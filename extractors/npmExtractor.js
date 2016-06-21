/**
 * Downloads and installs an analyser from npm
 */

"use strict";
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const inherits = require('util').inherits;
const exec = require('child_process').exec;

const tgz = require('tar.gz');
const Promise = require('bluebird');
const jsonWithComments = require('strip-json-comments');
const requestCB = require('request');

const os = require('@sidekick/common/os');

const request = Promise.promisify(requestCB);
const mkdir = Promise.promisify(fs.mkdir);
const unlink = Promise.promisify(fs.unlink);

module.exports = exports = NpmExtractor;

function NpmExtractor(){
  var self = this;

  EventEmitter.call(self);

  self.fetch = function(analyser, analyserVersion, analyserInstallDir){
    var eventData = {'analyser': analyser.name, 'version': analyserVersion, 'canFailCi': analyser.failCiOnError};
    self.emit('downloading', eventData);
    return fetchNpmInfoForAnalyser(analyser.name)
        .then(function(analyserInfo){
          var specificVersionInfo, versionToInstall;

          //get the version info for latest or a specific version
          if(analyserVersion === 'latest'){
            versionToInstall = analyserInfo['dist-tags'].latest;
          } else {
            versionToInstall = analyserVersion;
          }
          specificVersionInfo = analyserInfo.versions[versionToInstall];
          if(!specificVersionInfo){
            return doReject(`Invalid version for analyser '${analyser.name}'. npm does not have version '${versionToInstall}'`);
          }

          var newAnalyserDir = path.join(analyserInstallDir, `${analyser.name}@${analyserVersion}`);
          return mkdir(newAnalyserDir)
              .then(function(){
                var tarballURL = specificVersionInfo.dist.tarball;
                var tarballName = resolveTarballName(tarballURL);
                var tarballFullPath = path.join(newAnalyserDir, tarballName);

                return fetchAnalyserTarball(tarballURL, tarballFullPath)
                    .then(function(){
                      self.emit('downloaded', eventData);
                      return unpack(tarballFullPath, newAnalyserDir)
                          .then(function(){
                            return install(newAnalyserDir, eventData);
                          })
                    });
              }, function(err) {
                return doReject(`Unable to create analyser dir for analyser '${analyser.name}'`, err);
              })
        })
  };

  self.getLatestVersion = function(analyserName){
    return fetchNpmInfoForAnalyser(analyserName)
        .then(function(analyserInfo){
          return doResolve(analyserInfo['dist-tags'].latest);
        })
  };

  function fetchNpmInfoForAnalyser(analyserName){
    const NPM_URL = `https://registry.npmjs.org/${analyserName}`;

    return request(NPM_URL)
        .then(function(response) {
          if(response.statusCode == 200) {
            self.ALL_ANALYSERS = JSON.parse(jsonWithComments(response.body));
            return Promise.resolve(self.ALL_ANALYSERS);
          } else {
            return doReject(`Unable to fetch analyser info for '${analyserName}'`, error);
          }
        }, function(err){
          return doReject(`Unable to fetch analyser info for '${analyserName}'`, error);
        })
  }

  function resolveTarballName(tarballURL){
    //npm stores tarballs as http://registry.npmjs.org/sidekick-david/-/sidekick-david-1.0.5.tgz
    return tarballURL.substr(tarballURL.lastIndexOf('/') + 1);
  }

  function fetchAnalyserTarball(tarballURL, installLocation){
    return new Promise(function(resolve, reject){

      var stream = fs.createWriteStream(installLocation);
      stream.on('finish', function(){
        resolve();
      });

      request
          .get(tarballURL)
          .on('error', function(err) {
            return reject(`Unable to fetch tarball '${tarballURL}'`, err);
          })
          .pipe(stream)
    });
  }

  function unpack(tarball, analyserDir){
    var gzipOptions = null;
    var tarOptions = {"strip": 1};  //remove package dir wrapper
    return new Promise(function(resolve, reject){

      var read = fs.createReadStream(tarball);
      var write = tgz(gzipOptions, tarOptions).createWriteStream(analyserDir);

      write.on('finish', function(){
        unlink(tarball); //remove tarball (don't fail if we cant)
        resolve();
      });
      read.on('error', reject);
      write.on('error', reject);

      read.pipe(write); //unzip then untar
    });
  }

  function install(analyserDir, eventData){
    return new Promise(function(resolve, reject){
      function puts(error, stdout, stderr) {
        if(error){
          reject(error);
        } else {
          self.emit('installed', eventData);
          resolve();
        }
      }

      self.emit('installing', eventData);
      var binInstallPath = analyserDir;
      var cmd = `cd "${binInstallPath}" && ./bin/install`;  //run bin/install
      if(!os.isPosix()){
        cmd = cmd + '.cmd'; //run /bin/install.cmd
      }
      exec(cmd, puts);
    });
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
inherits(NpmExtractor, EventEmitter);
