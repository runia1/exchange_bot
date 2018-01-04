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
  if (global_db !== null) {
    return Promise.resolve(global_db);
  }
  else {
    const mongoCredentials = require('../keys/mongo.json');
    return MongoClient.connect(`mongodb://${mongoCredentials.user}:${mongoCredentials.pwd}@localhost:27017/trading?authMechanism=${mongoCredentials.authMechanism}&authSource=${mongoCredentials.authSource}`);
  }
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

module.exports = {
    getDB,
    ObjectId,
    logger,
    flushLogsAndExit,
    sendEmail,
    toDigit
};
