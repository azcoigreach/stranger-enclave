'use strict';

/** Server-independent tuning. Home and territory are discovered once and stored in memory. */
module.exports = Object.freeze({
  reportInterval: 100,
  planningInterval: 25,
  minimumBucket: 1000,
  optionalCpuFraction: 0.7,
  maxWorkerUnits: 3,
  downgradeUrgency: 3000,
});
