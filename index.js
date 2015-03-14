var countLib = require('./lib/count.js');
var uniqueLib = require('./lib/unique.js');
var latencyLib = require('./lib/latency.js');
var locationLib = require('./lib/location.js');

var timers = {count:{}, unqiue:{}, retry:{}};

function main(options, dependencies) {
  console.log('deps in analytics middleware:');
  console.log(dependencies);
  var collector = dependencies.collector;

  var count = countLib(options);
  var unique = uniqueLib(options);
  var latency = latencyLib(options);
  var location = locationLib(options);

  var methods = {
      count : count
    , unique : unique
    , latency : latency
  };

  var selectedMethods = {};
  var selectedMethodFields = {};

  for (var key in options) {
    if (methods[key]) {
      selectedMethods[key] = methods[key];
      selectedMethodFields[key] = options[key];
    }
  }

  var allFields = {};
  if (options.count) {
    options.count.forEach(function(field){
      allFields[field] = 1;
    });
  }

  if (options.unique) {
    options.unique.forEach(function(field){
      allFields[field] = 1;
    });
  }

  var locationLookup = '';
  if (allFields.city) locationLookup = locationLookup + 'City';
  if (allFields.county) locationLookup = locationLookup + 'County';
  if (allFields.state) locationLookup = locationLookup + 'State';
  if (allFields.country) locationLookup = locationLookup + 'Country';
  var locationLookupByLatLon = locationLookup = 'get' + locationLookup + 'ByLatLon';
  var locationLookupByIpAddress = 'get' + locationLookup + 'ByIpAddress';


  /*
   * Set Interval for sending out data to the collector
   */
  setInterval(function(){
    var now = new Date();
    var sec = now.getTime()/1000;
    if (timers.count || timers.unique){
      var record = {time:sec, lastTry: sec, retryCount:0};
      if (timers.count) record.count = timers.count;
      if (timers.unique) record.unique = timers.unique;
      timers.retry[sec] = record;
      timers.count = {};
      timers.unique = {};
      collector.sendRecord(record, function(err, result){
        //TODO: should only log error when occurs, and will pickup by recurring process (move to general logger)
        if (err) {
          console.log(err);
        } else {
          delete timers[record.time];
        }

      });
      //Do retries, delay 5 seconds, try 5 times
      for (var key in timers.retry) {
        if (sec - key > 5) {
          if (timers.retry[key].retryCount < 5) {
            timers.retry[key].retryCount++;
            collector.sendRecord(timers.retry[key], function (err, result) {
              //TODO: should only log error when occurs, and will pickup by recurring process (move to general logger)
              if (err) {
                console.log(err);
                timers.retry[key].lastTry = sec;
              } else {
                delete timers.retry[key];
              }

            });
          } else {
            //TODO: remove console.log to standard logger
            console.log('EXCEEDED MAX RETRIES FOR SENDING TO COLLECTOR: ' + JSON.stringify(timers.retry[key]));
            delete timers.retry[key]
          }
        }
      }
    }
  }, 1000);


  return function(payload) {
    //TODO: make it so that it only queries the city/county/state/country that it needs (not all if any are missing)
    if ((allFields.city && !payload.city) || (allFields.county && !payload.county) || (allFields.state && !payload.state) || allFields.country && !payload.country) {
      var locationQuery = null;
      var criteria = null;
      if (payload.ipAddress) {
        locationQuery = locationLookupByIpAddress;
        criteria = payload.ipAddress;
      }
      if (payload.lat && payload.lon) {
        locationQuery = locationLookupByLatLon;
        criteria = {lat:payload.lat, lon:payload.lon};
      }

      if (locationQuery && criteria) {
        locationQuery(criteria, function (err, data) {
          //TODO: should probably not fail because of bad lookup, just log?
          if (err) return errorHandler(err);

          for (var key in data) {
            payload[key] = data[key];
          }

          for (var key in selectedMethods) {
            selectedMethods[key](payload, timers, selectedMethodFields[key]);
          }

        });
      }
    }
  }

}


module.exports = {
    init : main
  , retry : timers.retry
}