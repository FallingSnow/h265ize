const Path = require('path');
const os = require('os');
const EventEmitter = require('events');

const _ = require('lodash');
const colors = require('colors');
const moment = require('moment');
require('moment-duration-format');
const filesize = require('filesize');
const fs = require('fs-extra');
const math = require('mathjs');
const Promise = require('bluebird');
const Pauser = require('promise-pauser');
const ffmpeg = require('fluent-ffmpeg');
const MemoryStream = require('memorystream');

const helpers = require(Path.join(__dirname, '../helpers.js'));
const ASPresets = require('../aspresets.json');

let counter = 0;

class Video {
    constructor(path, options) {

        // Check if file exists
        fs.accessSync(path, fs.F_OK);

        this.encoder = null;
        this.id = counter++;

        // Path related data
        this.path = path;
        let pathParsed = Path.parse(this.path);
        this.base = pathParsed.base;
        this.dir = pathParsed.dir;
        this.ext = pathParsed.ext;
        this.name = pathParsed.name;
        this.root = pathParsed.root;

        // Setup encoding options
        this.options = {};
        _.defaults(this.options, options, {
            preview: false,
            quality: 19,
            override: false,
            stats: false,
            HEAudioBitrate: 40,
            destination: os.homedir()
        });
        this.output = {
            base: this.name + (this.options.preview ? '-preview' : '') + '.' + this.options.outputFormat,
            dir: this.options.destination,
            sample: this.name + '-sample.' + this.options.outputFormat
        };
        this.output.path = Path.join(this.output.dir, this.output.base);

        this.running = false;
        this.paused = false;
        this.status;

        this.ffmpegCommand = new ffmpeg().input(this.path).renice(10)
            .videoCodec('libx265').audioCodec('copy').outputOptions('-c:s', 'copy')
            .outputOptions('-c:d', 'copy');
        this.promiseChain;
        this.pauser = Pauser.pauser();
        this.inputCounter = 0;
        this.pass = 0;
        this.x265Options = '';
        this.previewStream = new MemoryStream();
        this.temp = {
            files: []
        };

        this.events = new EventEmitter();

        this.currentStageNum = -1;
        this.currentStage = {
            name: 'Pending',
            action: 'pending'
        };
        this.stages = [{
            name: 'Initialize filesystem',
            action: 'initializing filesystem',
            promise: this.filesystem
        }, {
            name: 'Get Initial Metadata',
            action: 'getting intial metadata',
            promise: this.getInitialMetadata
        }, {
            name: 'Process Streams',
            action: 'processing streams',
            promise: this.processStreams
        }, {
            name: 'Set AS Preset',
            action: 'setting as preset',
            promise: this.setASPreset
        }, {
            name: 'Upconvert',
            action: 'upconverting',
            promise: this.upconvert
        }, {
            name: 'Set Video Bit Depth',
            action: 'detecting video bit depth',
            promise: this.setVideoBitDepth
        }, {
            name: 'Normalize Audio',
            action: 'normalizing audio',
            promise: this.normalizeAudio
        }, {
            name: 'Auto Crop',
            action: 'detecting crop',
            promise: this.autoCrop
        }, {
            name: 'Deinterlace',
            action: 'deinterlacing',
            promise: this.deinterlace
        }, {
            name: 'Map Streams',
            action: 'mapping streams',
            promise: this.mapStreams
        }, {
            name: 'Map High Efficiency Audio',
            action: 'mapping high effeciency audio',
            promise: this.heAudio
        }, {
            name: 'Encode',
            action: 'encoding',
            promise: this.encode
        }, {
            name: 'Multipass',
            action: 'generating multipass',
            promise: this.multiPass
        }, {
            name: 'Verify Encode',
            action: 'verifying encode',
            promise: this.verifyEncode
        }, {
            name: 'Move Output',
            action: 'moving output',
            promise: this.move
        }, {
            name: 'Screenshots',
            action: 'creating screenshots',
            promise: this.screenshots
        }, {
            name: 'Sample',
            action: 'creating sample',
            promise: this.sample
        }, {
            name: 'Stats',
            action: 'appending stats',
            promise: this.appendStats
        }];
    }

    _addX265Option(option) {
        this.x265Options += this.x265Options.length ? ':' + option : option;
    }

    filesystem() {
        let _self = this;
        return new Promise(function(resolve, reject) {


            if (fs.existsSync(_self.output.path)) {
                return reject(new Error('Output ' + colors.yellow('"' + _self.output.path + '"') + ' already exists.'));
            }

            resolve();

        });
    }

