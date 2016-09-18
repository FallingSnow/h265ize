"use strict";

const spawn = require('child_process').spawn;
const os = require('os');
const Path = require('path');
const fs = require('fs');

const consoleLogger = require('./consoleLogger.js');
const languages = require('./languages.json');
const packageSettings = require(Path.resolve(__dirname, '../package.json'));

const moment = require("moment");
const hasbin = require('hasbin');
const colors = require('colors');
const _ = require('lodash');
const mime = require('mime');
const recursive = require('recursive-readdir');

var exports = module.exports = {
    getStreamTitle: getStreamTitle,
    normalizeStreamLanguage: normalizeStreamLanguage,
    normalizeLanguage: normalizeLanguage,
    getFormatedChannels: getFormatedChannels,
    momentizeTimemark: momentizeTimemark,
    extractTrack: extractTrack,
    vobsubToSRT: vobsubToSRT,
    createListString: createListString,
    parseInput: parseInput,
    initStatsFile: initStatsFile,
    appendToStatsFile: appendToStatsFile
};

String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
};

function getStreamTitle(stream) {
    return stream.title || stream.tags ? stream.tags.title : undefined;
}

function normalizeStreamLanguage(stream) {
    let lang = stream.language || stream.tags ? stream.tags.language : undefined;
    return normalizeLanguage(lang);
}

function normalizeLanguage(lang) {
    if (typeof lang === 'undefined')
        return 'Unknown';

    switch (lang.length) {
        case 2:
            return languages.alpha2Languages[lang] || "Unknown";
        case 3:
            return languages.alpha3Languages[lang] || "Unknown";
        default:
            return lang.capitalize() || "Unknown";
    }
}

function getFormatedChannels(channels) {
    if (channels === 1) {
        return 'Mono';
    } else if (channels === 2) {
        return 'Stereo';
    } else if (channels % 2) {
        return channels + '.0 Channel';
    } else {
        return (channels - 1) + '.1 Channel';
    }
}

function momentizeTimemark(timemark) {

    let hours = parseInt(timemark.substring(0, timemark.indexOf(':')), 10);
    let minutes = parseInt(timemark.substring(timemark.indexOf(':') + 1, timemark.lastIndexOf(':')), 10);
    let seconds = parseFloat(timemark.substr(timemark.lastIndexOf(':') + 1));

    return moment.duration().add(hours, 'h').add(minutes, 'm').add(seconds, 's');
}

function extractTrack(videoPath, trackIndex) {
    return new Promise(function (resolve, reject) {
        if (!hasbin.sync('mkvextract')) {
            return reject({
                level: 'warn',
                message: 'MKVEXTRACT_NOT_INSTALLED'
            });
        }

        let base = Path.basename(videoPath);
        let output = Path.join(Path.resolve(os.tmpdir(), packageSettings.name), 'TRACK' + trackIndex + '_' + base.replace(/\.[^/.]+$/, ""));

        let process = spawn('mkvextract', ['tracks', videoPath, trackIndex + ':' + output])
                .on('close', (code) => {
                    if (code !== 0) {
                        return reject({
                            level: 'error',
                            message: 'MKVEXTRACT_ERROR ' + code
                        });
                    }
                    resolve(output);
                });
        process.stdout.on('data', function (data) {
            outputHandler('mkvextract', data);
        });
        process.stderr.on('data', function (data) {
            outputHandler('mkvextract', data);
        });

    });
}

function outputHandler(tool, data) {
    // logger.debug(colors.bgMagenta.white('[' + tool + ']'), data.toString('utf8'), {
    //     __clearLine: true
    // });
}


function vobsubToSRT(filePath) {
    return new Promise(function (resolve, reject) {
        if (!hasbin.sync('vobsub2srt')) {
            return reject({
                level: 'warn',
                message: 'VOBSUB2SRT_NOT_INSTALLED'
            });
        }
        let filePathWithoutExtension = filePath.replace(/\.[^/.]+$/, "");

        let process = spawn('vobsub2srt', [filePathWithoutExtension])
                .on('close', (code) => {
                    if (code !== 0) {
                        return reject({
                            level: 'error',
                            message: 'VOBSUB2SRT_ERROR'
                        });
                    }
                    resolve(filePathWithoutExtension + '.srt');
                });
        process.stdout.on('data', function (data) {
            outputHandler('vobsub2srt', data);
        });
        process.stderr.on('data', function (data) {
            outputHandler('vobsub2srt', data);
        });
    });
}

function createListString(files) {
    if (Array.isArray(files))
        return '\n\t- ' + files.join('\n\t- ');

    let array = [];
    _.each(files, function (value, key) {
        array.push(colors.yellow(key) + ': ' + value);
    });
    return '\n\t- ' + array.join('\n\t- ');
}

function parseInput(input, logger) {
    logger = logger ? logger : consoleLogger;
    return new Promise(function (resolve, reject) {
        let fileDescriptorStats;
        try {
            fileDescriptorStats = fs.lstatSync(input);
        } catch (e) {
            if (e.code === 'ENOENT') {
                logger.error('Input', input, 'does not exist.');
                resolve([]);
            }
            throw e;
        }

        // Check if input is a file
        if (fileDescriptorStats.isFile()) {
            if (mime.lookup(input).startsWith('video/')) {
                resolve([input]);
            } else
                return reject('Input file \'' + input + '\' is not a recognized file format.');
        }

        // Check if input is a directory
        else if (fileDescriptorStats.isDirectory()) {
            // Get all files in directory
            findVideos(input).then(function (videoPaths) {
                logger.verbose('Folder encoding started at', colors.yellow(moment().format("dddd, MMMM Do YYYY, h:mm:ss A")));
                resolve(videoPaths);
            }).catch(function (err) {
                reject(err);
            });
        }

    });
}

function findVideos(path) {
    return new Promise(function (resolve, reject) {
        recursive(path, function (err, files) {

            let videos = [];

            // Handle any errors given while searching input directory
            if (err) {
                if (err.code === 'ENOENT')
                    return reject(new Error('File or directory ' + colors.yellow(path) + ' does not exist.'));
                else
                    throw err;
            }


            // Check if each file is a video
            _.each(files, function (file) {
                if (mime.lookup(file).startsWith('video/'))
                    videos.push(file);
            });

            resolve(videos);
        });
    });
}

function initStatsFile(path) {
    return new Promise(function (resolve, reject) {
        loadStatsFile(path).then(function (stream) {
            resolve(stream);
        }).catch(reject);
    });
}

function loadStatsFile(path) {
    return new Promise(function (resolve, reject) {
        fs.access(path, fs.F_OK, function (err) {
            let stream = fs.createWriteStream(path, {
                'flags': 'a'
            });

            if (err) {
                stream.write('Encoded Date,Relative Path,Original Size,New Size,Percentage,Duration of Encode');
            }

            resolve(stream);
        });
    });
}

function appendToStatsFile(data, statsFile) {
    return new Promise(function (resolve, reject) {
        _.each(data, function (val, i) {
            if (val.indexOf(',') > -1) {
                data[i] = '"' + val + '"';
            }
        });
        statsFile.write('\n' + data.join(','));
        resolve();
    });
}
