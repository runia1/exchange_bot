/**
 * Calculate the EMA based on an irregular time series
 */
class EmaIrregularTimeSeries {
    constructor({length, start} = {length: 10, start: null}) {
        this.length = length;

        // if they gave us a place to start check and make sure it has the required keys
        if (start !== null) {
            if (start.timestamp === undefined) {
                throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.timestamp] undefined!');
            }
            if (start.value === undefined) {
                throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.value] undefined!');
            }
            if (start.ema === undefined) {
                throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.ema] undefined!');
            }
        }

        this.last = start;
    }

    /**
     * Calculate the next value of the ema irregulat time series
     *
     * @param next Object with keys:
     *          timestamp   number  unix timestamp
     *          value       number  the market price
     * @returns number   the new ema
     */
    nextValue(next) {
        if (this.last === null) {
            this.last = next;
            return next.value;
        }
        
        /*
        This algorithm credit to: http://www.eckner.com/papers/Algorithms%20for%20Unevenly%20Spaced%20Time%20Series.pdf
        
        out[1] = values[1];
        for (j in 2:N(X)) {
            tmp = (times[j] - times[j-1]) / tau;
            w = exp(-tmp);
            w2 = (1 - w) / tmp;
            out[j] = out[j-1] * w + values[j] * (1 - w2) + values[j-1] * (w2 - w);
        }
        */

        // calulate the amount of time that has passed since last value over the total time.
        const tmp = (next.timestamp - this.last.timestamp) / this.length;
        const w = Math.exp(-1 * tmp);
        const w2 = (1 - w) / tmp;
        
        const ema = this.last.ema * w + next.value * (1 - w2) + this.last.value * (w2 - w);
        
        // update last ema with next
        this.last = {
            ...next,
            ema
        };

        return ema;
    }
}

module.exports = {
    EmaIrregularTimeSeries
};