'use strict';

import { EventEmitter } from 'events';
import { getDB, ObjectId, logMessage } from './utils';

class MockWebsocketClient extends EventEmitter {
    
    constructor(start, end) {
        super();
        
        // make the socket look like something other than null...
        this.socket = {};
        
        // lets wait half a second and them emit an open
        setTimeout(() => {
          this.emit('open');

          this.fetchPoints(start, end).then((done) => {
            logMessage('DEBUG', 'MockWebsocketClient', `Done fetching points: ${done}`);
          }).catch((err) => {
            logMessage('CRIT', 'MockWebsocketClient', `Problem fetching points: ${err}`);
          });
        }, 500);
    }

    async fetchPoints(start, end) {
      const perPage = 5000;
      let lastId = start;
      let points = [];

      const db = await getDB();

      while (lastId !== end) {
        points = await db.collection('points')
          .find({ _id: { $gt: ObjectId(lastId), $lte: ObjectId(end) } })
          .limit(perPage)
          .toArray();

        for (let point of points) {
          point.type = "match";
          this.emit('message', point);
        }
      }
    }

    connect() {
        
    }
}

export {
    MockWebsocketClient
}