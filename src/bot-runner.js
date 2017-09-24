
import { ClientProvider, PROD, TEST } from './client-provider';
import { TradeBot } from './trade-bot';
import { logMessage } from './utils';

import express from 'express';
import cors from 'cors';

const MINUTES = 60*1000;

// TODO: spawn a dozen tradeBots and see which one wins on a month's worth of data
const EMA_LENGTH = 12 * MINUTES; // 12 minutes
const BUY_THRESHOLD = 0.0000025;
const SELL_THRESHOLD = -0.0000025;
const DROP_THRESHOLD = 500.00; // if it drops this far from the all_time_high sell and send an email!
const store = false;

const PRODUCT_ID = 'BTC-USD';

// instantiate the client provider from the correct source
const clientSource = new ClientProvider(TEST, PRODUCT_ID);
const restClient = clientSource.getRestClient();
const websocketClient = clientSource.getWebsocketClient();

const tradeBot = new TradeBot(restClient, websocketClient, EMA_LENGTH, BUY_THRESHOLD, SELL_THRESHOLD, DROP_THRESHOLD, store);

tradeBot.run();


/*
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
*/


// intercept bad things :(
process.on('uncaughtException', (exception) => {
    logMessage('CRIT', 'Process Unhandled Exception', exception.message);
});

process.on('unhandledRejection', (reason, p) => {
    logMessage('CRIT', 'Process Unhandled Promise Rejection', `Unhandled Rejection, reason: ${reason}`);
});