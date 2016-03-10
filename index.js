/**
 * Used to fetch a Sidekick analyser from a registry and install it.
 * Emits events if downloading [downloading, downloaded]
 */

"use strict";

const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');

module.exports = exports;

/**
 *
 * @param analyser
 * @returns Promise {path: [abs path to analyser], config: [analyser config]}
 */
module.exports.fetchAnalyser = function(analyser){

  //check if already installed
  //pull from registry if not installed (untar and ./bin/install)
};

function checkIfInstalled(analyserName){
  var dirExists = fs.existsSync(path.join(getAnalyserInstallDir(), analyserName));

  if(dirExists){
    //fetch analyser config
    //return analyser path and config
  } else {
    fetchAnalyser(analyserName)
  }
}

/**
 * Fetch and analyser from sidekick central
 * @param analyserName
 */
function fetchAnalyser(analyserName){

  fetchAnalyserList()
    .then(function(ALL_ANALYSERS){

    });

  function fetchAnalyserList(){

  }
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
      return `${process.env.APPDATA}\\sidekick`;
    case 'darwin':
      return `${os.homedir()}/Library/Application Support/sidekick`;
    case 'linux':
      return '/var/local/sidekick';
    default :
      throw new Error(`Unsupported os: ${currentOs}`);
  }
}
