/**
 * Used to fetch a Sidekick analyser from a registry and install it.
 * Emits events if downloading [downloading, downloaded, installed]
 */

"use strict";

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const inherits = require('util').inherits;

const Promise = require('bluebird');
const jsonWithComments = require('strip-json-comments');
const request = require('request');
const semver = require('semver');

const installLocation = require('./installLocation');
const npmExtractor = require('./extractors/npmExtractor');

const exists = Promise.promisify(fs.stat);
const canAccess = Promise.promisify(fs.access);
const readFile = Promise.promisify(fs.readFile);

module.exports = exports = AnalyserManager;

/**
 * Create instance
 * @param analyserInstallLocation (optional)
 * @constructor
 */
function AnalyserManager(analyserInstallLocation){
  var self = this;

  //if the installation location if the analysers is not specified, use detault.
  if(!analyserInstallLocation){
    analyserInstallLocation = installLocation();
  }

  EventEmitter.call(self);

  self.ANALYSER_INSTALL_DIR = analyserInstallLocation;

  function init(){
    exists(self.ANALYSER_INSTALL_DIR)
      .then(function(stat){
        canAccess(self.ANALYSER_INSTALL_DIR, fs.W_OK)
          .then(function(){
            //all good
          }, function(err){
            throw new Error('Unable to write to sidekick analyser directory', err);
          });
    }, function(err){
      console.log('creating sidekick analyser dir..');
      try {
        fs.mkdirSync(self.ANALYSER_INSTALL_DIR);
        //all good
      } catch(err){
        throw new Error('Unable to create sidekick analyser directory', err);
      }
    })
  }
  init();

  /**
   * Fetch and analyser object to be run (its config and path to its executable).
   * Will install the analyser for a registry if not found on the local install.
   * If no version specified and the analyser does not exist locally, it will install the latest version.
   * @param analyser the name of the analyser to fetch the config for
   * @param version (optional) the specific version of the analyser to return data for.
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.fetchAnalyser = function(analyserName, version){
    var pathToAnalyser = path.join(self.ANALYSER_INSTALL_DIR, analyserName);

    return new Promise(function(resolve, reject){
      exists(pathToAnalyser)
        .then(function(fileStat){
          fetchAnalyserConfig(analyserName, version, true)
            .then(function(configObj){
              resolve({path: pathToAnalyser, config: configObj});
            }, reject);
        }, function(err){
          if(err.code === 'ENOENT'){

            if(!version) {
              version = 'latest';
            }

            fetchAnalyserConfig(analyserName, version, false)
              .then(function(configObj){
                resolve({path: pathToAnalyser, config: configObj});
              }, reject);
          } else {
            reject(new Error('Cannot read analyser install dir', err));
          }
        });
    });
  };

  self.isNewerVersionAvailable = function(analyserName, version){
    return new Promise(function(resolve, reject){
      getAllAnalyserEntry(analyserName)
        .then(function(analyserConfig){
          if(analyserConfig.registry === 'npm') {
            var npm = new npmExtractor();
            npm.getLatestVersion(analyserName)
              .then(function(latestVersion){
                if(semver.valid(version) && semver.valid(latestVersion)){
                  resolve({"newer" : semver.lt(version, latestVersion), "latest": latestVersion});
                } else {
                  if(semver.valid(latestVersion)){
                    //we were pased a garbage version - still useful to say what the latest version is
                    resolve({"latest": latestVersion});
                  } else {
                    reject(new Error(`Invalid version '${version}' for analyser '${analyserName}'`));
                  }
                }
              }, reject)
          }
        }, reject)
    });
  };

  /**
   * Fetch an analyser config from sidekick central
   * @param analyserName
   * @param version the version of the analyser to fetch config for
   * @param isAlreadyInstalled boolean - is the analyser already on the local machine
   */
  function fetchAnalyserConfig(analyserName, version, isAlreadyInstalled) {
    return new Promise(function(resolve, reject){
      if(isAlreadyInstalled) {
        readAnalyserConfig(analyserName).then(resolve, reject);
      } else {
        installAnalyser(analyserName, version).then(resolve, reject);
      }
    });

    function readAnalyserConfig(analyserName){
      return new Promise(function(resolve, reject){
        var fileName = path.join(self.ANALYSER_INSTALL_DIR, analyserName, 'config.json');

        readFile(fileName, {encoding: 'utf8'})
          .then(function(fileContents){
            try {
              resolve(JSON.parse(jsonWithComments(fileContents)));
            } catch(err){
              reject(new Error(`Unable to parse config file for analyser '${analyserName}'`, err));
            }
          }, function(err){
            reject(new Error(`Unable to read config file for analyser '${analyserName}'`, err));
          });
      });
    }
  }

  function installAnalyser(analyserName, version){
    return new Promise(function(resolve, reject){
      getAllAnalyserEntry(analyserName)
        .then(function(analyserConfig){
          var config = analyserConfig.config; //strip the wrapper which includes registry etc..

          if(version !== 'latest' && !semver(version)) {
            reject(new Error(`Invalid version '${version}' for analyser '${analyserName}'`));
          }

          if(analyserConfig.registry === 'npm'){
            var npm = new npmExtractor();

            npm.on('downloading', function(){self.emit('downloading')});
            npm.on('downloaded', function(){self.emit('downloaded')});
            npm.on('installing', function(){self.emit('installing')});
            npm.on('installed', function(){self.emit('installed')});

            npm.fetch(analyserName, version, self.ANALYSER_INSTALL_DIR)
            .then(function(){
              resolve(config);  //return the newly installed analyser config
            }, function(err){
              reject(err);  //unable to install analyser
            });
          }
        }, reject);
    });
  }

  function getAllAnalyserEntry(analyserName){
    return new Promise(function(resolve, reject) {
      fetchAnalyserList()
        .then(function (ALL_ANALYSERS) {
          var analyserConfig = ALL_ANALYSERS[analyserName];
          if (analyserConfig) {
            resolve(analyserConfig);
          } else {
            reject(new Error(`Unknown analyser '${analyserName}'`));
          }
        })
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
  }
}

inherits(AnalyserManager, EventEmitter);
