global.__base = __dirname + '/';

var
  use_https = true,
  argv = require('minimist')(process.argv.slice(2)),
  https = require('https'),
  fs = require('fs'),
  app = require('express')(),
  _ = require('lodash'),
  parser = require('xmldom').DOMParser,
  XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest,
  sendPostRequest = require('request').post,
  cors = require('cors'),
  portastic = require('portastic');
  const path = require("path");
  const ConfigParser = require('configparser');
  const config = new ConfigParser();

////////// EXPERIMENT GLOBAL PARAMS //////////

var gameport;
var store_port;
var store_process;

const settings_file = '../settings.conf';
try{
  config.read(settings_file);
} catch {
  console.log("Failed to read config file. Make sure settings.conf exists and that you started app.js with the experiments folder as working directory.")
}

var CONFIGFILE;
const DEFAULT_CONFIG_FILENAME = config.get('DEFAULTS', 'CONFIG_FILENAME');
if ("CAB_CONFIGFILE" in process.env) {
  CONFIGFILE = process.env["CAB_CONFIGFILE"]
} else {
  CONFIGFILE = path.join(process.env['HOME'], DEFAULT_CONFIG_FILENAME);
}

if (fs.existsSync(CONFIGFILE)) {
  config.read(CONFIGFILE);
} else {
  console.log(`No config exists at path ${CONFIGFILE}, check settings`);
}

var cur_path = process.cwd();
// make sure that we're launching store.js from the right path
if (cur_path.indexOf('/experiments') === -1) {
  cur_path = cur_path + '/experiments/';
} else {
  cur_path = cur_path + '/';
}

if (argv.gameport) {
  try {
    if ((argv.gameport < 8850) || (argv.gameport > 8999)) {
      throw 'error';
    } else {
      gameport = argv.gameport;
      console.log('using public facing port ' + gameport);
    }
  } catch (err) {
    console.log('invalid gameport: choose a gameport between 8850 and 8999');
    process.exit();
  }
} else {
  gameport = 8886;
  console.log('no gameport specified: using 8886\nUse the --gameport flag to change');
}

// we launch store.js ourselves
// find free internal port
portastic.find({
  min: 4000,
  max: 5000,
  retrieve: 1
}).then(ports => {
  store_port = ports;
  if (argv.local_store) {
    console.log('using local store on port ' + store_port);
    // launch store.js
    store_process = require('child_process').spawn('node', [cur_path+'store_local.js', '--port', store_port], {stdio: 'inherit'});
    console.log("⚠️ LOCAL STORAGE IS BEING USED. THIS IS NOT RECOMMENDED FOR PRODUCTION. YOU MIGHT LOOSE DATA. USE A DATABASE INSTEAD. ⚠️");
  } else {
    console.log('using mongoDB store on port ' + store_port);
    // launch store.js
    store_process = require('child_process').spawn('node', [cur_path+'store.js', '--port', store_port], {stdio: 'inherit'});
  }
});


try {
  var privateKey = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/privkey.pem'),
    certificate = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/cert.pem'),
    intermed = fs.readFileSync('/etc/letsencrypt/live/cogtoolslab.org/chain.pem'),
    options = { key: privateKey, cert: certificate, ca: intermed },
    server = require('https').createServer(options, app).listen(gameport),
    io = require('socket.io')(server);
} catch (err) {
  console.log("cannot find SSL certificates; falling back to http");
  var server = app.listen(gameport),
    io = require('socket.io')(server);
}

// serve stuff that the client requests
app.get('/*', (req, res) => {
  serveFile(req, res);
});

io.on('connection', function (socket) {
  console.log('\t :: Express :: client connected');

  // on request serve the stimulus data
  socket.on('getStims', function (data) {
    console.log('getStims');
    var proj_name = data.proj_name;
    var exp_name = data.exp_name;
    var iter_name = data.iter_name;
    initializeWithTrials(socket, proj_name, exp_name, iter_name);
  });
  // write data to db upon getting current data
  socket.on('currentData', function (data) {
    console.log('currentData received: ' + JSON.stringify(data).substring(0,200));
    // Increment games list in mongo here
    var proj_name = data.projName;
    var exp_name = data.expName;
    var iter_name = data.iterName;
    writeDataToMongo(data, proj_name, exp_name, iter_name);
  });
  // on request serve the stimulus data
  socket.on('getStatistics', function (data) {
    console.log('getStatistics');
    var proj_name = data.proj_name;
    var exp_name = data.exp_name;
    var iter_name = data.iter_name;
    getExperimentStats(socket, proj_name, exp_name, iter_name);
  });

});

