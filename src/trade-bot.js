'use strict';


//import MovingAverage from 'moving-average';
//import { getDB, logMessage } from './utils';

const MovingAverage = require('moving-average');
const { getDB, logMessage, toDigit } = require('./utils');

// sides
const USD = false;
const BITCOIN = true;

const PRODUCT_ID = 'BTC-USD';
const GDAX_FEE = 0.0025; // .25% on taker fills

// ############### YOU MUST UPDATE THIS ANYTIME YOU MANUALLY TRANSFER FUNDS INTO / OUT OF GDAX!!!! #################
const USD_TOTAL_INVESTMENT = 1500.00;

const TRADE_TIMEOUT = 15000; // timeout trade if a match doesn't occur within 15 seconds

class TradeBot {
    constructor(restClient, websocketClient, emaLength, buyThreshold, sellThreshold, dropThreshold, store = false) {
        this._emaLength =  emaLength;
        this._buyThreshold = buyThreshold;
        this._sellThreshold = sellThreshold;
        this._dropThreshold = dropThreshold;

        this._store = store;

        this._emaCalculator = null;

        this._restClient = restClient;
        this._websocketClient = websocketClient;

        this._btcHoldings = 0.00;
        this._usdHoldings = 0.00;
        this._side = BITCOIN;

        this._operationPending = false;
        this._operationRemainingSize = 0;

        // TODO: we could make this do an actual lookup someday.. maybe from our database
        this._allTimeHigh = 4980.00;

        this._lastSequence = 0;
        this._lastEMA = 0;
        this._lastTime = null;

        this._tradeTimer = null;

        this._points = [];

        // fetch initial position
        this.fetchPosition();

        // must bind this otherwise it runs in the context of MockWebsocketClient
        this.matchHandler = this.matchHandler.bind(this);
        this.closeHandler = this.closeHandler.bind(this);
    }
    
    fetchPosition() {
        this._operationPending = true;
        this._restClient.request('get', [
            'position'
        ]).then((data) => {
            if (data.status !== 'active') {
                throw new Error('Cannot proceed, your account status is not active.');
            }

            this._btcHoldings = parseFloat(data.accounts.BTC.balance);
            this._usdHoldings = parseFloat(data.accounts.USD.balance);

            if (this._usdHoldings > this._btcHoldings) {
                this._side = USD;
            }
            else {
                this._side = BITCOIN;
            }

            logMessage('INFO', 'Position Info', `You have the following position:\nBTC: ${this._btcHoldings}\nUSD: ${this._usdHoldings}\nSide: ${this._side ? 'BTC' : 'USD'}`);

            this._operationPending = false;
            this._operationRemainingSize = 0;

            return getDB();
        }).then((db) => {
            // TODO: make this respect 'store' flag
            // store the new position
            db.collection('positions').insertOne({
                time: new Date(),
                usd: this._usdHoldings,
                btc: this._btcHoldings
            }).then((res) => {
                // do nothing
            });
        }).catch((err) => {
            logMessage('CRIT', 'Fetch Position', `Could not fetch position, err: ${err}`);
            // retry
            this.fetchPosition();
        });
    }

    run() {
        // start the ema calculator
        this._emaCalculator = MovingAverage(this._emaLength);

        // every time we start this thing up we need to get some initial values before we let it loose. 
        // To do this we temporarily hook up a small event handler in charge of preloading those values. 
        // We then remove it and hook up our more permanent event handler which has trade logic.
        const preloadHandler = (data) => {
            if (data.type === 'match') {
                this._lastSequence = data.sequence;
                this._lastTime = Date.parse(data.time);
                this._emaCalculator.push(this._lastTime, data.price);
                this._lastEMA = this._emaCalculator.movingAverage();

                this._websocketClient.removeListener('message', preloadHandler);

                this._websocketClient.addListener('message', this.matchHandler);
            }
        };
        this._websocketClient.addListener('message', preloadHandler);

        // if there is an error let me know.
        this._websocketClient.on('error', (err) => {
            logMessage('ERROR', 'Websocket Error', err);
        });

        // if it closes reconnect
        this._websocketClient.on('close', this.closeHandler);
    }

    stop() {
        this._websocketClient.removeListener('message', this.matchHandler);

        this._websocketClient.removeListener('close', this.closeHandler);

        this._emaCalculator = null;
    }

