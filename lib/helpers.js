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
const yargs = require('yargs');
const optional = require('optional');

const userSettings = optional("./settings.json") || {};

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
    appendToStatsFile: appendToStatsFile,
    getCLIArguments: getCLIArguments,
    removeFromObject: removeFromObject,
    isSupportedFileType: isSupportedFileType
};

String.prototype.capitalize = function() {
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
    return new Promise(function(resolve, reject) {
        if (!hasbin.sync('mkvextract')) {
            return reject(new Error("MKVEXTRACT_NOT_INSTALLED"));
        }

        let base = Path.basename(videoPath);
        let output = Path.join(Path.resolve(os.tmpdir(), packageSettings.name), 'TRACK' + trackIndex + '_' + base.replace(/\.[^/.]+$/, ""));

        let process = spawn('mkvextract', ['tracks', videoPath, trackIndex + ':' + output])
            .on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error('MKVEXTRACT_ERROR ' + code));
                }
                resolve(output);
            });
        process.stdout.on('data', function(data) {
            outputHandler('mkvextract', data);
        });
        process.stderr.on('data', function(data) {
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
    return new Promise(function(resolve, reject) {
        if (!hasbin.sync('vobsub2srt')) {
            return reject(new Error('VOBSUB2SRT_NOT_INSTALLED'));
        }
        let filePathWithoutExtension = filePath.replace(/\.[^/.]+$/, "");

        let process = spawn('vobsub2srt', [filePathWithoutExtension])
            .on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error('VOBSUB2SRT_ERROR'));
                }
                resolve(filePathWithoutExtension + '.srt');
            });
        process.stdout.on('data', function(data) {
            outputHandler('vobsub2srt', data);
        });
        process.stderr.on('data', function(data) {
            outputHandler('vobsub2srt', data);
        });
    });
}

function createListString(files) {
    if (Array.isArray(files))
        return '\n\t- ' + files.join('\n\t- ');

    let array = [];
    _.each(files, function(value, key) {
        array.push(colors.yellow(key) + ': ' + value);
    });
    return '\n\t- ' + array.join('\n\t- ');
}

function parseInput(input, logger) {
    logger = logger ? logger : consoleLogger;
    return new Promise(function(resolve, reject) {
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
            if (isSupportedFileType(input)) {
                resolve([input]);
            } else
                return reject('Input file \'' + input + '\' is not a recognized file format.');
        }

        // Check if input is a directory
        else if (fileDescriptorStats.isDirectory()) {
            // Get all files in directory
            findVideos(input).then(function(videoPaths) {
                logger.verbose('Folder encoding started at', colors.yellow(moment().format("dddd, MMMM Do YYYY, h:mm:ss A")));
                resolve(videoPaths);
            }).catch(function(err) {
                reject(err);
            });
        }

    });
}

function findVideos(path) {
    return new Promise(function(resolve, reject) {
        recursive(path, function(err, files) {

            let videos = [];

            // Handle any errors given while searching input directory
            if (err) {
                if (err.code === 'ENOENT')
                    return reject(new Error('File or directory ' + colors.yellow(path) + ' does not exist.'));
                else
                    throw err;
            }


            // Check if each file is a video
            _.each(files, function(file) {
                if (isSupportedFileType(file)) {
                    videos.push(file);
                }
            });

            resolve(videos);
        });
    });
}

function isSupportedFileType(file) {
    const type = mime.getType(file);
    if (type != null && (type.startsWith('video/') || Path.extname(file) === '.m2ts'))
        return true;
    else
        return false;
}

function initStatsFile(path) {
    return new Promise(function(resolve, reject) {
        loadStatsFile(path).then(function(stream) {
            resolve(stream);
        }).catch(reject);
    });
}

