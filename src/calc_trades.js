"use strict";

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;

// actions
const BUY = false;
const SELL = true;

const GDAX_FEE = 0.0025; // .25% on taker fills

const USD = false;
const BITCOIN = true;
let btc_holdings = 0.50;
let usd_holdings = 0.0;
let side = BITCOIN;

const BUY_THRESHOLD = 0.0000025;
const SELL_THRESHOLD = -0.0000025;

const ema = 'ema2';

// just connect the first time and the other times respond with global_db
let global_db = null;
const getDB = () => {
    return new Promise((resolve, reject) => {
        if (global_db !== null) {
            resolve(global_db);
        }
        else {
            const mongoCredentials = require('./keys/mongo.json');
            MongoClient.connect(`mongodb://${mongoCredentials.user}:${mongoCredentials.pwd}@localhost:27017/trading?authMechanism=${mongoCredentials.authMechanism}&authSource=${mongoCredentials.authSource}`).then((db) => {
                global_db = db;
                resolve(global_db);
            });
        }
    });
};

getDB().then((db) => {
    // Time range
    const end = new Date("Sat Sep 02 2017 11:45:00 GMT-0600 (MDT)");
    const start = end.setDate(end.getDate()-1); // minus 1 day
    
    return db.collection('points')
        .find({ time: { $gte: new Date(start), $lte: new Date("Sat Sep 02 2017 11:45:00 GMT-0600 (MDT)") }})
        .sort({time: 1})
        .toArray();
}).then((points) => {
    getDB().then((db) => {
        db.close();
    });
    
    let lastTime = Date.parse(points[0]['time']);
    let lastEMA = points[0][ema];
    
    points.forEach((point) => {
        // calc new slope
        const now = Date.parse(point.time);
        const slope = (point[ema] - lastEMA) / (now - lastTime);
        
        lastEMA = point[ema];
        lastTime = now;
        
        // handle the divide by 0 problem.
        if (Number.isFinite(slope)) {
            // if we are currently exposed, side === BTC... check if we need to do anything
            if (side === BITCOIN) {
                if (slope < SELL_THRESHOLD) {
                    execute_trade(SELL, point.price, point.time, slope);
                }
            }
            // if we are currently out, side === USD... check if we need to do anything
            else {
                if (slope > BUY_THRESHOLD) {
                    execute_trade(BUY, point.price, point.time, slope);
                }
            }
        }
    });
}).catch((err) => {
    console.error(`Could not get points. Reason: ${err}`);
});


const execute_trade = (action, price, time, slope) => {
    if (action === BUY) {
        let amount_to_buy = usd_holdings / price;
        const usd_fees = calc_taker_fees(price, amount_to_buy);
        
        amount_to_buy = amount_to_buy - (usd_fees / price);
        
        usd_holdings = 0;
        btc_holdings += amount_to_buy;
        
        side = BITCOIN;
        
        console.log(`Slope: ${slope}, Executed: BUY, at price: ${price}, at time: ${time}, fees: ${usd_fees}, usd_holdings: ${usd_holdings}, btc_holdings: ${btc_holdings}`);
    }
    else {
        let amount_to_sell = btc_holdings;
        const usd_fees = calc_taker_fees(price, amount_to_sell);
        
        let amount_made = (amount_to_sell * price) - usd_fees;
        
        usd_holdings += amount_made;
        btc_holdings = 0;
        
        side = USD;

        console.log(`Slope: ${slope}, Executed: SELL, at price: ${price}, at time: ${time}, fees: ${usd_fees}, usd_holdings: ${usd_holdings}, btc_holdings: ${btc_holdings}`);
    }
};

const calc_taker_fees = (coin_price, coin_amount) => {
    return coin_price * coin_amount * GDAX_FEE;
};