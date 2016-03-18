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
const requestCB = require('request');
const semver = require('semver');
const _ = require('lodash');

const installLocation = require('./installLocation');
const npmExtractor = require('./extractors/npmExtractor');

const exists = Promise.promisify(fs.stat);
const canAccess = Promise.promisify(fs.access);
const readFile = Promise.promisify(fs.readFile);
const mkdir = Promise.promisify(fs.mkdir);
const request = Promise.promisify(requestCB);

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
  self.ALL_ANALYSERS;

  /**
   * Initialise the all analyser cache, create the analysers dir etc..
   * @returns {bluebird|exports|module.exports}
   */
  self.init = function() {
    return exists(self.ANALYSER_INSTALL_DIR)
      .then(function(){
        return canWrite(self.ANALYSER_INSTALL_DIR)
          .then(function(){
            return self.fetchAnalyserList();
          })
        },
        function(err){
          return mkdir(self.ANALYSER_INSTALL_DIR)
            .then(function(){
              return canWrite(self.ANALYSER_INSTALL_DIR)
                .then(function(){
                  return self.fetchAnalyserList();
                })
            })
            .catch(function(err){
              return doReject('Unable to create sidekick analyser directory', err);
            })
        }
      );

    function canWrite(dir){
      return canAccess(dir, fs.W_OK)
        .then(function(){
          return doResolve();
        })
        .catch(function(err){
          return doReject('Unable to write to sidekick analyser directory', err);
        })
    }
  };

  /**
   * Fetch a list of all the analysers that Sidekick supports
   * @returns {bluebird|exports|module.exports}
   */
  self.fetchAnalyserList = function(){
    const SK_CENTRAL_ANALYSER_LIST_URL = 'https://raw.githubusercontent.com/sidekickcode/analysers/master/analysers.json';

    return request(SK_CENTRAL_ANALYSER_LIST_URL)
      .then(function(response) {
        if(response.statusCode == 200) {
          self.ALL_ANALYSERS = JSON.parse(jsonWithComments(response.body));
          return doResolve(self.ALL_ANALYSERS);
        } else {
          return doReject('Unable to fetch list of analysers', err);
        }
      }, function(err){
        return doReject('Unable to fetch list of analysers', err);
      })
  };

  /**
   * Fetch the canonical analyser config stored in teh central list of analysers.
   * @param analyserName the name of the analyser to fetch the config for
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.fetchCanonicalAnalyserConfig = function(analyserName){
    if(!self.ALL_ANALYSERS) {
      return self.fetchAnalyserList()
        .then(function() {
          return returnConfig();
        })
    } else {
      return returnConfig();
    }

    function returnConfig(){
      var analyserConfig = self.ALL_ANALYSERS[analyserName];
      if (analyserConfig) {
        return doResolve(analyserConfig);
      } else {
        return doReject(`Unknown analyser '${analyserName}'`);
      }
    }

  };

  /**
   * Fetch and analyser object to be run (its config and path to its executable).
   * Will install the analyser for a registry if not found on the local install.
   * If no version specified and the analyser does not exist locally, it will install the latest version.
   * @param analyserName the name of the analyser to fetch the config for
   * @param version (optional) the specific version of the analyser to return data for.
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.fetchAnalyser = function(analyserName, version){
    var pathToAnalyser = path.join(self.ANALYSER_INSTALL_DIR, `${analyserName}@${version}`);

    return exists(pathToAnalyser)
      .then(function(fileStat){
        return readAnalyserConfig(pathToAnalyser)
          .then(function(configObj){
            return doResolve({path: pathToAnalyser, config: configObj});
          });
      }, function(err){
        return doReject(`Unable to fetch config for analyser '${analyserName}'`, err);
      })
  };

  /**
   * Install the analyser from a registry.
   * If the analyser already exists locally (same version) then we just return the config.
   * If no version specified it will install the latest version.
   * @param analyserName the name of the analyser to fetch the config for
   * @param version (optional) the specific version of the analyser to return data for.
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.installAnalyser = function(analyserName, version){
    var versionToInstall = version || 'latest';
    var pathToAnalyser = path.join(self.ANALYSER_INSTALL_DIR, `${analyserName}@${versionToInstall}`);

    return exists(pathToAnalyser) //checks for @latest as well as specific version
      .then(function(fileStat){
        return readAnalyserConfig(pathToAnalyser)
          .then(function(configObj){
            return doResolve({path: pathToAnalyser, config: configObj});
          });
        },
        function(err){
          if(err.code === 'ENOENT'){
            //no specific version dir or @latest dir
            return _installAnalyser(analyserName, versionToInstall)
              .then(function(configObj){
                return doResolve({path: pathToAnalyser, config: configObj});
              });
          } else {
            return doReject('Cannot read analyser install dir', err);
          }
        }
      )
  };

  /**
   * Get the latest version info for an analyser {newer: [boolean], latest: [string]}
   * @param analyserName
   * @param version
   * @returns {bluebird|exports|module.exports}
   */
  self.isNewerVersionAvailable = function(analyserName, version){
    return getAllAnalyserEntry(analyserName)
      .then(function(analyserConfig){
        if(analyserConfig.registry === 'npm') {
          var npm = new npmExtractor();
          return npm.getLatestVersion(analyserName)
            .then(function(latestVersion){
              if(semver.valid(version) && semver.valid(latestVersion)){
                return doResolve({"newer" : semver.lt(version, latestVersion), "latest": latestVersion});
              } else {
                if(semver.valid(latestVersion)){
                  //we were passed a garbage version - still useful to say what the latest version is
                  return doResolve({"latest": latestVersion});
                } else {
                  return doReject(`Invalid version '${version}' for analyser '${analyserName}'`);
                }
              }
            })
        }
      })
  };

  self.getAllAnalysersForConfig = function(repoConfig){
    var allAnalysers = _.uniq(_.flatten(_.map(repoConfig.languages, function(lang){
      var analysersForLang = [];
      _.forOwn(lang, function(value, key){
        analysersForLang.push(value);
      });
      return _.uniq(_.flatten(analysersForLang));
    })));

    //make easy - array of {name: analyserName, analyserProp1: prop1Value,...}
    var easy = _.map(allAnalysers, function(analyser){
      var name = Object.keys(analyser)[0];  //only 1 prop {"sidekick-eslint": {config}}
      var obj = {"name": name};
      return _.defaults(obj, analyser[name]);
    });
    return easy;
  };

  /**
   * Read and parse the config for a locally installed analyser
   * @param analyserPath the abs path of the analyser config file
   */
  function readAnalyserConfig(analyserPath) {
    var filePath = path.join(analyserPath, 'package', 'config.json');

    return readFile(filePath, {encoding: 'utf8'})
      .then(function(fileContents){
        try {
          return doResolve(JSON.parse(jsonWithComments(fileContents)));
        } catch(err){
          return doReject(`Unable to parse config file for analyser '${analyserPath}'`, err);
        }
      }, function(err){
        return doReject(`Unable to read config file for analyser '${analyserPath}'`, err);
      });
  }

  function _installAnalyser(analyserName, version){
    return getAllAnalyserEntry(analyserName)
      .then(function(analyserConfig){
        var config = analyserConfig.config; //strip the wrapper which includes registry etc..

        if(version !== 'latest' && !semver(version)) {
          return doReject(`Invalid version '${version}' for analyser '${analyserName}'`);
        }

        var extractor;
        //TODO - support other registries (extractors shoudl have common interface (fetch func and ee)
        if(analyserConfig.registry === 'npm') {
          extractor = new npmExtractor();
        } else {
          return doReject(`Unknown registry '${analyserConfig.registry}'`);
        }

        extractor.on('downloading', function(){self.emit('downloading', {"analyser": analyserName})});
        extractor.on('downloaded', function(){self.emit('downloaded', {"analyser": analyserName})});
        extractor.on('installing', function(){self.emit('installing', {"analyser": analyserName})});
        extractor.on('installed', function(){self.emit('installed', {"analyser": analyserName})});

        return extractor.fetch(analyserName, version, self.ANALYSER_INSTALL_DIR)
          .then(function(){
            return doResolve(config);  //return the newly installed analyser config
          })
      })
  }

  function getAllAnalyserEntry(analyserName){
    return self.fetchAnalyserList()
      .then(function (ALL_ANALYSERS) {
        var analyserConfig = ALL_ANALYSERS[analyserName];
        if (analyserConfig) {
          return doResolve(analyserConfig);
        } else {
          return doReject(`Unknown analyser '${analyserName}'`);
        }
      })
  }

  function doResolve(stuff){
    return Promise.resolve(stuff);
  }
  function doReject(errMsg, err){
    if(err && err.message){
      return Promise.reject(Error(`${errMsg}\n${err.message}`, err));
    } else {
      return Promise.reject(Error(errMsg, err));
    }
  }
}

inherits(AnalyserManager, EventEmitter);
