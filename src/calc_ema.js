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

let ma1, ma2, ma3;

getDB().then((db) => {
    return db.collection('backtest_points').findOne({ _id: ObjectId("59c7c9210206240ce57f90af") });
}).then((point) => {
    const startTrade = pointToValue(point);
    // we need to add a fake ema for the first point
    startTrade.ema = startTrade.value;

    // 12 * 5 min chunks = 12 candlestick ema for 5 min candlesticks == 60 min ema
    ma1 = new EmaIrregularTimeSeries({
        length: 12 * 5 * MINUTE,
        start: startTrade
    });

    // 12 * 15 min chunks = 12 candlestick ema for 15 min candlesticks == 180 min ema
    ma2 = new EmaIrregularTimeSeries({
        length: 12 * 15 * MINUTE,
        start: startTrade
    });

    // 11 days
    ma3 = new EmaIrregularTimeSeries({
        length: 11 * DAY,
        start: startTrade
    });

    return getDB();
}).then((db) => {
    return db.collection('backtest_points')
        .find({ time: { $gte: new Date('2017-08-19 05:17:36.434Z') } })
        .sort({time: 1})
        .batchSize(500);
}).then((cursor) => {
    // now that we have a cursor lets go to town

    const pointsWithEmas = [];
    let count = 0;

    const promiseLoop = (promise) => {
        promise.then((point) => {
            const trade = pointToValue(point);

            const ma1Val = ma1.nextValue(trade);
            const ma2Val = ma2.nextValue(trade);
            const ma3Val = ma3.nextValue(trade);
            Promise.all([ma1Val, ma2Val, ma3Val]).then((values) => {
                count++;
                console.dir(values);
                pointsWithEmas.push(values);
            });

            promiseLoop(cursor.next());
        });
    };

    promiseLoop(cursor.next());

}).catch((err) => {
    console.error(`Could not get points. Reason: ${err}`);
});