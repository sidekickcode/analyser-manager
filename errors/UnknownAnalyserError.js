'use strict';

var inherits = require('util').inherits;

module.exports = function UnknownAnalyserError(analyserName) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = `Unknown analyser: ${analyserName}`;
};

inherits(module.exports, Error);
