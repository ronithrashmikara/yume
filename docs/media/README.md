# README media

| File | What it is | How it was made |
|---|---|---|
| `banner.webp` | The banner at the top of the README | A static 1600 px WebP (quality 82) converted from a PNG with Pillow |
| `banner.gif` | The earlier animated banner (no longer at the top of the README) | `scripts/generate-readme-banner.mjs`: GPT Image 2.5 Sunburst painted the scene, MiniMax Hailuo-02 animated it (both on fal). Cropped to 960×400, looped by crossfading its last second into its first, with the title laid over it in the site's own fonts |
| `social-preview.jpg` | The card GitHub shows when the repository is shared | GPT Image 2.5 Sunburst, lettered by the model itself. Upload it under the repository's Settings → General → Social preview |
| `words.gif`, `spell.gif`, `wrong-right.gif`, `hina.gif`, `quest.gif`, `door.gif` | Real footage | Cut from recorded live Orbis sessions, sped up 1.4–1.6×, at 8fps. Only the player's voice was simulated |

The banner GIF was cut from the generated `banner.mp4` and a transparent title image:

```bash
ffmpeg -i banner.mp4 -i title.png -filter_complex \
  "[0:v]crop=1364:568:0:60,scale=960:400:flags=lanczos,fps=10,split[a][b];\
   [a]trim=1:5.875,setpts=PTS-STARTPTS[main];[b]trim=0:1,setpts=PTS-STARTPTS[head];\
   [main][head]xfade=transition=fade:duration=1:offset=3.875[loop];\
   [loop][1:v]overlay=0:0,split[x][y];[x]palettegen=max_colors=192:stats_mode=diff[p];\
   [y][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 banner.gif
```
