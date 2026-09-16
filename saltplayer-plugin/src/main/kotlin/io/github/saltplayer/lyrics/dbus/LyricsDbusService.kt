package io.github.saltplayer.lyrics.dbus

import io.github.saltplayer.lyrics.LyricsSnapshot
import org.freedesktop.dbus.connections.impl.DBusConnection
import org.freedesktop.dbus.connections.impl.DBusConnectionBuilder

class LyricsDbusService(
    private val snapshotProvider: () -> LyricsSnapshot,
) : LyricsRemote, AutoCloseable {
    private var connection: DBusConnection? = null

    override fun getObjectPath(): String = LyricsRemote.OBJECT_PATH

    override fun GetSnapshot(): String = snapshotProvider().toJson()

    override fun GetVersion(): String = "1.0.0"

    fun start() {
        check(connection == null) { "D-Bus service has already started" }

        val newConnection = DBusConnectionBuilder.forSessionBus()
            .withShared(false)
            .build()

        try {
            newConnection.requestBusName(LyricsRemote.BUS_NAME)
            newConnection.exportObject(LyricsRemote.OBJECT_PATH, this)
            connection = newConnection
        } catch (error: Throwable) {
            runCatching { newConnection.close() }
            throw error
        }
    }

    fun publish(snapshot: LyricsSnapshot) {
        val activeConnection = connection ?: return
        runCatching {
            activeConnection.sendMessage(
                LyricsRemote.LyricsChanged(
                    LyricsRemote.OBJECT_PATH,
                    snapshot.toJson(),
                ),
            )
        }.onFailure { error ->
            System.err.println("Unable to publish lyrics over D-Bus: ${error.message}")
        }
    }

    override fun close() {
        val activeConnection = connection ?: return
        connection = null

        runCatching { activeConnection.unExportObject(LyricsRemote.OBJECT_PATH) }
        runCatching { activeConnection.releaseBusName(LyricsRemote.BUS_NAME) }
        runCatching { activeConnection.close() }
    }
}
