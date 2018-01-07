class Queue {
    constructor() {
        this._oldestIndex = 1;
        this._newestIndex = 1;
        this._storage = {};
    }
    
    getStorage() {
        return this._storage;
    }
    
    getSize() {
        return this._newestIndex - this._oldestIndex;
    }
    
    getOldestIndex() {
        return this._oldestIndex;
    }
    
    getDataAtIndex(index) {
        return this._storage[index];
    }
    
    enqueue(data) {
        this._storage[this._newestIndex] = data;
        this._newestIndex++
    }
    
    dequeue() {
        let deletedData;

        if (this._oldestIndex !== this._newestIndex) {
            deletedData = this._storage[this._oldestIndex];
            delete this._storage[this._oldestIndex];
            this._oldestIndex++;

            return deletedData;
        }
    }
}


/**
 * Calculate the EMA based on an irregular time series
 */
class EmaIrregularTimeSeries {
    constructor({length, start} = {}) {
        this.length = length;

        //make sure they gave us a length
        if (length === undefined) {
            throw new Error('Cannot instantiate EmaIrregularTimeSeries with [length] undefined!');
        }
        if (start === undefined) {
          throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start] undefined!');
        }
        if (start.timestamp === undefined) {
            throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.timestamp] undefined!');
        }
        if (start.value === undefined) {
            throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.value] undefined!');
        }
        if (start.ema === undefined) {
            throw new Error('Cannot instantiate EmaIrregularTimeSeries with [start.ema] undefined!');
        }

        this.last = start;
        
        this.queue = new Queue();
        
        this.queueProcessing = false;
    }

    /**
     * Calculate the next value of the ema irregulat time series
     *
     * @param next Object with keys:
     *          timestamp   number  unix timestamp in milliseconds
     *          value       number  the market price
     * @returns  Promise
     */
    nextValue(next) {

        let resolve;
        const p = new Promise((res, rej) => {
            resolve = res;
        });

        // add it to the queue
        this.queue.enqueue({
            timestamp: next.timestamp,
            value: next.value,
            resolve
        });

        // use this little trick to defer processing till later if there are still more to enqueue
        setTimeout(() => {
            this.processQueue();
        }, 0);
        
        return p;
    }
    
    processQueue() {
        if (this.queue.getSize() && !this.queueProcessing) {
            this.queueProcessing = true;

            const next = this.queue.dequeue();

            // check if there are any other things in the queue with the same timestamp
            let more = true;
            let index = this.queue.getOldestIndex();
            const valuesAtThisTimestamp = [next.value];
            const resolvesAtThisTimestamp = [next.resolve];
            while(this.queue.getSize() && more) {
                const tmp = this.queue.getDataAtIndex(index++);
                if (tmp.timestamp > next.timestamp) {
                    more = false;
                }
                // it must have the same timestamp
                else {
                    // add it to the array of values to average
                    valuesAtThisTimestamp.push(tmp.value);
                    // add it to the array of resolves
                    resolvesAtThisTimestamp.push(tmp.resolve);
                    // remove it from the queue
                    this.queue.dequeue();
                }
            }

            // average the values at this timestamp and calc the ema for the average value
            let avgValue = 0;
            for (const value of valuesAtThisTimestamp) {
                avgValue += value;
            }
            avgValue = avgValue / valuesAtThisTimestamp.length;

            const tmp = (next.timestamp - this.last.timestamp) / this.length;
            const w = Math.exp(-tmp);
            const w2 = (1 - w) / tmp;

            const ema = this.last.ema * w + avgValue * (1 - w2) + this.last.value * (w2 - w);

            // update last ema with next, and new ema
            this.last = {
                timestamp: next.timestamp,
                value: avgValue,
                ema
            };

            // reslove all the promises with the value
            for (const resolve of resolvesAtThisTimestamp) {
                resolve(ema);
            }

            this.queueProcessing = false;
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
    }
}

module.exports = {
    EmaIrregularTimeSeries
};