    closeHandler(data) {
        logMessage('ERROR', 'Websocket Error', `websocket closed unexpectedly with data: ${data}. Attempting to re-connect.`);

        // try to re-connect the first time...
        this._websocketClient.connect();

        let count = 1;
        // attempt to re-connect every 30 seconds.
        const interval = setInterval(() => {
            if (!this._websocketClient.socket) {
                count++;

                // send me a email if it keeps failing every 30/2 = 15 minutes
                if (count % 30 === 0) {
                    let time_since = 30 * count;
                    logMessage('CRIT', 'Websocket Error', `Attempting to re-connect for the ${count} time. It has been ${time_since} seconds since we lost connection.`);
                }
                this._websocketClient.connect();
            }
            else {
                clearInterval(interval);
            }
        }, 30000);
    }

    matchHandler(data) {
        // we only care about matches.. that is when currency actually changes hands.
        if (data.type === 'match') {
            // we have to make sure these matches are in correct sequence otherwise our ema will not calculate correctly.
            // if it is not in the correct sequence we simply throw it out.. yes our ema will be slightly off but that is ok.
            if (data.sequence < this._lastSequence) {
                logMessage('ERROR', 'Websocket Error', `Incorrect sequence order. Expected > ${this._lastSequence}, got: ${data.sequence}`);
                return;
            }

            this._lastSequence = data.sequence;

            data.price = parseFloat(data.price);

            // parse the time into an int here and feed it into the ema calculator
            const dateTimestamp = Date.parse(data.time);

            // calc emas
            this._emaCalculator.push(dateTimestamp, data.price);
            const ema = this._emaCalculator.movingAverage();

            // calc new slope
            const slope = (ema - this._lastEMA) / (dateTimestamp - this._lastTime);

            // need to re-assign these as fast as possible so that the next message coming in has the new values for calculations
            this._lastTime = dateTimestamp;
            this._lastEMA = ema;

            if (!this._operationPending) {
                // handle the divide by 0 problem.
                if (Number.isFinite(slope)) {
                    // if we are currently exposed, side === BTC... check if we need to do anything
                    if (this._side === BITCOIN) {
                        if (slope < this._sellThreshold) {
                            this.sell(data.price, slope);
                        }
                    }
                    // if we are currently out, side === USD... check if we need to do anything
                    else {
                        if (slope > this._buyThreshold) {
                            this.buy(data.price, slope);
                        }
                    }
                }
            }

            // TODO: we really shouldn't need this block...
            /*// if we are currently exposed, check if we need to do any emergency sell-offs
            if (this._side === BITCOIN) {
                // sell and send an email if the price drops too far from the all time high
                // TODO: make DROP_THRESHOLD settable via api... may need some authentication on this, a secret key or something
                if ((this._allTimeHigh - this._dropThreshold) >= data.price) {
                    this.emergencySell(data.price, 'price dropped too far from all time high');
                }

                // sell and send an email if the price drops below initial investment amount
                if (((data.price * this._btcHoldings) + this._usdHoldings) <= USD_TOTAL_INVESTMENT) {
                    this.emergencySell(data.price, 'price dropped below initial investment');
                }
            }*/

            // update _allTimeHigh if it should be updated
            if (data.price > this._allTimeHigh) {
                this._allTimeHigh = data.price;
            }

            // if we want to store the points store them
            if (this._store) {
                this.savePoint({
                    time: new Date(dateTimestamp),
                    price: data.price,
                    ema
                });
            }
        }

        // it was something else user related like 'received' or 'open'
        else {
            logMessage('DEBUG', 'Trade Logic', `Got a message that wasn't a match: ${JSON.stringify(data)}`);

            // if we get this, it means that our 'user' channel is letting us know that an order was filled
            if (data.type === 'done') {
                if (data.reason === 'filled') {
                    // kill the trade timer
                    clearTimeout(this._tradeTimer);

                    // NOTE: we could make this faster by doing the math ourselves instead of calling their api, but this approach
                    // ensures that their platform is always the source of truth and not us so it seems ok to halt any trades until this is done.
                    this.fetchPosition();
                }
                else if (data.reason === 'canceled') {
                    // double check that none of it was sold, if so we need to re-fetch our position
                    if (parseFloat(data.remaining_size) < this._operationRemainingSize) {
                        this.fetchPosition();
                    }
                }
            }
        }
    }

