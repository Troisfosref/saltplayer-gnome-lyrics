import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const BUS_NAME = 'io.github.saltplayer.Lyrics';
const OBJECT_PATH = '/io/github/saltplayer/Lyrics';
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
    <signal name="LyricsChanged">
      <arg name="snapshot" type="s"/>
    </signal>
  </interface>
</node>`;

const LyricsProxy = Gio.DBusProxy.makeProxyWrapper(LYRICS_INTERFACE_XML);

const ScrollingLabel = GObject.registerClass({
    GTypeName: 'SaltPlayerScrollingLabel',
}, class ScrollingLabel extends St.Widget {
    _init(viewportWidth, speedMode, textAlignment) {
        super._init({
            clip_to_allocation: true,
            reactive: false,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'saltplayer-lyrics-label',
        });

        this._text = '';
        this._lineDurationMs = 0;
        this._viewportWidth = viewportWidth;
        this._speedMode = speedMode;
        this._textAlignment = textAlignment;
        this._travelDistance = 0;
        this._measureId = 0;
        this._startDelayId = 0;
        this._animateNextMeasure = false;
        this._transitionSerial = 0;

        this.set_width(this._viewportWidth);
        this._labels = [this._createLabel(), this._createLabel()];
        this._label = this._labels[0];
        this._label.opacity = 255;
        this._labels[1].opacity = 0;
    }

    configure(viewportWidth, speedMode, textAlignment) {
        if (this._viewportWidth === viewportWidth
            && this._speedMode === speedMode
            && this._textAlignment === textAlignment)
            return;

        this._viewportWidth = viewportWidth;
        this._speedMode = speedMode;
        this._textAlignment = textAlignment;
        this.set_width(this._viewportWidth);
        this._scheduleMeasure(false);
    }

    setContent(text, lineDurationMs = 0) {
        const nextText = text ?? '';
        const nextDuration = Math.max(0, lineDurationMs);
        const textChanged = nextText !== this._text;
        if (!textChanged && nextDuration === this._lineDurationMs)
            return;

        this._text = nextText;
        this._lineDurationMs = nextDuration;
        this._scheduleMeasure(textChanged);
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

    _prepareLabel(label, text) {
        label.translation_x = 0;
        label.text = text;
        label.set_width(-1);

        if (text.length === 0)
            return 0;

        const [, naturalWidth] = label.get_preferred_width(-1);
        const labelWidth = Math.ceil(naturalWidth);
        label.set_width(labelWidth);

        if (labelWidth <= this._viewportWidth) {
            label.translation_x = this._getAlignmentOffset(labelWidth);
            return 0;
        }

        return labelWidth - this._viewportWidth;
    }

    _showTextImmediately() {
        this._cancelLabelTransitions();
        const inactiveLabel = this._labels.find(label => label !== this._label);
        inactiveLabel.text = '';

        this._travelDistance = this._prepareLabel(this._label, this._text);
        this._label.opacity = this._text.length > 0 ? 255 : 0;
        this._scheduleScrollStart();
    }

    _transitionToText() {
        this._cancelLabelTransitions();

        const previousLabel = this._label;
        const nextLabel = this._labels.find(label => label !== previousLabel);
        const nextTravelDistance = this._prepareLabel(nextLabel, this._text);
        nextLabel.translation_y = LYRIC_TRANSITION_DISTANCE;

        const serial = this._transitionSerial;
        this._label = nextLabel;
        this._travelDistance = nextTravelDistance;

        previousLabel.ease({
            opacity: 0,
            translation_y: -LYRIC_TRANSITION_DISTANCE,
            duration: LYRIC_EXIT_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        nextLabel.ease({
            opacity: 255,
            translation_y: 0,
            duration: LYRIC_ENTER_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (serial !== this._transitionSerial)
                    return;

                previousLabel.text = '';
                this._scheduleScrollStart();
            },
        });
    }

    _cancelLabelTransitions() {
        this._transitionSerial++;
        for (const label of this._labels)
            label.remove_all_transitions();

        this._label.opacity = this._label.text.length > 0 ? 255 : 0;
        this._label.translation_y = 0;
        const inactiveLabel = this._labels.find(label => label !== this._label);
        inactiveLabel.opacity = 0;
        inactiveLabel.translation_y = 0;
    }

    _getAlignmentOffset(labelWidth) {
        const remainingWidth = this._viewportWidth - labelWidth;
        switch (this._textAlignment) {
        case 'left':
            return 0;
        case 'right':
            return remainingWidth;
        default:
            return remainingWidth / 2;
        }
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
    _init(settings, openPreferences, visibilityChanged) {
        super._init(0.5, 'Salt Player Lyrics', false);

        this._settings = settings;
        this._lastSnapshot = null;
        this._lyricsVisible = false;
        this._visibilityChanged = visibilityChanged;
        this._scrollingLabel = new ScrollingLabel(
            settings.get_int('lyrics-width'),
            settings.get_string('scroll-speed-mode'),
            settings.get_string('text-alignment')
        );
        this.add_child(this._scrollingLabel);

        this._trackItem = new PopupMenu.PopupMenuItem('Salt Player', {
            reactive: false,
            style_class: 'saltplayer-lyrics-track',
        });
        this._statusItem = new PopupMenu.PopupMenuItem('等待 Salt Player…', {
            reactive: false,
        });
        this.menu.addMenuItem(this._trackItem);
        this.menu.addMenuItem(this._statusItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._modeItems = new Map();
        const modeMenu = new PopupMenu.PopupSubMenuMenuItem('歌词内容');
        for (const [value, label] of [
            ['original', '只显示原文'],
            ['translation', '只显示翻译'],
            ['both', '同时显示'],
        ]) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => settings.set_string('display-mode', value));
            modeMenu.menu.addMenuItem(item);
            this._modeItems.set(value, item);
        }
        this.menu.addMenuItem(modeMenu);

        this._alignmentItems = new Map();
        const alignmentMenu = new PopupMenu.PopupSubMenuMenuItem('歌词对齐');
        for (const [value, label] of [
            ['left', '靠左'],
            ['center', '居中'],
            ['right', '靠右'],
        ]) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => settings.set_string('text-alignment', value));
            alignmentMenu.menu.addMenuItem(item);
            this._alignmentItems.set(value, item);
        }
        this.menu.addMenuItem(alignmentMenu);

        this._speedItems = new Map();
        const speedMenu = new PopupMenu.PopupSubMenuMenuItem('滚动速度');
        for (const [value, label] of [
            ['dynamic', '动态'],
            ['slow', '慢速'],
            ['normal', '标准'],
            ['fast', '快速'],
            ['very-fast', '很快'],
        ]) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => settings.set_string('scroll-speed-mode', value));
            speedMenu.menu.addMenuItem(item);
            this._speedItems.set(value, item);
        }
        this.menu.addMenuItem(speedMenu);

        this._positionItems = new Map();
        const positionMenu = new PopupMenu.PopupSubMenuMenuItem('顶栏位置');
        for (const [value, label] of [
            ['left', '左侧'],
            ['center', '居中'],
            ['right', '右侧'],
        ]) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => settings.set_string('panel-box', value));
            positionMenu.menu.addMenuItem(item);
            this._positionItems.set(value, item);
        }
        this.menu.addMenuItem(positionMenu);

        this._hideClockItem = new PopupMenu.PopupSwitchMenuItem(
            '有歌词时隐藏时钟',
            settings.get_boolean('hide-clock-when-centered')
        );
        this._hideClockItem.connect('toggled', (_item, state) => {
            if (settings.get_boolean('hide-clock-when-centered') !== state)
                settings.set_boolean('hide-clock-when-centered', state);
        });
        this.menu.addMenuItem(this._hideClockItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const preferencesItem = new PopupMenu.PopupMenuItem('首选项…');
        preferencesItem.connect('activate', openPreferences);
        this.menu.addMenuItem(preferencesItem);

        this.syncSettings();
        this.hide();
    }

    syncSettings() {
        this._scrollingLabel.configure(
            this._settings.get_int('lyrics-width'),
            this._settings.get_string('scroll-speed-mode'),
            this._settings.get_string('text-alignment')
        );

        const mode = this._settings.get_string('display-mode');
        for (const [value, item] of this._modeItems)
            item.setOrnament(value === mode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        const alignment = this._settings.get_string('text-alignment');
        for (const [value, item] of this._alignmentItems)
            item.setOrnament(value === alignment ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        const speedMode = this._settings.get_string('scroll-speed-mode');
        for (const [value, item] of this._speedItems)
            item.setOrnament(value === speedMode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        const position = this._settings.get_string('panel-box');
        for (const [value, item] of this._positionItems)
            item.setOrnament(value === position ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);

        this._hideClockItem.setToggleState(
            this._settings.get_boolean('hide-clock-when-centered')
        );

        if (this._lastSnapshot !== null)
            this.setSnapshot(this._lastSnapshot);
    }

    setDisconnected() {
        this._lastSnapshot = null;
        this._scrollingLabel.setContent('');
        this._trackItem.label.text = 'Salt Player';
        this._statusItem.label.text = '未连接';
        this._setLyricsVisible(false);
    }

    setSnapshot(snapshot) {
        this._lastSnapshot = snapshot;
        const text = typeof snapshot.text === 'string' ? snapshot.text.trim() : '';
        const translation = typeof snapshot.translation === 'string'
            ? snapshot.translation.trim()
            : '';
        const lyrics = this._formatLyrics(text, translation);

        if (snapshot.available !== true || lyrics.length === 0) {
            this._scrollingLabel.setContent('');
            this._statusItem.label.text = snapshot.playing ? '等待歌词…' : '已暂停';
            this._setLyricsVisible(false);
            return;
        }

        const startTime = Number.isFinite(snapshot.startTime) ? snapshot.startTime : 0;
        const endTime = Number.isFinite(snapshot.endTime) ? snapshot.endTime : 0;
        this._scrollingLabel.setContent(lyrics, Math.max(0, endTime - startTime));
        const title = typeof snapshot.title === 'string' ? snapshot.title.trim() : '';
        const artist = typeof snapshot.artist === 'string' ? snapshot.artist.trim() : '';
        this._trackItem.label.text = [title, artist].filter(Boolean).join(' — ') || 'Salt Player';
        this._statusItem.label.text = snapshot.playing ? '正在播放' : '已暂停';
        this._setLyricsVisible(true);
    }

    get lyricsVisible() {
        return this._lyricsVisible;
    }

    _setLyricsVisible(visible) {
        if (visible)
            this.show();
        else
            this.hide();

        if (visible === this._lyricsVisible)
            return;

        this._lyricsVisible = visible;
        this._visibilityChanged();
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
        this._settingsChangedId = 0;
        this._clockRestoreState = null;
        this._cancellable = new Gio.Cancellable();
        this._settings = this.getSettings();

        this._indicator = new LyricsIndicator(
            this._settings,
            () => this.openPreferences(),
            () => this._syncClockVisibility()
        );
        this._addToPanel();
        this._syncClockVisibility();

        this._settingsChangedId = this._settings.connect('changed', (_settings, key) => {
            if (key === 'panel-box' || key === 'panel-index')
                this._repositionIndicator();
            this._indicator?.syncSettings();
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
        if (this._settings !== null && this._settingsChangedId !== 0)
            this._settings.disconnect(this._settingsChangedId);

        this._proxy = null;
        this._proxySignalId = 0;
        this._ownerSignalId = 0;
        this._settingsChangedId = 0;
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
            && this._indicator?.lyricsVisible === true
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
            this._indicator?.setDisconnected();
            return;
        }

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
