package io.github.saltplayer.lyrics.dbus

import org.freedesktop.dbus.annotations.DBusInterfaceName
import org.freedesktop.dbus.interfaces.DBusInterface
import org.freedesktop.dbus.messages.DBusSignal

@DBusInterfaceName(LyricsRemote.INTERFACE_NAME)
interface LyricsRemote : DBusInterface {
    fun GetSnapshot(): String

    fun GetVersion(): String

    class LyricsChanged(
        path: String,
        val snapshot: String,
    ) : DBusSignal(path, snapshot)

    companion object {
        const val BUS_NAME = "io.github.saltplayer.Lyrics"
        const val OBJECT_PATH = "/io/github/saltplayer/Lyrics"
        const val INTERFACE_NAME = "io.github.saltplayer.Lyrics"
    }
}
