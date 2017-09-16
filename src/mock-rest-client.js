
class MockRestClient {
    buy() {
        
    }
    
    sell() {
        
    }
    
    request(method, args) {
        
    }
}

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

export {
    MockRestClient
}