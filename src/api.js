'use strict';

//import express from 'express';
//import cors from 'cors';

//import { getDB, logMessage } from './utils';

const express = require('express');
const cors = require('cors');
const { getDB, logMessage } = require('./utils');

// set up a simple api for the monitor
const app = express();

//handle cross origin requests with this middleware
app.all('/*', cors());

app.get('/points', (req, res) => {
  if (!('start' in req.query) || !('end' in req.query)) {
    return res.status(400).send({
      result: false,
      message: '/points endpoint must include start and end params'
    });
  }

  getDB().then((db) => {
    return db.collection('points')
      .find({ time: { $gte: new Date(req.query.start), $lte: new Date(req.query.end) }}, { _id: 0 })
      .sort({time: 1})
      .toArray();
  }).then((points) => {
    res.send({
      result: points
    });
  }).catch((err) => {
    res.status(500).send({
      result: false,
      message: 'could not get /points'
    });

    logMessage('CRIT', 'Database failure', `Failed to get database connection, reason: ${err}`)
  });
});

// endpoints not yet handled
app.use('*', (req, res) => {
  res.send({
    result: false,
    message: 'no endpoint matches your request'
  });
});

app.listen(8080);