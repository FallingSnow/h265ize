# h265ize
h265ize is a fire and forget weapon. A bash script utilizing handbrake to encode large quantities of videos with the hevc codec.
For more information visit [ayrton.sparling.us](https://ayrton.sparling.us/index.php/ultimate-x265hevc-encoding-script-h265izer/ "Ayrton Sparling").

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
- [FFmpeg](https://www.ffmpeg.org/) - Used for things like detecting timing, audio/video/subtitle tracks, languages, and many, many other things. Also absolutely necessary.
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

## Creating 10bit encodes
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

## Usage
./h265izer [-h(help)] [-d &lt;string&gt;] [-q &lt;0|51&gt;] [-m &lt;string&gt;] [-n &lt;string&gt;{3}] [-t &lt;string&gt;] [-f &lt;string&gt;{3}] [-g &lt;string&gt;] [-l &lt;integer&gt;] [-a] [-o] [-p] [-u] [-v] &lt;file|directory&gt;
### Options
>  -a :Accurate Timestamps (substantially increases file size but sometimes fixes timestamps)

>  -d :(NO TRAILING SLASH) Folder to output files to; default: $HOME/h265

>  -f :Container format to output; Options: mkv, mp4, m4v; default: mkv; NOTE: If you use mp4 and intend to encode to larger than 4GB, you must add the --large-file option to the QUERY variable.

>  -g :(NO TRAILING SLASH) Directory where new unfinished file is stored

>  -l :Seconds to be encoded in preview mode; default: 30

>  -m :x265 encoder preset; Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo; default: fast

>  -n :Your native language; Examples: eng, fre, spa, dut; default: eng

>  -o :Override mode; Allows conversion of videos that are already encoded by the hevc codec

>  -p :Preview mode; Only processes the first ${defaults[previewLength]} seconds

>  -q :0-51; default: 19

>  -t :Temporary name of the new unfinished file

>  -u :Disable Upconvert; Stop converting Vobsub subs to srt; Only works with mkv's

>  -v :Verbose mode; Display extra output

>  -x :Extra options; Experimental, can lead to glitchy encodes; Not Recommended

>  -h :Help; Shows help page

>  --debug :Debug mode; Print extra debugging information

>  --aspreset :My personal presets; Possible values are listed [below](#aspresets); I'll be adding more as time goes on

>  --help :Help; Shows help page

#### Aspresets <a name="aspresets"></a>
| Preset | Description |
|:---:|:---|
| finalCut | Uses the slow preset and allows QP to shift between 19 and 23 |
| animeHigh | Changes some advanced options to provide the lowest possible file size while still maintaining quality; Caution these settings create high latency encodes |

#### Examples
* ./h265izer -v big_buck_bunny_1080p_h264.mov
* ./h265izer -v -d /home -q 25 -g /tmp big_buck_bunny_folder
