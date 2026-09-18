import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function addStringCombo(group, settings, key, title, subtitle, choices) {
    const values = choices.map(([value]) => value);
    const labels = choices.map(([, label]) => label);
    const model = new Gtk.StringList();
    labels.forEach(label => model.append(label));
    const row = new Adw.ComboRow({
        title,
        subtitle,
        model,
    });

    const syncFromSettings = () => {
        const index = values.indexOf(settings.get_string(key));
        row.selected = index >= 0 ? index : 0;
    };
    syncFromSettings();

    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value !== undefined && settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    settings.connect(`changed::${key}`, syncFromSettings);
    group.add(row);
}

function addIntegerSpin(group, settings, key, title, subtitle, lower, upper, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        digits: 0,
        adjustment: new Gtk.Adjustment({
            lower,
            upper,
            step_increment: step,
            page_increment: step * 5,
        }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
}

function addBooleanSwitch(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({
        title,
        subtitle,
    });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
}

export default class SaltPlayerLyricsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        window.search_enabled = true;
        window.set_default_size(560, 620);

        const page = new Adw.PreferencesPage({
            title: '常规',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const placementGroup = new Adw.PreferencesGroup({
            title: '顶栏位置',
            description: '选择歌词所在区域，以及它与区域内其他图标的相对顺序。',
        });
        page.add(placementGroup);

        addStringCombo(
            placementGroup,
            window._settings,
            'panel-box',
            '所在区域',
            '左侧、中央或右侧区域',
            [
                ['left', '左侧'],
                ['center', '居中'],
                ['right', '右侧'],
            ]
        );
        addIntegerSpin(
            placementGroup,
            window._settings,
            'panel-index',
            '区域内序号',
            '从 0 开始；数值越小，位置越靠左',
            0,
            30,
            1
        );
        addBooleanSwitch(
            placementGroup,
            window._settings,
            'hide-clock-when-centered',
            'Salt Player 运行时隐藏时钟',
            '歌词暂时为空时仍保持隐藏；完全退出 Salt Player 后恢复'
        );

        const lyricsGroup = new Adw.PreferencesGroup({
            title: '歌词显示',
            description: '歌词始终居中显示，可设置固定宽度和原文、翻译的组合方式。',
        });
        page.add(lyricsGroup);

        addIntegerSpin(
            lyricsGroup,
            window._settings,
            'cover-radius',
            '封面圆角（像素）',
            '0 为原始方形，11 为圆形',
            0,
            11,
            1
        );

        addStringCombo(
            lyricsGroup,
            window._settings,
            'display-mode',
            '显示内容',
            '没有翻译时会自动回退到原文',
            [
                ['original', '只显示原文'],
                ['translation', '只显示翻译'],
                ['both', '同时显示'],
            ]
        );
        addIntegerSpin(
            lyricsGroup,
            window._settings,
            'lyrics-width',
            '固定宽度（像素）',
            '长歌词超过这个宽度后自动滚动',
            120,
            1000,
            10
        );
        addStringCombo(
            lyricsGroup,
            window._settings,
            'scroll-speed-mode',
            '滚动速度',
            '动态模式根据歌词长度和当前行时间戳自动计算',
            [
                ['dynamic', '动态'],
                ['slow', '慢速'],
                ['normal', '标准'],
                ['fast', '快速'],
                ['very-fast', '很快'],
            ]
        );
    }
}
