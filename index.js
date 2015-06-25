var countLib = require('./lib/count.js');
var uniqueLib = require('./lib/unique.js');
var latencyLib = require('./lib/latency.js');
var locationLib = require('./lib/location.js');

var timers = {count:{}, unqiue:{}, retry:{}};

function main(options, dependencies) {
  //console.log('deps in analytics middleware:');
  //console.log(dependencies);
  var collector = dependencies.collector;
  var geo = dependencies.geo;

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
      selectedMethodFields[key] = options[key]; //redundant to options
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

  console.log('selectedMethods::');
  console.log(selectedMethods);
  console.log('selectedMethodFields::');
  console.log(selectedMethodFields);
  console.log('allFields::');
  console.log(allFields);


  /*
   * Set Interval for sending out data to the collector
   */
  setInterval(function(){
    var now = new Date();
    var sec = Math.round(now.getTime()/1000);
    if (timers.count || timers.unique){
      var record = {time:sec, lastTry: sec, retryCount:0};
      console.log('timers are:');
      console.log(timers);
      if (timers.count) record.count = timers.count;
      if (timers.unique) record.unique = timers.unique;
      timers.retry[sec] = record;
      timers.count = {};
      timers.unique = {};
      console.log('collector - sending a record');
      collector.sendRecord(record, function(err, result){
        /*console.log('err is:');
        console.log(err);
        console.log('result is:');
        console.log(result.body);*/
        //TODO: should only log error when occurs, and will pickup by recurring process (move to general logger)
        if (err) {
          console.log(err);
        } else {
          console.log('deleting');

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
    geoLookup(payload, function(err, data){
      //TODO: change to standard error logger
      if (err) console.log(err);
      if (data) {
        for (var key in data) {
          payload[key] = data[key];
        }
      }
      for (var key in selectedMethods) {
        selectedMethods[key](payload, timers, selectedMethodFields[key]);
      }
    });
  };

  function geoLookup(payload, cb){
    var locationFlag = null;
    var locationQuery = 'get';
    var criteria = null;

    if (allFields.city && !payload.city) {
      locationQuery = locationLookup + 'City';
      locationFlag = true;
    }
    if (allFields.county && !payload.county) {
      locationQuery = locationLookup + 'County';
      locationFlag = true;
    }
    if (allFields.state && !payload.state) {
      locationQuery = locationLookup + 'State';
      locationFlag = true;
    }
    if (allFields.country && !payload.country) {
      locationQuery = locationLookup + 'Country';
      locationFlag = true;
    }

    if (payload.lat && payload.lon) {
      locationQuery = locationLookup + 'ByLatLon';
      criteria = {lat:payload.lat, lon:payload.lon};
    } else if (payload.ipAddress) {
      locationQuery = locationLookup + 'ByIpAddress';
      criteria = payload.ipAddress;
    }

    if (locationFlag && criteria) {
      geo[locationQuery](criteria, function(err, data){
        return cb(err, data);
      });
    } else {
      return cb(null, null);
    }
  }
}




module.exports = {
    init : main
  , retry : timers.retry
}