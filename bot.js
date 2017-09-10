/**
 * Created by mar on 7/15/17.
 */

'use strict';

import { AuthenticatedClient, WebsocketClient } from 'gdax';
import MovingAverage from 'moving-average';
import { Exponential_Moving_Average } from './my_modules/exponential-moving-average';
import { MongoClient, ObjectId } from 'mongodb';
import express from 'express';
import nodemailer from 'nodemailer';

import cors from 'cors';

const EMA_LENGTH = 12 * 60 * 1000; // 12 minutes

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

// do some generic validation
let args = {};
process.argv.forEach((val, index) => {
    if (index > 1) {
        if (val.includes('=')) {
            const val_array = val.split('=');
            args[val_array[0]] = val_array[1];
        }
        else {
            throw new Error(`Called exchange_bot with invalid argument: ${$val}`);
        }
    }
});
console.log('exchange_bot started with cmdline args:');
console.dir(args);
console.log();

// make sure we have a 'mode' arg.  This is required
if (!args.hasOwnProperty('mode') || (args.mode !== 'test' && args.mode !== 'prod')) {
    throw new Error('Required argument "mode=test|prod" was not provided.');
}

// get the correct credentials from key files
let gdax_api_uri = null;
let gdax_wss_uri = null;
let gdax_api_keys = null;

if (args.mode === 'test') {
  gdax_api_uri = 'https://api-public.sandbox.gdax.com';
  // TODO: this doesn't seem to work..
  // gdax_wss_uri = 'wss://ws-feed-public.sandbox.gdax.com';
  gdax_wss_uri = 'wss://ws-feed.gdax.com';
  gdax_api_keys = require(`${__dirname}/../keys/gdax_sandbox.json`);
}
else {
  gdax_api_uri = 'https://api.gdax.com';
  gdax_wss_uri = 'wss://ws-feed.gdax.com';
  gdax_api_keys = require(`${__dirname}/../keys/gdax.json`);
}

/*
// create the GDAX clients
const rest_client = new AuthenticatedClient(gdax_api_keys.key, gdax_api_keys.secret, gdax_api_keys.passphrase, gdax_api_uri);
const websocket_client = new WebsocketClient([PRODUCT_ID], gdax_wss_uri, gdax_api_keys);

// get initial position
get_position();

// get what the all time high is and keep track of changes
// TODO: we could make this do an actual lookup someday.. maybe from our database
let all_time_high = 4980.00;

const ma = MovingAverage(EMA_LENGTH);

// monitor real-time price changes
websocket_client.on('message', (data) => {
  if (data.type === 'match') {
    // parse the time here and feed it into the ema engine
    const date_timestamp = Date.parse(data.time);

    // calc ema
    ma.push(date_timestamp, data.price);
    const ma1 = ma.movingAverage();
    
    if (!operation_pending) {
        // TODO: logic to make trade or not
      console.dir(data);
        
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
          ema1: ma1
      });
    }).catch((err) => {
      log_message('CRIT', 'Database failure', `Failed to get database connection, reason: ${err}`);
    });
  }
});

// if there is an error let me know.
websocket_client.on('error', (err) => {
    log_message('ERROR', 'Websocket Error', err);
});

// if it closes reconnect
websocket_client.on('close', (data) => {
    log_message('ERROR', 'Websocket Error', `websocket closed unexpectedly with data: ${data}. Attempting to re-connect.`);

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
                log_message('CRIT', 'Websocket Error', `Attempting to re-connect for the ${count} time. It has been ${time_since} seconds since we lost connection.`);
            }
            websocket_client.connect();
        }
        else {
            clearInterval(interval);
        }
    }, 3000);
});
*/

// set up a simple api for the monitor
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

app.get('/points', (req, res) => {
    if (!('start' in req.query) || !('end' in req.query)) {
        res.status(400).send({
            result: false,
            message: '/points endpoint must include start and end params'
        });
    }
    
    getDB().then((db) => {
        return db.collection('points')
            .find({ time: { $gte: new Date(req.query.start), $lte: new Date(req.query.end) }})
            .sort({time: 1})
            .toArray();
    }).then((points) => {
        res.send({
            result: points
        });
    }).catch((err) => {
        res.status(500).send({
            result: false,
            message: 'could not get /points'
        });
        
        log_message('CRIT', 'Database failure', `Failed to get database connection, reason: ${err}`)
    });
});

// endpoints not yet handled
app.use('*', (req, res) => {
    res.send({
        result: false,
        message: 'no endpoint matches your request'
    });
});

app.listen(80);

// intercept bad things :(
process.on('uncaughtException', (exception) => {
  log_message('CRIT', 'Process Unhandled Exception', exception.message);
});

process.on('unhandledRejection', (reason, p) => {
  log_message('CRIT', 'Process Unhandled Promise Rejection', `Unhandled Rejection, reason: ${reason}`);
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
  /*
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
    
    log_message('EMERG', reason, `BTC has dropped to: ${current_price} and your BTC holdings were sold bc ${reason}.`);
  }).catch((err) => {
    log_message('CRIT', 'emergency sell failed', `tried to do an emergency sell at: ${current_price}, but failed due to: ${err}. Original reason for trying to sell: ${reason}`);  
  });
  */
};

/**
 * log a message and send it in an email
 *
 * @param log_level
 * @param topic
 * @param msg
 */
const log_message = (log_level, topic, msg) => {
  msg = `${new Date()} ${log_level} => topic: ${topic} msg: ${msg}`;

  // log it
  console.log(msg);

  // email it
  send_email(topic, msg);
};

/**
 * Send an email
 *
 * @param subject
 * @param text
 */
const send_email = (subject, text) => {
  const mailOptions = {
    from: gmailCredentials.email,
    to: gmailCredentials.email,
    subject: `Exchange bot: ${subject}`,
    text: text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(`${new Date()} CRIT => Failed to send email on above log line. Error: ${error}`);
    }
  });
};


// just connect the first time and the other times respond with global_db
let global_db = null;
const getDB = () => {
    return new Promise((resolve, reject) => {
        if (global_db !== null) {
            resolve(global_db);
        }
        else {
            const mongoCredentials = require('../keys/mongo.json');
            MongoClient.connect(`mongodb://${mongoCredentials.user}:${mongoCredentials.pwd}@localhost:27017/trading?authMechanism=${mongoCredentials.authMechanism}&authSource=${mongoCredentials.authSource}`, (err, db) => {
                if(err) {
                    reject('Error connecting to database.');
                }
                else {
                    global_db = db;
                    resolve(db);
                }
            });
        }
    });
};


// set up nodemailer
const gmailCredentials = require('../keys/gmail.json');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: gmailCredentials.email,
        pass: gmailCredentials.pass
    }
});