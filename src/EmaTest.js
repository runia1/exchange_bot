const { EmaIrregularTimeSeries } = require('./EmaIrregularTimeSeries');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const now = Date.now();

const startTrade = {
    timestamp: now,
    value: 10,
    expected: 10,
    ema: 10
};

const trades = [
    {
        timestamp: now + (1 * MINUTE),
        value: 12,
        expected: 12
    },
    {
        timestamp: now + (2 * MINUTE),
        value: 12,
        expected: 12
    },
    {
        timestamp: now + (2 * MINUTE),
        value: 13,
        expected: 13
    },
    {
        timestamp: now + (4 * MINUTE),
        value: 13,
        expected: 13
    },
    {
        timestamp: now + (5 * MINUTE),
        value: 13,
        expected: 13
    },
];

const ema = new EmaIrregularTimeSeries({
    length: 2 * MINUTE,
    start: startTrade
});

for(const { timestamp, value, expected } of trades) {
    console.log(`Calling with value ${value}`);

    ema.nextValue({
        timestamp,
        value
    }).then((tmpEma) => {
        console.log(`Expected: [${expected}] got: [${tmpEma}]`);
    });
}

