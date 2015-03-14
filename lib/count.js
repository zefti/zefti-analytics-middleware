var errorHandler = require('zefti-error-handler');
module.exports = function(options) {

  return function(payload, timers, fields){
    fields.forEach(function(field){
      if (timers.count[field]) {
        timers.count[field]++;
      } else {
        timers.count[field] = 1;
      }
    });
  }
};