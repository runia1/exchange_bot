import { EventEmitter } from 'events';
import { getDB, logMessage } from './utils';

class MockWebsocketClient extends EventEmitter {
    
    constructor(start, end) {
        super();
        
        // make the socket look like something other than null...
        this.socket = {};
        
        // lets wait a second and them emit an open
        setTimout(() => {
            this.emit('open');
        }, 1000);

        // now lets start pulling historical data from the DB and emitting it.
        getDB()
            .then((db) => {
                return db.collection('points')
                    .find({ time: { $gte: new Date(start), $lte: new Date(end) }}, { time: 1, price: 1 })
                    .sort({time: 1})
                    .toArray();
            })
            .then((points) => {
                let i = 1;
                points.forEach((point) => {
                    this.emit('message', {
                        type: "match",
                        //trade_id: 10,
                        sequence: i++,
                        //maker_order_id: "ac928c66-ca53-498f-9c13-a110027a60e8",
                        //taker_order_id: "132fb6ae-456b-4654-b4e0-d681ac05cea1",
                        time: point.time,
                        //product_id: "BTC-USD",
                        //size: "5.23512",
                        price: point.price,
                        //side: "sell"
                    });
                });
            })
            .catch((err) => {
                logMessage('CRIT', 'MockWebsocketClient', `Database problem: ${err}`);
            });
    }
    
    connect() {
        
    }
}

export {
    MockWebsocketClient
}