    getInitialMetadata() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            Video.getMetadata(_self).then(function(metadata) {
                _self.metadata = metadata;
                resolve();
            }, reject);

        });
    }

    processStreams() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            let videoStreams = [],
                audioStreams = [],
                subtitleStreams = [],
                otherStreams = [];

            // Dissect each video stream
            _.each(_self.metadata.streams, function(stream) {
                _self.encoder.logger.debug('Working on stream:', stream.index);
                stream.input = 0;

                // this.encoder.logger.debug(stream);

                if (!stream.codec_type) {
                    _self.encoder.logger.warn('A codec was not provided for stream ' + stream.index + '. Your ffmpeg is most likely out of date. At least version 2.8.2 is recommended.');
                }

                switch (stream.codec_type) {
                    case 'video':
                        if (stream.codec_name === 'hevc' && !_self.options.override)
                            return reject(new Error('Already encoded in h265. Skipping... (use the --override flag to encode hevc videos)'));
                        videoStreams.push(stream);
                        break;
                    case 'audio':
                        audioStreams.push(stream);
                        break;
                    case 'subtitle':
                        subtitleStreams.push(stream);
                        break;
                    default:
                        if (stream.codec_name === 'unknown') {
                            _self.encoder.logger.warn('Codec stream with index ' + stream.index + ' will not be included because it has an unknown codec.');
                            break;
                        }
                        otherStreams.push(stream);
                        break;
                }
            });

            // Preview Mode
            if (_self.options.preview) {
                _self.ffmpegCommand.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
            }

            if (_self.options.multiPass > 1) {
                _self._addX265Option('pass=1:stats=' + Path.join(os.tmpdir(), 'x265stats.log'));
            }

            _self.streams = {
                videoStreams: videoStreams,
                audioStreams: audioStreams,
                subtitleStreams: subtitleStreams,
                otherStreams: otherStreams
            };
            resolve();
        });
    }

    setASPreset() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.asPreset)
                return resolve();

            if (_self.options.asPreset === 'none')
                return resolve();

            for (let preset of _self.options.asPreset.split(':')) {
                let ASPreset = ASPresets[preset];
                if (!ASPreset)
                    return reject(new Error('Unknown as-preset option ' + colors.yellow(preset) + '.'));

                for (let option in ASPreset) {
                    switch (option) {
                        case 'x265Options':
                            _self._addX265Option(ASPreset[option]);
                            break;
                        case 'preset':
                            _self.options.preset = ASPreset[option];
                            break;
                        case 'videoFilters':
                            _self.ffmpegCommand.videoFilters(ASPreset[option]);
                            break;
                        case 'bitdepth':
                            _self.options.bitdepth = ASPreset[option];
                            break;
                        default:
                            return reject(new Error('Unknown as-preset setting ' + colors.yellow(option) + ' for as-preset ' + colors.yellow(_self.options.asPreset) + '.'));
                    }
                }
            }
            resolve();
        });
    }

    upconvert() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.upconvert || _self.options.test)
                return resolve();


            let trackUpconvertProcesses = [];

            // Here you can process all subtitles
            _.each(_self.streams.subtitleStreams, function(subtitle, i) {

                // Detect dvdsub subtitles
                if (subtitle.codec_name === 'dvdsub' || subtitle.codec_name === 'dvd_subtitle') {

                    // Convert dvdsub subtitle to srt
                    trackUpconvertProcesses.push(new Promise(function(resolve, reject) {
                        helpers.extractTrack(_self.path, subtitle.index).then(helpers.vobsubToSRT).then(function(filePath) {
                            _self.ffmpegCommand.input(filePath);
                            _self.temp.files.push(filePath);
                            Video.getMetadata(_self).then(function(metadata) {
                                metadata.streams[0].title = subtitle.title;
                                metadata.streams[0].language = subtitle.language;
                                metadata.streams[0].tags = subtitle.tags;
                                metadata.streams[0].disposition = subtitle.disposition;
                                metadata.streams[0].input = ++_self.inputCounter;

                                _self.streams.subtitleStreams[i] = metadata.streams[0];
                                resolve();
                            }, reject);
                        }).catch(reject);
                    }));
                }
            });

            _self.encoder.logger.debug('Upconverting', trackUpconvertProcesses.length, 'tracks.');
            // Execute all upconvert processes
            Promise.all(trackUpconvertProcesses).then(function() {
                resolve();
            }).catch(function(err) {
                _self.encoder.logger.warn('Upconvert error: ' + err.message + ' - Skipping upconvert...');
                reject(err);
            });

            resolve();
        });
    }

    setVideoBitDepth() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            // Video streams
            let videoIndex = 0,
                videoBitDepth = 8;

            if (_self.streams.videoStreams.length > 1) {
                // TODO implement feature
                _self.encoder.logger.alert('More than one video stream detected. Using the video stream with the greatest duration.');
                videoIndex = 0;
            }
            let videoStream = _self.videoStream = _self.streams.videoStreams[videoIndex];

            // Check for 12bit or 10bit video
            if (videoStream.pix_fmt.indexOf('12le') > -1 || videoStream.pix_fmt.indexOf('12be') > -1) {
                videoBitDepth = 12;
            } else if (videoStream.pix_fmt.indexOf('10le') > -1 || videoStream.pix_fmt.indexOf('10be') > -1) {
                videoBitDepth = 10;
            }
            _self.videoBitDepth = videoBitDepth;

            // Set video encoding profile
            if (_self.options.bitdepth === 12) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p12le');
            } else if (_self.options.bitdepth === 10) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p10le');
            } else if (_self.options.bitdepth === 8) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p');
            } else {
                switch (_self.videoBitDepth) {
                    case 16:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p16le');
                        break;
                    case 14:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p14le');
                        break;
                    case 12:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p12le');
                        break;
                    case 10:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p10le');
                        break;
                    default:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p');
                        break;
                }
            }

            // Make sure we are only attempting to use 8 bit with fallback
            // binary
            // TODO
            // if (usingFallbackFfmpeg) {
            //     let options = command._currentOutput.options.get();
            //     let selectedPixFmt = options[options.indexOf('-pix_fmt') + 1];
            //     if (selectedPixFmt !== 'yuv420p') {
            //         return reject({
            //             level: 'error',
            //             message: 'Bit depth about 8 bit are not supported by the fallback ffmpeg library. Try installing ffmpeg.'
            //         });
            //     }
            // }

            resolve();
        });
    }

    normalizeAudio() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            if (!_self.options.normalizeLevel || _self.options.normalizeLevel < 3) {
                return resolve();
            }

            let availableFilters;

            ffmpeg.getAvailableFilters(function(err, filters) {
                availableFilters = filters;
                normalize();
            });

            function normalize() {

                _self.stages[_self.currentStageNum].command = new ffmpeg(_self.path, {
                        logger: _self.encoder.logger
                    }).inputOptions('-hide_banner').format('null').output('-')
                    .on('start', function(commandLine) {
                        if (_self.paused)
                            _self.pause();
                        _self.encoder.logger.debug('Running Query:', commandLine);
                    })
                    .on('error', function(err, stdout, stderr) {
                        _self.encoder.logger.debug(err.stack);

                        _self.encoder.logger.debug(stderr);

                        if (err.message.startsWith('ffmpeg was killed with signal'))
                            reject(new Error('ENDING'));
                        else
                            reject(err);
                    });
                let vdc = _self.stages[_self.currentStageNum].command;

                if (_self.options.preview) {
                    vdc.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
                }

                // Only map streams we are going to work on
                _.each(_self.streams.audioStreams, function(stream, i) {
                    vdc.outputOptions('-map', stream.input + ':' + stream.index);
                });


                /************ This is where the normalization detection happens ***/

                //
                if (_self.options.normalizeLevel >= 5) {
                    _self.encoder.logger.debug('Normalizing audio via dynaudnorm.');

                    if (!availableFilters.dynaudnorm) {
                        return reject(new Error('Installed ffmpeg version does not support the dynaudnorm audio filter'));
                    }

                    return reject(new Error('dynaudnorm is not currently implemented'));

                }

                //
                else if (_self.options.normalizeLevel >= 4) {
                    _self.encoder.logger.debug('Normalizing audio via loudnorm.');

                    if (!availableFilters.loudnorm) {
                        return reject(new Error('Installed ffmpeg version does not support the loudnorm audio filter'));
                    }

                    let parsedAttributes;

                    // Oh loudnorm multipass, lets begin
                    _.each(_self.streams.audioStreams, function(stream, i) {
                        vdc.outputOptions('-filter_complex', '[' + stream.input + ':' + stream.index + ']loudnorm=I=-16:TP=-2.0:LRA=11:print_format=json');
                    });

                    vdc.on('end', function(stdout, stderr) {
                        delete _self.stages[_self.currentStageNum].command;
                        let unparsedStart = stderr.lastIndexOf('[Parsed_loudnorm') + 38;
                        let unparsed = stderr.substr(unparsedStart).replace(/\r?\n|\r/g, '');
                        parsedAttributes = JSON.parse(unparsed);
                        _self.ffmpegCommand.audioFilters({
                            filter: 'loudnorm',
                            options: 'I=-16:TP=-2.0:LRA=11:measured_I=' + parsedAttributes.input_i + ':measured_LRA=' + parsedAttributes.input_lra + ':measured_TP=' + parsedAttributes.input_tp + ':measured_thresh=' + parsedAttributes.input_thresh + ':offset=' + parsedAttributes.target_offset + ':linear=true:print_format=summary'
                        });
                        return resolve();
                    });

                    vdc.run();
                }

                // "simple" audio RMS-based normalization to -2.0 dBFS
                else if (_self.options.normalizeLevel >= 3) {
                    _self.encoder.logger.debug('Normalizing audio via volumedetect & volume.');

                    if (!availableFilters.volumedetect || !availableFilters.volume) {
                        return reject(new Error('Installed ffmpeg version does not support volumedetect audio filter and/or volume audio filter'));
                    }

                    const volumeRegexp = /max_volume: (-?[0-9]+\.[0-9]+)/g;
                    let volumeLevels = [];
                    _.each(_self.streams.audioStreams, function(stream, i) {
                        vdc.outputOptions('-filter_complex', '[' + stream.input + ':' + stream.index + ']volumedetect');
                    });

                    vdc.on('stderr', function(stderrLine) {
                        if (stderrLine.startsWith('[Parsed_volumedetect')) {
                            let match = volumeRegexp.exec(stderrLine);
                            if (match) {
                                volumeLevels.push(parseFloat(match[1]));
                            }
                        }
                        // _self.encoder.logger.debug(colors.bgMagenta.white('[ffmpeg]'), stderrLine);
                    }).on('end', function(stderr) {
                        delete _self.stages[_self.currentStageNum].command;
                        _.each(_self.streams.audioStreams, function(stream, i) {
                            let volume = volumeLevels[i] * -1 - 2.0;
                            _self.ffmpegCommand.outputOptions('-filter_complex', '[' + stream.input + ':' + stream.index + ']volume=' + volume + 'dB');
                            _self.ffmpegCommand.outputOptions('-c:' + stream.input + ':' + stream.index, 'aac');
                            // FIXME Hardcoded bitrate
                            let bitratePerChannel = 128;
                            _self.ffmpegCommand.outputOptions('-b:' + stream.input + ':' + stream.index, bitratePerChannel * stream.channels + 'k');
                        });
                        return resolve();
                    });

                    vdc.run();
                }
            }

        });
    }

    autoCrop() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.normalizeLevel < 1) {
                return resolve();
            }

            const intervals = 12;
            const interval = _self.metadata.format.duration / (intervals + 1);

            function detectCrop(start, fallback) {
                return new Promise(function(resolve, reject) {
                    const cropRegexp = /crop=(-?[0-9]+):(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)/g;
                    _self.stages[_self.currentStageNum].command = new ffmpeg(_self.path, {
                            logger: _self.encoder.logger
                        }).outputOptions('-map', _self.videoStream.input + ':' + _self.videoStream.index)
                        .videoCodec('rawvideo').videoFilters("cropdetect=0.094:2:0").format('null').output('-');

                    if (fallback) {
                        _self.encoder.logger.warn('Crop detection failed! Running crop detection in fallback mode. This is significantly slower.');
                    } else {
                        _self.stages[_self.currentStageNum].command.frames(2).seekInput(start);
                    }

                    let crop = {};

                    _self.stages[_self.currentStageNum].command
                        .on('start', function(commandLine) {
                            if (_self.paused)
                                _self.pause();

                            _self.encoder.logger.debug('Running Query:', commandLine);
                        })
                        .on('end', function(stdout, stderr) {
                            delete _self.stages[_self.currentStageNum].command;

                            let match = cropRegexp.exec(stderr);
                            if (match === null) {
                                return reject(new Error('Could not run crop detection.'));
                            }

                            crop.w = parseInt(match[1], 10);
                            crop.h = parseInt(match[2], 10);
                            crop.x = parseInt(match[3], 10);
                            crop.y = parseInt(match[4], 10);
                            resolve(crop);
                        })
                        // .on('stderr', function(line) {
                        //     this.encoder.logger.debug(line);
                        // })
                        .on('error', function(err, stdout, stderr) {
                            _self.encoder.logger.debug(err.stack);

                            if (err.message.startsWith('ffmpeg was killed with signal'))
                                return reject(new Error('ENDING'));
                            else
                                return reject(err);
                        });

                    _self.stages[_self.currentStageNum].command.run();
                });
            }

            //
            let i = intervals,
                counter = 1,
                cropDetections = [];

            // This just runs all the ffmpeg crop detections in sync so you
            // dont end up with a million threads running
            function syncHandler(crop) {
                if (crop)
                    cropDetections.push(crop);
                if (i > 0) {
                    _self.encoder.logger.info('Crop Detection:', (counter++) + '/' + intervals, {
                        __clearLine: true
                    });
                    let startTime = interval * i--;
                    detectCrop(startTime).then(syncHandler, function() {
                        return detectCrop(startTime, true).then(function(crop) {
                            cropDetections.push(crop);
                            cropDetectionComplete(cropDetections);
                        }, reject);
                    });
                } else
                    cropDetectionComplete(cropDetections);
            }
            syncHandler();



            // TODO: this seems overly complicated and inefficent.
            // detections is an array of objects, for example
            // [ { w: '1920', h: '1072', x: '0', y: '4' },
            //   { w: '1920', h: '1072', x: '0', y: '4' },
            //   { w: '1920', h: '1076', x: '0', y: '2' } ]
            function cropDetectionComplete(detections) {
                let width = Number.NEGATIVE_INFINITY,
                    height = Number.NEGATIVE_INFINITY,
                    x = Number.POSITIVE_INFINITY,
                    y = Number.POSITIVE_INFINITY;
                _.each(detections, function(val, key) {
                    if (val.w > width) {
                        width = val.w;
                        x = val.x;
                    }
                    if (val.h > height) {
                        height = val.h;
                        y = val.y;
                    }
                });

                if (width !== _self.videoStream.width || height !== _self.videoStream.height) {
                    _self.encoder.logger.alert('Output will be cropped to', width + 'x' + height + '.', 'Originally', _self.videoStream.width + 'x' + _self.videoStream.height);
                    _self.ffmpegCommand.videoFilters('crop=' + width + ':' + height + ':' + x + ':' + y);
                }
                resolve();
            }
        });
    }

    deinterlace() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.normalizeLevel < 3)
                return resolve();

            let framesToScan = 250;
            _self.stages[_self.currentStageNum] = ffmpeg(_self.path).videoFilters('idet').frames(framesToScan).outputOptions('-map v')
                .format('rawvideo').outputFormat('null').output('-')
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();

                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                .on('end', function(stdout, stderr) {
                    let lines = stderr.split('\n');
                    let lastLine = lines[lines.length - 2].replace(/ /g, '');
                    let numFrames = lastLine.match(new RegExp('TFF:([0-9]+)BFF:([0-9]+)Progressive:([0-9]+)'));
                    let interlacedFrameCount = parseInt(numFrames[1]) + parseInt(numFrames[2]);
                    let progressiveFrameCount = parseInt(numFrames[3]);

                    if (interlacedFrameCount >= progressiveFrameCount) {
                        _self.interlaced = true;
                        _self.ffmpegCommand.videoFilters('yadif');
                        _self.encoder.logger.alert('Interlaced video detected. Output will be deinterlaced.');
                        return resolve();
                    } else {
                        _self.interlaced = false;
                        return resolve();
                    }
                })
                .on('error', function(err, stdout, stderr) {
                    _self.encoder.logger.debug(err.stack);

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        return reject(new Error('ENDING'));
                    else
                        return reject(err);
                })
                .run();
        });
    }

    mapStreams() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            _self.ffmpegCommand.outputOptions('-map', _self.videoStream.input + ':' + _self.videoStream.index);
            _self.encoder.logger.debug('Video stream', _self.videoStream.input + ':' + _self.videoStream.index, 'mapped.', {
                size: _self.videoStream.width + 'x' + _self.videoStream.height,
                codec: _self.videoStream.codec_long_name,
                profile: _self.videoStream.profile,
                'bit depth': _self.videoBitDepth
            });

            // Handle native language detection and default audio track selection
            _.each(_self.streams.audioStreams, function(stream, i) {
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                if (normalizedLanguage === helpers.normalizeLanguage(_self.options['native-language']) && !_self.defaultAudioIndex) {
                    _self.defaultAudioIndex = stream.index;
                }
            });

            // Audio streams
            _.each(_self.streams.audioStreams, function(stream, i) {

                let audioTitle = helpers.getStreamTitle(stream);
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);

                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                if (!(audioTitle) && _self.options.normalizeLevel >= 2) {

                    let channelsFormated = helpers.getFormatedChannels(stream.channels);
                    audioTitle = normalizedLanguage + ' ' + stream.codec_name.toUpperCase() + ((stream.profile && stream.profile !== 'unknown') ? (' ' + stream.profile) : '') + ' (' + channelsFormated + ')';
                    _self.encoder.logger.alert('Audio does not have a title. Title set to', '"' + audioTitle + '".');
                    _self.ffmpegCommand.outputOptions('-metadata:s:' + stream.index, 'title="' + audioTitle + '"');
                }

                // Set default audio
                if (_self.defaultAudioIndex && _self.defaultAudioIndex === stream.index) {
                    _self.ffmpegCommand.outputOptions('-disposition:a:' + stream.index, 'default');
                }

                let extraInfo = {
                    title: audioTitle,
                    language: normalizedLanguage,
                    codec: stream.codec_long_name,
                    channels: stream.channels
                };

                if (stream.profile)
                    extraInfo.profile = stream.profile;
                else
                    extraInfo['bit-depth'] = stream.bits_per_raw_sample;

                _self.encoder.logger.debug('Audio stream', stream.input + ':' + stream.index, 'mapped.', extraInfo);
            });

            // Subtitle streams
            _.each(_self.streams.subtitleStreams, function(stream, i) {

                // Handle native language
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                if (normalizedLanguage === helpers.normalizeLanguage(_self.options['native-language']) && !_self.defaultAudioIndex && !_self.defaultSubtitleIndex) {
                    _self.defaultSubtitleIndex = stream.index;
                }

                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                if (!helpers.getStreamTitle(stream) && _self.options.normalizeLevel >= 2) {
                    _self.encoder.logger.alert('Subtitle does not have a title. Title set to', normalizedLanguage + '.');
                    _self.ffmpegCommand.outputOptions('-metadata:s:' + stream.index, 'title=' + normalizedLanguage);
                }
                _self.ffmpegCommand.outputOptions('-disposition:s:' + stream.index, 'default');
                _self.encoder.logger.debug('Subtitle stream', stream.input + ':' + stream.index, 'mapped.', {
                    title: helpers.getStreamTitle(stream) || normalizedLanguage,
                    language: normalizedLanguage,
                    codec: stream.codec_long_name
                });
            });

            // Other streams (Attachments: fonts, pictures, etc.)
            _.each(_self.streams.otherStreams, function(stream, i) {
                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                _self.encoder.logger.debug('Other stream', stream.input + ':' + stream.index, 'mapped.');
            });

            resolve();
        });
    }

    heAudio() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.heAudio)
                return resolve();

            _.each(_self.streams.audioStreams, function(stream, i) {
                if (stream.codec_name !== 'flac' || _self.options.forceHeAudio) {
                    _self.encoder.logger.verbose('Audio stream', colors.yellow(helpers.getStreamTitle(stream) + ' (index: ' + stream.index + ')'), 'will be encoded to HE Audio.');
                    _self.ffmpegCommand.outputOptions('-c:a:' + i, 'libopus');
                    _self.ffmpegCommand.outputOptions('-af', "aformat=channel_layouts='7.1|5.1|stereo'");
                    _self.ffmpegCommand.outputOptions('-frame_duration', 60);
                    if (_self.options.downmixHeAudio && stream.channels > 3) {
                        // Downmix HE Audio
                        _self.ffmpegCommand.audioChannels(2).audioFilters('aresample=matrix_encoding=dplii');
                        stream.channels = 2;
                    }

                    let bitrate = _self.options.HEAudioBitrate * stream.channels;
                    _self.ffmpegCommand.outputOptions('-b:a:' + i, bitrate + 'k');

                    // Handle setting a new title
                    let audioTitle = helpers.getStreamTitle(stream);
                    let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                    if (!(audioTitle) && _self.options.normalizeLevel >= 2) {
                        let channelsFormated = helpers.getFormatedChannels(stream.channels);
                        audioTitle = normalizedLanguage + ' OPUS (' + channelsFormated + ')';
                        _self.encoder.logger.alert('Audio does not have a title. Title set to', '"' + audioTitle + '".');
                        _self.ffmpegCommand.outputOptions('-metadata:s:' + stream.index, 'title="' + audioTitle + '"');
                    }
                } else {
                    _self.encoder.logger.alert('Audio stream', colors.yellow(helpers.getStreamTitle(stream) + ' (index: ' + stream.index + ')'), 'won\'t be encoded with HE Audio because it is in a lossless format.');
                }
            });

            resolve();
        });
    }

    encode() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            _self.pass++;
            let startTime = moment();

            if (_self.options.test)
                return reject(new Error('Test mode! Skipping...'));

            // Make output directory
            if (!_self.options.delete)
                fs.ensureDir(_self.output.dir, function(err) {
                    if (err) {
                        _self.encoder.logger.warn(_self.base, 'was unable to be encoded. The following error was given:');
                        _self.encoder.logger.warn(err);
                    }
                });

            let frameRate = math.eval(_self.videoStream.avg_frame_rate);

            // Accurate Timestamps
            if (_self.options.accurateTimestamps)
                _self._addX265Option('keyint=' + math.eval(_self.videoStream['avg_frame_rate']).toFixed(0));

            // Scale video
            if (_self.options.scale)
                _self.ffmpegCommand.videoFilters('scale=-1:' + _self.options.scale);

            // Video bitrate target or constant quality?
            if (_self.options.videoBitrate) {
                _self.ffmpegCommand.videoBitrate(_self.options.videoBitrate);
            } else {
                _self.ffmpegCommand.outputOptions('-crf ' + _self.options.quality);
            }

            // H265 preset
            if (_self.options.preset)
                _self.ffmpegCommand.outputOptions('-preset', _self.options.preset);

            // H265 extra options
            if (_self.options.extraOptions)
                _self._addX265Option(_self.options.extraOptions);

            if (_self.x265Options)
                _self.ffmpegCommand.outputOptions('-x265-params', _self.x265Options);

            _self.ffmpegCommand
                .on('progress', function(progress) {
                    let elapsed = moment.duration(moment().diff(startTime), 'milliseconds');
                    let processed = helpers.momentizeTimemark(progress.timemark);
                    let precent = progress.percent ? progress.percent.toFixed(1) : ((processed.asMilliseconds() / 1000 / _self.metadata.format.duration) * 100).toFixed(1);
                    let estimatedFileSize = precent > 10 ? filesize(fs.statSync(_self.output.path).size / precent * 100) : '';
                    _self.elapsedFormated = elapsed.format('hh:mm:ss', {
                        trim: false,
                        forceLength: true
                    });

                    // let speed = 'x' + getSpeedRatio(progress.timemark, elapsed);
                    let speed = (progress.currentFps / frameRate).toFixed(3);
                    let eta = moment.duration((100 - precent) / 100 * _self.metadata.format.duration * (1 / speed), 'seconds').format('hh:mm:ss', {
                        trim: false,
                        forceLength: true
                    });

                    _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), 'Processing:', progress.currentFps + 'fps', precent + '%',
                        '[' + progress.timemark + ']', '|', colors.yellow(_self.elapsedFormated), '[x' + speed + ']', colors.blue(eta), colors.blue(estimatedFileSize), {
                            __clearLine: true
                        });

                    _self.progress = {
                        fps: progress.currentFps,
                        percent: precent,
                        processed: processed,
                        frames: progress.frames,
                        elapsed: _self.elapsedFormated,
                        eta: eta,
                        speed: speed
                    };

                    _self.events.emit('progress', _self.progress);
                })
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();
                    _self.temp.files.push(_self.output.path);
                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                // .on('stderr', function(stderrLine) {
                //     _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), stderrLine);
                // })
                .on('end', function() {
                    _.pull(_self.temp.files, _self.output.path);
                    resolve();
                })
                .on('error', function(err, stdout, stderr) {

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        reject(new Error('FFMPEGKILLED'));
                    else
                        reject(new Error('ffmpeg exited with an error.' + stdout + stderr));
                });
            _self.ffmpegCommand.output(_self.output.path, {
                end: true
            });

            if (_self.encoder.enablePreviewStream)
                _self.ffmpegCommand
                .output(_self.previewStream)
                .noAudio()
                .videoCodec('bmp')
                .format('image2')
                .outputOptions('-vf', 'fps=3 [slow];[slow] scale=-1:240')
                .outputOptions('-pix_fmt', 'bgr24')
                .outputOptions('-updatefirst 1');

            // Preview Mode
            if (_self.options.preview) {
                _self.ffmpegCommand.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
            }
            _self.ffmpegCommand.run();
        });
    }

    multiPass() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            if (!_self.options.multiPass || _self.options.multiPass <= 1)
                return resolve();

            if (!_self.options.videoBitrate)
                return reject(new Error('Multipass is only compatable with bitrate encoding, not constant quality encoding.'));

            if (_self.pass >= _self.options.multiPass)
                return resolve();

            let newInput = _self.output.path + '-pass' + _self.pass;
            _self.ffmpegCommand = new ffmpeg(newInput, {
                    logger: _self.encoder.logger
                })
                //.inputOptions('-loglevel', 48)
                .outputOptions('-map', 0)
                .outputOptions('-c', 'copy')
                .outputOptions('-c:v', 'libx265');

            let statsLogLocation = Path.resolve(os.tmpdir(), 'x265stats.log');

            if (_self.options.multiPass === _self.pass + 1) {
                _self._addX265Option('pass=2:stats=' + statsLogLocation);
            } else {
                _self._addX265Option('pass=3:stats=' + statsLogLocation);
            }

            return fs.move(_self.output.path, newInput, {
                clobber: true
            }, function(err) {
                if (err) {
                    _self.encoder.logger.error(err.message);
                    _self.encoder.logger.debug(err.stack);

                    return reject(new Error('Error moving file ' + colors.yellow(_self.output.path) + ' to ' + colors.yellow(newInput) + '.'));
                }

                _self._updatePath(newInput);
                _self.temp.files.push(statsLogLocation);
                _self.temp.files.push(newInput);

                _self.encoder.logger.verbose('Running pass', _self.pass + 1 + '.');
                return _self.setVideoBitDepth().then(function() {
                    return _self.encode.call(_self);
                }).then(function() {
                    return _self.multiPass.call(_self);
                }).then(resolve, reject);
            });
        });
    }

    verifyEncode() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            Video.getMetadata(_self, true).then(function(metadata) {
                const oldMetadata = _self.metadata;
                const timeDiffLimit = 1; // in seconds
                _self.output.metadata = metadata;
                _self.ratio = (_self.output.metadata.format.size / oldMetadata.format.size * 100).toFixed(2);
                _self.encoder.logger.debug('Original Duration:', oldMetadata.format.duration + '(s)\t', 'New Duration:', metadata.format.duration + '(s)');
                let timeDiff = oldMetadata.format.duration - metadata.format.duration;
                // TODO: TimeDiffLimit
                if (timeDiff > timeDiffLimit && !_self.options.preview) {
                    _self.encoder.logger.warn('New encode is', timeDiff, 'seconds longer than the original. The max is', timeDiffLimit, 'seconds.');
                    fs.unlinkSync(_self.output.path);
                    reject(new Error('Processed encode did not meet max time slippage requirements.'));
                } else {
                    resolve();
                }
            });
        });
    }

    move() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.delete)
                return resolve();

            const newDestination = Path.join(_self.dir, _self.output.base);
            _self.encoder.logger.debug('Removing original and moving file to ', newDestination);
            fs.remove(_self.path, function(err) {
                if (err) return reject(err);
                _self.encoder.watchIgnore.push(newDestination);
                fs.move(_self.output.path, newDestination,
                    function(err) {
                        if (err) return reject(err);
                        _self._updateDestination(_self.dir);
                        resolve();
                    });
            })
        });
    }

    screenshots() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.screenshots)
                return resolve();

            Video.takeScreenshots(_self.output.path, Path.join(_self.output.dir, 'screenshots'), _self.encoder.logger).then(resolve, reject);
        });
    }

    sample() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.sample)
                return resolve();

            if (_self.options.preview) {
                _self.encoder.logger.warn('Cannot create sample: Preview and sample flags cannot be used together.');
                return resolve();
            }

            let startTime = moment();
            let frameRate = math.eval(_self.videoStream.avg_frame_rate);
            let command = _self.stages[_self.currentStageNum].command = new ffmpeg(_self.path, {
                logger: _self.encoder.logger
            }).seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000).outputOptions('-c', 'copy').output(_self.output.sample);

            command
                .on('progress', function(progress) {
                    let elapsed = moment.duration(moment().diff(startTime), 'milliseconds');
                    let processed = helpers.momentizeTimemark(progress.timemark);
                    let precent = progress.percent ? progress.percent.toFixed(1) : ((processed.asMilliseconds() / 1000 / _self.metadata.format.duration) * 100).toFixed(1);
                    _self.elapsedFormated = elapsed.format('hh:mm:ss', {
                        trim: false,
                        forceLength: true
                    });

                    // let speed = 'x' + getSpeedRatio(progress.timemark, elapsed);
                    let speed = (progress.currentFps / frameRate).toFixed(3);
                    let eta = moment.duration((100 - precent) / 100 * _self.metadata.format.duration * (1 / speed), 'seconds').format('hh:mm:ss', {
                        trim: false,
                        forceLength: true
                    });

                    _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), 'Processing:', progress.currentFps + 'fps', precent + '%',
                        '[' + progress.timemark + ']', '|', colors.yellow(_self.elapsedFormated), '[x' + speed + ']', colors.blue(eta), {
                            __clearLine: true
                        });

                    _self.progress = {
                        fps: progress.currentFps,
                        percent: precent,
                        processed: processed,
                        elapsed: _self.elapsedFormated,
                        eta: eta,
                        speed: speed
                    };

                    _self.events.emit('progress', _self.progress);
                })
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();
                    _self.temp.files.push(_self.output.path);
                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                // .on('stderr', function(stderrLine) {
                //     _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), stderrLine);
                // })
                .on('end', function() {
                    _.pull(_self.temp.files, _self.output.path);
                    resolve();
                })
                .on('error', function(err, stdout, stderr) {
                    // this.encoder.logger.debug(colors.bgMagenta.white('[ffmpeg]'), stderr);
                    _self.encoder.logger.debug(err.stack);

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        reject(new Error('FFMPEGKILLED'));
                    else
                        reject(err);
                });
        });
    }

    appendStats() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.stats)
                return resolve();

            helpers.initStatsFile(Path.join(process.cwd(), 'h265ize.csv')).then(function(stream) {
                helpers.appendToStatsFile([
                        moment().format('MMMM Do YYYY H:mm:ss a'),
                        _self.path,
                        filesize(_self.metadata.format.size),
                        filesize(_self.output.metadata.format.size),
                        _self.ratio + '%',
                        _self.elapsedFormated
                    ], stream)
                    .then(function() {
                        stream.close();
                        resolve();
                    });
            });

        });
    }

    start() {
        if (this.running)
            return new Error('ALREADYRUNNING');

        if (this.paused) {
            return this.resume();
        }

        this.startTime = moment();
        this.encoder.logger.verbose('Encoding started at', colors.yellow(this.startTime.format("ddd, h:mm A")));
        this.running = true;

        let _self = this;
        this.promiseChain = Promise.reduce(this.stages, function(stageNum, stage) {
            _self.currentStageNum = _self.currentStageNum + 1;
            _self.currentStage = _self.stages[_self.currentStageNum];

            _self.encoder.logger.verbose('Running stage:', stage.name);
            _self.events.emit('stage', stage.name);

            return stage.promise.call(_self).tap(Pauser.waitFor(_self.pauser));

        }, this.currentStageNum).then(function() {
            _self.finishedAt = moment();
            _self.status = 'finished';
            _self.events.emit('finished', _self);
            _self.stop();

        }, function(err) {
            _self.error = err;
            _self.events.emit('failed', _self);
            _self.stop();

        });

        this.events.emit('running');
    }

    resume() {
        this.paused = false;
        this.running = true;
        this.pauser.unpause();

        // Check if there is command active
        if (this.stages[this.currentStageNum].command) {

            // Resume running command
            this.stages[this.currentStageNum].command.kill('SIGCONT');
        }

        // Special handling for the encode stage
        if (this.stages[this.currentStageNum].name === 'Encode') {
            this.ffmpegCommand.kill('SIGCONT');
        }

        this.encoder.logger.info('Resumed...');
        this.events.emit('resumed');
    }

    pause() {
        this.paused = true;
        this.running = false;
        this.pauser.pause();

        // Check if there is command active
        if (this.stages[this.currentStageNum].command) {

            // Resume running command
            this.stages[this.currentStageNum].command.kill('SIGTSTP');
        }

        // Special handling for the encode stage
        if (this.stages[this.currentStageNum].name === 'Encode') {
            this.ffmpegCommand.kill('SIGTSTP');
        }

        this.encoder.logger.info('Paused...');
        this.events.emit('paused');
    }

    stop() {

        if (!this.running)
            return new Error('NOTRUNNING');

        this.running = false;
        this.paused = false;

        // End encoding
        if (this.ffmpegCommand)
            this.ffmpegCommand.kill();

        this.promiseChain.cancel();

        if (!this.error && this.status !== 'finished') {
            this.status = 'failed';
            this.error = new Error('Stopped prematurely.');
            this.events.emit('failed', this);
        }

        return this.cleanUp();
    }

    cleanUp() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            _.each(_self.temp.files, function(path, i) {
                fs.unlinkSync(path);
            });
            resolve();
        });
    }

    _updatePath(path) {
        this.path = path;

        let pathParsed = Path.parse(this.path);
        this.base = pathParsed.base;
        this.dir = pathParsed.dir;
        this.ext = pathParsed.ext;
        this.name = pathParsed.name;
        this.root = pathParsed.root;
    }

    _updateDestination(path) {
        this.options.destination = path;
        this.output = {
            base: this.name + (this.options.preview ? '-preview' : '') + '.' + this.options.outputFormat,
            dir: this.options.destination,
            sample: this.name + '-sample.' + this.options.outputFormat
        };
        this.output.path = Path.join(this.output.dir, this.output.base);
    }

    static getMetadata(video, ofOutput) {
        return new Promise(function(resolve, reject) {
            let path = ofOutput ? video.output.path : video.path;
            ffmpeg.ffprobe(path, function(err, metadata) {
                if (err) {
                    // video.encoder.logger.error(err.message);
                    // video.encoder.logger.debug('ffprobe error stack:', err.stack);
                    return reject(err);
                }

                // video.encoder.logger.debug('Container data:', {
                //     duration: moment.duration(metadata.format.duration, 'seconds').format('hh:mm:ss', {
                //         trim: false,
                //         forceLength: true
                //     }),
                //     size: filesize(metadata.format.size)
                // });

                if (metadata.format.format_name !== 'srt' && !_.isNumber(metadata.format.duration)) {
                    // video.encoder.logger.alert('Could not retrieve video duration. Computing duration...');
                    video.stages[video.currentStageNum].command = new ffmpeg().input(video.path).outputFormat('null').output('-').on('start', function() {
                        if (video.paused)
                            video.pause();
                    }).on('end', function(stdout, stderr) {
                        delete video.stages[video.currentStageNum].command;
                        let lines = stderr.split('\n');
                        let lastTime = lines[lines.length - 3];
                        let duration = lastTime.match(new RegExp('time=(([0-9]|\:|\.)+) bitrate'))[1];

                        // Fix bug with momentjs https://github.com/moment/moment/issues/3266
                        if (duration.indexOf('.') <= duration.length - 3) {
                            duration += '000';
                        }

                        let seconds = moment.duration(duration);
                        metadata.format.duration = seconds.format("s", 6);
                        resolve(metadata);
                    }).run();
                } else {
                    resolve(metadata);
                }
            });
        });
    }

    static takeScreenshots(path, destination, logger) {
        return new Promise(function(resolve, reject) {

            let command = new ffmpeg(path);
            let outputDir = Path.join(destination);

            command
                .on('filenames', function(filenames) {
                    if (filenames.length < 6)
                        logger.alert('Only generating', colors.yellow(filenames.length), 'screenshots.');
                })
                .on('end', function() {
                    resolve();
                });

            fs.ensureDir(outputDir, function(err) {
                if (err) {
                    throw err;
                }

                command.screenshots({
                    filename: '%b-%i.png',
                    folder: outputDir,
                    count: 6
                });
            });

        });
    }
}

module.exports = Video;
