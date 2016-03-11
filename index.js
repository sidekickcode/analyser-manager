/**
 * Used to fetch a Sidekick analyser from a registry and install it.
 * Emits events if downloading [downloading, downloaded]
 */

"use strict";

const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');

const Promise = require('bluebird');
const jsonWithComments = require('strip-json-comments');
const request = require('request');

const exists = Promise.promisify(fs.stat);
const readFile = Promise.promisify(fs.readFile);

const ANALYSER_INSTALL_DIR = getAnalyserInstallDir();

module.exports = exports;

module.exports.ANALYSER_INSTALL_DIR = ANALYSER_INSTALL_DIR;

function init(){
  exists(ANALYSER_INSTALL_DIR).then(function(stat){
    //all good
  }), function(err){
    console.log('creating sidekick analyser dir..');
    //create sidekick dir with read options
  }
}
init();

/**
 *
 * @param analyser
 * @returns Promise {path: [abs path to analyser], config: [analyser config]}
 */
module.exports.fetchAnalyser = function(analyserName){
  var pathToAnalyser = path.join(ANALYSER_INSTALL_DIR, analyserName);

  return new Promise(function(resolve, reject){
    exists(pathToAnalyser)
      .then(function(fileStat){
        fetchAnalyserConfig(analyserName, true)
          .then(function(configObj){
            resolve({path: pathToAnalyser, config: configObj});
          }, reject);
      }, function(err){
        if(err.code === 'ENOENT'){
          fetchAnalyserConfig(analyserName, false)
            .then(function(configObj){
              resolve({path: pathToAnalyser, config: configObj});
            }, reject);
        } else {
          reject(new Error('Cannot read analyser install dir', err));
        }
      });
  });
};


/**
 * Fetch and analyser from sidekick central
 * @param analyserName
 */
function fetchAnalyserConfig(analyserName, isAlreadyInstalled) {
  return new Promise(function(resolve, reject){
    if(isAlreadyInstalled) {
      readAnalyserConfig(analyserName).then(resolve, reject);
    } else {
      installAnalyser(analyserName).then(resolve, reject);
    }
  });

  function readAnalyserConfig(analyserName){
    return new Promise(function(resolve, reject){
      var fileName = path.join(ANALYSER_INSTALL_DIR, analyserName, 'config.json');

      readFile(fileName, {encoding: 'utf8'})
        .then(function(fileContents){
          resolve(JSON.parse(jsonWithComments(fileContents)));
        }, function(err){
          reject(new Error(`Unable to read config file for analyser: '${analyserName}'`, err));
        });
    });
  }
}

function installAnalyser(analyserName){
  return new Promise(function(resolve, reject){
    fetchAnalyserList()
      .then(function(ALL_ANALYSERS){
        var analyserConfig = ALL_ANALYSERS[analyserName];
        if(analyserConfig){
          var config = analyserConfig.config; //strip the wrapper which includes registry etc..

          //store the analyser config
          var newAnalyserDir = path.join(ANALYSER_INSTALL_DIR, analyserName);
          fs.mkdirSync(newAnalyserDir);
          fs.writeFileSync(path.join(newAnalyserDir, 'config.json'), JSON.stringify(config));

          resolve(config);
        } else {
          reject(new Error('Unknown analyser: ' + analyserName));
        }
      });

    function fetchAnalyserList(){
      const SK_CENTRAL_ANALYSER_LIST_URL = 'https://raw.githubusercontent.com/sidekickcode/analysers/master/analysers.json';

      return new Promise(function(resolve, reject){
        request(SK_CENTRAL_ANALYSER_LIST_URL, function (error, response, body) {
          if(!error && response.statusCode == 200) {
            resolve(JSON.parse(jsonWithComments(body)));
          } else {
            reject(new Error('Unable to fetch list of analysers', error));
          }
        })
      });
    }
  });
}

/**
 * Returns the location of our analysers
 * %APPDATA% on Windows
 * $XDG_CONFIG_HOME or ~/.config on Linux
 * ~/Library/Application Support on OS X
 * @returns {string}
 */
function getAnalyserInstallDir(){
  var currentOs = process.platform;

  switch (currentOs) {
    case 'win32':
      return `${process.env.APPDATA}\\sidekick\\analysers`;
    case 'darwin':
      return `${os.homedir()}/Library/Application Support/sidekick/analysers`;
    case 'linux':
      return '/var/local/sidekick/analysers';
    default :
      throw new Error(`Unsupported os: ${currentOs}`);
  }
}
