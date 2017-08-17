

class Exponential_Moving_Average {

  constructor(timespan) {
    if (typeof timespan !== 'number'){
      throw new Error('must provide a timespan to the moving average constructor');
    }

    if (timespan <= 0) {
      throw new Error('must provide a timespan > 0 to the moving average constructor');
    }

    this.timespan = timespan;

    this.prev_sample = 0;
    this.prev_ema = 0;
    this.prev_time = 0;
  }

  /**
   * Calculate the EMA for an irregular time interval.
   * This is perfect for when orders are coming in at random intervals via a websocket api such as GDAX offers.
   */
  get_irregular_ema(sample, sample_time) {
    let new_ema = 0;

    // if this is not the first time
    if (this.prev_sample) {

      const a = (sample_time - this.prev_time) / this.timespan;
      const u = Math.exp(a * -1);

      let v = 0;
      if (a) {
        v = (1 - u) / a;
      }

      new_ema = (u * this.prev_ema) + ((v - u) * this.prev_sample) + ((1.0 - v) * sample);
    }
    else {
      new_ema = sample;
    }

    // set for next time
    this.prev_time = sample_time;
    this.prev_sample = sample;
    this.prev_ema = new_ema;

    return new_ema;
  }

}


export {
  Exponential_Moving_Average
}