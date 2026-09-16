package io.github.saltplayer.lyrics

import com.xuncorp.spw.workshop.api.PluginContext
import com.xuncorp.spw.workshop.api.SpwPlugin
import com.xuncorp.spw.workshop.api.WorkshopApi
import io.github.saltplayer.lyrics.dbus.LyricsDbusService

class SaltLyricsPlugin(
    pluginContext: PluginContext,
) : SpwPlugin(pluginContext) {
    private var dbusService: LyricsDbusService? = null

    override fun start() {
        runCatching {
            LyricsDbusService(LyricsBridge::currentSnapshot).also { service ->
                service.start()
                LyricsBridge.attach(service)
                dbusService = service
            }
        }.onSuccess {
            WorkshopApi.ui.toast(
                "GNOME 顶栏歌词桥接已启动",
                WorkshopApi.Ui.ToastType.Success,
            )
        }.onFailure { error ->
            System.err.println("Unable to start the GNOME lyrics D-Bus service: ${error.message}")
            error.printStackTrace()
            WorkshopApi.ui.toast(
                "GNOME 顶栏歌词桥接启动失败",
                WorkshopApi.Ui.ToastType.Error,
            )
        }
    }

    override fun stop() {
        stopService()
    }

    override fun delete() {
        stopService()
    }

    private fun stopService() {
        dbusService?.let { service ->
            LyricsBridge.detach(service)
            service.close()
        }
        dbusService = null
    }
}
