"use strict";

const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectId;
const MovingAverage = require('moving-average');

const minutes = 60*1000;

const ma1 = MovingAverage(12 * 15 * minutes); // 12 * 15 min chunks = 12 candlestick ema for 15 min candlesticks == 180 min ema
const ma2 = MovingAverage(12 * 5 * minutes); // 12 * 5 min chunks = 12 candlestick ema for 5 min candlesticks == 60 min ema
const ma3 = MovingAverage(11 * 24 * 60 * minutes); // 11 days

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

// Time range
const end = new Date("Sat Sep 02 2017 11:45:00 GMT-0600 (MDT)");
const start = end.setDate(end.getDate()-1); // minus 1 day

getDB().then((db) => {
    return db.collection('points')
        .find({ time: { $gte: new Date(start), $lte: new Date("Sat Sep 02 2017 11:45:00 GMT-0600 (MDT)") }})
        .sort({time: 1})
        .toArray();
}).then((points) => {
    points.forEach((point) => {
        getDB().then((db) => {
            const unixTime = Date.parse(point.time);
            
            const ema1 = calc_ema(ma1, unixTime, point.price);
            const ema2 = calc_ema(ma2, unixTime, point.price);
            const ema3 = calc_ema(ma3, unixTime, point.price);
            
            db.collection('points').updateOne(
                { _id: ObjectId(point._id) },
                {
                    $set: {
                        ema2: ema1,
                        ema3: ema2,
                        ema4: ema3
                    }
                }
            ).then(() => {
                console.log(`Updating ${point._id}`);
            });
        });
    });
}).catch((err) => {
    console.error(`Could not get points. Reason: ${err}`);
});

const calc_ema = (ema, time, price) => {
    ema.push(time, price);
    return ema.movingAverage();
};