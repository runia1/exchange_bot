'use strict';

//import { MongoClient, ObjectId } from 'mongodb';
//import nodemailer from 'nodemailer';

const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const winston = require('winston');
const { Loggly, flushLogsAndExit } = require('winston-loggly-bulk');

// just connect the first time and the other times respond with global_db
let global_db = null;
const getDB = () => {
  if (global_db === null) {
      const mongoCredentials = require('../keys/mongo.json');
      global_db = MongoClient.connect(`mongodb://${mongoCredentials.user}:${mongoCredentials.pwd}@localhost:27017/trading?authMechanism=${mongoCredentials.authMechanism}&authSource=${mongoCredentials.authSource}`);
  }

  return global_db;
};


/**
 * Set up the winston logger
 */
const logglyCredentials = require('../keys/loggly.json');
const logger = winston.createLogger({
    level: 'silly',
    transports: [
        new Loggly({
            ...logglyCredentials,
            tags: ["Winston-NodeJS"],
            json: true
        })
    ]
});


/**
 * Send an email
 *
 * @param subject
 * @param text
 */
const sendEmail = (subject, text) => {
  const mailOptions = {
    from: gmailCredentials.email,
    to: gmailCredentials.email,
    subject: `Exchange bot: ${subject}`,
    text: text
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      logger.error(`Failed to send email on above log line. Error: ${error}`);
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

const toDigit = (float, decimals) => {
    const offset = Math.pow(10, decimals);
    return parseInt(float * offset) / offset;
};

const beforeExit = (exitData) => {
    // save the stuff we need to save
    logger.debug(`beforeExit saving: ${JSON.stringify(exitData)}`);
    getDB().then((db) => {
        return db.collection('exit_data').insertOne(exitData);
    }).then(() => {
        logger.debug('Saved the exitData.');
        flushLogsAndExit();
    }).catch((err) => {
        logger.error(`Problem saving exit data: ${err.message}, stack: ${err.stack}`);
        flushLogsAndExit();
    });
};

const beforeStart = () => {

};

module.exports = {
    getDB,
    ObjectId,
    logger,
    beforeExit,
    beforeStart,
    sendEmail,
    toDigit
};
