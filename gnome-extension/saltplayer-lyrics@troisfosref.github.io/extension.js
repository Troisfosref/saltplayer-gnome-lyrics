import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const BUS_NAME = 'io.github.saltplayer.Lyrics';
const OBJECT_PATH = '/io/github/saltplayer/Lyrics';
const MPRIS_BUS_NAME = 'org.mpris.MediaPlayer2.salt-player';
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const SCROLL_START_DELAY_MS = 500;
const SCROLL_END_HOLD_MS = 350;
const LYRIC_EXIT_DURATION_MS = 180;
const LYRIC_ENTER_DURATION_MS = 220;
const LYRIC_TRANSITION_DISTANCE = 5;
const FIXED_SCROLL_SPEEDS = {
    slow: 25,
    normal: 40,
    fast: 70,
    'very-fast': 100,
};

const LYRICS_INTERFACE_XML = `
<node>
  <interface name="io.github.saltplayer.Lyrics">
    <method name="GetSnapshot">
      <arg name="snapshot" type="s" direction="out"/>
    </method>
    <method name="Play"/>
    <method name="Pause"/>
    <signal name="LyricsChanged">
      <arg name="snapshot" type="s"/>
    </signal>
  </interface>
</node>`;

const LyricsProxy = Gio.DBusProxy.makeProxyWrapper(LYRICS_INTERFACE_XML);

const MPRIS_INTERFACE_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
  </interface>
