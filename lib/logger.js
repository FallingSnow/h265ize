const winston = require("winston");
const Path = require("path");
const colors = require('colors');
const stripAnsi = require('strip-ansi');
const readline = require("readline");
const keypress = require('keypress');

const packageSettings = require(Path.join(__dirname, '../package.json'));
const helpers = require(Path.join(__dirname, './helpers.js'));

let logFile = Path.join(process.cwd(), 'h265ize.log');

let logLevels = {
    levels: {
        error: 0,
        warn: 1,
        alert: 2,
        info: 3,
        verbose: 4,
        debug: 5
    },
    colors: {
        error: 'red',
        warn: 'yellow',
        alert: 'magenta',
        info: 'white',
        verbose: 'cyan',
        debug: 'grey'
    }
};
winston.addColors(logLevels.colors);
module.exports = function (level) {
    let lastLineWasCleared = false;
    let lastMessageLength = 0;
    let keypressListener;
    let logger = new (winston.Logger)({
        levels: logLevels.levels,
        transports: [
            new (winston.transports.Console)({
                name: 'default-logger',
                level: level,
                colorize: true,
                label: packageSettings.name,
                prettyPrint: true,
                //handleExceptions: true,
                //humanReadableUnhandledException: true,
                // timestamp: function() {
                //     return Date.now();
                // },
                formatter: function (options) {
                    let label = options.level === 'error' ? colors[logLevels.colors['error']]('[' + options.label + ']') : colors.green('[' + options.label + ']');
                    let logLevel = (options.level === 'info' || options.level === 'error') ? '' : colors[logLevels.colors[options.level]]('[' + options.level + ']') + ' ';
                    return label + ': ' + logLevel +
                            (undefined !== options.message ? options.message : '') +
                            (options.meta && Object.keys(options.meta).length ? helpers.createListString(options.meta) : '');
                }
            }),
        ],
        filters: [
            function (level, msg, meta) {
                if (meta.__divider)
                    msg = msg + '\n' + '-'.repeat(process.stdout.columns);

                delete meta.__clearLine;
                delete meta.__divider;
                return msg;
            }
        ],
        rewriters: [
            function (level, msg, meta) {
                if (meta.__clearLine && lastLineWasCleared) {
                    readline.moveCursor(process.stdout, -1000, -Math.ceil(lastMessageLength / process.stdout.columns));
                    readline.clearLine(process.stdout, 0);
                    lastLineWasCleared = true;
                } else if (meta.__clearLine) {
                    lastLineWasCleared = true;
                } else {
                    lastLineWasCleared = false;
                }
                lastMessageLength = stripAnsi(msg).length;

                return meta;
            }
        ]
    });

    if (level === 'debug') {
        logger.debug('Log file location:', logFile);
        logger.add(winston.transports.File, {
            filename: logFile,
            level: level,
            label: packageSettings.name,
            prettyPrint: true,
            json: false,
            timestamp: false,
            formatter: function (options) {
                let label = '[' + options.label + ']';
                let logLevel = (options.level === 'info' || options.level === 'error') ? '' : '[' + options.level + ']' + ' ';
                return stripAnsi(label + ': ' + logLevel +
                        (undefined !== options.message ? options.message : '') +
                        (options.meta && Object.keys(options.meta).length ? helpers.createListString(options.meta) : ''));
            }
        });
    }

    if (module.parent && module.parent.name === 'h265ize') {
        if (process.stdin.isTTY) {
            keypress(process.stdin);
            process.stdin.setRawMode(true);
            process.stdin.resume();

            if (keypressListener === true)
                process.stdin.removeListener('keypress', keypressListener);

            keypressListener = process.stdin.on('keypress', function (ch, key) {
                if (key && key.name == 'd') {
                    let logLevelIsDebug = (logger.transports['default-logger'].level === 'debug');
                    logger.info('Debugging', logLevelIsDebug ? 'disabled.' : 'enabled.');
                    if (logLevelIsDebug) {
                        logger.transports['default-logger'].level = 'info';
                    } else {
                        logger.transports['default-logger'].level = 'debug';
                    }
                }
            });
        }
    }

    return logger;
};