FORBIDDEN_FILES = ["auth.json"]

var serveFile = function (req, res) {
  var fileName = req.params[0];
  if (FORBIDDEN_FILES.includes(fileName)) {
    // Don't serve files that contain secrets
    console.log("Forbidden file requested: " + filename);
    return;
  }
  console.log('\t :: Express :: file requested: ' + fileName);
  return res.sendFile(fileName, { root: __dirname });
};

function omit(obj, props) { //helper function to remove _id of stim object
  try{
    props = props instanceof Array ? props : [props]
    return eval(`(({${props.join(',')}, ...o}) => o)(obj)`)
  } catch (err) {
    return obj;
  }
}

function initializeWithTrials(socket, proj_name, collection, it_name) {
  var gameid = UUID();
  // var colname = 'human-physics-benchmarking-dominoes-pilot_production_1'; //insert STIMULI DATASETNAME here
  sendPostRequest('http://localhost:' + store_port + '/db/getstims', {
    json: {
      dbname: proj_name + '_input',
      colname: collection,
      it_name: it_name,
      gameid: gameid
    }
  }, async (error, res, body) => {
    if (!error && res.statusCode === 200 && typeof body !== 'undefined') {
      let missingAssets = [];

      // check the stim for missing assets
      for (const type of ['stims', 'familiarization_stims']) {
        const stims = body[type] || {};
        for (const stim in stims) {
          try {
            for (const key in Object.keys(stim)) {
              if (key.endsWith('_url')) {
                 const response = await fetch(stim[key], {
                   method: 'OPTIONS'
                 });
                 if (response.status !== 200) {
                    missingAssets.push({stim_id: stim._id, key, url: stim[key]});
                 }
              }
            }
          } catch (e) {
            missingAssets.push({stim_id: stim._id, type, key, url: stim[key]});
          }
        }
      }

      missingAssets.push({stim_id: 1, key: 2, url: "http://"});

      if (missingAssets.length > 0) {
        console.log(`missing assets: ${missingAssets}`);
        sendPostRequest('http://localhost:' + store_port + '/notify', {
          json: {
            token: config.get('GENERAL', 'notify_token'),
            dbname: proj_name + '_input',
            colname: collection,
            it_name: it_name,
            inputid: body['_id'],
            missingAssets
          }
        }, (error, res, body) => {
          // Retry with another sequence
          initializeWithTrials(socket, proj_name, collection, it_name);
        });
      }

      // send trial list (and id) to client
      var packet = {
        gameid: gameid,
        inputid: body['_id'], // using the mongo record ID
        stims: omit(body.stims, ['_id']),
        familiarization_stims: omit(body.familiarization_stims, ['_id']),
        stim_version: body.stim_version, //TODO fix stim version
        // TODO add other properties here

      };
      socket.emit('stims', packet);
    } else {
      console.log(`error getting stims: ${error} ${body}`);
    }
  });
}

function getExperimentStats(socket, proj_name, collection, it_name) {
  sendPostRequest('http://localhost:' + store_port + '/db/getstatistics', {
    json: {
      dbname: proj_name + '_input',
      colname: collection,
      it_name: it_name,
    }
  }, (error, res, body) => {
    if (!error && res.statusCode === 200 && typeof body !== 'undefined') {
      var packet = {
        statistics: body.statistics,
      };
      socket.emit('statistics', packet);
    } else {
      console.log(`error getting statistics: ${error} ${body}`);
    }
  });
}

var UUID = function () {
  var baseName = (Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10) + '' +
    Math.floor(Math.random() * 10));
  var template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  var id = baseName + '-' + template.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
  return id;
};

var writeDataToMongo = function (data, proj_name, collection, it_name) {
  var db = proj_name + '_output';
  sendPostRequest(
    'http://localhost:' + store_port + '/db/insert',
    {
      json: data,
    },
    (error, res, body) => {
      if (!error && res.statusCode === 200) {
        console.log(`sent data to store`);
      } else {
        console.log(`error sending data to store: ${error} ${body}`);
      }
    }
  );
};