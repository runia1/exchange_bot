'use strict';


//import MovingAverage from 'moving-average';
//import { getDB, logger, toDigit } from './utils';

const { EmaIrregularTimeSeries } = require('./EmaIrregularTimeSeries');
const { getDB, logger, toDigit } = require('./utils');

// sides
const USD = false;
const BITCOIN = true;
const BELOW = false;
const ABOVE = true;

const PRODUCT_ID = 'BTC-USD';
const GDAX_FEE = 0.0025; // .25% on taker fills

// ############### YOU MUST UPDATE THIS ANYTIME YOU MANUALLY TRANSFER FUNDS INTO / OUT OF GDAX!!!! #################
const USD_TOTAL_INVESTMENT = 1500.00;

const TRADE_TIMEOUT = 15000; // timeout trade if a match doesn't occur within 15 seconds

class TradeBot {
    constructor(restClient, websocketClient, emaLength1, emaLength2, store = false) {
        this._restClient = restClient;
        this._websocketClient = websocketClient;
        
        this._emaLength1 = emaLength1;
        this._emaLength2 = emaLength2;

        this._emaCalculator1 = null;
        this._emaCalculator2 = null;

        this._store = store;

        this._btcHoldings = 0.00;
        this._usdHoldings = 0.00;
        this._side = BITCOIN;

        this._operationPending = false;

        // TODO: we could make this do an actual lookup someday.. maybe from our database
        this._allTimeHigh = 19000.00;

        this._lastSequence = 0;

        this._tradeTimer = null;

        this._points = [];

        // fetch initial position
        this.fetchPosition();

        // must bind these otherwise it runs in the context of MockWebsocketClient
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

            logger.info(`You have the following position:\nBTC: ${this._btcHoldings}\nUSD: ${this._usdHoldings}\nSide: ${this._side ? 'BTC' : 'USD'}`);

            this._operationPending = false;

            return getDB();
        }).then((db) => {
            if (this._store) {
                // store the new position
                db.collection('positions').insertOne({
                    time: new Date(),
                    usd: this._usdHoldings,
                    btc: this._btcHoldings
                }).then((res) => {
                    // do nothing
                });
            }
        }).catch((err) => {
            logger.error(`Could not fetch position, err: ${err}`);
            // retry
            this.fetchPosition();
        });
    }

    run() {
        // every time we start this thing up we need to get some initial values before we let it loose. 
        // To do this we temporarily hook up a small event handler in charge of preloading those values. 
        // We then remove it and hook up our more permanent event handler which has trade logic.
        const preloadHandler = (data) => {
            if (data.type === 'match') {
                this._lastSequence = data.sequence;
                
                data.price = parseFloat(data.price);

                const start = {
                    timestamp: Date.parse(data.time),
                    value: data.price,
                    ema: data.price
                };

                // start the ema calculators
                this._emaCalculator1 = new EmaIrregularTimeSeries({
                    length: this._emaLength1,
                    start
                });
                this._emaCalculator2 = new EmaIrregularTimeSeries({
                    length: this._emaLength2,
                    start
                });

                this._websocketClient.removeListener('message', preloadHandler);
                this._websocketClient.addListener('message', this.matchHandler);
            }
        };
        this._websocketClient.addListener('message', preloadHandler);

        // if there is an error let me know.
        this._websocketClient.on('error', (err) => {
            logger.error(`Websocket Error: ${err}`);
        });

        // if it closes reconnect
        this._websocketClient.on('close', this.closeHandler);
    }

    stop() {
        this._websocketClient.removeListener('message', this.matchHandler);
        this._websocketClient.removeListener('close', this.closeHandler);

        this._emaCalculator1 = null;
        this._emaCalculator2 = null;
    }

    closeHandler() {
        logger.error(`Websocket closed unexpectedly, attempting to re-connect.`);

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
                    logger.error(`Websocket attempting to re-connect for the ${count} time. It has been ${time_since} seconds since we lost connection.`);
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
                logger.error(`Incorrect sequence order. Expected > ${this._lastSequence}, got: ${data.sequence}`);
                return;
            }
            this._lastSequence = data.sequence;

            const trade = {
                timestamp: Date.parse(data.time),
                value: data.price
            };

            const emaPromise1 = this._emaCalculator1.nextValue(trade);
            const emaPromise2 = this._emaCalculator2.nextValue(trade);
            Promise.all([emaPromise1, emaPromise2]).then((values) => {
                const [ema1, ema2] = values;

                if (!this._operationPending) {
                    // if it's BELOW
                    if (ema1 < ema2) {
                        // if we're holding BTC, we need to sell.
                        if (this._side === BITCOIN) {
                            logger.info(`Executing a 'sell' order at: ${data.price}`);
                            this._side = USD;
                            //this.sell(data.price);
                        }
                    }
                    // if it's ABOVE
                    else {
                        // if we're not holding BTC, we need to buy.
                        if (this._side === USD) {
                            logger.info(`Executing a 'buy' order at: ${data.price}`);
                            this._side = BITCOIN;
                            //this.buy(data.price);
                        }
                    }
                }

                // if we want to store the points store them
                if (this._store) {
                    this.savePoint({
                        time: new Date(data.time),
                        price: data.price,
                        ema1,
                        ema2
                    });
                }
            });

            // update _allTimeHigh if it should be updated
            if (data.price > this._allTimeHigh) {
                this._allTimeHigh = data.price;
            }
        }

        // it was something else user related like 'received' or 'open'
        else {
            logger.debug(`Got a message that wasn't a match: ${JSON.stringify(data)}`);

            // if we get this, it means that our 'user' channel is letting us know that an order was filled
            if (data.type === 'done') {
                if (data.reason === 'filled' || data.reason === 'canceled') {
                    // kill the trade timer
                    clearTimeout(this._tradeTimer);

                    // NOTE: this approach ensures that their platform is always the source of truth
                    // and not us so it seems ok to halt any trades until this is done.
                    this.fetchPosition();
                }
            }
        }
    }

    buy(price) {
        this._operationPending = true;

        logger.info(`Executing a 'buy' order at: ${price}`);

        this._restClient.buy({
            type: 'market',
            funds: this._usdHoldings.toFixed(2),
            product_id: PRODUCT_ID
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
            logger.error(`Failed to execute a 'buy' order at: ${price}, err: ${err}`);

            // this happens sometimes when their servers are too slow :(, just refresh our position
            if (err === 'Insufficient funds') {
                this.fetchPosition();
            }
        });
    }

    sell(price) {
        this._operationPending = true;

        logger.info(`Executing a 'sell' limit order at: ${price}`);
        
        this._restClient.sell({
            type: 'market',
            size: this._btcHoldings.toFixed(8),    // BTC
            product_id: PRODUCT_ID
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
            logger.error(`Failed to execute a 'sell' order at: ${price}, err: ${err}`);

            // this happens sometimes when their servers are too slow :(, just refresh our position
            if (err === 'Insufficient funds') {
                this.fetchPosition();
            }
        });
    }

    cancel() {
        logger.info(`Cancelling all orders bc an order didn't fill within ${TRADE_TIMEOUT} milliseconds`);

        this._restClient.cancelOrders().then((result) => {
            this._operationPending = false;
        }).catch((err) => {
            logger.error(`We could not cancel all orders bc: ${err}`);
        });
    }

    savePoint(point) {
        this._points.push(point);

        if (this._points.length === 500) {
            // put the new ema in the db
            getDB().then((db) => {
                return db.collection('points').insertMany(this._points);
            }).then((result) => {
                this._points = [];
            }).catch((err) => {
                logger.error(`Mongo Failed to save points, reason: ${err}`);
            });
        }
    }

    /*emergencySell(currentPrice, reason) {
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

            logger.error(`BTC has dropped to: ${currentPrice} and your BTC holdings were sold bc ${reason}.`);
        }).catch((err) => {
            logger.error(`Tried to do an emergency sell at: ${currentPrice}, but failed due to: ${err}. Original reason for trying to sell: ${reason}`);
        });
    }*/

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