/**
 * Created by mar on 7/15/17.
 */

'use strict';

import { AuthenticatedClient, WebsocketClient } from 'gdax';
import MovingAverage from 'moving-average';
import express from 'express';

import { getDB, logMessage } from './utils';

import cors from 'cors';

const minutes = 60*1000;

const ema1 = MovingAverage(12 * minute); // 12 minutes
const ema2 = MovingAverage(12 * 5 * minutes); // 12 * 5 min chunks = 12 candlestick ema for 5 min candlesticks == 60 min ema
const ema3 = MovingAverage(12 * 15 * minutes); // 12 * 15 min chunks = 12 candlestick ema for 15 min candlesticks == 180 min ema
const ema4 = MovingAverage(11 * 24 * 60 * minute); // 11 days

const USD = false;
const BITCOIN = true;
const PRODUCT_ID = 'BTC-USD';

const GDAX_FEE = 0.0025; // .25% on taker fills

const DROP_THRESHOLD = 500.00; // if it drops this far from the all_time_high sell and send an email!

// GLOBAL VARIABLES
let btc_holdings = 0.00;
let usd_holdings = 0.00;
let side = BITCOIN;
let operation_pending = false;

// ############### YOU MUST UPDATE THIS ANYTIME YOU MANUALLY TRANSFER FUNDS INTO / OUT OF GDAX!!!! #################
const USD_TOTAL_INVESTMENT = 1500.00;

// get the correct credentials from key files
const gdax_api_uri = 'https://api.gdax.com';
const gdax_wss_uri = 'wss://ws-feed.gdax.com';
const gdax_api_keys = require('../../keys/gdax.json');

// create the GDAX clients
const rest_client = new AuthenticatedClient(gdax_api_keys.key, gdax_api_keys.secret, gdax_api_keys.passphrase, gdax_api_uri);
const websocket_client = new WebsocketClient([PRODUCT_ID], ['user', 'matches', 'heartbeat'], gdax_wss_uri, gdax_api_keys);

// get initial position
get_position();

// get what the all time high is and keep track of changes
// TODO: we could make this do an actual lookup someday.. maybe from our database
let all_time_high = 4980.00;

// monitor real-time price changes
let lastSequence = 0;
websocket_client.on('message', (data) => {

  // we only care about matches.. that is when currency actually changes hands.
  if (data.type === 'match') {

    // we have to make sure these matches are in correct sequence otherwise our ema will not calculate correctly.
    // if it is not in the correct sequence we simply throw it out.. yes our ema will be slightly off but that is ok.
    if (data.sequence < lastSequence) {
      logMessage('ERROR', 'Websocket Error', `Incorrect sequence order. Expected > ${lastSequence}, got: ${data.sequence}`);
      return;
    }

    lastSequence = data.sequence;

    // parse the time here and feed it into the ema engine
    const date_timestamp = Date.parse(data.time);

    // calc emas
    ema1.push(date_timestamp, data.price);
    ema2.push(date_timestamp, data.price);
    ema3.push(date_timestamp, data.price);
    ema4.push(date_timestamp, data.price);

    const ma1 = ema1.movingAverage();
    const ma2 = ema2.movingAverage();
    const ma3 = ema3.movingAverage();
    const ma4 = ema4.movingAverage();
    
    if (!operation_pending) {
        /*
        // if we are currently exposed, side === BTC... check if we need to do anything
        if (side) {
            // sell and send an email if the price drops too far from the all time high
            // TODO: make DROP_THRESHOLD settable via api... may need some authentication on this, a secret key or something
            if ((all_time_high - DROP_THRESHOLD) >= data.price) {
                emergency_sell_off(data.price, 'price dropped too far from all time high');
            }

            // sell and send an email if the price drops below initial investment amount
            if (((data.price * btc_holdings) + usd_holdings) <= USD_TOTAL_INVESTMENT) {
                emergency_sell_off(data.price, 'price dropped below initial investment');
            }
        }

        // if we are currently out, side === USD... check if we need to do anything
        else {

        }
        */
    }

    // update holdings if it was a match and I am one of the parties..
    // the data will have a special property 'user_id' if my account was one of the parties involved in the trade.
    if ('user_id' in data) {
        // NOTE: we could make this faster by doing the math ourselves instead of calling their api, but this approach
        // ensures that their platform is always the source of truth and not us.
        get_position();
    }
    
    // update all_time_high if it should be updated
    if (data.price > all_time_high) {
      all_time_high = data.price;
    }
    
    // put the new ema in the db
    getDB().then((db) => {
      return db.collection('points').insertOne({
          time: new Date(date_timestamp), // turn it into a Date object here
          price: data.price,
          ema1: ma1,
          ema2: ma2,
          ema3: ma3,
          ema4: ma4
      });
    }).catch((err) => {
      logMessage('CRIT', 'Database failure', `Failed to get database connection, reason: ${err}`);
    });
  }
});

