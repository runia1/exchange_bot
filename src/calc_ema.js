"use strict";

const { getDB, ObjectId, logger, flushLogsAndExit } = require('./utils');
const { EmaIrregularTimeSeries } = require('./EmaIrregularTimeSeries');
const {} = require('mongodb');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pointToValue = (point) => {
    return {
        timestamp: Date.parse(point.time),
        value: point.price
    };
};

let startTrade = {};

getDB()
.then((db) => {
    return db.collection('backtest_points').findOne({ _id: ObjectId("59c7c9210206240ce57f90af") });
}).then((point) => {
    startTrade = pointToValue(point);
    // we need to add a fake ema for the first point
    startTrade.ema = startTrade.value;
});

// 12 * 5 min chunks = 12 candlestick ema for 5 min candlesticks == 60 min ema
const ma1 = new EmaIrregularTimeSeries({
    length: 12 * 5 * MINUTE,
    start: startTrade
});

// 12 * 15 min chunks = 12 candlestick ema for 15 min candlesticks == 180 min ema
const ma2 = new EmaIrregularTimeSeries({
    length: 12 * 15 * MINUTE,
    start: startTrade
});

// 11 days
const ma3 = new EmaIrregularTimeSeries({
    length: 11 * DAY,
    start: startTrade
});

// paginate through all these points and calculate the 3 emas and store them
getDB().then((db) => {
    return db.collection('backtest_points')
        .find({ _id: ObjectId("59c7c9210206240ce57f90b0") })
        .sort({time: 1})
        .batchSize(500);
}).then((cursor) => {
    // now that we have a cursor lets got to town
    while(cursor.hasNext()) {
        let point = tojson(cursor.next());
        
        // TODO: get this set up
        
    }

}).catch((err) => {
    logger.error(`Could not get points. Reason: ${err}`);
});
