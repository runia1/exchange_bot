/**
 * Created by mar on 7/15/17.
 */

'use strict';

import { AuthenticatedClient, WebsocketClient } from 'gdax';
import MovingAverage from 'moving-average';
import { Exponential_Moving_Average } from './my_modules/exponential-moving-average';
import nodemailer from 'nodemailer';

// set up nodemailer
const gmailCredentials = require('../keys/gmail.json');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailCredentials.email,
    pass: gmailCredentials.pass
  }
});

const EMA_LENGTH = 12; // 12 days

const USD = 'USD';
const BITCOIN = 'BTC';
const PRODUCT_ID = 'BTC-USD';

const GDAX_FEE = 0.0025; // .25% on taker fills

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

// create the
const rest_client = new AuthenticatedClient(gdax_api_keys.key, gdax_api_keys.secret, gdax_api_keys.passphrase, gdax_api_uri);

const websocket_client = new WebsocketClient([PRODUCT_ID], gdax_wss_uri, gdax_api_keys);



/*// TODO: figure out if either of these ema algs are correct!?
const ma = MovingAverage(EMA_LENGTH * 60 * 1000);
const max = new Exponential_Moving_Average(EMA_LENGTH * 60 * 1000);

websocket_client.on('message', (data) => {
  if (data.type === 'match') {
    ma.push(Date.now(), data.price);
    console.log('ma1 is', ma.movingAverage());
    console.log('ma2 is', max.get_irregular_ema(data.price, Date.now()));
    console.log();
  }
});*/

// These are some variables we should keep track of
let btc = 0.00;
let usd = 0.00;

let side = BITCOIN;

let all_time_high = 0.00;

// get and store our current position
rest_client.request('get', ['position']).then((data) => {
  if (data.status !== 'active') {
    throw new Error('Cannot proceed, your account status is not active.');
  }

  btc = data.accounts.BTC.balance;
  usd = data.accounts.USD.balance;

  console.log('You have the following position:');
  console.log(`BTC: ${btc}`);
  console.log(`USD: ${usd}`);

  if (usd > btc) {
    side = USD;
  }
  else {
    side = BITCOIN;
  }

  console.log(`Current side: ${side}`);

}).catch((err) => {
  throw new Error(err.message);
});


//


/*
// current side of the market (either coin or USD)
let side = USD;

let last_trade_price = 0.0;

// calculate the price at which to make the next trade including the required_margin
const calc_next_trade = (side, last_trade_price) => {
  // if the side is USD we want to buy low
  if (side === USD) {

  }

  // if the side is COIN we want to sell high
  else {

  }
};
*/

// intercept bad things :(
process.on('uncaughtException', (exception) => {
  log_message('CRIT', 'Process Unhandled Exception', exception.message);
});

process.on('unhandledRejection', (reason, p) => {
  const msg = `Unhandled Rejection at Promise: ${p}, reason: ${reason}`;
  log_message('CRIT', 'Process Unhandled Promise Rejection', msg);
});

//############################## utility functions ##################################

/**
 * Calculates the fees GDAX will charge for an order filled as a TAKER.
 *
 * @param coin_price
 * @param coin_amount
 * @returns {number}
 */
const calc_taker_fees = (coin_price, coin_amount) => {
  return coin_price * coin_amount * GDAX_FEE;
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

  //log it to stderr
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
      console.log(`${new Date()} CRIT => Failed to send email on above log line ^`);
    }
  });
};