</node>`;

const MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(MPRIS_INTERFACE_XML);

function trimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function formatTrackInfo(title, artist) {
    const cleanTitle = trimmedString(title);
    const cleanArtist = trimmedString(artist);
    return cleanTitle && cleanArtist
        ? `${cleanTitle}  ·  ${cleanArtist}`
        : cleanTitle || cleanArtist;
}

const ScrollingLabel = GObject.registerClass({
    GTypeName: 'SaltPlayerScrollingLabel',
}, class ScrollingLabel extends St.Widget {
    _init(viewportWidth, speedMode) {
        super._init({
            clip_to_allocation: true,
            reactive: false,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'saltplayer-lyrics-label',
        });

        this._text = '';
        this._lineDurationMs = 0;
        this._contentId = '';
        this._viewportWidth = viewportWidth;
        this._speedMode = speedMode;
        this._travelDistance = 0;
        this._measureId = 0;
        this._startDelayId = 0;
        this._animateNextMeasure = false;
        this._transitionSerial = 0;

        this.set_width(this._viewportWidth);
        this._label = this._createLabel();
        this._label.opacity = 0;
    }

    configure(viewportWidth, speedMode) {
        if (this._viewportWidth === viewportWidth
            && this._speedMode === speedMode)
            return;

        this._viewportWidth = viewportWidth;
        this._speedMode = speedMode;
        this.set_width(this._viewportWidth);
        this._scheduleMeasure(false);
    }

    setContent(text, lineDurationMs = 0, contentId = '') {
        const nextText = text ?? '';
        const nextDuration = Math.max(0, lineDurationMs);
        const nextContentId = String(contentId);
        const contentChanged = nextText !== this._text || nextContentId !== this._contentId;
        if (!contentChanged && nextDuration === this._lineDurationMs)
            return;

        this._text = nextText;
        this._lineDurationMs = nextDuration;
        this._contentId = nextContentId;
        this._scheduleMeasure(contentChanged);
    }

    _createLabel() {
        const label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        label.clutter_text.single_line_mode = true;
        this.add_child(label);
        return label;
    }

    _scheduleMeasure(animate) {
        this._animateNextMeasure ||= animate;
        this._stopScroll();
        if (this._measureId !== 0)
            GLib.Source.remove(this._measureId);

        this._measureId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._measureId = 0;
            this._measure();
            return GLib.SOURCE_REMOVE;
        });
    }

    _measure() {
        const shouldAnimate = this._animateNextMeasure
            && this._label.text.length > 0
            && this._text.length > 0;
        this._animateNextMeasure = false;

        if (shouldAnimate)
            this._transitionToText();
        else
            this._showTextImmediately();
    }

    _prepareText(text) {
        this._label.translation_x = 0;
        this._label.text = text;
        this._label.set_width(-1);

        if (text.length === 0)
            return 0;

        const [, naturalWidth] = this._label.get_preferred_width(-1);
        const labelWidth = Math.ceil(naturalWidth);
        this._label.set_width(labelWidth);

        if (labelWidth <= this._viewportWidth) {
            this._label.translation_x = (this._viewportWidth - labelWidth) / 2;
            return 0;
        }

        return labelWidth - this._viewportWidth;
    }

    _showTextImmediately() {
        this._cancelLabelTransitions();
        this._travelDistance = this._prepareText(this._text);
        this._label.opacity = this._text.length > 0 ? 255 : 0;
        this._scheduleScrollStart();
    }

    _transitionToText() {
        this._cancelLabelTransitions();
        const serial = this._transitionSerial;
        this._label.ease({
            opacity: 0,
            translation_y: -LYRIC_TRANSITION_DISTANCE,
            duration: LYRIC_EXIT_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (serial !== this._transitionSerial)
                    return;

                this._travelDistance = this._prepareText(this._text);
                this._label.translation_y = LYRIC_TRANSITION_DISTANCE;
                this._label.ease({
                    opacity: 255,
                    translation_y: 0,
                    duration: LYRIC_ENTER_DURATION_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (serial === this._transitionSerial)
                            this._scheduleScrollStart();
                    },
                });
            },
        });
    }

    _cancelLabelTransitions() {
        this._transitionSerial++;
        this._label.remove_all_transitions();
        this._label.opacity = this._label.text.length > 0 ? 255 : 0;
        this._label.translation_y = 0;
    }

    _scheduleScrollStart() {
        if (this._travelDistance <= 0 || this._startDelayId !== 0)
            return;

        this._startDelayId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            SCROLL_START_DELAY_MS,
            () => {
                this._startDelayId = 0;
                this._startScroll();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _startScroll() {
        if (this._travelDistance <= 0)
            return;

        const scrollSpeed = this._getScrollSpeed();
        const duration = Math.max(
            1,
            Math.round(this._travelDistance / scrollSpeed * 1000)
        );
        this._label.ease({
            translation_x: -this._travelDistance,
            duration,
            mode: Clutter.AnimationMode.LINEAR,
        });
    }

    _getScrollSpeed() {
        if (this._speedMode !== 'dynamic')
            return FIXED_SCROLL_SPEEDS[this._speedMode] ?? FIXED_SCROLL_SPEEDS.normal;

        if (this._lineDurationMs <= 0)
            return FIXED_SCROLL_SPEEDS.normal;

        const usableDurationMs = Math.max(
            400,
            this._lineDurationMs
                - LYRIC_ENTER_DURATION_MS
                - SCROLL_START_DELAY_MS
                - SCROLL_END_HOLD_MS
        );
        return Math.min(
            300,
            Math.max(10, this._travelDistance / (usableDurationMs / 1000))
        );
    }

    _stopScroll() {
        if (this._startDelayId !== 0) {
            GLib.Source.remove(this._startDelayId);
            this._startDelayId = 0;
        }
        this._label.remove_transition('translation-x');
    }

    destroy() {
        this._cancelLabelTransitions();
        this._stopScroll();
        if (this._measureId !== 0) {
            GLib.Source.remove(this._measureId);
            this._measureId = 0;
        }
        super.destroy();
    }
});

const LyricsIndicator = GObject.registerClass({
    GTypeName: 'SaltPlayerLyricsIndicator',
}, class LyricsIndicator extends PanelMenu.Button {
    _init(settings, togglePlayback) {
        super._init(0.5, 'Salt Player Lyrics', true);

        this._settings = settings;
        this._togglePlaybackRequested = togglePlayback;
        this._lastSnapshot = null;
        this._lastSequence = -1;
        this._trackInfo = '';
        this._showingLyrics = false;
        this._playing = false;
        this._coverUri = null;
        this._coverBackgroundUri = null;
        this._scrollingLabel = new ScrollingLabel(
            settings.get_int('lyrics-width'),
            settings.get_string('scroll-speed-mode')
        );
        this._panelCover = this._createCover();
        this._panelStatusIcon = new St.Icon({
            icon_name: 'media-playback-pause-symbolic',
            icon_size: 14,
            style_class: 'saltplayer-panel-status',
        });
        this._panelContent = new St.BoxLayout({
            style_class: 'saltplayer-panel-content',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelContent.add_child(this._panelCover.bin);
        this._panelContent.add_child(this._scrollingLabel);
        this._panelContent.add_child(this._panelStatusIcon);
        this.add_child(this._panelContent);

        if (this._clickGesture !== undefined)
            this.remove_action(this._clickGesture);
        this._playbackGesture = new Clutter.ClickGesture();
        this._playbackGesture.set_recognize_on_press(true);
        this._playbackGesture.set_enabled(true);
        this._playbackGesture.connect('recognize', () => this._togglePlayback());
        this.add_action(this._playbackGesture);

        this.syncSettings();
        this.hide();
    }

    _createCover() {
        const size = 22;
        const icon = new St.Icon({
            icon_name: 'audio-x-generic-symbolic',
            icon_size: size,
        });
        const bin = new St.Bin({
            child: icon,
            width: size,
            height: size,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'saltplayer-panel-cover',
            clip_to_allocation: true,
        });
        return {bin, icon, size};
    }

    syncSettings(key = null) {
        if (key === null || key === 'lyrics-width' || key === 'scroll-speed-mode') {
            this._scrollingLabel.configure(
                this._settings.get_int('lyrics-width'),
                this._settings.get_string('scroll-speed-mode')
            );
        }
        if (key === null || key === 'cover-radius')
            this._syncCoverRadius();
        if (key === 'display-mode' && this._lastSnapshot !== null)
            this.setSnapshot(this._lastSnapshot);
    }

    _syncCoverRadius() {
        const radius = Math.clamp(
            this._settings.get_int('cover-radius'),
            0,
            this._panelCover.size / 2
        );
        const declarations = [`border-radius: ${radius}px`];
        if (this._coverBackgroundUri !== null) {
            const uri = this._coverBackgroundUri
                .replaceAll('\\', '\\\\')
                .replaceAll('"', '\\"');
            declarations.push(`background-image: url("${uri}")`);
            declarations.push('background-size: cover');
        }
        this._panelCover.bin.set_style(`${declarations.join('; ')};`);
    }

    setDisconnected() {
        this._lastSnapshot = null;
        this._lastSequence = -1;
        this._showingLyrics = false;
        this._scrollingLabel.setContent('', 0, 'disconnected');
        this.hide();
    }

    setSnapshot(snapshot) {
        const sequence = Number(snapshot.sequence);
        if (Number.isFinite(sequence) && sequence < this._lastSequence)
            return;
        if (Number.isFinite(sequence))
            this._lastSequence = sequence;

        this._lastSnapshot = snapshot;
        if (typeof snapshot.playing === 'boolean') {
            this._playing = snapshot.playing;
            this._syncPlaybackIcon();
        }
        const text = trimmedString(snapshot.text);
        const translation = trimmedString(snapshot.translation);
        const lyrics = this._formatLyrics(text, translation);
        if (snapshot.available !== true || lyrics.length === 0) {
            this._showingLyrics = false;
            const trackInfo = this._trackInfo
                || formatTrackInfo(snapshot.title, snapshot.artist);
            this._scrollingLabel.setContent(trackInfo, 0, `track:${trackInfo}`);
            if (trackInfo.length > 0)
                this.show();
            else
                this.hide();
            return;
        }

        this._showingLyrics = true;
        const startTime = Number.isFinite(snapshot.startTime) ? snapshot.startTime : 0;
        const endTime = Number.isFinite(snapshot.endTime) ? snapshot.endTime : 0;
        this._scrollingLabel.setContent(
            lyrics,
            Math.max(0, endTime - startTime),
            `lyric:${startTime}:${endTime}`
        );
        this.show();
    }

    setMediaState(state) {
        const nextTrackInfo = formatTrackInfo(state?.title, state?.artist);
        const trackInfoChanged = nextTrackInfo !== this._trackInfo;
        this._trackInfo = nextTrackInfo;
        this._setCover(state?.coverUri ?? '');
        if (state !== null) {
            this._playing = state.playing === true;
            this._syncPlaybackIcon();
        }
        if (trackInfoChanged && this._lastSnapshot !== null && !this._showingLyrics)
            this.setSnapshot(this._lastSnapshot);
    }

    _setCover(uri) {
        if (uri === this._coverUri)
            return;
        this._coverUri = uri;

        let backgroundUri = null;
        if (uri.length > 0) {
            const file = uri.includes(':')
                ? Gio.File.new_for_uri(uri)
                : Gio.File.new_for_path(uri);
            if (file.query_exists(null))
                backgroundUri = file.get_uri();
        }

        this._coverBackgroundUri = backgroundUri;
        if (backgroundUri === null)
            this._panelCover.icon.show();
        else
            this._panelCover.icon.hide();
        this._syncCoverRadius();
    }

    _syncPlaybackIcon() {
        this._panelStatusIcon.icon_name = this._playing
            ? 'media-playback-start-symbolic'
            : 'media-playback-pause-symbolic';
    }

    _togglePlayback() {
        const wasPlaying = this._playing;
        this._playing = !wasPlaying;
        this._syncPlaybackIcon();
        this._togglePlaybackRequested(wasPlaying);
    }

    _formatLyrics(text, translation) {
        switch (this._settings.get_string('display-mode')) {
        case 'original':
            return text || translation;
        case 'translation':
            return translation || text;
        default:
            return text && translation ? `${text}  ·  ${translation}` : text || translation;
        }
    }
});

export default class SaltPlayerLyricsExtension extends Extension {
    enable() {
        this._proxy = null;
        this._proxySignalId = 0;
        this._ownerSignalId = 0;
        this._mprisProxy = null;
        this._mprisPropertiesId = 0;
        this._mprisOwnerSignalId = 0;
        this._settingsChangedId = 0;
        this._saltConnected = false;
        this._clockRestoreState = null;
        this._cancellable = new Gio.Cancellable();
        this._settings = this.getSettings();

        this._indicator = new LyricsIndicator(
            this._settings,
            wasPlaying => this._setPlayback(!wasPlaying)
        );
        this._addToPanel();
        this._syncClockVisibility();

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'panel-box' || key === 'panel-index')
                this._repositionIndicator();
            if (['lyrics-width', 'scroll-speed-mode', 'display-mode', 'cover-radius']
                .includes(key))
                this._indicator?.syncSettings(key);
            if (key === 'panel-box' || key === 'hide-clock-when-centered')
                this._syncClockVisibility();
        });

        new LyricsProxy(
            Gio.DBus.session,
            BUS_NAME,
            OBJECT_PATH,
            (proxy, error) => {
                if (error !== null) {
                    if (this._indicator !== null)
                        console.warn(`Salt Player Lyrics: ${error.message}`);
                    return;
                }

                if (this._indicator === null)
                    return;

                this._proxy = proxy;
                this._proxySignalId = proxy.connectSignal(
                    'LyricsChanged',
                    (_proxy, _nameOwner, [payload]) => this._applyPayload(payload)
                );
                this._ownerSignalId = proxy.connect(
                    'notify::g-name-owner',
                    () => this._onNameOwnerChanged()
                );
                this._onNameOwnerChanged();
            },
            this._cancellable,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START
        );

        new MprisPlayerProxy(
            Gio.DBus.session,
            MPRIS_BUS_NAME,
            MPRIS_OBJECT_PATH,
            (proxy, error) => {
                if (error !== null) {
                    if (this._indicator !== null)
                        console.warn(`Salt Player MPRIS: ${error.message}`);
                    return;
                }

                if (this._indicator === null)
                    return;

                this._mprisProxy = proxy;
                this._mprisPropertiesId = proxy.connect(
                    'g-properties-changed', () => this._applyMprisState()
                );
                this._mprisOwnerSignalId = proxy.connect(
                    'notify::g-name-owner',
                    () => this._onMprisOwnerChanged()
                );
                this._onMprisOwnerChanged();
            },
            this._cancellable,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START
        );
    }

    disable() {
        this._cancellable?.cancel();
        this._restoreClockVisibility();

        if (this._proxy !== null) {
            if (this._proxySignalId !== 0)
                this._proxy.disconnectSignal(this._proxySignalId);
            if (this._ownerSignalId !== 0)
                this._proxy.disconnect(this._ownerSignalId);
        }
        if (this._mprisProxy !== null) {
            if (this._mprisPropertiesId !== 0)
                this._mprisProxy.disconnect(this._mprisPropertiesId);
            if (this._mprisOwnerSignalId !== 0)
                this._mprisProxy.disconnect(this._mprisOwnerSignalId);
        }
        if (this._settings !== null && this._settingsChangedId !== 0)
            this._settings.disconnect(this._settingsChangedId);

        this._proxy = null;
        this._proxySignalId = 0;
        this._ownerSignalId = 0;
        this._mprisProxy = null;
        this._mprisPropertiesId = 0;
        this._mprisOwnerSignalId = 0;
        this._settingsChangedId = 0;
        this._saltConnected = false;
        this._clockRestoreState = null;
        this._cancellable = null;
        this._settings = null;

        this._indicator?.destroy();
        this._indicator = null;
    }

    _addToPanel() {
        const position = this._settings.get_string('panel-box');
        const rawIndex = this._settings.get_int('panel-index');
        const boxNames = {
            left: '_leftBox',
            center: '_centerBox',
            right: '_rightBox',
        };
        const targetBox = Main.panel[boxNames[position] ?? '_leftBox'];
        const index = Math.min(Math.max(0, rawIndex), targetBox.get_n_children());
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, position);
    }

    _repositionIndicator() {
        if (this._indicator === null)
            return;

        const container = this._indicator.container;
        container.get_parent()?.remove_child(container);
        delete Main.panel.statusArea[this.uuid];
        this._addToPanel();
    }

    _syncClockVisibility() {
        const shouldHide = this._settings !== null
            && this._saltConnected
            && this._settings.get_boolean('hide-clock-when-centered')
            && this._settings.get_string('panel-box') === 'center';

        if (!shouldHide) {
            this._restoreClockVisibility();
            return;
        }

        if (this._clockRestoreState !== null)
            return;

        const clock = Main.panel.statusArea.dateMenu?.container;
        if (clock === undefined)
            return;

        this._clockRestoreState = clock.visible;
        if (clock.visible)
            clock.hide();
    }

    _restoreClockVisibility() {
        if (this._clockRestoreState === null)
            return;

        const clock = Main.panel.statusArea.dateMenu?.container;
        if (this._clockRestoreState && clock !== undefined)
            clock.show();
        this._clockRestoreState = null;
    }

    _onNameOwnerChanged() {
        if (this._proxy?.g_name_owner === null) {
            this._saltConnected = false;
            this._indicator?.setDisconnected();
            this._syncClockVisibility();
            return;
        }

        this._saltConnected = true;
        this._syncClockVisibility();
        this._requestSnapshot();
    }

    _requestSnapshot() {
        this._proxy?.GetSnapshotRemote((result, error) => {
            if (error !== null) {
                this._indicator?.setDisconnected();
                return;
            }

            const [payload] = result;
            this._applyPayload(payload);
        });
    }

    _onMprisOwnerChanged() {
        if (this._mprisProxy?.g_name_owner === null) {
            this._indicator?.setMediaState(null);
            return;
        }

        this._applyMprisState();
    }

    _metadataValue(metadata, key, fallback) {
        const value = metadata?.[key];
        if (value === undefined || value === null)
            return fallback;
        return typeof value.deep_unpack === 'function' ? value.deep_unpack() : value;
    }

    _applyMprisState() {
        if (this._mprisProxy === null || this._indicator === null)
            return;

        const metadata = this._mprisProxy.Metadata ?? {};
        const artists = this._metadataValue(metadata, 'xesam:artist', []);
        this._indicator.setMediaState({
            title: String(this._metadataValue(metadata, 'xesam:title', '')),
            artist: Array.isArray(artists) ? artists.join(' / ') : String(artists ?? ''),
            coverUri: String(this._metadataValue(metadata, 'mpris:artUrl', '')),
            playing: this._mprisProxy.PlaybackStatus === 'Playing',
        });
    }

    _setPlayback(playing) {
        if (this._proxy === null || this._proxy.g_name_owner === null)
            return;

        const method = playing ? 'Play' : 'Pause';
        const remoteMethod = this._proxy[`${method}Remote`];
        remoteMethod.call(this._proxy, (_result, error) => {
            if (error !== null)
                console.warn(`Salt Player Lyrics ${method}: ${error.message}`);
        });
    }

    _applyPayload(payload) {
        if (this._indicator === null)
            return;

        try {
            this._indicator.setSnapshot(JSON.parse(payload));
        } catch (error) {
            console.warn(`Salt Player Lyrics returned invalid data: ${error.message}`);
            this._indicator.setDisconnected();
        }
    }
}
