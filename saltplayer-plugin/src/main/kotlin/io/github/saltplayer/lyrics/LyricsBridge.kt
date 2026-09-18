package io.github.saltplayer.lyrics

import com.xuncorp.spw.workshop.api.PlaybackExtensionPoint
import io.github.saltplayer.lyrics.dbus.LyricsDbusService

object LyricsBridge {
    private val lock = Any()

    @Volatile
    private var snapshot = LyricsSnapshot()

    private var service: LyricsDbusService? = null

    fun attach(newService: LyricsDbusService) {
        synchronized(lock) {
            service = newService
            newService.publish(snapshot)
        }
    }

    fun detach(currentService: LyricsDbusService) {
        synchronized(lock) {
            if (service === currentService) {
                service = null
            }
        }
    }

    fun currentSnapshot(): LyricsSnapshot = snapshot

    fun updateTrack(mediaItem: PlaybackExtensionPoint.MediaItem) {
        update {
            copy(
                text = "",
                translation = "",
                title = mediaItem.title,
                artist = mediaItem.artist,
                startTime = 0,
                endTime = 0,
                available = false,
            )
        }
    }

    fun updateLyrics(line: PlaybackExtensionPoint.LyricsLine?) {
        update {
            if (line == null) {
                copy(
                    text = "",
                    translation = "",
                    startTime = 0,
                    endTime = 0,
                    available = false,
                )
            } else {
                copy(
                    text = line.pureMainText,
                    translation = line.pureSubText.orEmpty(),
                    startTime = line.startTime,
                    endTime = line.endTime,
                    available = line.pureMainText.isNotBlank()
                        || !line.pureSubText.isNullOrBlank(),
                )
            }
        }
    }

    fun updatePlaying(isPlaying: Boolean) {
        update { copy(playing = isPlaying) }
    }

    fun clear() {
        update {
            LyricsSnapshot(playing = false)
        }
    }

    private fun update(transform: LyricsSnapshot.() -> LyricsSnapshot) {
        synchronized(lock) {
            val updated = snapshot.transform().copy(sequence = snapshot.sequence + 1)
            snapshot = updated
            service?.publish(updated)
        }
    }
}
