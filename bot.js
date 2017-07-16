/**
 * Created by mar on 7/15/17.
 */

'use strict';

import { AuthenticatedClient, WebsocketClient } from 'gdax';

let args = {};
console.log('exchange_bot started with cmdline args...');
process.argv.forEach((val, index) => {
    if (index > 1) {
        if (val.includes('=')) {
            const val_array = val.split('=');
            args[val_array[0]] = val_array[1];
        }
        else {
            throw Error(`Called exchange_bot with invalid argument: ${$val}`);
        }
    }
});
console.dir(args);

if (!args.hasOwnProperty('mode') || (args.mode !== 'test' && args.mode !== 'prod')) {
    throw Error('Required argument "mode=test|prod" was not provided.');
}

let gdax_api_uri = null;
let gdax_api_keys = null;

if (args.mode === 'test') {
    gdax_api_uri = 'https://api.gdax.com';
    gdax_api_keys = require(`${__dirname}/../keys/gdax.json`);
    
}
else {
    gdax_api_uri = 'https://api-public.sandbox.gdax.com';
    gdax_api_keys = require(`${__dirname}/../keys/gdax_sandbox.json`);
}

const client = new AuthenticatedClient(gdax_api_keys.key, gdax_api_keys.secret, gdax_api_keys.passphrase, gdax_api_uri);

const websocket = new WebsocketClient(['BTC-USD']);
websocket.on('message', (data) => {
    console.log(data); 
});