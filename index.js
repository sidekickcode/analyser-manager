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
const semver = require('semver');
const EventEmitter = require('events');
const inherits = require('util').inherits;

const exists = Promise.promisify(fs.stat);
const canAccess = Promise.promisify(fs.access);
const readFile = Promise.promisify(fs.readFile);

module.exports = exports = AnalyserManager;

function AnalyserManager(){
  var self = this;

  EventEmitter.call(self);

  self.ANALYSER_INSTALL_DIR = getAnalyserInstallDir();

  function init(){
    exists(self.ANALYSER_INSTALL_DIR).then(function(stat){
      canAccess(self.ANALYSER_INSTALL_DIR, fs.W_OK).then(function(){
        //all good
      }, function(err){
        throw new Error('Unable to write to sidekick analyser directory', err);
      });
    }), function(err){
      console.log('creating sidekick analyser dir..');
      try {
        fs.mkdirSync(self.ANALYSER_INSTALL_DIR);
      } catch(err){
        throw new Error('Unable to create sidekick analyser directory', err);
      }
    }
  }

  /**
   *
   * @param analyser
   * @returns Promise {path: [abs path to analyser], config: [analyser config]}
   */
  self.fetchAnalyser = function(analyserName){
    var pathToAnalyser = path.join(self.ANALYSER_INSTALL_DIR, analyserName);

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
        var fileName = path.join(self.ANALYSER_INSTALL_DIR, analyserName, 'config.json');

        readFile(fileName, {encoding: 'utf8'})
            .then(function(fileContents){
              try {
                resolve(JSON.parse(jsonWithComments(fileContents)));
              } catch(err){
                reject(new Error(`Unable to parse config file for analyser: '${analyserName}'`, err));
              }
            }, function(err){
              reject(new Error(`Unable to read config file for analyser: '${analyserName}'`, err));
            });
      });
    }
  }

  function installAnalyser(analyserName){
    self.emit('downloading');
    return new Promise(function(resolve, reject){
      fetchAnalyserList()
        .then(function(ALL_ANALYSERS){
          var analyserConfig = ALL_ANALYSERS[analyserName];
          if(analyserConfig){
            self.emit('downloaded');
            var config = analyserConfig.config; //strip the wrapper which includes registry etc..
            var version = config.version;
            if(semver(version)){
              //store the analyser config
              var newAnalyserDir = path.join(self.ANALYSER_INSTALL_DIR, `${analyserName}`);
              //var newAnalyserDir = path.join(self.ANALYSER_INSTALL_DIR, `${analyserName}@${version}`);
              fs.mkdirSync(newAnalyserDir);
              fs.writeFileSync(path.join(newAnalyserDir, 'config.json'), JSON.stringify(config));
              resolve(config);
            } else {
              reject(new Error(`Invalid version '${version}' specified for analyser '${analyserName}`));
            }
          } else {
            reject(new Error(`Unknown analyser: ${analyserName}`));
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
}
inherits(AnalyserManager, EventEmitter);
