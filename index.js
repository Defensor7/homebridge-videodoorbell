var Accessory, hap, Service, Characteristic, UUIDGen;

var FFMPEG = require('./ffmpeg').FFMPEG;

var http = require('http');
var qs = require('querystring');
var concat = require('concat-stream');


module.exports = function (homebridge) {
    Accessory = homebridge.platformAccessory;
    hap = homebridge.hap;
    Service = hap.Service;
    Characteristic = hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerPlatform("homebridge-videodoorbell", "Video-doorbell", videodoorbellPlatform, true);
}

function videodoorbellPlatform(log, config, api) {
    var self = this;

    self.log = log;
    self.config = config || {};
    self.binaryState = 0; // switch state, default is OFF

    if (api) {
        self.api = api;

        if (api.version < 2.1) {
            throw new Error("Unexpected API version.");
        }

        self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
    }
}

videodoorbellPlatform.prototype.configureAccessory = function (accessory) {
    // Won't be invoked
}

videodoorbellPlatform.prototype.getState = function (callback) {
    var self = this;

    console.log("Power state is %s", self.binaryState);
    callback(null, self.binaryState);
}

// Method to handle identify request
videodoorbellPlatform.prototype.identify = function (primaryService, paired, callback) {
    console.log("Identify requested!");

    // Dbg:
    console.log("Ding Dong!");
    primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
    callback();
}

videodoorbellPlatform.prototype.EventWithAccessory = function (accessory) {
    console.log("Ding Dong!");
    accessory.getService(Service.Doorbell).getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
}

videodoorbellPlatform.prototype.didFinishLaunching = function () {
    var self = this;

    if (self.config.cameras) {
        var configuredAccessories = [];

        var cameras = self.config.cameras;
        cameras.forEach(function (cameraConfig) {
            var cameraName = cameraConfig.name;
            var videoConfig = cameraConfig.videoConfig;
            var webserverPort = cameraConfig.port;

            if (!cameraName || !videoConfig || !webserverPort) {
                console.log("Missing parameters.");
                return;
            }

            var uuid = UUIDGen.generate(cameraName);
            var videodoorbellAccessory = new Accessory(cameraName, uuid, hap.Accessory.Categories.VIDEO_DOORBELL);

            // Doorbell has to be the primary service
            var primaryService = new Service.Doorbell(cameraName);
            primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).on('get', self.getState.bind(this));

            // Setup and configure the camera services
            var cameraSource = new FFMPEG(hap, cameraConfig);
            videodoorbellAccessory.configureCameraSource(cameraSource);

            // Setup HomeKit doorbell service
            videodoorbellAccessory.addService(primaryService);

            // Identify
            videodoorbellAccessory.on('identify', self.identify.bind(this, primaryService));

            // We do not need the following 'required' services
            //var speakerService = new Service.Speaker("Speaker");
            //videodoorbellAccessory.addService(speakerService);

            //var microphoneService = new Service.Microphone("Microphone");
            //videodoorbellAccessory.addService(microphoneService);

            configuredAccessories.push(videodoorbellAccessory);

            // DBG: Fire an event 10s after start 
            //setTimeout(function () {
            //console.log("Ding Dong Ding");
            //primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
            //}.bind(this), 10000);


            self.api.publishCameraAccessories("Video-doorbell", configuredAccessories);

            // Create http-server to trigger doorbell from outside: 
            // curl -X POST -d 'ding=dong&dong=ding' http://HOMEBRIDGEIP:PORT
            var server = http.createServer(function (req, res) {
                req.pipe(concat(function (body) {
                    var params = qs.parse(body.toString());
                    res.end(JSON.stringify(params) + '\n');
                    // todo: add validation
                    self.EventWithAccessory(videodoorbellAccessory);
                }));
            });
            server.listen(webserverPort);

        });
    }
}