package io.github.saltplayer.lyrics

import com.xuncorp.spw.workshop.api.PlaybackExtensionPoint
import org.pf4j.Extension

@Extension
class PlaybackLyricsExtension : PlaybackExtensionPoint {
    override fun onBeforeLoadLyrics(mediaItem: PlaybackExtensionPoint.MediaItem): String? {
        LyricsBridge.updateTrack(mediaItem)
        return null
    }

    override fun onLyricsLineUpdated(lyricsLine: PlaybackExtensionPoint.LyricsLine?) {
        LyricsBridge.updateLyrics(lyricsLine)
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        LyricsBridge.updatePlaying(isPlaying)
    }

    override fun onStateChanged(state: PlaybackExtensionPoint.State) {
        when (state) {
            PlaybackExtensionPoint.State.Idle -> LyricsBridge.clear()
            PlaybackExtensionPoint.State.Ended -> LyricsBridge.updatePlaying(false)
            PlaybackExtensionPoint.State.Buffering,
            PlaybackExtensionPoint.State.Ready,
            -> Unit
        }
    }
}
