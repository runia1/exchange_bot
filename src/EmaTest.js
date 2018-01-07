const { EmaIrregularTimeSeries } = require('./EmaIrregularTimeSeries');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const ema = new EmaIrregularTimeSeries({
    length: 2 * MINUTE
});

const now = Date.now();

const trades = [
    {
        timestamp: now,
        value: 10,
        expected: 10
    },
    {
        timestamp: now + (1 * MINUTE),
        value: 12,
        expected: 10
    },
    {
        timestamp: now + (2 * MINUTE),
        value: 12,
        expected: 10
    },
    {
        timestamp: now + (2 * MINUTE),
        value: 13,
        expected: 10
    },
    {
        timestamp: now + (4 * MINUTE),
        value: 13,
        expected: 10
    },
    {
        timestamp: now + (5 * MINUTE),
        value: 1,
        expected: 10
    },
];

for(const { timestamp, value, expected } of trades) {
    const tmpEma = ema.nextValue({
        timestamp,
        value
    });
    
    console.log(`Expected: [${expected}] got: [${tmpEma}]`);
}

