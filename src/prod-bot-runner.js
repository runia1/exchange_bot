'use strict';

//import "babel-polyfill";

//import { ClientProvider, PROD, TEST } from './client-provider';
//import { TradeBot } from './trade-bot';
//import { logMessage } from './utils';

//import express from 'express';
//import cors from 'cors';

process.env.TZ = 'America/Boise';

const { ClientProvider, PROD, TEST } = require('./client-provider');
const { TradeBot } = require('./trade-bot');
const { logMessage } = require('./utils');

const express = require('express');
const cors = require('cors');

const MINUTES = 60*1000;
const HOURS = 60*MINUTES;
const DAYS = 24*HOURS;

const EMA_LENGTH1 = 1*HOURS;
const EMA_LENGTH2 = 6*HOURS;

const DROP_THRESHOLD = 500.00; // if it drops this far from the all_time_high sell and send an email!
const store = true;

const PRODUCT_ID = 'BTC-USD';

// THESE ARE UNUSED IN PROD
const start = '59c7c9210206240ce57f90af'; //'2017-08-19T05:17:35.662Z';
const end = '59c7ce9d0206240ce59a7446'; //'2017-09-24T00:00:00.000Z';

// instantiate the client provider for the correct mode
const clientSource = new ClientProvider(PROD, PRODUCT_ID, start, end);
const restClient = clientSource.getRestClient();
const websocketClient = clientSource.getWebsocketClient();

const tradeBot = new TradeBot(restClient, websocketClient, EMA_LENGTH1, EMA_LENGTH2, store);

tradeBot.run();


// set up a simple api for the monitor, this api isn't in the api script b/c it depends on data from the bot algorithm itself.
const app = express();

app.all('/*', cors()); //handle cross origin requests with this middleware

app.get('/all_time_high', (req, res) => {
    res.send({
        result: tradeBot.getAllTimeHigh()
    });
});

app.get('/position', (req, res) => {
    res.send({
        result: tradeBot.getPosition()
    });
});

// endpoints not yet handled
app.use('*', (req, res) => {
    res.send({
        result: false,
        message: 'no endpoint matches your request'
    });
});

app.listen(8081);


// intercept bad things :(
process.on('uncaughtException', (exception) => {
    logMessage('CRIT', 'Process Unhandled Exception', exception.message);
});

process.on('unhandledRejection', (reason, p) => {
    logMessage('CRIT', 'Process Unhandled Promise Rejection', `Unhandled Rejection, reason: ${reason}`);
});