function loadStatsFile(path) {
    return new Promise(function(resolve, reject) {
        fs.access(path, fs.F_OK, function(err) {
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
    return new Promise(function(resolve, reject) {
        _.each(data, function(val, i) {
            if (val.indexOf(',') > -1) {
                data[i] = '"' + val + '"';
            }
        });
        statsFile.write('\n' + data.join(','), 'utf-8', function(err) {
            if (err)
                return reject(err);
            resolve();
        });
    });
}

function getCLIArguments() {
    return yargs
        .usage(colors.underline('Usage:') + ' $0 [options] file|directory')
        .options({
            'd': {
                alias: 'destination',
                default: userSettings['destination'] || Path.resolve(process.cwd(), 'h265'),
                describe: 'Folder where encoded files are output.',
                type: 'string',
                normalize: true,
                group: 'General:'
            },
            // 'g': {
            //     alias: 'temp-directory',
            //     default: userSettings['temp-directory'] || Path.resolve(os.tmpdir(), packageSettings.name),
            //     describe: 'Folder where files are stored during encoding.',
            //     type: 'string',
            //     normalize: true,
            //     group: 'General:'
            // },
            // 'log-file': {
            //     default: userSettings['log-file'] || Path.resolve(process.cwd(), 'h265ize.log'),
            //     describe: 'Sets the log file location for all output from h265ize. Enable debug mode via the --debug flag to output to the log file.',
            //     type: 'string',
            //     normalize: true,
            //     group: 'General:'
            // },
            'm': {
                alias: 'preset',
                default: userSettings['preset'] || 'fast',
                describe: 'x265 encoder preset.',
                choices: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'],
                type: 'string',
                group: 'General:'
            },
            'as-preset': {
                default: userSettings['as-preset'] || 'none',
                describe: 'My personal presets. Descriptions of each preset\'s use and function can be found on the github page.',
                choices: ['anime-high', 'anime-medium', 'testing-ssim', 'none'],
                type: 'string',
                group: 'Video:'
            },
            'n': {
                alias: 'native-language',
                default: userSettings['native-language'] || '',
                describe: 'The native language used to select default audio and subtitles. You may use 3 letter or 2 letter ISO 639-2 Alpha-3/Alpha-2 codes or the full language name. Examples: [eng|en|English|jpn|ja|Japanese]',
                type: 'string',
                group: 'General:'
            },
            'f': {
                alias: 'output-format',
                default: userSettings['output-format'] || 'mkv',
                describe: 'Output container format.',
                choices: ['mkv', 'mp4', 'm4v'],
                type: 'string',
                group: 'General:'
            },
            'x': {
                alias: 'extra-options',
                default: userSettings['extra-options'] || '',
                describe: 'Extra x265 options. Options can be found on the x265 options page.',
                type: 'string',
                group: 'Video:'
            },
            'q': {
                alias: 'quality',
                default: userSettings['quality'] || 19,
                describe: 'Sets the qp quality target',
                type: 'number',
                group: 'General:'
            },
            'video-bitrate': {
                default: userSettings['video-bitrate'] || 0,
                describe: 'Sets the video bitrate, set to 0 to use qp rate control instead of a target bitrate.',
                type: 'number',
                group: 'Video:'
            },
            'l': {
                alias: 'preview-length',
                default: userSettings['preview-length'] || 30000,
                describe: 'Milliseconds to encode in preview mode. Max is half the length of input video.',
                type: 'number',
                group: 'Advanced:'
            },
            // 'time-drift-limit': {
            //     default: userSettings['time-drift-limit'] || 200,
            //     describe: 'Milliseconds the finished encode is allowed to differ from the original\'s length.',
            //     type: 'number',
            //     group: 'Advanced:'
            // },
            'accurate-timestamps': {
                default: userSettings['accurate-timestamps'] || false,
                describe: 'Become blu-ray complient and reduce the max keyInt to the average frame rate.',
                type: 'boolean',
                group: 'Video:'
            },
            'he-audio': {
                default: userSettings['he-audio'] || false,
                describe: 'Re-encode audio to opus at 40kbps/channel.',
                type: 'boolean',
                group: 'Audio:'
            },
            'force-he-audio': {
                default: userSettings['force-he-audio'] || false,
                describe: 'Convert all audio to HE format, including lossless formats.',
                type: 'boolean',
                group: 'Audio:'
            },
            'downmix-he-audio': {
                default: userSettings['downmix-he-audio'] || false,
                describe: 'Downmix he-audio opus to Dolby Pro Logic II at 40 kbps/channel. Enables he-audio.',
                type: 'boolean',
                group: 'Audio:'
            },
            'o': {
                alias: 'override',
                default: userSettings['override'] || false,
                describe: 'Enable override mode. Allows conversion of videos that are already encoded by the hevc codec.',
                type: 'boolean',
                group: 'General:'
            },
            'p': {
                alias: 'preview',
                default: userSettings['preview'] || false,
                describe: 'Only encode a preview of the video starting at middle of video. See -l/--preview-length for more info.',
                type: 'boolean',
                group: 'General:'
            },
            'multi-pass': {
                default: userSettings['mutli-pass'] || 0,
                describe: 'Enable multiple passes by the encoder. Must be greater than 1.',
                type: 'number',
                group: 'Video:'
            },
            'stats': {
                default: userSettings['stats'] || false,
                describe: 'Output a stats file containing stats for each video converted.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'v': {
                alias: 'verbose',
                default: userSettings['verbose'] || false,
                describe: 'Enables verbose mode. Prints extra information.',
                type: 'boolean',
                group: 'General:'
            },
            'watch': {
                default: userSettings['watch'] || '',
                describe: 'Watches a directory for new video files to be converted.',
                type: 'string',
                group: 'Advanced:'
            },
            'bitdepth': {
                default: userSettings['bitdepth'] || 0,
                describe: 'Forces encoding videos at a specific bitdepth. Set to 0 to maintain original bitdepth.',
                type: 'number',
                group: 'Video:'
            },
            'screenshots': {
                default: userSettings['screenshots'] || false,
                describe: 'Take 6 screenshots at regular intervals throughout the finished encode.',
                type: 'boolean',
                group: 'Video:'
            },
            'normalize-level': {
                default: userSettings['normalize-level'] || 2,
                describe: 'Level of normalization to be applied. See https://github.com/FallingSnow/h265ize/issues/56 for more info.',
                type: 'number',
                group: 'Advanced:'
            },
            'scale': {
                default: userSettings['scale'] || false,
                describe: 'Width videos should be scaled to. Videos will always maintain original aspect ratio. [Examples: 720, 480]',
                type: 'number',
                group: 'Video:'
            },
            'debug': {
                default: userSettings['debug'] || false,
                describe: 'Enables debug mode. Prints extra debugging information.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'delete': {
                default: userSettings['delete'] || false,
                describe: 'Delete source after encoding is complete and replaces it with new encode. [DANGER]',
                type: 'boolean',
                group: 'Advanced:'
            },
            'help': {
                describe: 'Displays help page.',
                group: 'Options:'
            },
            'test': {
                default: userSettings['test'] || false,
                describe: 'Puts h265ize in test mode. No files will be encoded.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'version': {
                describe: 'Displays version information.',
                group: 'Options:'
            },
        })
        .argv;
}

function removeFromObject(obj, key) {
    if (typeof obj[key] !== 'undefined') {
        delete obj[key];
        obj.length -= 1;
    }
}
