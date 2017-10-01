'use strict';

import { EventEmitter } from 'events';
import { getDB, ObjectId, logMessage } from './utils';

class MockWebsocketClient extends EventEmitter {
    
    constructor(restClient, start, end) {
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

        // if the restClient emits a 'trade' we need to emit a match so that it looks like the
        // trade resulted in a match.
        restClient.on('trade', (data) => {
          this.emit('message', {
            type: 'match',
            user_id: '521c20b3d4ab09621f000011',
            sequence: 1 // this will log an ERROR every time but that's ok for testing...
          });
        });
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

    // stubbed out
    connect() {}
}

export {
    MockWebsocketClient
}