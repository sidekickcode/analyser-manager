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

const request = Promise.promisify(requestCB);
const mkdir = Promise.promisify(fs.mkdir);
const unlink = Promise.promisify(fs.unlink);

module.exports = exports = NpmExtractor;

function NpmExtractor(){
  var self = this;

  EventEmitter.call(self);

  self.fetch = function(analyserName, analyserVersion, analyserInstallDir){
    self.emit('downloading');
    return fetchNpmInfoForAnalyser(analyserName)
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
          return doReject(`Invalid version for analyser '${analyserName}'. npm does not have version '${versionToInstall}'`);
        }

        var newAnalyserDir = path.join(analyserInstallDir, `${analyserName}@${analyserVersion}`);
        return mkdir(newAnalyserDir)
          .then(function(){
            var tarballURL = specificVersionInfo.dist.tarball;
            var tarballName = resolveTarballName(tarballURL);
            var tarballFullPath = path.join(newAnalyserDir, tarballName);

            return fetchAnalyserTarball(tarballURL, tarballFullPath).then(function(){
              self.emit('downloaded');
              return unpack(tarballFullPath, newAnalyserDir);
            });

          }, function(err) {
            return doReject(`Unable to create analyser dir for analyser '${analyserName}'`, err);
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
    var stream = fs.createWriteStream(installLocation);

    return new Promise(function(resolve, reject){
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
    return new Promise(function(resolve, reject){
      var read = fs.createReadStream(tarball);
      var write = tgz().createWriteStream(analyserDir);

      write.on('finish', function(){
        function puts(error, stdout, stderr) {
          if(error){
            reject(error);
          } else {
            self.emit('installed');
            resolve();
          }
        }

        self.emit('installing');
        unlink(tarball); //remove tarball (don't fail if we cant)
        var binInstallPath = path.join(analyserDir, '/package');
        exec(`cd "${binInstallPath}" && ./bin/install`, puts); //run bin/install
      });
      read.on('error', reject);
      write.on('error', reject);

      read.pipe(write); //unzip then untar
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
