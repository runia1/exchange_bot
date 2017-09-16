
import { AuthenticatedClient, WebsocketClient } from 'gdax';
import { MockRestClient } from "./mock-rest-client";
import { MockWebsocketClient } from "./mock-websocket-client";

const PROD = 'prod';
const TEST = 'test';

/**
 * Factory for providing data to the trade algorithm
 */
class ClientProvider  {
    
    constructor(mode, productId) {
        this._productId = productId;
        
        // use the real GDAX Clients
        if (mode === PROD) {
            // get the correct credentials from key files
            const gdax_api_uri = 'https://api.gdax.com';
            const gdax_wss_uri = 'wss://ws-feed.gdax.com';
            const gdax_api_keys = require('../keys/gdax.json');

            // create the GDAX Clients
            this.restClient = new AuthenticatedClient(gdax_api_keys.key, gdax_api_keys.secret, gdax_api_keys.passphrase, gdax_api_uri);
            this.websocketClient = new WebsocketClient([this._productId], ['user', 'matches', 'heartbeat'], gdax_wss_uri, gdax_api_keys);
        }
        // use the Mock Clients
        else {
            this.restClient = new MockRestClient();
            this.websocketClient = new MockWebsocketClient();
        }
    }

    getRestClient() {
        return this.restClient;
    }

    getWebsocketClient() {
        return this.websocketClient;
    }
}


export {
    DataProvider,
    PROD,
    TEST
};