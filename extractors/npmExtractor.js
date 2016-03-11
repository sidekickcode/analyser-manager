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
const request = require('request');

module.exports = exports = NpmExtractor;

function NpmExtractor(){
  var self = this;

  EventEmitter.call(self);

  self.fetch = function(analyserName, analyserVersion, analyserInstallDir){
    self.emit('downloading');
    return new Promise(function(resolve, reject){
      fetchNpmInfoForAnalyser(analyserName).then(function(analyserInfo){
        var specificVersionInfo = analyserInfo.versions[analyserVersion];

        if(!specificVersionInfo){
          throw new Error(`Invalid version for analyser '${analyserName}'. npm does not have version '${analyserVersion}'`);
        }

        var newAnalyserDir = path.join(analyserInstallDir, `${analyserName}@${analyserVersion}`);
        fs.mkdirSync(newAnalyserDir);

        var tarballURL = specificVersionInfo.dist.tarball;
        var tarballName = resolveTarballName(tarballURL);
        var tarballFullPath = path.join(newAnalyserDir, tarballName);

        fetchAnalyserTarball(tarballURL, tarballFullPath).then(function(){
          self.emit('downloaded');
          unpack(tarballFullPath, newAnalyserDir).then(resolve, reject);
        });
      });
    });
  };

  function fetchNpmInfoForAnalyser(analyserName){
    const NPM_URL = `https://registry.npmjs.org/${analyserName}`;

    return new Promise(function(resolve, reject){
      request(NPM_URL, function (error, response, body) {
        if(!error && response.statusCode == 200) {
          resolve(JSON.parse(jsonWithComments(body)));
        } else {
          reject(new Error(`Unable to fetch analyser info for '${analyserName}'`, error));
        }
      })
    });
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
            reject(new Error(`Unable to fetch tarball '${tarballURL}'`, err));
          })
          .pipe(stream)
    });
  }

  function unpack(tarball, analyserDir){
    return new Promise(function(resolve, reject){
      var read = fs.createReadStream(tarball);
      var write = tgz().createWriteStream(analyserDir);

      write.on('finish', function(){
        fs.unlink(tarball); //remove tarball
        function puts(error, stdout, stderr) {
          if(error){
            reject(error);
          } else {
            self.emit('installed');
            resolve();
          }
        }
        exec(`cd ${analyserDir}/package && ./bin/install`, puts); //run bin/install
      });

      write.on('error', function(err) {
        reject(err);
      });

      read.pipe(write); //unzip then untar
    });
  }
}
inherits(NpmExtractor, EventEmitter);
