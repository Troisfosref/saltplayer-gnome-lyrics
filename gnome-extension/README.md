# Salt Player Lyrics GNOME Extension

This GNOME Shell extension displays the synchronized lyrics published by the
`io.github.saltplayer.lyrics` Salt Player plugin in the center of the top bar.

## Features

- Place the lyrics in the left, center, or right panel area.
- Select the relative index among the other items in that area.
- Optionally hide the clock only while centered lyrics are visible.
- Align lyrics to the left, center, or right inside the fixed-width component.
- Use a fixed, adjustable display width with one-way scrolling for long lines.
- Choose dynamic scrolling based on each line's timestamps, or a fixed speed.
- Cross-fade lyric changes with a subtle vertical slide.
- Show the original lyrics, the translation, or both.
- Change common options from the indicator menu, or open the complete native
  preferences window with `gnome-extensions prefs saltplayer-lyrics@troisfosref.github.io`.

## Requirements

- GNOME Shell 50
- The Salt Player plugin from `../saltplayer-plugin`

## Package and install

```bash
make enable
```

`make enable` packages, installs, and enables the extension. Use `make pack`
when only the distributable ZIP is needed.

GNOME Shell may not discover a newly installed local extension until the Shell
session is restarted. On Wayland, log out and back in, then run `make enable`
again. The second command enables the extension without reinstalling it.

## Diagnostics

Check whether the Salt Player plugin owns its D-Bus name:

```bash
busctl --user status io.github.saltplayer.Lyrics
```

Read the current state directly:

```bash
gdbus call --session \
  --dest io.github.saltplayer.Lyrics \
  --object-path /io/github/saltplayer/Lyrics \
  --method io.github.saltplayer.Lyrics.GetSnapshot
```
