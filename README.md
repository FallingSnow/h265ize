#### Version 0.3.x => 0.4.x
h265ize has experienced a major overhaul. Versions up to 0.3.x are written in bash and should work on most systems. Version 0.4.x onward requires nodejs in order to function.

# h265ize
h265ize is a fire and forget weapon. A nodejs utility utilizing ffmpeg to encode large quantities of videos with the hevc codec.
For more information visit [ayrton.sparling.us](https://ayrton.sparling.us/index.php/ultimate-x265hevc-encoding-script-h265ize/ "Ayrton Sparling").

If you have any questions or the script isn't working for you, feel free to open an issue.

## Features
- Batch file processing (can process a whole folder)
- Automatically detects video files (only processes video files found within a folder)
- Detects all audio tracks
- Preserves audio codecs
- Preserves audio track titles
- Preserves flac audio sample rate and bit depth (currently supports 44.1khz/16bit and 96khz/24bit, 24bit is popular in high quality anime)
- Detects and preserves all subtitles
- Detects audio language, if audio language is not your native language and native language subtitles are provided, makes those subtitle default
- Automatically upconvert vobsub/dvdsubs to srt subtitles on mkv files
- Detects bit depth and uses appropriate encoder profile (10-bit is common in high quality anime, supports 8-bit and 10-bit)
- Verbose and preview mode
- File override detection (doesn't accidentally write over a file that already exists, other than in preview mode)
- Detects if file is already encoded in x265 and skips it
- Ability to make encoding previews
- Faulty encoding detection based on before and after video durations
- Maintains file structure in output folder (So in theory you could just take your 3tb movie folder and throw it into the script and the output folder should look that same but with x265 videos)

### Dependencies
- [FFmpeg](https://www.ffmpeg.org/) - Does all the heavy lifting, including encoding. Also used for things like detecting timing, audio/video/subtitle tracks, languages, ect.. **Necessary**.
- [mkvtoolnix](https://www.bunkus.org/videotools/mkvtoolnix/) - Used for upconverting subs in MKVs, not necessary.
- [vobsub2srt](https://github.com/ruediger/VobSub2SRT) - Used for upconverting subs, not necessary.

### Installation
To install the script run the following command to download and make it executable.

##### Base Utility (Unix)
```
git clone https://github.com/FallingSnow/h265ize.git && cd h265ize && npm install && chmod +x h265ize
```
##### Arch Linux (Plus Dependencies)
```
sudo pacman -S ffmpeg mkvtoolnix-cli; \
yaourt vobsub2srt-git; \
git clone https://github.com/FallingSnow/h265ize.git && cd h265ize && npm install && chmod +x h265ize
```

## Usage
`./h265ize [-h|--help] [-d <string>] [-q <0|51>] [-m <string>] [-n <string>] [-f <string>{3}] [-g <string>] [-l <integer>] [-o] [-p] [-v] [--accurate-timestamps] [--disable-upconvert] [--debug] [--as-preset <preset>] [--video-bitrate <integer>] [--he-audio] [--force-he-audio] [--he-downmix] [--delete] <file|directory>`

### Options
> -d :Folder to output files to

> -f :Container format to output; Options: mkv, mp4, m4v; default: mkv; NOTE: If you use mp4 and intend to encode to larger than 4GB, you must add the --large-file option to the QUERY variable.

> -g :Directory where new unfinished file is stored

> -l :Milliseconds to be encoded in preview mode; default: 30000

> -m :x265 encoder preset; Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo; default: fast

> -n :The native language used to select default audio and subtitles. You may use 3 letter or 2 letter ISO 639-2 Alpha-3/Alpha-2 codes or the full language name. Examples: [eng|en|English|jpn|ja|Japanese]

> -o :Override mode; Allows conversion of videos that are already encoded by the hevc codec

> -p :Preview mode; Only processes the first 30 seconds

> -q :Sets the qp quality target; default: 19

> -v :Verbose mode; Display extra output

> -x :Extra x265 options. Options can be found on the [x265 options page](https://x265.readthedocs.org/en/default/cli.html)

> --accurate-timestamps :Accurate Timestamps (substantially increases file size but sometimes fixes timestamps)

> --as-preset :My personal presets; Possible values are listed below; I'll be adding more as time goes on

> --debug :Debug mode; Print extra debugging information

> --delete : Delete source after encoding is complete and replaces it with new encode; STRONGLY NOT RECOMMENED

> --depth :How deap the search for files should go in subdirectories; default: 2

> --disable-upconvert :Disable Upconvert; Stop converting Vobsub subs to srt; Only works with mkv's

> --force-he-audio :Force High Efficiency audio encoding even on lossless audio tracks

> --he-audio :High Efficiency audio mode

> --he-downmix :If there are more than 2.1 audio channels, downmix them to stereo. **`he-audio` must also be enabled**

> --screenshots :Take 6 screenshots at regular intervals throughout the finished encode

> --stats: Creates a stats file in the destination named h265ize.stats

> --video-bitrate :Sets the video bitrate, set to 0 to use qp instead of a target bitrate

> --help :Help; Shows help page

Run `h265ize --help` for more info.

#### Aspresets <a name="aspresets"></a>
| Preset | Description |
|:---:|:---|
| basic | Overall good preset, will always create high quality videos but may produce large files. |
| anime | A very good preset for all types of anime. Produces very good quality for a very small size. Warning: this preset creates a nonconformant, high latency encode. |
| testing-ssim | x265's native preset just in SSIM mode. |

#### Examples
* `./h265izer -v big_buck_bunny_1080p_h264.mov`
* `./h265izer -v -d /home -q 25 -g /home big_buck_bunny_folder`

## Stats file
### Stats currently does not work on 0.4.x
The stats file is located at the destination of the finished encoding under the name `h265ize.stats`. This must be enabled using the `--stats` flag. The file is composed of several lines. Each line is in the format

`
[Finish Encoding Date],[Filename],[Original Size in Megabytes],[Encoded size in Megabytes],[Compression Ratio]
`

For exmaple:

`
08/13 02:46:03 PM, [deanzel] Noir - 08 [BD 1080p Hi10p Dual Audio FLAC][a436a4e8].mkv, 1964MB, 504MB, 25.00%
`

## Creating 10bit encodes
Needs to be updated for version 0.4.x.

### TODO
- [ ] Audio normalization