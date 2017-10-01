'use strict';

//import { getDB, logMessage } from './utils';
//import { PublicClient } from 'gdax';

const { getDB, logMessage } = require('./utils');
const { PublicClient } = require('gdax');

const PRODUCT_ID = 'BTC-USD';

const client = new PublicClient(PRODUCT_ID);

const from = 19499999;  // 2017-08-19T05:17:35.662Z
const to = 21267295;    // 2017-09-24

const readable = client.getProductTradeStream(from, to);

let count = 0;
let collection = [];

readable.on('data', (data) => {
  count++;

  collection.push({
    time: new Date(data.time), // turn it into a Date object here
    price: data.price,
    sequence: data.trade_id
  });

  // insert 5000 at a time.
  if (count % 5000 === 0) {
    getDB().then((db) => {
      return db.collection('points').insertMany(collection);
    }).then((result) => {
      collection = [];
    }).catch((err) => {
      console.error("ERROR: " + err);
    });
  }
});

readable.on('error', (err) => {
  console.error("Err: " + err);
});