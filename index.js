/**
 * Used to fetch a Sidekick analyser from a registry and install it.
 * Emits events if downloading [downloading, downloaded, installed]
 */

"use strict";

const proxyAll = require("@sidekick/common/eventHelpers").proxyAll;

const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const inherits = require('util').inherits;

const Promise = require('bluebird');
const jsonWithComments = require('strip-json-comments');
const requestCB = require('request');
const semver = require('semver');
const _ = require('lodash');
const debug = require('debug')('analyser-manager');

const npmExtractor = require('./extractors/npmExtractor');
const UnknownAnalyserError = require('./errors/UnknownAnalyserError');

const exists = Promise.promisify(fs.stat);
const remove = Promise.promisify(fs.remove);
const canAccess = Promise.promisify(fs.access);
const readFile = Promise.promisify(fs.readFile);
const mkdir = Promise.promisify(fs.mkdir);
const request = Promise.promisify(requestCB);

module.exports = exports = AnalyserManager;

/**
 * Create instance
 * @param analyserInstallLocation where to install the analysers to (absolute path)
 * @constructor
 */
function AnalyserManager(analyserInstallLocation){
  var self = this;

  EventEmitter.call(self);

  self.ANALYSER_INSTALL_DIR = analyserInstallLocation;
  self.ALL_ANALYSERS = null;

  /**
   * Initialise the all analyser cache, create the analysers dir etc..
   * @returns {bluebird|exports|module.exports}
   */
  self.init = function() {
    return exists(self.ANALYSER_INSTALL_DIR)
      .then(function(){
        debug('install dir exists');
        return canWrite(self.ANALYSER_INSTALL_DIR)
          .then(function(){
            debug('install dir writeable');
            return self.fetchAnalyserList();
          })
        },
        function(){
          debug('install dir does not exists');
          return mkdir(self.ANALYSER_INSTALL_DIR)
            .then(function(){
              debug('install dir now exists');
              return canWrite(self.ANALYSER_INSTALL_DIR)
                .then(function(){
                  debug('install dir now writeable');
                  return self.fetchAnalyserList();
                })
            })
            .catch(function(cantMakeDirErr){
              return doReject(`Unable to create sidekick analyser directory: ${self.ANALYSER_INSTALL_DIR}`, cantMakeDirErr);
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
    const REPO_SLUG = "sidekickcode/analysers/master/analysers.json";
    const RAWGIT_SK_CENTRAL_ANALYSER_LIST_URL = 'https://cdn.rawgit.com/' + REPO_SLUG;
    const SK_CENTRAL_ANALYSER_LIST_URL = 'https://raw.githubusercontent.com/' + REPO_SLUG;

    return fetchList(RAWGIT_SK_CENTRAL_ANALYSER_LIST_URL)
      .then((allAnalysers) => {
        debug('have analysers list from rawgit: ');
        self.ALL_ANALYSERS = allAnalysers;
        return doResolve(self.ALL_ANALYSERS);
      }, () => {  //.error() didn't work - weird
        return fetchList(SK_CENTRAL_ANALYSER_LIST_URL)
          .then((allAnalysers) => {
            debug('have analysers list from github: ');
            self.ALL_ANALYSERS = allAnalysers;
            return doResolve(self.ALL_ANALYSERS);
          });
      });

    function fetchList(URL){
      return request(URL)
        .then(function(response) {
          if(response.statusCode == 200) {
            return JSON.parse(jsonWithComments(response.body));
          } else {
            debug('analyser list unavailable: ' + JSON.stringify(response, null, 4));
            return doReject('Unable to fetch list of analysers');
          }
        }, function(err){
          debug('error fetching analyser list');
          return doReject('Unable to fetch list of analysers', err);
        })
    }
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
   * @param analyser {name, version} the name of the analyser to fetch the config for
   * @param force (optional) override the existing analysers found in the install location.
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.installAnalyser = function(analyser, force){
    var haveVersion;
    if(!analyser.version || analyser.version === 'latest'){
      haveVersion = self.isNewerVersionAvailable(analyser.name);
    } else {
      haveVersion = Promise.resolve({"latest": analyser.version});
    }

    return haveVersion.then(function(version){
      var versionToInstall = version.latest;
      var pathToAnalyser = path.join(self.ANALYSER_INSTALL_DIR, `${analyser.name}@${versionToInstall}`);

      return exists(pathToAnalyser) //checks for specific version
        .then(function(fileStat) {
              if(force){
                return remove(pathToAnalyser)
                    .then(() => {
                      return _installAnalyser(analyser, versionToInstall)
                          .then(function (configObj) {
                            return doResolve({path: pathToAnalyser, config: configObj});
                          });
                    })
              } else {
                return readAnalyserConfig(pathToAnalyser)
                    .then(function (configObj) {
                      return doResolve({path: pathToAnalyser, config: configObj});
                    });
              }
            },
            function(err){
              if(err.code === 'ENOENT'){
                //no specific version dir or @latest dir
                return _installAnalyser(analyser, versionToInstall)
                    .then(function(configObj){
                      return doResolve({path: pathToAnalyser, config: configObj});
                    });
              } else {
                return doReject('Cannot read analyser install dir', err);
              }
            }
        )
    });

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
        var extractor;
        if(analyserConfig.registry === 'npm') {
          extractor = new npmExtractor();
        }
        proxyAll(extractor, self);

        return extractor.getLatestVersion(analyserName)
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
        })
  };

  /**
   * Validate a list of analysers - removing any unknown analysers
   * @param analysers Array of possible analysers
   * @retuns Array of known analysers
   */
  self.validateAnalyserList = function(analysers){
    var validAnalysers = [];
    debug('analysers to validate: ' + JSON.stringify(analysers));

    return new Promise(function(resolve, reject){
      if(self.ALL_ANALYSERS){
        debug('have analyser list');
        doResolve();
      } else {
        self.fetchAnalyserList()
          .then(function(ALL_ANALYSER){
            debug('have fetched analyser list: ' + ALL_ANALYSER);
            doResolve();
          });
      }

      function doResolve(){
        debug('resolving..');
        _.each(analysers, function(analyser){
          debug('resolving ' + JSON.stringify(analyser));
          if(analyser.name){
            if(self.ALL_ANALYSERS[analyser.name]){
              validAnalysers.push(analyser);
            }
          }
        });
        resolve(validAnalysers);
      }
    });
  };

  /**
   * Finds the latest version of an installed analyser by comparing directory names.
   * e.g. if a dire contains my-analyser@1.0.2 and my-analyser@1.10.0, then '1.10.0' will be returned
   * @param analyserName the name of the analyser to search for
   * @returns String
   */
  self.getLatestVersionOfInstalledAnalyser = function(analyserName){
    //find all dirs that start with analyserName
    const allAnalyserDirs = getDirectories(self.ANALYSER_INSTALL_DIR, analyserName);

    if(allAnalyserDirs.length === 0){
      return null;
    } else {
      const versions = _.map(allAnalyserDirs, function(dir){
        return dir.substr(dir.indexOf('@') + 1);
      });
      _.remove(versions, function(version){
        return !semver.valid(version);
      });

      const ascVersions =_.sortBy(versions, function(version){
        return version;
      });

      return ascVersions[ascVersions.length -1];
    }

    function getDirectories(basePath, analyserName) {
      if(isDir(basePath)){
        return fs.readdirSync(basePath).filter(function(file) {
          const stat = fs.statSync(path.join(basePath, file));
          const re = new RegExp(`^${analyserName}@`, "i");
          return stat.isDirectory() && re.test(file);
        });
      } else {
        return [];
      }
    }
  };

  /**
   * Gets a list of all the installed analysers (name only)
   * @returns Array
   */
  self.getAllInstalledAnalysers = function(){
    if(isDir(self.ANALYSER_INSTALL_DIR)){
      return fs.readdirSync(self.ANALYSER_INSTALL_DIR).filter(function(file) {
        const stat = fs.statSync(path.join(self.ANALYSER_INSTALL_DIR, file));
        const re = new RegExp(`@`, "i");
        return stat.isDirectory() && re.test(file);
      });
    } else {
      return [];
    }
  };

  /**
   * Read and parse the config for a locally installed analyser
   * @param analyserPath the abs path of the analyser config file
   */
  function readAnalyserConfig(analyserPath) {
    var filePath = path.join(analyserPath, 'config.json');

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

  function _installAnalyser(analyser, version){
    return getAllAnalyserEntry(analyser.name)
      .then(function(analyserConfig){
        var config = analyserConfig.config; //strip the wrapper which includes registry etc..

        if(version !== 'latest' && !semver(version)) {
          return doReject(`Invalid version '${version}' for analyser '${analyser.name}'`);
        }

        var extractor;
        //TODO - support other registries (extractors shoudl have common interface (fetch func and ee)
        if(analyserConfig.registry === 'npm') {
          extractor = new npmExtractor();
        } else {
          return doReject(`Unknown registry '${analyserConfig.registry}'`);
        }
        proxyAll(extractor, self);

        return extractor.fetch(analyser, version, self.ANALYSER_INSTALL_DIR)
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
          return Promise.reject(new UnknownAnalyserError(analyserName));
        }
      })
  }

  function isDir(dir){
    try {
      var stat = fs.statSync(dir);
      return stat !== undefined;
    } catch (e){
      return false;
    }
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