// if there is an error let me know.
websocket_client.on('error', (err) => {
    logMessage('ERROR', 'Websocket Error', err);
});

// if it closes reconnect
websocket_client.on('close', (data) => {
    logMessage('ERROR', 'Websocket Error', `websocket closed unexpectedly with data: ${data}. Attempting to re-connect.`);

    // try to re-connect the first time...
    websocket_client.connect();
    
    let count = 1;
    // attempt to re-connect every 30 seconds.
    const interval = setInterval(() => {
        if (!websocket_client.socket) {
            count++;
            
            // send me a email if it keeps failing every 30/2 = 15 minutes
            if (count % 30 === 0) {
                let time_since = 30 * count;
                logMessage('CRIT', 'Websocket Error', `Attempting to re-connect for the ${count} time. It has been ${time_since} seconds since we lost connection.`);
            }
            websocket_client.connect();
        }
        else {
            clearInterval(interval);
        }
    }, 3000);
});

// set up a simple api for the monitor, this api isn't in the api script b/c it depends on data from the bot algorithm.
const app = express();

app.all('/*', cors()); //handle cross origin requests with this middleware

app.get('/all_time_high', (req, res) => {
    res.send({
        result: all_time_high
    });
});

app.get('/position', (req, res) => {
    res.send({
        result: {
            BTC: btc_holdings,
            USD: usd_holdings
        }
    });
});

// endpoints not yet handled
app.use('*', (req, res) => {
    res.send({
        result: false,
        message: 'no endpoint matches your request'
    });
});

app.listen(8081);

// intercept bad things :(
process.on('uncaughtException', (exception) => {
  logMessage('CRIT', 'Process Unhandled Exception', exception.message);
});

process.on('unhandledRejection', (reason, p) => {
  logMessage('CRIT', 'Process Unhandled Promise Rejection', `Unhandled Rejection, reason: ${reason}`);
});

//############################## utility functions ##################################

/**
 * get and store our current position
 */
function get_position() {
    operation_pending = true;
    rest_client.request('get', ['position']).then((data) => {
        if (data.status !== 'active') {
            throw new Error('Cannot proceed, your account status is not active.');
        }

        btc_holdings = data.accounts.BTC.balance;
        usd_holdings = data.accounts.USD.balance;

        console.log('You have the following position:');
        console.log(`BTC: ${btc_holdings}`);
        console.log(`USD: ${usd_holdings}`);

        if (usd_holdings > btc_holdings) {
            side = USD;
        }
        else {
            side = BITCOIN;
        }

        console.log(`Side: ${side ? 'BTC' : 'USD'}`);
        
        operation_pending = false;
    }).catch((err) => {
        throw new Error(err.message);
    });
}

/**
 * Calculates the fees GDAX will charge for an order filled as a TAKER.
 *
 * @param coin_price
 * @param coin_amount
 * @returns {number}
 */
// TODO: maybe make one specifically for selling / buying
const calc_taker_fees = (coin_price, coin_amount) => {
  return coin_price * coin_amount * GDAX_FEE;
};

/**
 * Sell off BTC dues to some emergency
 * 
 * @param current_price
 * @param reason
 */
const emergency_sell_off = (current_price, reason) => {
  operation_pending = true;
  
  rest_client.sell({
      type: 'market',         // market orders will get charged a taker fee but it's better than losing a lot more...
      product_id: PRODUCT_ID,
      size: btc_holdings      // all our holdings
  }).then((data) => {
    // if there is no id field in data we have a problem.
    if (!('id' in data)) {
      return Promise.reject('No id in response');
    }
    
    side = USD;
    operation_pending = false;
    
    logMessage('EMERG', reason, `BTC has dropped to: ${current_price} and your BTC holdings were sold bc ${reason}.`);
  }).catch((err) => {
    logMessage('CRIT', 'emergency sell failed', `tried to do an emergency sell at: ${current_price}, but failed due to: ${err}. Original reason for trying to sell: ${reason}`);  
  });
};





