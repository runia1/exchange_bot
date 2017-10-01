'use strict';

//import { EventEmitter } from 'events';

const { EventEmitter } = require('events');

class MockRestClient extends EventEmitter {

    constructor() {
      super();

      this._btcHoldings = 0.00;
      this._usdHoldings = 1500.00; // start with $1500
    }

    post(endpoint, args) {
        if (endpoint[0] === 'orders') {
            const price = args.price;
            const size = args.size;

            if (args.side === 'sell') {
              this._usdHoldings = price * size;
              this._btcHoldings = 0.00;
            }
            else {
              this._usdHoldings = 0.00;
              this._btcHoldings = size;
            }
        }

        this.emit('trade', {});

        return Promise.resolve({});
    }

    request(method, args) {
        if (method === 'get' && args[0] === 'position') {
            return Promise.resolve({
              "status": "active",
              "accounts": {
                "USD": {
                  "id": "202af5e9-1ac0-4888-bdf5-15599ae207e2",
                  "balance": this._usdHoldings,
                  //"hold": "0.0000000000000000",
                  //"funded_amount": "622.4819952241817500",
                  //"default_amount": "0"
                },
                "BTC": {
                  "id": "1f690a52-d557-41b5-b834-e39eb10d7df0",
                  "balance": this._btcHoldings,
                  //"hold": "0.6000000000000000",
                  //"funded_amount": "0.0000000000000000",
                  //"default_amount": "0"
                }
              },
              "user_id": "521c20b3d4ab09621f000011",
              "profile_id": "d881e5a6-58eb-47cd-b8e2-8d9f2e3ec6f6",
              /*
              "position": {
                "type": "long",
                "size": "0.59968368",
                "complement": "-641.91999958602800000000000000",
                "max_size": "1.49000000"
              },
              */
              "product_id": "BTC-USD"
            });
        }
    }

    // TODO: maybe build this out if we need to.
    sell(args) {

    }
}

/*
// TODO: maybe make one specifically for selling / buying
const calc_taker_fees = (coin_price, coin_amount) => {
    return coin_price * coin_amount * GDAX_FEE;
};

const execute_trade = (action, price, time, slope) => {
    if (action === BUY) {
        let amount_to_buy = usd_holdings / price;
        const usd_fees = calc_taker_fees(price, amount_to_buy);

        amount_to_buy = amount_to_buy - (usd_fees / price);

        usd_holdings = 0;
        btc_holdings += amount_to_buy;

        side = BITCOIN;

        console.log(`Slope: ${slope}, Executed: BUY, at price: ${price}, at time: ${time}, fees: ${usd_fees}, usd_holdings: ${usd_holdings}, btc_holdings: ${btc_holdings}`);
    }
    else {
        let amount_to_sell = btc_holdings;
        const usd_fees = calc_taker_fees(price, amount_to_sell);

        let amount_made = (amount_to_sell * price) - usd_fees;

        usd_holdings += amount_made;
        btc_holdings = 0;

        side = USD;

        console.log(`Slope: ${slope}, Executed: SELL, at price: ${price}, at time: ${time}, fees: ${usd_fees}, usd_holdings: ${usd_holdings}, btc_holdings: ${btc_holdings}`);
    }
};
*/

module.exports = {
    MockRestClient
};