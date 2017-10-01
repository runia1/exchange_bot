'use strict';

import MovingAverage from 'moving-average';

import { getDB, logMessage } from './utils';

// sides
const USD = false;
const BITCOIN = true;

// actions
const BUY = false;
const SELL = true;

const PRODUCT_ID = 'BTC-USD';
const GDAX_FEE = 0.0025; // .25% on taker fills

// ############### YOU MUST UPDATE THIS ANYTIME YOU MANUALLY TRANSFER FUNDS INTO / OUT OF GDAX!!!! #################
const USD_TOTAL_INVESTMENT = 1500.00;

const TRADE_TIMEOUT = 2000; // timout trade if a match doesn't occur within 2 seconds

class TradeBot {
    constructor(restClient, websocketClient, emaLength, buyThreshold, sellThreshold, dropThreshold, store = false) {
        this._emaLength =  emaLength;
        this._buyThreshold = buyThreshold;
        this._sellThreshold = sellThreshold;
        this._dropThreshold = dropThreshold;
        
        this._store = store;
        
        this._restClient = restClient;
        this._websocketClient = websocketClient;
        
        this._btcHoldings = 0.00;
        this._usdHoldings = 0.00;
        this._side = BITCOIN;
        
        this._operationPending = false;
        
        // TODO: we could make this do an actual lookup someday.. maybe from our database
        this._allTimeHigh = 4980.00;
        
        this._lastSequence = 0;
        this._lastEMA = 0;
        this._lastTime = null;
        
        this._tradeTimer = null;

        // fetch initial position
        this.fetchPosition();
    }

    /**
     * get and store our current position
     */
    fetchPosition() {
        this._operationPending = true;
        this._restClient.request('get', [
          'position'
        ]).then((data) => {
            if (data.status !== 'active') {
                throw new Error('Cannot proceed, your account status is not active.');
            }

            this._btcHoldings = data.accounts.BTC.balance;
            this._usdHoldings = data.accounts.USD.balance;

            if (this._usdHoldings > this._btcHoldings) {
                this._side = USD;
            }
            else {
                this._side = BITCOIN;
            }

            logMessage('DEBUG', 'Position Info', 'You have the following position:');
            logMessage('DEBUG', 'Position Info', `BTC: ${this._btcHoldings}`);
            logMessage('DEBUG', 'Position Info', `USD: ${this._usdHoldings}`);
            logMessage('DEBUG', 'Position Info', `Side: ${this._side ? 'BTC' : 'USD'}`);

            this._operationPending = false;

            return getDB();
        }).then((db) => {
            // store the new position
            return db.collection('positions').insertOne({
                time: new Date(),
                usd: this._usdHoldings,
                btc: this._btcHoldings
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
        this._websocketClient.on('close', (data) => {
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
        });
    }
    
    stop() {
        this._websocketClient.removeListener('message', this.matchHandler);
        
        this._emaCalculator = null;
    }
    
    matchHandler(data) {
        // we only care about matches.. that is when currency actually changes hands.
        if (data.type === 'match') {

            // update holdings if it was a match and I am one of the parties..
            // the data will have a special property 'user_id' if my account was one of the parties involved in the trade.
            if ('user_id' in data) {
                // kill the trade timer
                clearInterval(this._tradeTimer);

                // NOTE: we could make this faster by doing the math ourselves instead of calling their api, but this approach
                // ensures that their platform is always the source of truth and not us so it seems ok to halt any trades until this is done.
                this.fetchPosition();
            }

            // we have to make sure these matches are in correct sequence otherwise our ema will not calculate correctly.
            // if it is not in the correct sequence we simply throw it out.. yes our ema will be slightly off but that is ok.
            if (data.sequence < this._lastSequence) {
                logMessage('ERROR', 'Websocket Error', `Incorrect sequence order. Expected > ${this._lastSequence}, got: ${data.sequence}`);
                return;
            }

            this._lastSequence = data.sequence;

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
                // put the new ema in the db
                getDB().then((db) => {
                    return db.collection('points').insertOne({
                        time: new Date(dateTimestamp), // turn it into a Date object here
                        price: data.price,
                        ema: ema
                    });
                }).then((result) => {
                    // TODO: make sure it was inserted correctly???
                }).catch((err) => {
                    logMessage('CRIT', 'Database failure', `Failed to get database connection, reason: ${err}`);
                });
            }
        }
    }
    
    buy(price, slope) {
        this._operationPending = true;
        
        const buyPrice = price - 0.01;
        this._restClient.post(['orders'], {
          side: 'buy',
          type: 'limit',
          price: buyPrice,                        // USD
          size: this._usdHoldings / buyPrice,     // BTC
          product_id: PRODUCT_ID,
        }).then((result) => {
            this._tradeTimer = setTimeout(() => {
                this.cancel();
            }, TRADE_TIMEOUT);
            logMessage('DEBUG', 'Trade Logic', `Executing a 'buy' limit order at: ${buyPrice} because of slope: ${slope}, response: ${result}`);
        }).catch((err) => {
            logMessage('CRIT', 'Trade Logic', `Failed to execute a 'buy' limit trade at: ${buyPrice} which was triggered bc of slope: ${slope}, err: ${err}`);
        });
    }
    
    sell(price, slope) {
        this._operationPending = true;

        const sellPrice = price + 0.01;
        this._restClient.post(['orders'], {
          side: 'sell',
          type: 'limit',
          price: sellPrice,           // USD
          size: this._btcHoldings,    // BTC
          product_id: PRODUCT_ID,
        }).then((result) => {
            this._tradeTimer = setTimeout(() => {
                this.cancel();
            }, TRADE_TIMEOUT);
            logMessage('DEBUG', 'Trade Logic', `Executing a 'buy' limit order at: ${sellPrice} because of slope: ${slope}, response: ${result}`);
        }).catch((err) => {
            logMessage('CRIT', 'Trade Logic', `Failed to execute a 'buy' limit trade at: ${sellPrice} which was triggered bc of slope: ${slope}, err: ${err}`);
        });
    }
    
    cancel() {
        // a trade did not occur within TRADE_TIMEOUT, lets cancel this order
        
        // TODO: for now we just let it stay out there till it fills, but eventually we'll make a call to cancel order and retry???
        //this._operationPending = false;
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

export {
    TradeBot
}


