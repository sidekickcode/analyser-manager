var chai = require('chai');
var assert = chai.assert;
var expect = chai.expect;
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

var fs = require('fs-extra');
var path = require('path');

var am = require('../../analyser-manager');

describe('analyser manager', function() {

  describe('positive tests', function() {

    var testAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, 'test-analyser');

    before(function(){
      fs.removeSync(testAnalyserDir); //in case you quit tests in IDE
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

    it('installs an analyser and loads the config', function() {
      var analyserName = 'sidekick-david';

      am.fetchAnalyser(analyserName).then(function(analyserConfig){
        expect(analyserConfig).to.have.property('path');
        expect(analyserConfig).to.have.property('config');
        expect(analyserConfig).to.have.deep.property('config.shortName', 'david-dm');
      });
    });

    after(function(){
      fs.removeSync(testAnalyserDir);
    });

  });

  describe('negative tests', function() {

    var testAnalyserDir = path.join(am.ANALYSER_INSTALL_DIR, 'test-analyser');

    before(function(){
      fs.removeSync(testAnalyserDir); //in case you quit tests in IDE
      fs.mkdirSync(testAnalyserDir);
      //fs.writeFileSync(path.join(testAnalyserDir, 'config.json'), JSON.stringify({"shortName": "test"}));
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
        assert.fail('Should fail for unknown analyser: ' + analyserName);
        done();
      }, function(err){
        expect(err).to.have.property('message', `Unable to read config file for analyser: '${analyserName}'`);
        done();
      });
    });

    after(function(){
      fs.removeSync(testAnalyserDir);
    });

  });

});
