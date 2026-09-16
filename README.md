# Salt Player GNOME Lyrics

Display Salt Player synchronized lyrics in the GNOME top bar.

在 GNOME 顶栏显示 Salt Player 同步歌词。项目由两个组件组成：

- `saltplayer-plugin`：Salt Player 创意工坊插件，通过会话 D-Bus 发布当前歌词。
- `gnome-extension`：GNOME Shell 扩展，负责显示、滚动和切换歌词。

## 功能

- 顶栏左侧、中央或右侧位置
- 固定宽度及组件内左对齐、居中、右对齐
- 根据歌词长度和时间戳动态滚动
- 原文、翻译或双语显示
- 歌词切换淡入淡出及轻微纵向移动
- 居中显示歌词时可自动隐藏时钟
- GNOME 原生图形化首选项

## 安装

从 [Releases](https://github.com/Troisfosref/saltplayer-gnome-lyrics/releases) 下载两个 ZIP 文件。

### 1. Salt Player 插件

将 `saltplayer-gnome-lyrics-plugin-*.zip` 放入：

```text
~/.local/share/Salt Player/workshop/plugins/
```

然后在 Salt Player 的“设置 → 创意工坊 → 模组管理”中启用插件并重启播放器。

### 2. GNOME Shell 扩展

安装下载的 GNOME 扩展 ZIP：

```bash
gnome-extensions install --force saltplayer-lyrics@troisfosref.github.io.zip
```

注销并重新登录后启用：

```bash
gnome-extensions enable saltplayer-lyrics@troisfosref.github.io
```

也可以在拓展管理器中搜索“Salt Player Lyrics”安装，或从 [GNOME Extensions](https://extensions.gnome.org/extension/10965/salt-player-lyrics/) 安装。

## 从源码构建

Salt Player 插件需要 JDK 21；GNOME 扩展需要 `glib-compile-schemas` 和 `zip`。

```bash
make
```

生成文件：

```text
saltplayer-plugin/build/distributions/saltplayer-gnome-lyrics-plugin-1.0.0.zip
gnome-extension/build/saltplayer-lyrics@troisfosref.github.io.zip
```

## 工作原理

```text
Salt Player PlaybackExtensionPoint
              │
              ▼
    io.github.saltplayer.Lyrics
         session D-Bus
              │
              ▼
       GNOME Shell extension
```

## 支持范围

- GNOME Shell 50
- Salt Player 原生 Linux 版本
- SPW Workshop API `0.1.0-dev20`

## 许可证

[GPL-3.0-or-later](LICENSE)
