# h265ize
h265ize is a fire and forget weapon. A nodejs utility utilizing ffmpeg to encode large quantities of videos with the hevc codec.
For more information visit [ayrton.sparling.us](https://ayrton.sparling.us/index.php/ultimate-x265hevc-encoding-script-h265ize/ "Ayrton Sparling").

[![NPM License](https://img.shields.io/npm/l/h265ize.svg)](https://raw.githubusercontent.com/FallingSnow/h265ize/master/LICENSE) [![NPM Version](https://img.shields.io/npm/v/h265ize.svg)](https://www.npmjs.com/package/h265ize)

[![NPM Version](https://nodei.co/npm/h265ize.png)](https://www.npmjs.com/package/h265ize)

If you have any questions or h265ize isn't working for you, feel free to open an issue.

> *h265ize will support [AV1](https://en.wikipedia.org/wiki/AOMedia_Video_1) once encoder support becomes stable & plex supports decoding it.*

## Features
- Works on Windows, OSX, and Linux
- Batch file processing (can process a whole folder)
- Automatically detects video files (only processes video files found within a folder)
- Detects all audio tracks
- Preserves audio codecs
- Preserves audio track titles
- Detects and preserves all subtitles
- Detects audio language, if audio language is not your native language and native language subtitles are provided, makes those subtitles default
- Automatically upconvert vobsub/dvdsubs to srt subtitles on mkv files
- Detects bit depth and uses appropriate encoder profile (10-bit is common in high quality anime, supports 8-bit, 10-bit, 12-bit)
- Verbose and preview mode
- File overwrite detection (doesn't accidentally write over a file that already exists, other than in preview mode)
- Detects if file is already encoded in x265 and skips it
- Ability to make encoding previews
- Take screenshots of a finished encode
- Faulty encoding detection based on before and after video durations
- Maintains file structure in output folder (So in theory you could just take your 3tb movie folder and throw it into the script and the output folder should look that same but with x265 videos)

### Dependencies
- [Node.js](https://nodejs.org/en/) - Required in order to run h265ize.
- [ffmpeg](https://ffmpeg.org/) - Does the video conversion among other things.

#### Option Dependencies
- [mkvtoolnix](https://www.bunkus.org/videotools/mkvtoolnix/) - Used for upconverting subs in MKVs.
- [vobsub2srt](https://github.com/ruediger/VobSub2SRT) - Used for upconverting subs.

### Installation
To install h265ize run one of the following command lines to download and install.

##### Base Utility
```
npm install h265ize --global
```

##### Arch Linux (Plus Optional Dependencies)
```
sudo pacman -S nodejs mkvtoolnix-cli; \
yaourt vobsub2srt-git; \
npm install h265ize --global
```

##### Bleeding Edge/Development
###### Linux
```
git clone https://github.com/FallingSnow/h265ize.git && cd h265ize && npm install && chmod +x h265ize
./h265ize --version
```

##### Windows
```
git clone https://github.com/FallingSnow/h265ize.git && cd h265ize && npm install
node h265ize --version
```

### Updating
Simply run `npm install h265ize --global` again.

### Uninstalling
`npm uninstall h265ize --global`

## Usage
`./h265ize [--help] [-d <string>] [-q <0-51>] [-m <string>] [-n <string>] [-f <string>{3}] [-g <string>] [-l <integer>] [-o] [-p] [-v] [--bitdepth <integer>] [--accurate-timestamps] [--as-preset <preset>] [--disable-upconvert] [--no-auto-subtitle-titles] [--debug] [--video-bitrate <integer>] [--he-audio] [--force-he-audio] [--downmix-he-audio] [--no-auto-audio-titles] [--screenshots] [--delete] <file|directory>`

### Options
> -d :Destination folder

> -f :Container format to output; Options: mkv, mp4, m4v; default: mkv.

> -l :Milliseconds to be encoded in preview mode; default: 30000

> -m :x265 encoder preset; Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo; default: fast

> -n :The native language used to select default audio and subtitles. You may use 3 letter or 2 letter ISO 639-2 Alpha-3/Alpha-2 codes or the full language name. Examples: [eng|en|English|jpn|ja|Japanese]

> -o :Override mode; Allows conversion of videos that are already encoded by the hevc codec

> -p :Preview mode; Only process a 30 second preview

> -q :Sets the qp quality target; default: 19

> -v :Verbose mode; Display extra output

> -x :Extra x265 options. Options can be found on the [x265 options page](https://x265.readthedocs.org/en/default/cli.html)

> --bitdepth :Forces the output bitdepth (bitdepths 8, 10, and 12 are supported)

> --accurate-timestamps :Accurate Timestamps (substantially increases file size but sometimes fixes timestamps)

> --as-preset :My personal presets; Possible values are listed below; I'll be adding more as time goes on

> --debug :Debug mode; Print extra debugging information

> --delete :Deletes source after encoding is complete and replaces it with new encode; STRONGLY NOT RECOMMENED

> --disable-upconvert :Disable Upconvert; Stop converting Vobsub subs to srt; Only works with mkv's

> --force-he-audio :Force High Efficiency audio encoding even on lossless audio tracks

> --he-audio :High Efficiency audio mode

> --downmix-he-audio :If there are more than 2.1 audio channels, downmix them to stereo.

> --normalize-level :Define a level of normalization to be applied. See [Issue 56](https://github.com/FallingSnow/h265ize/issues/56) for more info.

> --screenshots :Take 6 screenshots at regular intervals throughout the finished encode

> --stats: Creates a stats file in the current working directory named h265ize.csv

> --watch: Watches a folder for new files and process the videos

> --video-bitrate :Sets the video bitrate, set to 0 to use qp instead of a target bitrate

> --test: Test mode; Runs as normal, but do not encode any files

> --help :Help; Shows help page

> --version: Show version information

Run `h265ize --help` for more info.

#### Aspresets
| Preset | Description |
|:---:|:---|
| anime | A very good preset for all types of anime. Produces very good quality for a very small size. Warning: this preset creates a nonconformant, high latency encode. |
| testing-ssim | x265's native preset just in SSIM mode. |

#### Examples
* `h265izer -v big_buck_bunny_1080p_h264.mov`
* `h265izer -v -d /home -q 25 big_buck_bunny_folder`
* `h265izer -d /home -q 25 --watch videos/folder`

## Stats file
The stats file is located at the current working directory under the name `h265ize.csv`. This must be enabled using the `--stats` flag. The file is composed of several lines. Each line is in the format

`[Finish Encoding Date],[File Path],[Original Size],[Encoded size],[Compression Precent],[Encoding Duration]`

For example:

`08/13 02:46:03 PM, videos/[deanzel] Noir - 08 [BD 1080p Hi10p Dual Audio FLAC][a436a4e8].mkv, 1964MB, 504MB, 25.66%, 2:51:16`

## Creating 10bit & 12bit encodes
To create 10 or 12bit encodes, simply pass the `--bitdepth 10` or `--bitdepth 12`
parameters. Make sure you have the correct libraries or ffmpeg static build.