    buy(price, slope) {
        this._operationPending = true;

        const buyPrice = toDigit(price - 0.01, 2);
        const size = toDigit(this._usdHoldings / buyPrice, 8);
        
        this._operationRemainingSize = size;

        logMessage('INFO', 'Trade Logic', `Executing a 'buy' limit order at: ${buyPrice}, size: ${size} because of slope: ${slope}`);

        this._restClient.buy({
            type: 'limit',
            price: buyPrice,          // USD
            size: size,               // BTC
            product_id: PRODUCT_ID,
            post_only: true
        }).then((result) => {
            // this means it didn't go through :(
            if ('message' in result) {
                return Promise.reject(result.message);
            }

            this._tradeTimer = setTimeout(() => {
                this.cancel();
            }, TRADE_TIMEOUT);
        }).catch((err) => {
            this._operationPending = false;
            logMessage('ERROR', 'Trade Logic', `Failed to execute a 'buy' limit trade at: ${buyPrice}, size: ${size} which was triggered bc of slope: ${slope}, err: ${err}`);

            // this happens sometimes when their servers are too slow :(, just refresh our position
            // TODO: maybe change this to calculate it ourselves...
            if (err === 'Insufficient funds') {
                this.fetchPosition();
            }
        });
    }

    sell(price, slope) {
        this._operationPending = true;

        const sellPrice = toDigit(price + 0.01, 2);
        
        logMessage('INFO', 'Trade Logic', `Executing a 'sell' limit order at: ${sellPrice}, size: ${this._btcHoldings} because of slope: ${slope}`);
        
        this._operationRemainingSize = this._btcHoldings;
        
        this._restClient.sell({
            type: 'limit',
            price: sellPrice,           // USD
            size: this._btcHoldings,    // BTC
            product_id: PRODUCT_ID,
            post_only: true
        }).then((result) => {
            // this means it didn't go through :(
            if ('message' in result) {
                return Promise.reject(result.message);
            }

            this._tradeTimer = setTimeout(() => {
                this.cancel();
            }, TRADE_TIMEOUT);
        }).catch((err) => {
            this._operationPending = false;
            logMessage('ERROR', 'Trade Logic', `Failed to execute a 'sell' limit trade at: ${sellPrice}, size: ${this._btcHoldings} which was triggered bc of slope: ${slope}, err: ${err}`);

            // this happens sometimes when their servers are too slow :(, just refresh our position
            if (err === 'Insufficient funds') {
                this.fetchPosition();
            }
        });
    }

    cancel() {
        logMessage('INFO', 'Trade Logic', `Cancelling all orders bc an order didn't fill within ${TRADE_TIMEOUT} milliseconds`);

        this._restClient.cancelOrders().then((result) => {
            this._operationPending = false;
            this._operationRemainingSize = 0;
        }).catch((err) => {
            logMessage('CRIT', 'Trade Logic', `We could not cancel all orders bc: ${err}`);
        });
    }

    savePoint(point) {
        this._points.push(point);

        if (this._points.length === 100) {
            // put the new ema in the db
            getDB().then((db) => {
                return db.collection('points').insertMany(this._points);
            }).then((result) => {
                this._points = [];
            }).catch((err) => {
                logMessage('CRIT', 'Database failure', `Failed to save points, reason: ${err}`);
            });
        }
    }

    emergencySell(currentPrice, reason) {
        this._operationPending = true;

        this._restClient.sell({
            type: 'market',             // market orders will get charged a taker fee but it's better than losing a lot more...
            product_id: PRODUCT_ID,
            size: this._btcHoldings     // all our holdings
        }).then((data) => {
            // if there is no id field in data we have a problem.
            if (!('id' in data)) {
                return Promise.reject('No id in response');
            }

            this._side = USD;
            this._operationPending = false;

            logMessage('EMERG', reason, `BTC has dropped to: ${currentPrice} and your BTC holdings were sold bc ${reason}.`);
        }).catch((err) => {
            logMessage('CRIT', 'emergency sell failed', `tried to do an emergency sell at: ${currentPrice}, but failed due to: ${err}. Original reason for trying to sell: ${reason}`);
        });
    }

    getAllTimeHigh() {
        return this._allTimeHigh;
    }

    getPosition() {
        return {
            "BTC": this._btcHoldings,
            "USD": this._usdHoldings
        };
    }
}

module.exports = {
    TradeBot
};