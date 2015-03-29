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
- Automatically searches for foreign segments subtitles
- Detects bit depth and uses appropriate encoder profile (10-bit is common in high quality anime, supports 8-bit and 10-bit)
- Verbose and preview mode
- File override detection (doesn't accidentally write over a file that already exists, other than in preview mode)
- Detects if file is already encoded in x265 and skips it
- Faulty encoding detection based on before and after video durations
- Maintains file structure in output folder (So in theory you could just take your 3tb movie folder and throw it into the script and the output folder should look that same but with x265 videos)

## Usage
./h265izer [-h(help)] ( [-d &#x3C;string&#x3E;] [-q &#x3C;0|51&#x3E;] [-m &#x3C;string&#x3E;] [-n &#x3C;string&#x3E;{3}] [-a] [-t &#x3C;string&#x3E;] [-f &#x3C;string&#x3E;] [-g &#x3C;string&#x3E;] [-l &#x3C;integer&#x3E;] [-v] [-p] input &#x3C;file|directory&#x3E;
### Options
>-d :(NO TRAILING SLASH) Folder to output files to; default: $HOME/h265

>-q :0-51; default: 19

>-m :x265 encoder preset; Options: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow, placebo; default: fast

>-n :Your native language; Examples: eng, fre, spa, dut; default: eng

>-a :Accurate timestamps (fixes seek times jumping all over the place but substantially increases size)

>-t :Temporary name of the new unfinished file

>-f :Container format to output; Options: mkv, mp4, m4v; default: mkv; NOTE: If you use mp4 and intend to encode to larger than 4GB, you must add the --large-file option to the QUERY variable.

>-g :(NO TRAILING SLASH) Directory where new unfinished file is stored; default: $HOME/h265

>-l :Seconds to be encoded in preview mode; default: 30

>-v :Verbose mode; Display extra output

>-p :Preview mode; Only processes the first ${defaults[previewLength]} seconds

>-x :Extra options; Experimental, can lead to glitchy encodes; Not Recommended

>-h :Help; Shows help page

##### Examples
* ./h265izer -v big_buck_bunny_1080p_h264.mov
* ./h265izer -v -d /home -q 25 -g /tmp big_buck_bunny_folder