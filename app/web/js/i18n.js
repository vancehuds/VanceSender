/**
 * VanceSender i18n - Lightweight internationalization module.
 *
 * Usage:
 *   - HTML elements with `data-i18n="key"` will have their textContent replaced.
 *   - HTML elements with `data-i18n-placeholder="key"` will have their placeholder replaced.
 *   - HTML elements with `data-i18n-title="key"` will have their title replaced.
 *   - Call `t('key')` in JS to get the translated string.
 *   - Call `setLanguage('en')` to switch languages.
 */

const LANG = {
    'zh-CN': {
        // Navigation
        'nav.home': '首页',
        'nav.send': '发送',
        'nav.quickSend': '快捷发送',
        'nav.ai': 'AI生成',
        'nav.presets': '预设',
        'nav.settings': '设置',

        // Home
        'home.title': '欢迎使用',
        'home.subtitle': '快捷文本发送工具',
        'home.serverStatus': '服务状态',
        'home.sendStats': '发送统计',
        'home.totalSent': '总发送',
        'home.successRate': '成功率',
        'home.batchCount': '批量发送',
        'home.failedCount': '失败数',
        'home.mostUsedPresets': '常用预设',
        'home.version': '版本信息',
        'home.currentVersion': '当前版本',
        'home.latestVersion': '最新版本',
        'home.checkUpdate': '立即检查更新',

        // Send Panel
        'send.title': '发送文本',
        'send.importBtn': '导入文本',
        'send.clearBtn': '清空',
        'send.importHint': '弹窗内 Ctrl+Enter 快速导入',
        'send.totalCount': '共 {0} 条文本',
        'send.quickPresetSwitch': '快速切换预设',
        'send.addItem': '新增项目',
        'send.saveToCurrentPreset': '保存到当前预设',
        'send.saveAsPreset': '存为预设',
        'send.delay': '间隔(ms)',
        'send.sendAll': '全部发送',
        'send.cancel': '取消',
        'send.emptyState': '暂无文本，请在上方输入或使用AI生成',
        'send.history': '发送历史',
        'send.historyRefresh': '刷新',
        'send.historyClear': '清空',
        'send.historyEmpty': '暂无发送记录',
        'send.resend': '重新发送',

        // Quick Send
        'quickSend.title': '快捷发送',
        'quickSend.selectPreset': '选择预设',
        'quickSend.emptyState': '暂无可发送内容',

        // AI Panel
        'ai.title': 'AI 文本生成',
        'ai.scenario': '场景描述',
        'ai.style': '写作风格（可选）',
        'ai.textType': '文本类型',
        'ai.provider': 'AI 服务商',
        'ai.count': '生成数量',
        'ai.generate': '生成文本',
        'ai.generating': '正在生成...',
        'ai.preview': '生成预览',
        'ai.importToSend': '导入到发送列表',
        'ai.waitingGenerate': '等待生成...',
        'ai.sceneTemplates': '场景模板',
        'ai.history': '生成历史',
        'ai.historyRefresh': '刷新',
        'ai.historyClearUnstarred': '清空非收藏',
        'ai.historyEmpty': '暂无生成记录',

        // Presets
        'presets.title': '预设管理',
        'presets.importBtn': '导入预设',
        'presets.exportAllBtn': '全部导出',
        'presets.dragHint': '💡 拖拽预设卡片可调整顺序',
        'presets.emptyState': '暂无预设',

        // Settings
        'settings.title': '系统设置',
        'settings.save': '保存所有设置',
        'settings.unsavedChanges': '存在未保存的设置更改',
        'settings.server': '服务器',
        'settings.senderConfig': '发送方式',
        'settings.overlay': '快捷悬浮窗',
        'settings.overlayAppearance': '悬浮窗外观',
        'settings.aiProviders': 'AI 服务商管理',
        'settings.systemPrompt': '系统提示词',
        'settings.overlayEnabled': '启用悬浮窗',
        'settings.overlayWebUIStatus': '显示 WebUI 发送状态',
        'settings.compactMode': '紧凑模式',
        'settings.bgOpacity': '背景透明度',
        'settings.accentColor': '主题色',
        'settings.fontSize': '字体大小',
        'settings.language': '界面语言',

        // Common
        'common.success': '成功',
        'common.failed': '失败',
        'common.loading': '加载中...',
        'common.confirm': '确认',
        'common.cancel': '取消',
        'common.delete': '删除',
        'common.save': '保存',
        'common.close': '关闭',
    },

    'en': {
        // Navigation
        'nav.home': 'Home',
        'nav.send': 'Send',
        'nav.quickSend': 'Quick Send',
        'nav.ai': 'AI Generate',
        'nav.presets': 'Presets',
        'nav.settings': 'Settings',

        // Home
        'home.title': 'Welcome',
        'home.subtitle': 'Quick Text Sender Tool',
        'home.serverStatus': 'Server Status',
        'home.sendStats': 'Send Statistics',
        'home.totalSent': 'Total Sent',
        'home.successRate': 'Success Rate',
        'home.batchCount': 'Batch Sends',
        'home.failedCount': 'Failed',
        'home.mostUsedPresets': 'Most Used Presets',
        'home.version': 'Version',
        'home.currentVersion': 'Current Version',
        'home.latestVersion': 'Latest Version',
        'home.checkUpdate': 'Check for Updates',

        // Send Panel
        'send.title': 'Send Text',
        'send.importBtn': 'Import Text',
        'send.clearBtn': 'Clear',
        'send.importHint': 'Ctrl+Enter to quick import in dialog',
        'send.totalCount': '{0} text items',
        'send.quickPresetSwitch': 'Quick Preset Switch',
        'send.addItem': 'Add Item',
        'send.saveToCurrentPreset': 'Save to Current Preset',
        'send.saveAsPreset': 'Save as Preset',
        'send.delay': 'Delay (ms)',
        'send.sendAll': 'Send All',
        'send.cancel': 'Cancel',
        'send.emptyState': 'No text. Enter above or use AI generation.',
        'send.history': 'Send History',
        'send.historyRefresh': 'Refresh',
        'send.historyClear': 'Clear',
        'send.historyEmpty': 'No send records',
        'send.resend': 'Resend',

        // Quick Send
        'quickSend.title': 'Quick Send',
        'quickSend.selectPreset': 'Select Preset',
        'quickSend.emptyState': 'No content to send',

        // AI Panel
        'ai.title': 'AI Text Generation',
        'ai.scenario': 'Scenario Description',
        'ai.style': 'Writing Style (optional)',
        'ai.textType': 'Text Type',
        'ai.provider': 'AI Provider',
        'ai.count': 'Count',
        'ai.generate': 'Generate',
        'ai.generating': 'Generating...',
        'ai.preview': 'Preview',
        'ai.importToSend': 'Import to Send List',
        'ai.waitingGenerate': 'Waiting for generation...',
        'ai.sceneTemplates': 'Scene Templates',
        'ai.history': 'Generation History',
        'ai.historyRefresh': 'Refresh',
        'ai.historyClearUnstarred': 'Clear Non-Starred',
        'ai.historyEmpty': 'No generation records',

        // Presets
        'presets.title': 'Preset Manager',
        'presets.importBtn': 'Import Preset',
        'presets.exportAllBtn': 'Export All',
        'presets.dragHint': '💡 Drag preset cards to reorder',
        'presets.emptyState': 'No presets',

        // Settings
        'settings.title': 'Settings',
        'settings.save': 'Save All Settings',
        'settings.unsavedChanges': 'Unsaved settings changes',
        'settings.server': 'Server',
        'settings.senderConfig': 'Send Method',
        'settings.overlay': 'Quick Overlay',
        'settings.overlayAppearance': 'Overlay Appearance',
        'settings.aiProviders': 'AI Provider Management',
        'settings.systemPrompt': 'System Prompt',
        'settings.overlayEnabled': 'Enable Overlay',
        'settings.overlayWebUIStatus': 'Show WebUI Send Status',
        'settings.compactMode': 'Compact Mode',
        'settings.bgOpacity': 'Background Opacity',
        'settings.accentColor': 'Accent Color',
        'settings.fontSize': 'Font Size',
        'settings.language': 'Language',

        // Common
        'common.success': 'Success',
        'common.failed': 'Failed',
        'common.loading': 'Loading...',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.save': 'Save',
        'common.close': 'Close',
    }
};

let _currentLang = localStorage.getItem('vs_lang') || 'zh-CN';

/**
 * Get the translated string for a key.
 * @param {string} key - The translation key
 * @param {...any} args - Format arguments for {0}, {1} etc.
 * @returns {string}
 */
function t(key, ...args) {
    const pack = LANG[_currentLang] || LANG['zh-CN'];
    let str = pack[key] || LANG['zh-CN'][key] || key;
    args.forEach((arg, i) => {
        str = str.replace(`{${i}}`, String(arg));
    });
    return str;
}

/**
 * Get the current language code.
 * @returns {string}
 */
function getCurrentLang() {
    return _currentLang;
}

/**
 * Set the active language and apply to all data-i18n elements.
 * @param {string} lang - Language code ('zh-CN' or 'en')
 */
function setLanguage(lang) {
    if (!LANG[lang]) return;
    _currentLang = lang;
    localStorage.setItem('vs_lang', lang);
    applyLanguage();
}

/**
 * Apply translations to all elements with data-i18n attributes.
 */
function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.placeholder = t(key);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) el.title = t(key);
    });
}
