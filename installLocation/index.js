/**
 * Returns the location to install analysers to.
 * Separate module so we can test the analyser-manager.
 */

"use strict";

const process = require('process');
const os = require('os');

/**
 * Returns the location of our analysers
 * %APPDATA% on Windows
 * $XDG_CONFIG_HOME or ~/.config on Linux
 * ~/Library/Application Support on OS X
 * @returns {string}
 */
module.exports = exports = function getAnalyserInstallDir(){
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
