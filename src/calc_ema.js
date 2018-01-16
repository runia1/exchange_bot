"use strict";

const { getDB, ObjectId, logger, flushLogsAndExit } = require('./utils');
const { EmaIrregularTimeSeries } = require('./EmaIrregularTimeSeries');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const EMA_LENGTH = 12 * HOUR;

const pointToValue = (point) => {
    return {
        timestamp: Date.parse(point.time),
        value: point.price
    };
};

let ma1;

getDB().then((db) => {
    return db.collection('backtest_points').findOne({ _id: ObjectId("59c7c9210206240ce57f90af") });
}).then((point) => {
    const startTrade = pointToValue(point);
    // we need to add a fake ema for the first point
    startTrade.ema = startTrade.value;

    ma1 = new EmaIrregularTimeSeries({
        length: EMA_LENGTH,
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

    let count = 0;

    const promiseLoop = (promise) => {
        promise.then((point) => {
            count++;

            ma1.nextValue(pointToValue(point)).then((values) => {
                console.dir(values);



            });

            if (count < 1762199) {
                promiseLoop(cursor.next());
            }
        });
    };

    promiseLoop(cursor.next());
}).catch((err) => {
    console.error(`Could not get points. Reason: ${err}`);
});