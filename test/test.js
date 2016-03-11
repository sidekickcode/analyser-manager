var chai = require('chai');
var assert = chai.assert;
var expect = chai.expect;
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

var sinon = require('sinon');

var fs = require('fs-extra');
var path = require('path');

var AnalyserManger = require('../../analyser-manager');
var am = new AnalyserManger(path.join(__dirname, '/fixtures')); //override with test fixture dir

describe('install location', function() {
  var installLocation = require('../installLocation');
  var platform = require('process').platform;

  switch(platform){
    case "win32":
      expect(installLocation()).to.equal('');
      break;
    case "darwin":
      var re =/\/Library\/Application Support\/sidekick\/analysers$/i;
      expect(installLocation()).to.match(re);
      break;
    case "win32":
      expect(installLocation()).to.equal('');
      break;
  }
});

describe('analyser manager', function() {

  describe('positive tests', function() {

    var testAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, 'test-analyser');
    var goodAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, 'sidekick-david@1.0.5');//FIXME should not be version specific

    before(function(){
      fs.removeSync(testAnalyserDir); //in case you quit tests in IDE
      fs.removeSync(goodAnalyserDir); //in case you quit tests in IDE
      fs.mkdirSync(testAnalyserDir);
      fs.writeFileSync(path.join(testAnalyserDir, 'config.json'), JSON.stringify({"shortName": "test"}));
    });

    it('loads the config of an existing analyser', function(done) {
      var analyserName = 'test-analyser';

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'test');
        done();
      });
    });

    it('installs an analyser and loads the config', function(done) {
      var analyserName = 'sidekick-david';

      var downloading = sinon.spy();
      am.on('downloading', downloading);

      var downloaded = sinon.spy();
      am.on('downloaded', downloaded);

      var installed = sinon.spy();
      am.on('installed', installed);

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');

        expect(downloading.called).to.be.true;
        expect(downloaded.called).to.be.true;
        expect(installed.called).to.be.true;
        done();
      });
    });

    after(function(){
      fs.removeSync(testAnalyserDir);
      fs.removeSync(goodAnalyserDir);
    });

  });

  describe('negative tests', function() {

    var testAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, 'test-analyser');

    before(function(){
      fs.removeSync(testAnalyserDir); //in case you quit tests in IDE
      fs.mkdirSync(testAnalyserDir);
    });

    it('fails to install for an unknown analyser', function(done) {
      var analyserName = 'rubbish-subbish-analyser';

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        assert.fail('Should fail for unknown analyser: ' + analyserName);
        done();
      }, function(err){
        expect(err).to.have.property('message', 'Unknown analyser: ' + analyserName);
        done();
      });
    });

    it('fails when there is no config file for an analyser', function(done) {
      var analyserName = 'test-analyser';

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        assert.fail('Should fail when no analyser config file.');
        done();
      }, function(err){
        expect(err).to.have.property('message', `Unable to read config file for analyser: '${analyserName}'`);
        done();
      });
    });

    it('fails when the config file contains no usable config', function(done) {
      var analyserName = 'test-analyser';

      fs.writeFileSync(path.join(testAnalyserDir, 'config.json'), 'just some text');

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        assert.fail('Should fail when the config file contains garbage.');
        done();
      }, function(err){
        expect(err).to.have.property('message', `Unable to parse config file for analyser: '${analyserName}'`);
        done();
      });
    });

/*    it('fails when we dont have write permission for the analyser dir', function(done) {
      fs.chmodSync(am.ANALYSER_INSTALL_DIR, 0755);
      try {
        var newAM = require('../../analyser-manager');
      } catch(err){
      }
    });*/

    after(function(){
      fs.removeSync(testAnalyserDir);
    });

  });

});
