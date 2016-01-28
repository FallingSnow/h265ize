# h265ize
h265ize is a fire and forget weapon. A bash script utilizing handbrake to encode large quantities of videos with the hevc codec.
For more information visit [ayrton.sparling.us](https://ayrton.sparling.us/index.php/ultimate-x265hevc-encoding-script-h265ize/ "Ayrton Sparling").

If you have any questions or the script isn't working for you, feel free to open an issue.

## Features
- Batch file processing (can process a whole folder)
- Automatically detects video files (only processes video files found within a folder)
- Works out of the box (in theory and personal practice)
- Detects all audio tracks
- Preserves audio codecs (if not possible; falls back to ac3 audio, this hasn't happened to me yet, I think you would have to use a really strange audio codec)
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
- [HandBrake](https://handbrake.fr/) - Does all the encoding, absolutely necessary to do use the script at all.
- [FFmpeg](https://www.ffmpeg.org/) - Used for things like detecting timing, audio/video/subtitle tracks, languages, and many, many other things. Also necessary.
- [mkvtoolnix](https://www.bunkus.org/videotools/mkvtoolnix/) - Used for upconverting subs in MKVs, not necessary.
- [vobsub2srt](https://github.com/ruediger/VobSub2SRT) - Used for upconverting subs, not necessary.

### Installation
To install the script run the following command to download and make it executable.

##### Base Script (Unix)
```
wget https://raw.githubusercontent.com/FallingSnow/h265ize/master/h265ize; chmod +x h265ize
```
##### Arch Linux (Plus Dependencies)
```
sudo pacman -S handbrake ffmpeg mkvtoolnix-cli; \
yaourt vobsub2srt-git; \
wget https://raw.githubusercontent.com/FallingSnow/h265ize/master/h265ize; chmod +x h265ize
```

## Usage
`./h265izer [-h(help)] [-d <string>] [-q <0|51>] [-m <string>] [-n <string>{3}] [-t <string>] [-f <string>{3}] [-g <string>] [-l <integer>] [-a] [-o] [-p] [-u] [-v] [--debug] [--aspreset <preset>] [--depth <integer>] [--video-bitrate <integer>] [--he-audio] [--copy-audio] [--delete] <file|directory>
`
### Options
> -a :Accurate Timestamps (substantially increases file size but sometimes fixes timestamps)

> -d :(NO TRAILING SLASH) Folder to output files to; default: $HOME/h265

> -f :Container format to output; Options: mkv, mp4, m4v; default: mkv; NOTE: If you use mp4 and intend to encode to larger than 4GB, you must add the --large-file option to the QUERY variable.

> -g :(NO TRAILING SLASH) Directory where new unfinished file is stored

> -l :Seconds to be encoded in preview mode; default: 30

> -m :x265 encoder preset; Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo; default: fast

> -n :Your native language; Examples: eng, fre, spa, dut; default: eng

> -o :Override mode; Allows conversion of videos that are already encoded by the hevc codec

> -p :Preview mode; Only processes the first ${defaults[previewLength]} seconds

> -q :Sets the qp quality target; default: 19

> -t :Temporary name of the new unfinished file

> -u :Disable Upconvert; Stop converting Vobsub subs to srt; Only works with mkv's

> -v :Verbose mode; Display extra output

> -x :Extra x265 options

> -h :Help; Shows this help page

> --delete : Delete source after encoding is complete and replaces it with new encode; STRONGLY NOT RECOMMENED

> --depth :How deap the search for files should go in subdirectories; default: 2

> --debug :Debug mode; Print extra debugging information

> --stats: Creates a stats file in the destination name h265ize.stats

> --aspreset :My personal presets; Possible values are listed below; I'll be adding more as time goes on

> --video-bitrate :Sets the video bitrate, set to 0 to use qp instead of a target bitrate

> --he-audio :High Efficiency audio mode

> --he-downmix :

> --copy-audio :Don't encode the audio streams, just copy them

> --help :Help; Shows this help page

Run `h265ize --help` for more info.

#### Aspresets <a name="aspresets"></a>
| Preset | Description |
|:---:|:---|
| basic | Overall good preset, will always create high quality videos but may produce large files. |
| testing-ssim | x265's native preset just in SSIM mode. |
| testing-anime | A very good preset for all types of anime. Produces very good quality for a very small size. Warning: this preset creates a nonconformant, high latency encode. |

#### Examples
* `./h265izer -v big_buck_bunny_1080p_h264.mov`
* `./h265izer -v -d /home -q 25 -g /tmp big_buck_bunny_folder`

## Stats file
The stats file is located at the destination of the finished encoding under the name `h265ize.stats`. This must be enabled using the `--stats` flag. The file is composed of several lines. Each line is in the format

`
[Finish Encoding Date],[Filename],[Original Size in Megabytes],[Encoded size in Megabytes],[Compression Ratio]
`

For exmaple:

`
08/13 02:46:03 PM, [deanzel] Noir - 08 [BD 1080p Hi10p Dual Audio FLAC][a436a4e8].mkv, 1964MB, 504MB, 25.00%
`

## Creating 10bit encodes (Outdated)
In order to encode 10bit encodes you must build handbrake yourself with a 10bit x265 build. In order to do this, follow these steps

1. Copy the handbrake respository
```
svn checkout svn://svn.handbrake.fr/HandBrake/trunk hb-trunk
```
2. Change directories to the repository you just downloaded
```
cd hb-trunk
```
3. Edit the module.defs file for x265 (in this case using vim)
```
vim contrib/x265/module.defs
```
Change `-DHIGH_BIT_DEPTH=OFF` to `-DHIGH_BIT_DEPTH=ON` and `-DWIN32=ON -DWINXP_SUPPORT=ON` to `-DWIN32=OFF -DWINXP_SUPPORT=OFF`
#####before
```
...
X265.CONFIGURE.shared      = -DENABLE_SHARED=OFF
X265.CONFIGURE.extra       = -DENABLE_CLI=OFF -DHIGH_BIT_DEPTH=OFF
...
    ifeq (mingw,$(BUILD.system))
        X265.CONFIGURE.extra += -DWIN32=ON -DWINXP_SUPPORT=ON
    endif
...
```
#####after
```
...
X265.CONFIGURE.shared      = -DENABLE_SHARED=OFF
X265.CONFIGURE.extra       = -DENABLE_CLI=OFF -DHIGH_BIT_DEPTH=ON
...
    ifeq (mingw,$(BUILD.system))
        X265.CONFIGURE.extra += -DWIN32=OFF -DWINXP_SUPPORT=OFF
    endif
...
```
4. Now build handbrake without the gui
```
./configure --launch --launch-jobs=0 --disable-gtk
```
5. Move the 10bit build of handbrake into your bin directory (assuming you're on linux). h265ize will automatically look for HandBrakeCLI10bit in your path.
```
mv build/HandBrakeCLI /bin/HandBrakeCLI10bit
```
6. Winning. You're now ready to encode 10bit videos.

### TODO
- [ ] Audio normalization

## Commercial Interests
There is a paid h265ize version available that includes the following additional automated features:
- Clustered encoding using TORQUE Resource Manager. Includes the ability to:
  - define the number of nodes used
  - define how many encoded segments should be used so nodes with different levels of encoding power can be used

Please contact [ayrton@sparling.us](mailto:ayrton@sparling.us?Subject=h265ize%20Commercial%20Interest) for more information.
