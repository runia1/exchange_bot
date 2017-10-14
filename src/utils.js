'use strict';

//import { MongoClient, ObjectId } from 'mongodb';
//import nodemailer from 'nodemailer';

const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');

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
 * log a message and send it in an email
 *
 * @param log_level
 * @param topic
 * @param msg
 */
const logMessage = (log_level, topic, msg) => {
  msg = `${new Date()} ${log_level} => topic: ${topic} msg: ${msg}`;

  switch(log_level) {
      case 'CRIT':
      case 'ERROR':
      case 'EMERG':
          // log it with backtrace
          console.error(msg);
          // email it
          //sendEmail(topic, msg);
          break;
      case 'INFO':
          // log it
          console.log(msg);
          // email it
          //sendEmail(topic, msg);
          break;
      default:
        // log it
        console.log(msg);
        // do nothing, you can use `tail:<app name>` to see all other logs
  }
};

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
      console.log(`${new Date()} CRIT => Failed to send email on above log line. Error: ${error}`);
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
    ObjectId
    logMessage,
    sendEmail, 
    toDigit
};
