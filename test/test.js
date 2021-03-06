var chai = require('chai');
var assert = chai.assert;
var expect = chai.expect;
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

var sinon = require('sinon');

var fs = require('fs-extra');
var path = require('path');

var AnalyserManger = require('../../analyser-manager');
var analysersDir = path.join(__dirname, '/idontexist/fixtures');
var am;

describe('analyser manager', function() {

  describe('positive tests', function() {

    this.timeout(30000);

    var goodVersion, knownVersion;

    before(function(){
    });

    it('initialises - creates the analyser dir if it does not exist', function(done) {
      try {
        am = new AnalyserManger(analysersDir); //pass test fixture dir
        am.init().then(function(){
          fs.stat(analysersDir, function(err, data){
            expect(err).to.not.exist;
            expect(am.ALL_ANALYSERS).to.exist;
            done();
          });
        }, function(err){
          expect.fail('creation of analyser dir should succeed.');
          done();
        });
      } catch(err){
        expect.fail('creation of analyser dir should succeed.');
        done();
      }

    });

    it('fetches the canonical config for an existing analyser', function() {
      var analyserName = 'sidekick-david';

      am.fetchCanonicalAnalyserConfig(analyserName).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('registry', 'npm');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');
      });
    });

    it('installs the latest version of an analyser and loads the config', function(done) {
      var analyserName = 'sidekick-david';

      var downloading = sinon.spy();
      am.on('downloading', downloading);

      var downloaded = sinon.spy();
      am.on('downloaded', downloaded);

      var installing = sinon.spy();
      am.on('installing', installing);

      var installed = sinon.spy();
      am.on('installed', installed);

      am.installAnalyser({name: analyserName}).then(function(analyserConfig){

        goodVersion = analyserConfig.config.version;
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');

        expect(downloading.called).to.be.true;
        expect(downloaded.called).to.be.true;
        expect(installing.called).to.be.true;
        expect(installed.called).to.be.true;
        done();
      }, function(err){
        expect.fail();
        done();
      });
    });

    it('installs a specific version of an analyser', function(done) {
      var analyserName = 'sidekick-david';
      knownVersion = '1.0.3';

      am.installAnalyser({name: analyserName, version: knownVersion}).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');
        done();
      });
    });

    it('return the config for an existing analyser', function(done) {
      var analyserName = 'sidekick-david';
      knownVersion = '1.0.3';

      am.fetchAnalyser(analyserName, knownVersion).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');
        done();
      });
    });

    it('determines if a newer version exists', function(done) {
      var analyserName = 'sidekick-david';
      var version = '1.0.0';
      var latestVersion;

      am.isNewerVersionAvailable(analyserName, version).then(function(isNewer){
        expect(isNewer.newer).to.be.true;
        latestVersion = isNewer.latest;

        am.isNewerVersionAvailable(analyserName, latestVersion).then(function(isNewer){
          expect(isNewer.newer).to.be.false;
          done();
        });
      });
    });

    it('finds the latest version of an installed analyser', function() {
      var analyserName = 'sidekick-david';

      //we have already installed sidekick-david 1.0.3 (known version) and the latest version

      return am.isNewerVersionAvailable(analyserName).then(function(isNewer){
        var latestVersion = isNewer.latest;

        const supposedLatestVersion = am.getLatestVersionOfInstalledAnalyser(analyserName);
        expect(latestVersion).to.equal(supposedLatestVersion);
        });
    });

    after(function(){
      var goodAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, `sidekick-david@${goodVersion}`);
      var versionedAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, `sidekick-david@${knownVersion}`);
      fs.removeSync(goodAnalyserDir);
      fs.removeSync(versionedAnalyserDir);
    });

  });

  describe('negative tests', function() {

    if(!am){
      am = new AnalyserManger(analysersDir);
    }

    it('fails to install for an unknown analyser', function(done) {
      var analyserName = 'rubbish-subbish-analyser';

      am.installAnalyser({name: analyserName}).then(function(analyserConfig){
        assert.fail('Should fail for unknown analyser: ' + analyserName);
        done();
      }, function(err){
        expect(err.name).to.equal('UnknownAnalyserError');
        expect(err).to.have.property('message', `Unknown analyser: ${analyserName}`);
        done();
      });
    });

    it('fails to fetch local config for an unknown analyser', function(done) {
      var analyserName = 'rubbish-subbish-analyser';
      var version = '1.0.1';

      am.fetchAnalyser(analyserName, version).then(function(analyserConfig){
        assert.fail('Should fail for unknown analyser: ' + analyserName);
        done();
      }, function(err){
        var re =/Unable to fetch config for analyser 'rubbish-subbish-analyser'/i;
        expect(err.message).to.match(re);
        done();
      });
    });

    it('fails to fetch local config for an unknown analyser version', function(done) {
      var analyserName = 'sidekick-david';
      var version = '0.0.1';

      am.fetchAnalyser(analyserName, version).then(function(analyserConfig){
        assert.fail('Should fail for unknown analyser: ' + analyserName);
        done();
      }, function(err){
        var re =/Unable to fetch config for analyser 'sidekick-david'/i;
        expect(err.message).to.match(re);
        done();
      });
    });

    it('fails to determine latest for a unknown analyser', function(done) {
      var analyserName = 'garbage-garbage';
      var version = 'garbage';

      am.isNewerVersionAvailable(analyserName, version).then(function(isNewer){
        assert.fail('Should fail for garbage analyser.');
        done();
      }, function(err){
        var re =/Unknown analyser: garbage-garbage/i;
        expect(err.message).to.match(re);
        done();
      });
    });

    it('still return useful latest version for garbage version', function(done) {
      var analyserName = 'sidekick-david';
      var version = 'garbage';

      am.isNewerVersionAvailable(analyserName, version).then(function(isNewer){
        expect(isNewer.latest).to.exist;
        expect(isNewer.newer).to.not.exist;
        done();
      }, function(err){
        assert.fail('Should not fail for valid analyser.');
        done();
      });
    });

/*    it('fails when we dont have write permission for the analyser dir', function(done) {
      fs.chmodSync(am.ANALYSER_INSTALL_DIR, 0755);
      try {
        var newAM = require('../../sidekick-analyser-manager');
      } catch(err){
      }
    });*/

    after(function(done){
      fs.removeSync(analysersDir)
      done();
    });

  });

});
