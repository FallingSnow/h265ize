const Path = require('path');
const os = require('os');
const readline = require('readline');
const EventEmitter = require('events');

const _ = require('lodash');
const colors = require('colors');
const moment = require('moment');
require('moment-duration-format');
const filesize = require('filesize');
const fs = require('fs-extra');
const gpuInfo = require('gpu-info');
// const hasbin = require('hasbin');

const Video = require('./video.js');
const consoleLogger = require('../consoleLogger.js');

class Encoder {
    constructor(logger, options) {
        this.logger = logger || consoleLogger;
        this.queue = [];
        this.currentlyProcessing;
        this.failedVideos = [];
        this.finishedVideos = [];
        this.potentialHWAccelSupport = false;
        this.supportedHWAccel = [];
        this.watchIgnore = [];
        this.enablePreviewStream = false;
        if (options) {
            if (options.enablePreviewStream)
                this.enablePreviewStream = options.enablePreviewStream;
        }

        this.running = false;
        this.paused = false;

        this.events = new EventEmitter();

        // Check for gpu encoding support
        let _self = this;
        gpuInfo().then(function(data) {
            if (os.platform() === 'win32')
                for (let gpu of data) {
                    if (gpu.AdapterCompatibility === 'NVIDIA') {
                        _self.potentialHWAccelSupport = true;
                        _self.logger.verbose('NVIDIA GPU Detected. Hardware Accelerated encoding support unlocked.')
                    }
                    if (gpu.AdapterCompatibility === 'Intel Corporation') {
                        _self.potentialHWAccelSupport = true;
                        _self.logger.verbose('Intel GPU Detected. Hardware Accelerated encoding support unlocked.')
                    }
                }
        }).catch(function(err) {
            _self.logger.debug('GPU detection error:', err.message);
        });
    }

    start() {
        if (this.running)
            return new Error('ALREADYRUNNING');

        if (this.paused) {
            this.paused = false;
            this.running = true;
            if (this.currentlyProcessing) {
                this.currentlyProcessing.start();
            } else {
                this.loop();
            }
            this.events.emit('running');
        } else {
            this.running = true;
            this.loop();
            this.events.emit('running');
        }

    }

    resume() {
        return this.start();
    }

    pause() {
        if (this.paused) {
            return new Error('ALREADYPAUSED');
        }

        if (!this.running) {
            return new Error('NOTRUNNING');
        }

        if (this.currentlyProcessing) {
            this.currentlyProcessing.pause();
        }

        this.running = false;
        this.paused = true;

        this.events.emit('paused');
    }

    loop() {
        if (!this.running)
            return;

        // Get first video in queue to encode
        let video = this.currentlyProcessing = this.queue.shift();

        // All videos have been encoded
        if (typeof video === 'undefined') {

            // Notify user of which videos have not been encoded
            let numVideosFailed = _.keys(this.rejectedVideos).length;
            if (numVideosFailed)
                this.logger.alert('The following videos', colors.yellow('(' + numVideosFailed + ')'), 'were not encoded:', this.failedVideos);

            return this.events.emit('finished');
        }

        this.events.emit('processing', video);

        this.logger.info('Processing', colors.bold(colors.yellow(video.base)) + "...", {
            __divider: true
        });

        let _self = this;
        video.events
            .on('finished', function() {
                // Notify user that all videos have been encoded
                _self.logger.info('Video finished processing at', colors.yellow(moment().format('dddd, MMMM Do YYYY, h:mm:ss A')), {
                    __divider: true
                });

                _self.finishedVideos.push(video);
                _self.removeVideo(video);
                _self.loop();
            })
            .on('failed', function(video) {
                // Notify user that all videos have been encoded
                _self.logger.info('Video failed processing at', colors.yellow(moment().format('dddd, MMMM Do YYYY, h:mm:ss A')), {
                    __divider: true
                });

                _self.failedVideos.push(video);
                _self.logger.error(video.error.message + '. Details can be found below in debug mode.');
                _self.logger.debug(video.error.stack);
                _self.removeVideo(video);
                _self.loop();
            });

        video.start();
    }

    addVideo(path, options) {

        // Check if file exists

        let video;
        if (path instanceof Video) {
            video = path;
        } else {
            fs.accessSync(path, fs.F_OK);
            video = new Video(path, options);
        }
        video.encoder = this;
        this.queue.push(video);

        if (this.running && !this.paused && !this.currentlyProcessing) {
            this.loop();
        }
        return video;
    }

    removeVideo(video) {
        if (video.running) {
            video.stop();
        }
        for (let i in this.queue) {
            if (this.queue[i].id === video.id) {
                this.queue.splice(i, 1);
                break;
            }
        }
    }

    stop() {
        if (!this.running) {
            return new Error('NOTRUNNING');
        }

        this.running = false;
        this.paused = false;
        if (this.currentlyProcessing)
            this.currentlyProcessing.stop();
        this.currentlyProcessing = undefined;
        this.events.emit('stopped');
    }
}

module.exports = Encoder;
