package io.github.saltplayer.lyrics.dbus

import io.github.saltplayer.lyrics.LyricsSnapshot
import org.freedesktop.dbus.connections.impl.DBusConnectionBuilder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class LyricsDbusServiceTest {
    @Test
    fun exportsSnapshotAndPublishesChanges() {
        val current = AtomicReference(
            LyricsSnapshot(
                text = "初始歌词",
                translation = "Initial lyrics",
                playing = true,
                available = true,
            ),
        )
        val service = LyricsDbusService(current::get)
        val client = DBusConnectionBuilder.forSessionBus()
            .withShared(false)
            .build()

        try {
            service.start()
            val remote = client.getRemoteObject(
                LyricsRemote.BUS_NAME,
                LyricsRemote.OBJECT_PATH,
                LyricsRemote::class.java,
            )

            assertEquals(current.get().toJson(), remote.GetSnapshot())
            assertEquals("1.0.0", remote.GetVersion())

            val signalPayload = AtomicReference<String>()
            val signalReceived = CountDownLatch(1)
            client.addSigHandler(LyricsRemote.LyricsChanged::class.java) { signal ->
                signalPayload.set(signal.snapshot)
                signalReceived.countDown()
            }

            val updated = current.get().copy(text = "下一句", sequence = 1)
            current.set(updated)
            service.publish(updated)

            assertTrue("LyricsChanged was not received", signalReceived.await(3, TimeUnit.SECONDS))
            assertEquals(updated.toJson(), signalPayload.get())
        } finally {
            client.close()
            service.close()
        }
    }
}
