/**
 * VanceSender Frontend Logic
 * Pure Vanilla JS - No Frameworks
 */

const DESKTOP_CLIENT_SESSION_KEY = 'vs_desktop_client';
const QUICK_PANEL_SESSION_KEY = 'vs_quick_panel_mode';

function readDesktopLaunchContext() {
    const params = new URLSearchParams(window.location.search || '');
    const queryDesktopClient = params.get('vs_desktop') === '1';
    const queryQuickPanelMode = params.get('vs_quick_panel') === '1';

    if (queryDesktopClient) {
        try {
            window.sessionStorage.setItem(DESKTOP_CLIENT_SESSION_KEY, '1');
        } catch (e) {
            // ignore sessionStorage failures
        }
    }

    if (queryQuickPanelMode) {
        try {
            window.sessionStorage.setItem(QUICK_PANEL_SESSION_KEY, '1');
        } catch (e) {
            // ignore sessionStorage failures
        }
    }

    let sessionDesktopClient = false;
    try {
        sessionDesktopClient = window.sessionStorage.getItem(DESKTOP_CLIENT_SESSION_KEY) === '1';
    } catch (e) {
        sessionDesktopClient = false;
    }

    let sessionQuickPanelMode = false;
    try {
        sessionQuickPanelMode = window.sessionStorage.getItem(QUICK_PANEL_SESSION_KEY) === '1';
    } catch (e) {
        sessionQuickPanelMode = false;
    }

    const desktopClient = queryDesktopClient || sessionDesktopClient;
    const quickPanelMode = queryQuickPanelMode || sessionQuickPanelMode;
    const launchToken = desktopClient ? String(params.get('vs_token') || '').trim() : '';
    if (launchToken) {
        try {
            window.localStorage.setItem('vs_token', launchToken);
        } catch (e) {
            // ignore localStorage failures
        }
    }

    if (params.has('vs_desktop') || params.has('vs_token') || params.has('vs_quick_panel')) {
        params.delete('vs_desktop');
        params.delete('vs_token');
        params.delete('vs_quick_panel');
        if (window.history && typeof window.history.replaceState === 'function') {
            const nextSearch = params.toString();
            const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
            window.history.replaceState(null, '', nextUrl);
        }
    }

    return {
        desktopClient,
        quickPanelMode
    };
}

const launchContext = readDesktopLaunchContext();

function isDesktopEmbeddedClient() {
    return Boolean(launchContext.desktopClient);
}

function isQuickPanelMode() {
    return Boolean(launchContext.quickPanelMode);
}

// --- Auth ---
function getToken() {
    return localStorage.getItem('vs_token') || '';
}

function setToken(token) {
    localStorage.setItem('vs_token', token);
}

function clearToken() {
    localStorage.removeItem('vs_token');
}

async function apiFetch(url, options = {}) {
    const token = getToken();
    if (token) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = 'Bearer ' + token;
    }
    const res = await window.fetch(url, options);
    if (res.status === 401) {
        const hadToken = Boolean(token);
        clearToken();
        showAuthGate({
            showError: hadToken,
            message: 'Token 错误，请重新输入'
        });
        throw new Error('AUTH_REQUIRED');
    }
    return res;
}

function formatApiErrorDetail(detail, status) {
    const parts = [`HTTP ${status}`];
    if (!detail) return parts.join(' | ');

    if (typeof detail === 'string') {
        parts.push(detail);
        return parts.join(' | ');
    }

    if (typeof detail === 'object') {
        if (detail.message) parts.push(detail.message);
        if (detail.error_type) parts.push(`type=${detail.error_type}`);
        if (detail.status_code !== undefined && detail.status_code !== null) {
            parts.push(`status=${detail.status_code}`);
        }
        if (detail.request_id) parts.push(`request_id=${detail.request_id}`);
        if (detail.body) parts.push(`body=${detail.body}`);
        return parts.join(' | ');
    }

    parts.push(String(detail));
    return parts.join(' | ');
}

function clearProviderTestResult() {
    const box = document.getElementById('test-provider-result');
    const summary = document.getElementById('test-provider-summary');
    const detail = document.getElementById('test-provider-detail');
    if (!box || !summary || !detail) return;
    box.classList.add('hidden');
    summary.textContent = '';
    detail.textContent = '';
}

function renderProviderTestResult(data, status) {
    const box = document.getElementById('test-provider-result');
    const summary = document.getElementById('test-provider-summary');
    const detail = document.getElementById('test-provider-detail');
    if (!box || !summary || !detail) return;

    const ok = Boolean(data && data.success);
    const lines = [];
    if (status !== undefined && status !== null) lines.push(`HTTP: ${status}`);
    if (data?.error_type) lines.push(`Type: ${data.error_type}`);
    if (data?.status_code !== undefined && data?.status_code !== null) {
        lines.push(`Provider Status: ${data.status_code}`);
    }
    if (data?.request_id) lines.push(`Request ID: ${data.request_id}`);
    if (data?.response) lines.push(`Response: ${data.response}`);
    if (data?.body !== undefined && data?.body !== null) {
        const bodyText = typeof data.body === 'string' ? data.body : JSON.stringify(data.body, null, 2);
        lines.push(`Body: ${bodyText}`);
    }

    summary.textContent = ok ? '连接成功' : '连接失败';
    summary.style.color = ok ? 'var(--accent-success)' : 'var(--accent-danger)';
    detail.textContent = lines.join('\n') || (data?.message || '无详细信息');
    box.classList.remove('hidden');
}

function showAuthGate(options = {}) {
    const showError = Boolean(options.showError);
    const message = String(options.message || 'Token 错误，请重新输入');

    if (isDesktopEmbeddedClient()) {
        const gate = document.getElementById('auth-gate');
        if (gate) {
            gate.classList.add('hidden');
        }

        if (!state.desktopShell.authFailureNotified) {
            state.desktopShell.authFailureNotified = true;
            showToast('内置窗口认证失败，请重启应用后重试', 'error');
        }
        return;
    }

    const gate = document.getElementById('auth-gate');
    const input = document.getElementById('auth-token-input');
    const errEl = document.getElementById('auth-error');

    if (gate) {
        gate.classList.remove('hidden');
    }

    if (errEl) {
        if (showError) {
            errEl.textContent = message;
            errEl.classList.remove('hidden');
        } else {
            errEl.classList.add('hidden');
        }
    }

    if (input) {
        if (showError) {
            input.value = '';
        }
        input.focus();
    }
}

function hideAuthGate() {
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-token-input').value = '';
}

function initAuth() {
    if (isDesktopEmbeddedClient()) {
        const gate = document.getElementById('auth-gate');
        if (gate) {
            gate.classList.add('hidden');
        }
        return;
    }

    document.getElementById('auth-submit').addEventListener('click', submitAuth);
    document.getElementById('auth-token-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitAuth();
    });
}

async function submitAuth() {
    const input = document.getElementById('auth-token-input');
    const token = input.value.trim();
    if (!token) return;

    const errEl = document.getElementById('auth-error');
    errEl.classList.add('hidden');

    try {
        const res = await window.fetch('/api/v1/send/status', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 401) {
            errEl.textContent = 'Token 错误，请重新输入';
            errEl.classList.remove('hidden');
            input.focus();
            input.select();
            return;
        }
        setToken(token);
        state.desktopShell.authFailureNotified = false;
        hideAuthGate();
        loadInitialData();
    } catch (e) {
        errEl.textContent = '连接失败';
        errEl.classList.remove('hidden');
    }
}

// --- State Management ---
const state = {
    texts: [], // Array of {type: 'me'|'do', content: string}
    isSending: false,
    sendController: null, // AbortController for cancelling
    settings: {
        server: {},
        launch: {},
        sender: {},
        ai: {},
        providers: []
    },
    settingsSnapshot: null,
    settingsDirty: false,
    settingsSaveInProgress: false,
    aiPreview: [],
    presets: [],
    currentPresetId: null,
    presetSnapshot: null,
    presetDirty: false,
    currentQuickPresetId: null,
    editingTextIndex: null,
    draggingTextIndex: null,
    dragOverTextIndex: null,
    dragInsertMode: null,
    aiRewriteTarget: null,
    pendingRewrite: null, // { target, original, rewritten, presetId? }
    lastModalTrigger: null,
    lanRiskToastShown: false,
    startupUpdateChecked: false,
    updateCheckInProgress: false,
    homeUpdateBannerDismissed: false,
    desktopShell: {
        active: false,
        maximized: false,
        actionInProgress: false,
        clientEmbedded: isDesktopEmbeddedClient(),
        uiVisible: false,
        authFailureNotified: false
    },
    quickPanel: {
        mode: isQuickPanelMode(),
        actionInProgress: false
    }
};

// --- DOM Elements ---
const dom = {
    desktopTitlebar: document.getElementById('desktop-titlebar'),
    desktopWindowMinimize: document.getElementById('desktop-window-minimize'),
    desktopWindowToggleMaximize: document.getElementById('desktop-window-toggle-maximize'),
    desktopWindowClose: document.getElementById('desktop-window-close'),
    quickPanelTitlebar: document.getElementById('quick-panel-titlebar'),
    quickPanelWindowMinimize: document.getElementById('quick-panel-window-minimize'),
    quickPanelWindowClose: document.getElementById('quick-panel-window-close'),

    navItems: document.querySelectorAll('.nav-item'),
    panels: document.querySelectorAll('.panel'),
    importTextInput: document.getElementById('import-text-input'),
    textList: document.getElementById('text-list'),
    totalCount: document.getElementById('total-count'),
    importBtn: document.getElementById('import-btn'),
    addTextItemBtn: document.getElementById('add-text-item-btn'),
    clearBtn: document.getElementById('clear-text-btn'),
    sendAllBtn: document.getElementById('send-all-btn'),
    cancelSendBtn: document.getElementById('cancel-send-btn'),
    sendDelay: document.getElementById('send-delay'),
    progressBar: document.getElementById('progress-bar-fill'),
    progressText: document.getElementById('progress-text'),
    progressArea: document.getElementById('send-progress-area'),

    // AI
    aiScenario: document.getElementById('ai-scenario'),
    aiStyle: document.getElementById('ai-style'),
    aiCount: document.getElementById('ai-count'),
    aiProvider: document.getElementById('ai-provider-select'),
    aiGenerateBtn: document.getElementById('ai-generate-btn'),
    aiPreviewList: document.getElementById('ai-preview-list'),
    aiImportBtn: document.getElementById('ai-import-btn'),

    // Presets
    presetsGrid: document.getElementById('presets-grid'),
    savePresetBtn: document.getElementById('save-preset-btn'),
    saveCurrentPresetBtn: document.getElementById('save-current-preset-btn'),
    presetUnsavedHint: document.getElementById('preset-unsaved-hint'),
    refreshPresetsBtn: document.getElementById('refresh-presets-btn'),
    quickPresetSelect: document.getElementById('quick-preset-select'),
    quickPresetRefreshBtn: document.getElementById('quick-preset-refresh-btn'),

    // Quick Send
    quickSendPresetSelect: document.getElementById('quick-send-preset-select'),
    quickSendRefreshBtn: document.getElementById('quick-send-refresh-btn'),
    quickSendList: document.getElementById('quick-send-list'),

    // Home
    homeLocalUrl: document.getElementById('home-local-url'),
    homeDocsUrl: document.getElementById('home-docs-url'),
    homeLanStatus: document.getElementById('home-lan-status'),
    homeLanEnabled: document.getElementById('home-lan-enabled'),
    homeLanDisabled: document.getElementById('home-lan-disabled'),
    homeLanUrls: document.getElementById('home-lan-urls'),
    homeTokenStatus: document.getElementById('home-token-status'),
    homeSecurityWarning: document.getElementById('home-security-warning'),
    homeOpenBrowserBtn: document.getElementById('home-open-browser-btn'),
    homeCopyLocalBtn: document.getElementById('home-copy-local-btn'),
    homeUpdateBanner: document.getElementById('home-update-banner'),
    homeUpdateBannerText: document.getElementById('home-update-banner-text'),
    homeUpdateBannerDismissBtn: document.getElementById('home-update-banner-dismiss-btn'),
    homeUpdateBannerLink: document.getElementById('home-update-banner-link'),
    homeUpdateStatus: document.getElementById('home-update-status'),
    homeUpdateTip: document.getElementById('home-update-tip'),
    homeUpdateReleaseLink: document.getElementById('home-update-release-link'),
    homeCheckUpdateBtn: document.getElementById('home-check-update-btn'),
    homePublicConfigCard: document.getElementById('home-public-config-card'),
    homePublicConfigTitle: document.getElementById('home-public-config-title'),
    homePublicConfigContent: document.getElementById('home-public-config-content'),
    homePublicConfigLink: document.getElementById('home-public-config-link'),

    // Settings
    settingMethod: document.getElementById('setting-method'),
    settingChatKey: document.getElementById('setting-chat-key'),
    settingDelayOpen: document.getElementById('setting-delay-open'),
    settingDelayPaste: document.getElementById('setting-delay-paste'),
    settingDelaySend: document.getElementById('setting-delay-send'),
    settingFocusTimeout: document.getElementById('setting-focus-timeout'),
    settingRetryCount: document.getElementById('setting-retry-count'),
    settingRetryInterval: document.getElementById('setting-retry-interval'),
    settingDelayBetweenLines: document.getElementById('setting-delay-between-lines'),
    settingTypingCharDelay: document.getElementById('setting-typing-char-delay'),
    settingLanAccess: document.getElementById('setting-lan-access'),
    settingEnableTrayOnStart: document.getElementById('setting-enable-tray-on-start'),
    settingOpenWebuiOnStart: document.getElementById('setting-open-webui-on-start'),
    settingShowConsoleOnStart: document.getElementById('setting-show-console-on-start'),
    settingCloseAction: document.getElementById('setting-close-action'),
    lanUrls: document.getElementById('lan-urls'),
    lanIpValue: document.getElementById('lan-ip-value'),
    lanUrlValue: document.getElementById('lan-url-value'),
    lanDocsUrlValue: document.getElementById('lan-docs-url-value'),
    settingOverlayEnabled: document.getElementById('setting-overlay-enabled'),
    settingOverlayShowWebuiStatus: document.getElementById('setting-overlay-show-webui-status'),
    settingOverlayCompactMode: document.getElementById('setting-overlay-compact-mode'),
    settingOverlayHotkeyMode: document.getElementById('setting-overlay-hotkey-mode'),
    settingOverlayHotkey: document.getElementById('setting-overlay-hotkey'),
    settingOverlayCaptureHotkeyBtn: document.getElementById('setting-overlay-capture-hotkey-btn'),
    settingOverlayMouseSideButton: document.getElementById('setting-overlay-mouse-side-button'),
    settingOverlayPollIntervalMs: document.getElementById('setting-overlay-poll-interval-ms'),
    settingSystemPrompt: document.getElementById('setting-system-prompt'),
    settingToken: document.getElementById('setting-token'),
    settingCustomHeaders: document.getElementById('setting-custom-headers'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    settingsUnsavedBar: document.getElementById('settings-unsaved-bar'),
    settingsUnsavedSaveBtn: document.getElementById('settings-unsaved-save-btn'),
    checkUpdateBtn: document.getElementById('check-update-btn'),
    appCurrentVersion: document.getElementById('app-current-version'),
    appLatestVersion: document.getElementById('app-latest-version'),
    appUpdateStatus: document.getElementById('app-update-status'),
    appUpdateReleaseLink: document.getElementById('app-update-release-link'),
    publicConfigCard: document.getElementById('public-config-card'),
    publicConfigTitle: document.getElementById('public-config-title'),
    publicConfigContent: document.getElementById('public-config-content'),
    publicConfigLink: document.getElementById('public-config-link'),
    providersList: document.getElementById('providers-list'),
    addProviderBtn: document.getElementById('add-provider-btn'),

    // Modals
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalSavePreset: document.getElementById('modal-save-preset'),
    modalImportText: document.getElementById('modal-import-text'),
    modalEditText: document.getElementById('modal-edit-text'),
    modalAIRewrite: document.getElementById('modal-ai-rewrite'),
    modalProvider: document.getElementById('modal-provider'),
    modalDesktopCloseConfirm: document.getElementById('modal-desktop-close-confirm'),
    presetNameInput: document.getElementById('preset-name-input'),
    confirmSavePreset: document.getElementById('confirm-save-preset'),
    confirmImportText: document.getElementById('confirm-import-text'),
    editTextModalTitle: document.getElementById('edit-text-modal-title'),
    editTextType: document.getElementById('edit-text-type'),
    editTextContent: document.getElementById('edit-text-content'),
    confirmEditText: document.getElementById('confirm-edit-text'),
    aiRewriteTitle: document.getElementById('ai-rewrite-modal-title'),
    aiRewriteDesc: document.getElementById('ai-rewrite-modal-desc'),
    aiRewriteProvider: document.getElementById('ai-rewrite-provider-select'),
    aiRewriteStyle: document.getElementById('ai-rewrite-style'),
    aiRewriteRequirements: document.getElementById('ai-rewrite-requirements'),
    confirmAIRewrite: document.getElementById('confirm-ai-rewrite'),
    modalAIComparison: document.getElementById('modal-ai-comparison'),
    comparisonList: document.getElementById('comparison-list'),
    cancelRewriteBtn: document.getElementById('cancel-rewrite-btn'),
    applyRewriteBtn: document.getElementById('apply-rewrite-btn'),
    providerForm: document.getElementById('provider-form'),
    desktopCloseConfirmRemember: document.getElementById('desktop-close-confirm-remember'),
    desktopCloseConfirmTray: document.getElementById('desktop-close-confirm-tray'),
    desktopCloseConfirmExit: document.getElementById('desktop-close-confirm-exit'),

    // Toast
    toastContainer: document.getElementById('toast-container')
};

const SETTINGS_PRIMARY_SAVE_IDLE_TEXT = dom.saveSettingsBtn?.textContent || '保存全部设置';
const SETTINGS_FLOAT_SAVE_IDLE_TEXT = dom.settingsUnsavedSaveBtn?.textContent || '保存设置';
const APPLY_REWRITE_IDLE_TEXT = dom.applyRewriteBtn?.textContent || '应用更改';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    initDesktopTitlebar();
    initQuickPanelMode();
    initNavigation();
    initHomePanel();
    initSendPanel();
    initQuickSendPanel();
    initAIPanel();
    initAIRewriteModal();
    initAIComparisonModal();
    initPresetsPanel();
    initSettingsPanel();
    initAuth();

    // Auth check — use raw window.fetch to avoid triggering auth gate prematurely
    const token = getToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    try {
        const r = await window.fetch('/api/v1/send/status', { headers });
        if (r.status === 401) {
            showAuthGate({
                showError: Boolean(token),
                message: 'Token 错误，请重新输入'
            });
            return;
        }
    } catch (e) { /* server unreachable — proceed, errors will surface later */ }

    loadInitialData();
});

async function loadInitialData() {
    try {
        await Promise.all([
            fetchSettings(),
            fetchPresets(),
            fetchPublicConfig({ silent: true })
        ]);
        showToast('系统已就绪', 'success');

        if (!state.startupUpdateChecked) {
            state.startupUpdateChecked = true;
            checkGitHubUpdate({ silent: true, startup: true });
        }
    } catch (e) {
        showToast('初始化失败: ' + e.message, 'error');
    }
}

// --- Navigation ---
function initNavigation() {
    dom.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const currentTarget = document.querySelector('.nav-item.active')?.dataset?.target || '';
            const nextTarget = item.dataset?.target || '';
            if (currentTarget === 'panel-send' && nextTarget !== 'panel-send' && hasPresetUnsavedChanges()) {
                const shouldLeave = confirm('当前预设有未保存修改，离开后不会自动保存。是否继续离开？');
                if (!shouldLeave) return;
            }

            // Update UI
            dom.navItems.forEach((n) => {
                n.classList.remove('active');
            });
            item.classList.add('active');

            dom.panels.forEach((p) => {
                p.classList.remove('active');
            });
            const target = document.getElementById(item.dataset.target);
            target.classList.add('active');
        });
    });
}

function syncDesktopTitlebarControls() {
    const shouldDisable = !state.desktopShell.uiVisible || state.desktopShell.actionInProgress;
    [
        dom.desktopWindowMinimize,
        dom.desktopWindowToggleMaximize,
        dom.desktopWindowClose
    ].forEach((button) => {
        if (!button) return;
        button.disabled = shouldDisable;
    });
}

function applyDesktopShellState(serverSettings) {
    const active = Boolean(serverSettings?.desktop_shell_active);
    const maximized = Boolean(serverSettings?.desktop_shell_maximized);

    if (isQuickPanelMode()) {
        state.desktopShell.active = active;
        state.desktopShell.uiVisible = false;
        state.desktopShell.maximized = false;

        document.body.classList.remove('desktop-shell-mode');
        if (dom.desktopTitlebar) {
            dom.desktopTitlebar.classList.add('hidden');
        }

        syncDesktopTitlebarControls();
        return;
    }

    state.desktopShell.active = active;
    state.desktopShell.uiVisible = active && state.desktopShell.clientEmbedded;
    state.desktopShell.maximized = state.desktopShell.uiVisible ? maximized : false;

    document.body.classList.toggle('desktop-shell-mode', state.desktopShell.uiVisible);
    if (dom.desktopTitlebar) {
        dom.desktopTitlebar.classList.toggle('hidden', !state.desktopShell.uiVisible);
    }

    if (dom.desktopWindowToggleMaximize) {
        const maximizeBtn = dom.desktopWindowToggleMaximize;
        if (state.desktopShell.maximized) {
            maximizeBtn.textContent = '❐';
            maximizeBtn.title = '还原';
            maximizeBtn.setAttribute('aria-label', '还原');
        } else {
            maximizeBtn.textContent = '□';
            maximizeBtn.title = '最大化';
            maximizeBtn.setAttribute('aria-label', '最大化');
        }
    }

    syncDesktopTitlebarControls();
}

function getConfiguredDesktopCloseAction() {
    const closeAction = String(state.settings?.launch?.close_action || '').trim().toLowerCase();
    if (['ask', 'minimize_to_tray', 'exit'].includes(closeAction)) {
        return closeAction;
    }
    return 'ask';
}

function isDesktopTraySupported() {
    return Boolean(state.settings?.server?.system_tray_supported ?? true);
}

async function rememberDesktopCloseAction(closeAction) {
    await apiFetch('/api/v1/settings/launch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ close_action: closeAction })
    });

    if (!state.settings.launch || typeof state.settings.launch !== 'object') {
        state.settings.launch = {};
    }
    state.settings.launch.close_action = closeAction;

    if (!state.settingsDirty) {
        if (dom.settingCloseAction && !dom.settingCloseAction.disabled) {
            dom.settingCloseAction.value = closeAction;
        }
        state.settingsSnapshot = getSettingsFormSnapshot();
        setSettingsDirtyState(false);
    }
}

function openDesktopCloseConfirmModal() {
    if (!dom.modalDesktopCloseConfirm) {
        return;
    }

    if (dom.desktopCloseConfirmRemember) {
        dom.desktopCloseConfirmRemember.checked = false;
    }
    openModal('modal-desktop-close-confirm');
}

async function applyDesktopCloseDecision(closeAction) {
    const rememberChoice = Boolean(dom.desktopCloseConfirmRemember?.checked);
    closeModal();

    if (rememberChoice) {
        try {
            await rememberDesktopCloseAction(closeAction);
        } catch (e) {
            if (e.message === 'AUTH_REQUIRED') {
                return;
            }
            showToast('保存关闭偏好失败，将仅本次生效', 'error');
        }
    }

    const desktopAction = closeAction === 'exit' ? 'exit' : 'hide_to_tray';
    await invokeDesktopWindowAction(desktopAction);
}

async function handleDesktopCloseRequest() {
    if (!state.desktopShell.uiVisible || state.desktopShell.actionInProgress) {
        return;
    }

    if (!isDesktopTraySupported()) {
        await invokeDesktopWindowAction('exit');
        return;
    }

    const closeAction = getConfiguredDesktopCloseAction();
    if (closeAction === 'ask') {
        openDesktopCloseConfirmModal();
        return;
    }

    if (closeAction === 'minimize_to_tray') {
        await invokeDesktopWindowAction('hide_to_tray');
        return;
    }

    await invokeDesktopWindowAction('exit');
}

function initDesktopTitlebar() {
    syncDesktopTitlebarControls();

    if (dom.desktopWindowMinimize) {
        dom.desktopWindowMinimize.addEventListener('click', () => {
            invokeDesktopWindowAction('minimize');
        });
    }

    if (dom.desktopWindowToggleMaximize) {
        dom.desktopWindowToggleMaximize.addEventListener('click', () => {
            invokeDesktopWindowAction('toggle_maximize');
        });
    }

    if (dom.desktopWindowClose) {
        dom.desktopWindowClose.addEventListener('click', () => {
            void handleDesktopCloseRequest();
        });
    }

    if (dom.desktopCloseConfirmTray) {
        dom.desktopCloseConfirmTray.addEventListener('click', () => {
            void applyDesktopCloseDecision('minimize_to_tray');
        });
    }

    if (dom.desktopCloseConfirmExit) {
        dom.desktopCloseConfirmExit.addEventListener('click', () => {
            void applyDesktopCloseDecision('exit');
        });
    }
}

function syncQuickPanelTitlebarControls() {
    const shouldDisable = !state.quickPanel.mode || state.quickPanel.actionInProgress;
    [dom.quickPanelWindowMinimize, dom.quickPanelWindowClose].forEach((button) => {
        if (!button) return;
        button.disabled = shouldDisable;
    });
}

function initQuickPanelMode() {
    if (!state.quickPanel.mode) {
        return;
    }

    document.body.classList.add('quick-panel-mode');

    if (dom.desktopTitlebar) {
        dom.desktopTitlebar.classList.add('hidden');
    }

    if (dom.quickPanelTitlebar) {
        dom.quickPanelTitlebar.classList.remove('hidden');
    }

    dom.navItems.forEach((item) => {
        item.classList.remove('active');
    });

    dom.panels.forEach((panel) => {
        panel.classList.remove('active');
    });

    const quickPanel = document.getElementById('panel-quick-send');
    if (quickPanel) {
        quickPanel.classList.add('active');
    }

    if (dom.quickPanelWindowMinimize) {
        dom.quickPanelWindowMinimize.addEventListener('click', () => {
            void invokeQuickPanelWindowAction('minimize');
        });
    }

    if (dom.quickPanelWindowClose) {
        dom.quickPanelWindowClose.addEventListener('click', () => {
            void invokeQuickPanelWindowAction('close');
        });
    }

    syncQuickPanelTitlebarControls();
}

async function invokeQuickPanelWindowAction(action) {
    if (!state.quickPanel.mode || state.quickPanel.actionInProgress) {
        return;
    }

    state.quickPanel.actionInProgress = true;
    syncQuickPanelTitlebarControls();

    try {
        const response = await apiFetch('/api/v1/settings/quick-panel-window/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            showToast(`快捷面板窗口控制失败: ${formatApiErrorDetail(payload.detail, response.status)}`, 'error');
            if (action === 'close') {
                window.close();
            }
            return;
        }
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('快捷面板窗口控制失败，请稍后重试', 'error');
            if (action === 'close') {
                window.close();
            }
        }
    } finally {
        state.quickPanel.actionInProgress = false;
        syncQuickPanelTitlebarControls();
    }
}

async function invokeDesktopWindowAction(action) {
    if (!state.desktopShell.uiVisible || state.desktopShell.actionInProgress) {
        return;
    }

    state.desktopShell.actionInProgress = true;
    syncDesktopTitlebarControls();

    try {
        const response = await apiFetch('/api/v1/settings/desktop-window/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            showToast(`窗口控制失败: ${formatApiErrorDetail(payload.detail, response.status)}`, 'error');
            if (response.status === 400) {
                applyDesktopShellState({
                    desktop_shell_active: false,
                    desktop_shell_maximized: false
                });
            }
            return;
        }

        applyDesktopShellState({
            desktop_shell_active: Boolean(payload.active),
            desktop_shell_maximized: Boolean(payload.maximized)
        });
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('窗口控制失败，请稍后重试', 'error');
        }
    } finally {
        state.desktopShell.actionInProgress = false;
        syncDesktopTitlebarControls();
    }
}

async function copyTextToClipboard(value) {
    const text = String(value || '').trim();
    if (!text) return false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // fallback below
        }
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (e) {
        copied = false;
    }

    document.body.removeChild(input);
    return copied;
}

function getServerLocalWebuiUrl(serverSettings) {
    const apiUrl = String(serverSettings?.webui_url || '').trim();
    if (apiUrl) return apiUrl;

    const origin = String(window.location.origin || '').trim();
    if (origin && origin !== 'null') return origin;

    const port = Number.parseInt(String(serverSettings?.port || ''), 10) || 8730;
    return `http://127.0.0.1:${port}`;
}

function renderHomePanel(serverSettings) {
    const localUrl = getServerLocalWebuiUrl(serverSettings);
    const docsUrl = String(serverSettings?.docs_url || '').trim() || `${localUrl}/docs`;

    if (dom.homeLocalUrl) {
        dom.homeLocalUrl.textContent = localUrl;
    }

    if (dom.homeDocsUrl) {
        dom.homeDocsUrl.textContent = docsUrl;
    }

    const lanEnabled = Boolean(serverSettings?.lan_access);
    const lanPort = Number.parseInt(String(serverSettings?.port || ''), 10) || 8730;
    const lanUrlList = pickLanList(serverSettings, 'lan_urls', 'lan_url');
    const displayLanList = lanUrlList.length > 0 ? lanUrlList : [`http://<your-ip>:${lanPort}`];

    if (dom.homeLanStatus) {
        dom.homeLanStatus.textContent = lanEnabled
            ? '局域网访问已开启，下列地址可供同网络设备访问。'
            : '局域网访问未开启，仅本机可访问。';
    }

    if (dom.homeLanEnabled) {
        dom.homeLanEnabled.classList.toggle('hidden', !lanEnabled);
    }

    if (dom.homeLanDisabled) {
        dom.homeLanDisabled.classList.toggle('hidden', lanEnabled);
    }

    if (dom.homeLanUrls) {
        dom.homeLanUrls.textContent = displayLanList.join(' | ');
    }

    const tokenSet = Boolean(serverSettings?.token_set);
    if (dom.homeTokenStatus) {
        dom.homeTokenStatus.textContent = tokenSet
            ? '当前已设置 Token 认证。'
            : '当前未设置 Token，建议立即设置。';
    }

    const securityWarning = String(serverSettings?.security_warning || '').trim();
    const hasRisk = Boolean(
        serverSettings?.risk_no_token_with_lan
        || (serverSettings?.lan_access && !serverSettings?.token_set)
    );
    if (dom.homeSecurityWarning) {
        dom.homeSecurityWarning.classList.toggle('hidden', !hasRisk);
        dom.homeSecurityWarning.textContent = hasRisk
            ? (securityWarning || '已开启局域网访问且未设置 Token，存在访问风险。')
            : '';
    }
}

function initHomePanel() {
    if (dom.homeOpenBrowserBtn) {
        dom.homeOpenBrowserBtn.addEventListener('click', () => {
            const url = String(dom.homeLocalUrl?.textContent || '').trim();
            if (!url) {
                showToast('地址未就绪，请稍后重试', 'error');
                return;
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    }

    if (dom.homeCopyLocalBtn) {
        dom.homeCopyLocalBtn.addEventListener('click', async () => {
            const url = String(dom.homeLocalUrl?.textContent || '').trim();
            if (!url) {
                showToast('地址未就绪，请稍后重试', 'error');
                return;
            }

            const copied = await copyTextToClipboard(url);
            showToast(copied ? '地址已复制' : '复制失败，请手动复制', copied ? 'success' : 'error');
        });
    }

    if (dom.homeCheckUpdateBtn) {
        dom.homeCheckUpdateBtn.addEventListener('click', () => {
            checkGitHubUpdate();
        });
    }

    if (dom.homeUpdateBannerDismissBtn) {
        dom.homeUpdateBannerDismissBtn.addEventListener('click', () => {
            state.homeUpdateBannerDismissed = true;
            if (dom.homeUpdateBanner) {
                dom.homeUpdateBanner.classList.add('hidden');
            }
        });
    }
}

// --- Send Panel Logic ---
function initSendPanel() {
    dom.importBtn.addEventListener('click', () => {
        openModal('modal-import-text');
    });
    dom.addTextItemBtn.addEventListener('click', openAddTextItemModal);
    dom.clearBtn.addEventListener('click', () => {
        if (hasPresetUnsavedChanges()) {
            const shouldClear = confirm('当前预设有未保存修改，清空后将丢失这些修改。是否继续清空？');
            if (!shouldClear) return;
        }

        state.texts = [];
        clearCurrentPresetSelection();
        renderTextList();
    });

    dom.confirmImportText.addEventListener('click', submitImportTextFromModal);
    dom.importTextInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            submitImportTextFromModal();
        }
    });

    dom.sendAllBtn.addEventListener('click', startBatchSend);
    dom.cancelSendBtn.addEventListener('click', cancelBatchSend);
    dom.savePresetBtn.addEventListener('click', () => openModal('modal-save-preset'));
    dom.saveCurrentPresetBtn.addEventListener('click', saveToCurrentPreset);
    dom.confirmSavePreset.addEventListener('click', saveCurrentAsPreset);
    dom.confirmEditText.addEventListener('click', confirmEditTextUpdate);

    dom.quickPresetSelect.addEventListener('change', (e) => {
        const presetId = e.target.value;
        if (!presetId) return;

        const loaded = loadPresetById(presetId, { jumpToSend: false });
        if (!loaded && dom.quickPresetSelect) {
            dom.quickPresetSelect.value = state.currentPresetId || '';
        }
    });

    dom.quickPresetRefreshBtn.addEventListener('click', async () => {
        const ok = await fetchPresets();
        if (ok) {
            showToast('预设列表已刷新', 'success');
        }
    });

    updatePresetSaveButtonState();
    bindPresetUnsavedWarning();
}

function initQuickSendPanel() {
    if (!dom.quickSendPresetSelect || !dom.quickSendList) return;

    dom.quickSendPresetSelect.addEventListener('change', (e) => {
        state.currentQuickPresetId = e.target.value || null;
        renderQuickSendList();
    });

    if (dom.quickSendRefreshBtn) {
        dom.quickSendRefreshBtn.addEventListener('click', async () => {
            const ok = await fetchPresets();
            if (ok) {
                showToast('预设列表已刷新', 'success');
            }
        });
    }
}

function clearCurrentPresetSelection() {
    state.currentPresetId = null;
    state.presetSnapshot = null;
    setPresetDirtyState(false);

    if (dom.quickPresetSelect) {
        dom.quickPresetSelect.value = '';
    }
    updatePresetSaveButtonState();
}

function updatePresetSaveButtonState() {
    if (!dom.saveCurrentPresetBtn) return;

    const canSaveToCurrentPreset = Boolean(state.currentPresetId);
    dom.saveCurrentPresetBtn.disabled = !canSaveToCurrentPreset;
    if (!canSaveToCurrentPreset) {
        dom.saveCurrentPresetBtn.title = '仅已加载预设后可保存到现有预设';
        setPresetDirtyState(false);
        return;
    }

    dom.saveCurrentPresetBtn.title = state.presetDirty
        ? '当前预设有未保存修改，点击覆盖保存'
        : '将当前文本覆盖保存到已加载预设';
    setPresetDirtyState(state.presetDirty);
}

function buildTextSnapshot(texts) {
    return JSON.stringify(
        (Array.isArray(texts) ? texts : [])
            .map((item) => {
                if (!item || (item.type !== 'me' && item.type !== 'do') || typeof item.content !== 'string') {
                    return null;
                }
                return {
                    type: item.type,
                    content: item.content.trim()
                };
            })
            .filter((item) => item !== null)
    );
}

function hasPresetUnsavedChanges() {
    return Boolean(state.currentPresetId && state.presetDirty);
}

function setPresetDirtyState(isDirty) {
    const activeDirty = Boolean(state.currentPresetId && isDirty);
    state.presetDirty = activeDirty;

    if (dom.presetUnsavedHint) {
        dom.presetUnsavedHint.classList.toggle('hidden', !activeDirty);
    }

    if (dom.saveCurrentPresetBtn) {
        dom.saveCurrentPresetBtn.classList.toggle('btn-primary', activeDirty);
        dom.saveCurrentPresetBtn.classList.toggle('btn-outline', !activeDirty);
    }
}

function refreshPresetDirtyState() {
    if (!state.currentPresetId || !state.presetSnapshot) {
        setPresetDirtyState(false);
        return;
    }

    const currentSnapshot = buildTextSnapshot(state.texts);
    setPresetDirtyState(currentSnapshot !== state.presetSnapshot);
    updatePresetSaveButtonState();
}

function capturePresetSnapshotFromCurrent() {
    if (!state.currentPresetId) {
        state.presetSnapshot = null;
        setPresetDirtyState(false);
        updatePresetSaveButtonState();
        return;
    }

    state.presetSnapshot = buildTextSnapshot(state.texts);
    setPresetDirtyState(false);
    updatePresetSaveButtonState();
}

function bindPresetUnsavedWarning() {
    window.addEventListener('beforeunload', (event) => {
        if (!hasPresetUnsavedChanges()) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

function submitImportTextFromModal() {
    const importedCount = parseAndImportText(dom.importTextInput.value);
    if (importedCount <= 0) {
        dom.importTextInput.focus({ preventScroll: true });
        return;
    }

    dom.importTextInput.value = '';
    closeModal();
}

function parseAndImportText(rawText) {
    const raw = String(rawText || '').trim();
    if (!raw) return 0;

    const lines = raw.split('\n').filter(l => l.trim());
    const newTexts = lines.map(line => {
        line = line.trim();
        let type = 'me';
        let content = line;

        if (line.toLowerCase().startsWith('/do ')) {
            type = 'do';
            content = line.substring(4).trim();
        } else if (line.toLowerCase().startsWith('/me ')) {
            type = 'me';
            content = line.substring(4).trim();
        }

        return { type, content };
    });

    state.texts = [...state.texts, ...newTexts];
    renderTextList();

    const saveHint = state.currentPresetId ? '，可点击“保存到当前预设”持久化修改' : '';
    showToast(`已导入 ${newTexts.length} 条文本${saveHint}`, 'success');
    return newTexts.length;
}

function renderTextList() {
    dom.textList.innerHTML = '';

    // Update count display if element exists
    if (dom.totalCount) {
        dom.totalCount.textContent = state.texts.length;
    }

    if (state.texts.length === 0) {
        dom.textList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>暂无文本，请在上方输入或使用AI生成</p>
            </div>`;
        refreshPresetDirtyState();
        return;
    }

    state.texts.forEach((item, index) => {
        const canMoveUp = index > 0;
        const canMoveDown = index < state.texts.length - 1;

        const card = document.createElement('div');
        card.className = 'text-card';
        card.dataset.index = String(index);
        // Add unique ID for scrolling
        card.id = `text-card-${index}`;

        card.innerHTML = `
            <div class="drag-handle" draggable="true" data-index="${index}" title="拖拽排序" aria-label="拖拽排序" role="button">
                <svg class="drag-handle-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="9" cy="6" r="1.6"></circle>
                    <circle cx="15" cy="6" r="1.6"></circle>
                    <circle cx="9" cy="12" r="1.6"></circle>
                    <circle cx="15" cy="12" r="1.6"></circle>
                    <circle cx="9" cy="18" r="1.6"></circle>
                    <circle cx="15" cy="18" r="1.6"></circle>
                </svg>
            </div>
            <div class="badge badge-${item.type}">/${item.type}</div>
            <div class="text-content" title="${item.content}">${item.content}</div>
            <div class="card-actions">
                <button class="btn btn-sm btn-ghost" onclick="moveTextUp(${index})" title="上移" ${canMoveUp ? '' : 'disabled'}>
                    <span class="icon">↑</span>
                </button>
                <button class="btn btn-sm btn-ghost" onclick="moveTextDown(${index})" title="下移" ${canMoveDown ? '' : 'disabled'}>
                    <span class="icon">↓</span>
                </button>
                <button class="btn btn-sm btn-secondary" onclick="sendSingle(${index})">
                    <span class="icon">🚀</span>
                </button>
                <button class="btn btn-sm btn-ghost" onclick="openSingleRewrite(${index})" title="AI重写">
                    <span class="icon">✨</span>
                </button>
                <button class="btn btn-sm btn-ghost" onclick="editText(${index})" title="编辑">
                    <span class="icon">✏️</span>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteText(${index})">
                    <span class="icon">✕</span>
                </button>
            </div>
        `;

        card.addEventListener('dragover', handleTextDragOver);
        card.addEventListener('drop', handleTextDrop);

        const dragHandle = card.querySelector('.drag-handle');
        if (dragHandle) {
            dragHandle.addEventListener('dragstart', handleTextDragStart);
            dragHandle.addEventListener('dragend', handleTextDragEnd);
        }

        dom.textList.appendChild(card);
    });

    refreshPresetDirtyState();
}

window.deleteText = (index) => {
    state.texts.splice(index, 1);
    renderTextList();
};

window.moveTextUp = (index) => {
    if (index <= 0 || index >= state.texts.length) return;
    if (!moveTextItem(index, index - 1)) return;
    renderTextList();
};

window.moveTextDown = (index) => {
    if (index < 0 || index >= state.texts.length - 1) return;
    if (!moveTextItem(index, index + 1)) return;
    renderTextList();
};

function getTextCardFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('.text-card');
}

function getTextCardIndex(card) {
    if (!card) return -1;
    const rawIndex = card.dataset?.index;
    const index = Number.parseInt(rawIndex || '', 10);
    return Number.isNaN(index) ? -1 : index;
}

function clearTextDragOverClasses() {
    dom.textList.querySelectorAll('.text-card.drag-over-top, .text-card.drag-over-bottom').forEach((el) => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });
}

function clearTextDragState() {
    state.draggingTextIndex = null;
    state.dragOverTextIndex = null;
    state.dragInsertMode = null;

    dom.textList.querySelectorAll('.text-card.dragging').forEach((el) => {
        el.classList.remove('dragging');
    });
    clearTextDragOverClasses();
}

function moveTextItem(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= state.texts.length) return false;
    if (toIndex < 0 || toIndex > state.texts.length) return false;
    if (fromIndex === toIndex) return false;

    const [item] = state.texts.splice(fromIndex, 1);
    if (!item) return false;

    state.texts.splice(toIndex, 0, item);
    return true;
}

function calculateDragInsertIndex(sourceIndex, targetIndex, insertMode) {
    if (insertMode === 'after') {
        return sourceIndex < targetIndex ? targetIndex : targetIndex + 1;
    }

    return sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

function handleTextDragStart(event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.drag-handle')) {
        event.preventDefault();
        return;
    }

    const card = getTextCardFromEventTarget(target);
    if (!card) return;

    const index = getTextCardIndex(card);
    if (index < 0 || index >= state.texts.length) return;

    state.draggingTextIndex = index;
    state.dragOverTextIndex = null;
    state.dragInsertMode = null;
    card.classList.add('dragging');

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.dropEffect = 'move';
        event.dataTransfer.setData('text/plain', String(index));
    }
}

function handleTextDragOver(event) {
    if (state.draggingTextIndex === null || state.draggingTextIndex === undefined) return;

    const card = getTextCardFromEventTarget(event.target);
    if (!card) return;

    const targetIndex = getTextCardIndex(card);
    if (targetIndex < 0 || targetIndex >= state.texts.length) return;

    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }

    if (targetIndex === state.draggingTextIndex) {
        clearTextDragOverClasses();
        state.dragOverTextIndex = null;
        state.dragInsertMode = null;
        return;
    }

    const rect = card.getBoundingClientRect();
    const insertMode = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (state.dragOverTextIndex === targetIndex && state.dragInsertMode === insertMode) {
        return;
    }

    clearTextDragOverClasses();
    card.classList.add(insertMode === 'before' ? 'drag-over-top' : 'drag-over-bottom');
    state.dragOverTextIndex = targetIndex;
    state.dragInsertMode = insertMode;
}

function handleTextDrop(event) {
    const sourceIndex = state.draggingTextIndex;
    if (sourceIndex === null || sourceIndex === undefined) {
        clearTextDragState();
        return;
    }

    event.preventDefault();

    const card = getTextCardFromEventTarget(event.target);
    const targetIndex = getTextCardIndex(card);
    if (targetIndex < 0 || targetIndex >= state.texts.length || targetIndex === sourceIndex) {
        clearTextDragState();
        return;
    }

    const insertMode = state.dragInsertMode === 'after' ? 'after' : 'before';
    const insertIndex = calculateDragInsertIndex(sourceIndex, targetIndex, insertMode);
    if (!moveTextItem(sourceIndex, insertIndex)) {
        clearTextDragState();
        return;
    }

    clearTextDragState();
    renderTextList();
}

function handleTextDragEnd() {
    clearTextDragState();
}

function openAddTextItemModal() {
    state.editingTextIndex = null;
    if (dom.editTextModalTitle) {
        dom.editTextModalTitle.textContent = '新增项目';
    }
    dom.editTextType.value = 'me';
    dom.editTextContent.value = '';
    openModal('modal-edit-text');
    dom.editTextContent.focus();
}

window.editText = (index) => {
    const item = state.texts[index];
    if (!item) return;

    state.editingTextIndex = index;
    if (dom.editTextModalTitle) {
        dom.editTextModalTitle.textContent = '编辑项目';
    }
    dom.editTextType.value = item.type;
    dom.editTextContent.value = item.content;
    openModal('modal-edit-text');
    dom.editTextContent.focus();
};

window.openSingleRewrite = (index) => {
    const item = state.texts[index];
    if (!item) {
        showToast('文本不存在，请刷新后重试', 'error');
        return;
    }
    state.aiRewriteTarget = { scope: 'single', index };
    dom.aiRewriteTitle.textContent = 'AI重写单条文本';
    dom.aiRewriteDesc.textContent = `目标：/${item.type} ${item.content}`;
    dom.aiRewriteProvider.value = dom.aiProvider.value || '';
    openModal('modal-ai-rewrite');
};

function confirmEditTextUpdate() {
    const index = state.editingTextIndex;

    const content = (dom.editTextContent.value || '').trim();
    if (!content) {
        showToast('文本内容不能为空', 'error');
        return;
    }

    const type = dom.editTextType.value === 'do' ? 'do' : 'me';

    if (index === null || index === undefined) {
        state.texts.push({ type, content });
        renderTextList();
        closeModal();
        showToast('项目已新增', 'success');
        return;
    }

    const item = state.texts[index];
    if (!item) {
        closeModal();
        return;
    }

    state.texts[index] = { type, content };
    renderTextList();
    closeModal();
    showToast('项目已更新', 'success');
}

async function sendTextNow(text, successMessage = '发送成功') {
    const source = isQuickPanelMode() ? 'quick_panel' : 'webui';
    try {
        const res = await apiFetch('/api/v1/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, source })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            const detail = data.error || formatApiErrorDetail(data.detail, res.status);
            showToast('发送失败: ' + detail, 'error');
            return false;
        }

        showToast(successMessage, 'success');
        return true;
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('发送错误', 'error');
        }
        return false;
    }
}

window.sendSingle = async (index) => {
    const item = state.texts[index];
    if (!item) return;
    const textToSend = `/${item.type} ${item.content}`;
    await sendTextNow(textToSend, '发送成功');
};

async function startBatchSend() {
    if (state.texts.length === 0) return showToast('列表为空', 'error');
    if (state.isSending) return;

    state.isSending = true;
    dom.sendAllBtn.disabled = true;
    dom.progressArea.classList.remove('hidden');
    dom.sendDelay.disabled = true;

    // Convert state texts to raw strings
    const textsToSend = state.texts.map(t => `/${t.type} ${t.content}`);
    const delay = parseInt(dom.sendDelay.value) || 1800;
    const source = isQuickPanelMode() ? 'quick_panel' : 'webui';

    try {
        const response = await apiFetch('/api/v1/send/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texts: textsToSend,
                delay_between: delay,
                source
            })
        });

        if (!response.ok) {
            const errPayload = await response.json().catch(() => ({}));
            throw new Error(formatApiErrorDetail(errPayload.detail, response.status));
        }

        if (!response.body) {
            throw new Error('当前浏览器不支持流式发送响应');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let terminalReceived = false;

        const processEventBlock = (block) => {
            const dataLines = block
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart());

            if (dataLines.length === 0) return;

            const payload = dataLines.join('\n');
            if (!payload || payload === '[DONE]') return;

            try {
                const event = JSON.parse(payload);
                if (updateProgress(event)) {
                    terminalReceived = true;
                }
            } catch (e) {
                console.error('SSE Parse Error', e, payload);
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const blocks = sseBuffer.split('\n\n');
            sseBuffer = blocks.pop() || '';

            for (const block of blocks) {
                processEventBlock(block);
            }
        }

        sseBuffer += decoder.decode();
        if (sseBuffer.trim()) {
            processEventBlock(sseBuffer);
        }

        if (!terminalReceived && state.isSending) {
            showToast('发送流提前结束，请检查 FiveM 前台焦点后重试', 'error');
            resetSendState();
        }
    } catch (e) {
        showToast('批量发送异常: ' + e.message, 'error');
        resetSendState();
    }
}

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function ensureSendCardVisible(card, options = {}) {
    if (!(card instanceof HTMLElement)) return;

    const force = Boolean(options.force);
    const rect = card.getBoundingClientRect();
    const topBoundary = 56;
    const bottomBoundary = window.innerHeight - 96;
    const outsideViewport = rect.top < topBoundary || rect.bottom > bottomBoundary;

    if (!outsideViewport && !force) return;

    card.scrollIntoView({
        behavior: isMobileViewport() ? 'auto' : 'smooth',
        block: isMobileViewport() ? 'nearest' : 'center'
    });
}

function updateProgress(event) {
    // event: {status: "sending"|"completed"|"cancelled", index, total, text}
    if (event.status === 'sending') {
        const pct = ((event.index + 1) / event.total) * 100;
        dom.progressBar.style.width = `${pct}%`;
        dom.progressText.textContent = `正在发送 ${event.index + 1}/${event.total}...`;

        // Highlight current in list
        const cards = dom.textList.children;
        if (cards[event.index]) {
            cards[event.index].style.borderColor = 'var(--accent-cyan)';
            ensureSendCardVisible(cards[event.index], { force: !isMobileViewport() });
        }
        return false;
    } else if (event.status === 'line_result') {
        const cards = dom.textList.children;
        if (cards[event.index]) {
            cards[event.index].style.borderColor = event.success ? 'var(--accent-success)' : 'var(--accent-danger)';
        }

        if (!event.success) {
            const msg = event.error || '未知错误';
            showToast(`第 ${event.index + 1} 条发送失败: ${msg}`, 'error');
        }
        return false;
    } else if (event.status === 'completed') {
        if (event.failed && event.failed > 0) {
            showToast(`发送完成，成功 ${event.success || 0} 条，失败 ${event.failed} 条`, 'error');
        } else {
            showToast('全部发送完成', 'success');
        }
        resetSendState();
        return true;
    } else if (event.status === 'cancelled') {
        showToast('已取消发送', 'error');
        resetSendState();
        return true;
    } else if (event.status === 'error') {
        showToast('批量发送失败: ' + (event.error || '未知错误'), 'error');
        resetSendState();
        return true;
    }

    return false;
}

async function cancelBatchSend() {
    await apiFetch('/api/v1/send/stop', { method: 'POST' });
}

function resetSendState() {
    state.isSending = false;
    dom.sendAllBtn.disabled = false;
    dom.progressArea.classList.add('hidden');
    dom.sendDelay.disabled = false;
    dom.progressBar.style.width = '0%';

    // Reset list styles
    Array.from(dom.textList.children).forEach((c) => {
        c.style.borderColor = '';
    });
}

// --- AI Panel Logic ---
function initAIPanel() {
    dom.aiGenerateBtn.addEventListener('click', generateAI);
    dom.aiImportBtn.addEventListener('click', () => {
        if (!Array.isArray(state.aiPreview) || state.aiPreview.length === 0) {
            showToast('暂无可导入内容，请先生成有效文本', 'error');
            return;
        }

        state.texts = [...state.texts, ...state.aiPreview];
        renderTextList(); // update main list
        const saveHint = state.currentPresetId ? '，可点击“保存到当前预设”持久化修改' : '';
        showToast(`已导入到发送列表${saveHint}`, 'success');
        // Switch back to send panel
        document.querySelector('[data-target="panel-send"]').click();
    });
}

function initAIRewriteModal() {
    if (!dom.confirmAIRewrite) return;
    dom.confirmAIRewrite.addEventListener('click', submitAIRewrite);
}

function initAIComparisonModal() {
    if (!dom.modalAIComparison) return;
    if (dom.applyRewriteBtn) dom.applyRewriteBtn.addEventListener('click', applyRewrite);
    if (dom.cancelRewriteBtn) dom.cancelRewriteBtn.addEventListener('click', cancelRewrite);
}

function resetApplyRewriteButtonState() {
    if (!dom.applyRewriteBtn) return;
    dom.applyRewriteBtn.disabled = false;
    dom.applyRewriteBtn.textContent = APPLY_REWRITE_IDLE_TEXT;
}

function renderComparison(data) {
    if (!dom.comparisonList) return;
    dom.comparisonList.innerHTML = '';

    if (!data || !data.original || !data.rewritten) return;

    const count = Math.min(data.original.length, data.rewritten.length);
    for (let i = 0; i < count; i++) {
        const orig = data.original[i];
        const rew = data.rewritten[i];

        const div = document.createElement('div');
        div.className = 'comparison-item';
        div.innerHTML = `
            <div class="comparison-row">
                <span class="comparison-label">原文</span>
                <span class="badge badge-${orig.type}">/${orig.type}</span>
                <span class="comparison-content original">${orig.content}</span>
            </div>
            <div class="comparison-arrow">↓</div>
            <div class="comparison-row">
                <span class="comparison-label">重写后</span>
                <span class="badge badge-${rew.type}">/${rew.type}</span>
                <span class="comparison-content new">${rew.content}</span>
            </div>
        `;
        dom.comparisonList.appendChild(div);
    }
}

function cancelRewrite() {
    state.pendingRewrite = null;
    closeModal();
    showToast('已保留原文', 'info');
}

async function applyRewrite() {
    const pending = state.pendingRewrite;
    if (!pending || !pending.rewritten) {
        closeModal();
        return;
    }

    const { target, rewritten } = pending;

    if (dom.applyRewriteBtn) {
        dom.applyRewriteBtn.disabled = true;
        dom.applyRewriteBtn.textContent = '应用中...';
    }

    try {
        if (target.scope === 'single') {
            const current = state.texts[target.index];
            if (!current) {
                showToast('应用失败：目标文本已不存在，请重试', 'error');
                return;
            }

            state.texts[target.index] = rewritten[0];
            renderTextList();
            showToast('单条文本已重写', 'success');
        } else if (target.scope === 'preset') {
            const presetId = target.presetId;
            if (!presetId) {
                showToast('应用失败：预设ID缺失', 'error');
                return;
            }

            // Update via API
            const saveRes = await apiFetch(`/api/v1/presets/${presetId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: rewritten })
            });

            if (!saveRes.ok) {
                const savePayload = await saveRes.json().catch(() => ({}));
                throw new Error(formatApiErrorDetail(savePayload.detail, saveRes.status));
            }

            // If current preset is active, update local state
            if (state.currentPresetId === presetId) {
                state.texts = [...rewritten];
                capturePresetSnapshotFromCurrent();
                renderTextList();
            }

            await fetchPresets();
            showToast('预设已重写并保存', 'success');
        }
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('应用更改失败: ' + e.message, 'error');
        }
        // Don't close modal on error, let user retry or cancel
        return;
    } finally {
        resetApplyRewriteButtonState();
    }

    state.pendingRewrite = null;
    closeModal();
}

async function generateAI() {
    const scenario = dom.aiScenario.value.trim();
    if (!scenario) return showToast('请输入场景描述', 'error');

    const style = (dom.aiStyle?.value || '').trim();
    const providerId = dom.aiProvider.value;
    const type = document.querySelector('input[name="ai-type"]:checked').value;
    const count = parseInt(dom.aiCount.value) || 5;

    dom.aiGenerateBtn.disabled = true;
    dom.aiGenerateBtn.innerHTML = '<span class="loading-spinner"></span> 生成中...';
    dom.aiPreviewList.innerHTML = '';
    state.aiPreview = [];
    dom.aiImportBtn.disabled = true;

    try {
        const res = await apiFetch('/api/v1/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scenario,
                provider_id: providerId,
                count,
                text_type: type,
                style: style || null
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const detailed = formatApiErrorDetail(data.detail, res.status);
            console.error('AI generate failed', { status: res.status, detail: data.detail });
            showToast('生成失败: ' + detailed, 'error');
            return;
        }

        const generatedTexts = Array.isArray(data.texts) ? data.texts : [];
        const normalizedTexts = generatedTexts
            .filter((item) => item && (item.type === 'me' || item.type === 'do') && typeof item.content === 'string')
            .map((item) => ({ type: item.type, content: item.content.trim() }))
            .filter((item) => item.content.length > 0);

        if (normalizedTexts.length === 0) {
            renderAIPreview();
            showToast('生成失败: 未返回可用文本，请调整场景或服务商重试', 'error');
            return;
        }

        state.aiPreview = normalizedTexts;
        renderAIPreview();
        dom.aiImportBtn.disabled = false;

    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('AI生成错误: ' + e.message, 'error');
        }
    } finally {
        dom.aiGenerateBtn.disabled = false;
        dom.aiGenerateBtn.innerHTML = '<span class="icon">✨</span> 开始生成';
    }
}

function renderAIPreview() {
    dom.aiPreviewList.innerHTML = '';

    if (!Array.isArray(state.aiPreview) || state.aiPreview.length === 0) {
        dom.aiPreviewList.innerHTML = `
            <div class="empty-state small">
                <p>暂无可预览内容，请重新生成</p>
            </div>`;
        return;
    }

    state.aiPreview.forEach(item => {
        const card = document.createElement('div');
        card.className = 'text-card';
        card.innerHTML = `
            <div class="badge badge-${item.type}">/${item.type}</div>
            <div class="text-content">${item.content}</div>
        `;
        dom.aiPreviewList.appendChild(card);
    });
}

// --- Presets Panel Logic ---
function initPresetsPanel() {
    dom.refreshPresetsBtn.addEventListener('click', fetchPresets);
}

async function fetchPresets() {
    dom.presetsGrid.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await apiFetch('/api/v1/presets');
        const data = await res.json();
        state.presets = Array.isArray(data) ? data : [];
        renderPresets(state.presets);
        renderQuickPresetSwitcher();
        renderQuickSendPresetSwitcher();
        return true;
    } catch (e) {
        state.presets = [];
        renderQuickPresetSwitcher();
        renderQuickSendPresetSwitcher();
        showToast('加载预设失败', 'error');
        dom.presetsGrid.innerHTML = '';
        return false;
    }
}

function renderPresets(presets) {
    dom.presetsGrid.innerHTML = '';
    if (presets.length === 0) {
        dom.presetsGrid.innerHTML = `
            <div class="empty-state small">
                <p>暂无预设，先在发送页保存一个吧</p>
            </div>`;
        return;
    }

    presets.forEach(p => {
        const el = document.createElement('div');
        el.className = 'preset-card glass-card';
        el.innerHTML = `
            <div class="preset-name">${p.name}</div>
            <div class="preset-meta">
                <span>${p.texts.length} 条文本</span>
                <span>${new Date(p.created_at).toLocaleDateString()}</span>
            </div>
            <div class="preset-card-actions">
                <button class="rewrite-preset btn btn-sm btn-ghost" data-id="${p.id}" type="button" title="AI重写整套预设">
                    ✨ 重写
                </button>
            </div>
            <button class="delete-preset" data-id="${p.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;

        // Add click listener for loading
        el.addEventListener('click', (e) => {
            // Prevent if delete button was clicked
            if (e.target.closest('.delete-preset') || e.target.closest('.rewrite-preset')) return;
            loadPreset(p);
        });

        const rewriteBtn = el.querySelector('.rewrite-preset');
        rewriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.openPresetRewrite(p.id);
        });

        // Add delete listener
        const deleteBtn = el.querySelector('.delete-preset');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.deletePreset(p.id, e);
        });

        dom.presetsGrid.appendChild(el);
    });
}

function renderQuickPresetSwitcher() {
    if (!dom.quickPresetSelect) return;

    dom.quickPresetSelect.innerHTML = '';

    if (state.presets.length === 0) {
        clearCurrentPresetSelection();
        dom.quickPresetSelect.disabled = true;
        dom.quickPresetSelect.innerHTML = '<option value="">暂无预设</option>';
        return;
    }

    dom.quickPresetSelect.disabled = false;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '快速切换预设...';
    dom.quickPresetSelect.appendChild(placeholder);

    state.presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = `${preset.name} (${preset.texts.length}条)`;
        dom.quickPresetSelect.appendChild(option);
    });

    if (state.currentPresetId && state.presets.some((preset) => preset.id === state.currentPresetId)) {
        dom.quickPresetSelect.value = state.currentPresetId;
    } else {
        clearCurrentPresetSelection();
    }
}

function renderQuickSendPresetSwitcher() {
    if (!dom.quickSendPresetSelect) return;

    dom.quickSendPresetSelect.innerHTML = '';

    if (state.presets.length === 0) {
        state.currentQuickPresetId = null;
        dom.quickSendPresetSelect.disabled = true;
        dom.quickSendPresetSelect.innerHTML = '<option value="">暂无预设</option>';
        renderQuickSendList();
        return;
    }

    dom.quickSendPresetSelect.disabled = false;

    state.presets.forEach((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = `${preset.name} (${preset.texts.length}条)`;
        dom.quickSendPresetSelect.appendChild(option);
    });

    if (!state.currentQuickPresetId || !state.presets.some((preset) => preset.id === state.currentQuickPresetId)) {
        state.currentQuickPresetId = state.presets[0].id;
    }

    dom.quickSendPresetSelect.value = state.currentQuickPresetId;
    renderQuickSendList();
}

function renderQuickSendList() {
    if (!dom.quickSendList) return;

    const preset = state.presets.find((item) => item.id === state.currentQuickPresetId);

    dom.quickSendList.innerHTML = '';

    if (!preset || !Array.isArray(preset.texts) || preset.texts.length === 0) {
        dom.quickSendList.innerHTML = `
            <div class="empty-state small">
                <p>当前预设暂无可发送文本</p>
            </div>`;
        return;
    }

    preset.texts.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quick-send-item';

        const badge = document.createElement('span');
        badge.className = `badge badge-${item.type}`;
        badge.textContent = `/${item.type}`;

        const content = document.createElement('span');
        content.className = 'quick-send-content';
        content.textContent = item.content;

        const action = document.createElement('span');
        action.className = 'quick-send-action';
        action.textContent = '发送';

        button.appendChild(badge);
        button.appendChild(content);
        button.appendChild(action);

        button.addEventListener('click', async () => {
            const textToSend = `/${item.type} ${item.content}`;
            button.disabled = true;
            const successMessage = isQuickPanelMode() ? '快捷面板发送成功' : '快速发送成功';
            const sent = await sendTextNow(textToSend, successMessage);
            if (sent) {
                button.classList.add('sent');
                setTimeout(() => button.classList.remove('sent'), 320);
            }
            button.disabled = false;
        });

        dom.quickSendList.appendChild(button);
    });
}

function loadPresetById(presetId, options = {}) {
    const preset = state.presets.find((item) => item.id === presetId);
    if (!preset) {
        showToast('预设不存在，请刷新后重试', 'error');
        clearCurrentPresetSelection();
        return false;
    }
    return loadPreset(preset, options);
}

function loadPreset(preset, options = {}) {
    const { jumpToSend = true, skipUnsavedConfirm = false } = options;

    if (
        !skipUnsavedConfirm
        && hasPresetUnsavedChanges()
        && preset.id !== state.currentPresetId
    ) {
        const shouldSwitch = confirm('当前预设有未保存修改，切换后将丢失这些修改。是否继续切换？');
        if (!shouldSwitch) return false;
    }

    state.texts = [...preset.texts]; // Clone
    state.currentPresetId = preset.id;
    capturePresetSnapshotFromCurrent();
    updatePresetSaveButtonState();
    renderQuickPresetSwitcher();
    renderTextList();
    showToast(`已加载预设 "${preset.name}"`, 'success');
    if (jumpToSend) {
        document.querySelector('[data-target="panel-send"]').click();
    }

    return true;
}

window.openPresetRewrite = (presetId) => {
    const preset = state.presets.find((item) => item.id === presetId);
    if (!preset) {
        showToast('预设不存在，请刷新后重试', 'error');
        return;
    }
    if (!Array.isArray(preset.texts) || preset.texts.length === 0) {
        showToast('该预设暂无可重写内容', 'error');
        return;
    }

    state.aiRewriteTarget = { scope: 'preset', presetId };
    dom.aiRewriteTitle.textContent = 'AI重写整套预设';
    dom.aiRewriteDesc.textContent = `目标：${preset.name}（${preset.texts.length} 条）`;
    dom.aiRewriteProvider.value = dom.aiProvider.value || '';
    openModal('modal-ai-rewrite');
};

async function submitAIRewrite() {
    const target = state.aiRewriteTarget;
    if (!target) {
        closeModal();
        return;
    }

    const style = (dom.aiRewriteStyle?.value || '').trim();
    const requirements = (dom.aiRewriteRequirements?.value || '').trim();
    const providerId = dom.aiRewriteProvider?.value || dom.aiProvider.value || '';

    let sourceTexts = [];
    let presetId = null;

    if (target.scope === 'single') {
        const item = state.texts[target.index];
        if (!item) {
            showToast('目标文本不存在，请重试', 'error');
            return;
        }
        sourceTexts = [item];
    } else if (target.scope === 'preset') {
        presetId = target.presetId;
        const preset = state.presets.find((item) => item.id === presetId);
        if (!preset || !Array.isArray(preset.texts) || preset.texts.length === 0) {
            showToast('目标预设不存在或为空', 'error');
            return;
        }
        sourceTexts = preset.texts;
    } else {
        showToast('未知重写目标', 'error');
        return;
    }

    const normalizedSourceTexts = sourceTexts
        .map((item) => {
            if (!item || (item.type !== 'me' && item.type !== 'do') || typeof item.content !== 'string') {
                return null;
            }
            const content = item.content.trim();
            if (!content) return null;
            return { type: item.type, content };
        })
        .filter((item) => item !== null);

    if (normalizedSourceTexts.length !== sourceTexts.length) {
        showToast('目标文本格式异常，请先修正后再重写', 'error');
        return;
    }

    dom.confirmAIRewrite.disabled = true;
    dom.confirmAIRewrite.textContent = '重写中...';

    try {
        const rewriteRes = await apiFetch('/api/v1/ai/rewrite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texts: normalizedSourceTexts,
                provider_id: providerId || null,
                style: style || null,
                requirements: requirements || null
            })
        });
        const rewritePayload = await rewriteRes.json().catch(() => ({}));
        if (!rewriteRes.ok) {
            showToast('重写失败: ' + formatApiErrorDetail(rewritePayload.detail, rewriteRes.status), 'error');
            return;
        }

        const rewritten = (Array.isArray(rewritePayload.texts) ? rewritePayload.texts : [])
            .map((item) => {
                if (!item || (item.type !== 'me' && item.type !== 'do') || typeof item.content !== 'string') {
                    return null;
                }
                const content = item.content.trim();
                if (!content) return null;
                return { type: item.type, content };
            })
            .filter((item) => item !== null);

        if (rewritten.length !== normalizedSourceTexts.length) {
            showToast('重写失败: 返回条数异常', 'error');
            return;
        }

        if (target.scope === 'preset' && !presetId) {
            showToast('重写失败: 预设ID缺失', 'error');
            return;
        }

        closeModal();

        state.pendingRewrite = {
            target: target.scope === 'single'
                ? { scope: 'single', index: target.index }
                : { scope: 'preset', presetId },
            original: normalizedSourceTexts.map((item) => ({ ...item })),
            rewritten
        };
        renderComparison(state.pendingRewrite);
        openModal('modal-ai-comparison');
        showToast('重写已生成，请确认后再应用', 'info');
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('重写失败: ' + e.message, 'error');
        }
    } finally {
        dom.confirmAIRewrite.disabled = false;
        dom.confirmAIRewrite.textContent = '开始重写';
    }
}

async function saveCurrentAsPreset() {
    const name = dom.presetNameInput.value.trim();
    if (!name) return showToast('请输入名称', 'error');
    if (state.texts.length === 0) return showToast('列表为空', 'error');

    try {
        const res = await apiFetch('/api/v1/presets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                texts: state.texts
            })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
            if (payload.id) {
                state.currentPresetId = payload.id;
                updatePresetSaveButtonState();
            }
            capturePresetSnapshotFromCurrent();
            showToast('保存成功', 'success');
            closeModal();
            await fetchPresets(); // Refresh list
            return;
        }

        showToast('保存失败: ' + formatApiErrorDetail(payload.detail, res.status), 'error');
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('保存失败: ' + e.message, 'error');
        }
    }
}

async function saveToCurrentPreset() {
    if (!state.currentPresetId) {
        showToast('当前文本未关联已保存预设，无法覆盖保存', 'error');
        return;
    }

    if (state.texts.length === 0) {
        showToast('列表为空', 'error');
        return;
    }

    try {
        const res = await apiFetch(`/api/v1/presets/${state.currentPresetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texts: state.texts
            })
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast('保存失败: ' + formatApiErrorDetail(payload.detail, res.status), 'error');
            return;
        }

        capturePresetSnapshotFromCurrent();
        showToast('已保存到当前预设', 'success');
        await fetchPresets();
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('保存失败: ' + e.message, 'error');
        }
    }
}

window.deletePreset = async (id, event) => {
    event.stopPropagation();
    if (!confirm('确定删除此预设吗？')) return;

    try {
        await apiFetch(`/api/v1/presets/${id}`, { method: 'DELETE' });
        if (state.currentPresetId === id) {
            clearCurrentPresetSelection();
        }
        showToast('已删除', 'success');
        await fetchPresets();
    } catch (e) {
        showToast('删除失败', 'error');
    }
};

// --- Settings Logic ---
const HOTKEY_MODE_SINGLE = 'single';
const HOTKEY_MODE_COMBO = 'combo';
const HOTKEY_MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'win'];
const HOTKEY_MODIFIER_ALIASES = {
    ctrl: 'ctrl',
    control: 'ctrl',
    shift: 'shift',
    alt: 'alt',
    win: 'win',
    meta: 'win',
    super: 'win'
};
const HOTKEY_SPECIAL_KEY_ALIASES = {
    space: 'space',
    enter: 'enter',
    return: 'enter',
    tab: 'tab',
    esc: 'esc',
    escape: 'esc',
    up: 'up',
    arrowup: 'up',
    down: 'down',
    arrowdown: 'down',
    left: 'left',
    arrowleft: 'left',
    right: 'right',
    arrowright: 'right',
    home: 'home',
    end: 'end',
    pageup: 'pageup',
    pagedown: 'pagedown',
    insert: 'insert',
    delete: 'delete'
};

let overlayHotkeyCaptureActive = false;
let overlayHotkeyCaptureHandler = null;

function normalizeOverlayHotkeyToken(token) {
    if (token === ' ') return 'space';

    const lowered = String(token || '').trim().toLowerCase();
    if (!lowered) return '';

    if (HOTKEY_MODIFIER_ALIASES[lowered]) {
        return HOTKEY_MODIFIER_ALIASES[lowered];
    }
    if (HOTKEY_SPECIAL_KEY_ALIASES[lowered]) {
        return HOTKEY_SPECIAL_KEY_ALIASES[lowered];
    }
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lowered)) {
        return lowered;
    }
    if (/^[a-z0-9]$/.test(lowered)) {
        return lowered;
    }

    return '';
}

function normalizeOverlayHotkey(rawHotkey) {
    const raw = String(rawHotkey || '').trim();
    if (!raw) return '';

    const seen = new Set();
    const ordered = [];

    raw.split('+').forEach((chunk) => {
        const token = normalizeOverlayHotkeyToken(chunk);
        if (!token || seen.has(token)) return;
        seen.add(token);
        ordered.push(token);
    });

    const modifiers = HOTKEY_MODIFIER_ORDER.filter((token) => seen.has(token));
    const mains = ordered.filter((token) => !HOTKEY_MODIFIER_ORDER.includes(token));
    return [...modifiers, ...mains].join('+');
}

function inferOverlayHotkeyMode(hotkeyValue) {
    return String(hotkeyValue || '').includes('+') ? HOTKEY_MODE_COMBO : HOTKEY_MODE_SINGLE;
}

function normalizeOverlayMouseSideButton(rawValue) {
    const lowered = String(rawValue || '').trim().toLowerCase();
    if (['x1', 'mouse4', 'side1', 'back'].includes(lowered)) return 'x1';
    if (['x2', 'mouse5', 'side2', 'forward'].includes(lowered)) return 'x2';
    return '';
}

function setOverlayHotkeyCaptureState(active) {
    overlayHotkeyCaptureActive = active;
    if (!dom.settingOverlayCaptureHotkeyBtn) return;

    dom.settingOverlayCaptureHotkeyBtn.textContent = active ? '按键中...' : '点击捕捉';
    dom.settingOverlayCaptureHotkeyBtn.classList.toggle('btn-danger', active);
    dom.settingOverlayCaptureHotkeyBtn.classList.toggle('btn-outline', !active);
    dom.settingOverlayCaptureHotkeyBtn.classList.toggle('is-capturing', active);

    if (dom.settingOverlayHotkeyMode) {
        dom.settingOverlayHotkeyMode.disabled = active;
    }
}

function stopOverlayHotkeyCapture() {
    if (overlayHotkeyCaptureHandler) {
        window.removeEventListener('keydown', overlayHotkeyCaptureHandler, true);
    }
    overlayHotkeyCaptureHandler = null;
    setOverlayHotkeyCaptureState(false);
}

function buildCapturedHotkeyFromEvent(event, mode) {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');
    if (event.metaKey) modifiers.push('win');

    const mainToken = normalizeOverlayHotkeyToken(event.key);
    if (!mainToken || HOTKEY_MODIFIER_ORDER.includes(mainToken)) {
        return '';
    }

    if (mode === HOTKEY_MODE_SINGLE) {
        return mainToken;
    }

    if (modifiers.length === 0) {
        return '';
    }

    return normalizeOverlayHotkey([...modifiers, mainToken].join('+'));
}

function startOverlayHotkeyCapture() {
    if (overlayHotkeyCaptureActive) return;

    const mode = dom.settingOverlayHotkeyMode?.value === HOTKEY_MODE_COMBO
        ? HOTKEY_MODE_COMBO
        : HOTKEY_MODE_SINGLE;

    overlayHotkeyCaptureHandler = (event) => {
        if (!overlayHotkeyCaptureActive) return;

        event.preventDefault();
        event.stopPropagation();

        const captured = buildCapturedHotkeyFromEvent(event, mode);
        if (!captured) return;

        dom.settingOverlayHotkey.value = captured;
        refreshSettingsDirtyState();
        stopOverlayHotkeyCapture();
        showToast(`热键已设置为 ${captured}`, 'success');
    };

    window.addEventListener('keydown', overlayHotkeyCaptureHandler, true);
    setOverlayHotkeyCaptureState(true);
    showToast(
        mode === HOTKEY_MODE_COMBO
            ? '请按下组合键（先按修饰键，再按主键）'
            : '请按下一个主键',
        'info'
    );
}

function validateOverlayHotkeyByMode(hotkeyValue, mode) {
    const normalized = normalizeOverlayHotkey(hotkeyValue);
    if (!normalized) {
        return { ok: false, message: '请先设置悬浮窗热键' };
    }

    const tokens = normalized.split('+').filter(Boolean);
    const hasModifier = tokens.some((token) => HOTKEY_MODIFIER_ORDER.includes(token));
    const hasMainKey = tokens.some((token) => !HOTKEY_MODIFIER_ORDER.includes(token));

    if (mode === HOTKEY_MODE_SINGLE) {
        if (tokens.length !== 1 || !hasMainKey) {
            return { ok: false, message: '单键模式下请设置一个非修饰键（如 f7、t、1）' };
        }
    } else {
        if (!hasModifier || !hasMainKey || tokens.length < 2) {
            return { ok: false, message: '组合键模式下请使用“修饰键 + 主键”（如 ctrl+f7）' };
        }
    }

    return { ok: true, hotkey: normalized };
}

function getSettingsFormSnapshot() {
    return {
        method: dom.settingMethod?.value || '',
        chatOpenKey: dom.settingChatKey?.value || '',
        delayOpenChat: dom.settingDelayOpen?.value || '',
        delayAfterPaste: dom.settingDelayPaste?.value || '',
        delayAfterSend: dom.settingDelaySend?.value || '',
        focusTimeout: dom.settingFocusTimeout?.value || '',
        retryCount: dom.settingRetryCount?.value || '',
        retryInterval: dom.settingRetryInterval?.value || '',
        delayBetweenLines: dom.settingDelayBetweenLines?.value || '',
        typingCharDelay: dom.settingTypingCharDelay?.value || '',
        lanAccess: Boolean(dom.settingLanAccess?.checked),
        enableTrayOnStart: Boolean(dom.settingEnableTrayOnStart?.checked),
        openWebuiOnStart: Boolean(dom.settingOpenWebuiOnStart?.checked),
        showConsoleOnStart: Boolean(dom.settingShowConsoleOnStart?.checked),
        closeAction: dom.settingCloseAction?.value || 'ask',
        overlayEnabled: Boolean(dom.settingOverlayEnabled?.checked),
        overlayShowWebuiStatus: Boolean(dom.settingOverlayShowWebuiStatus?.checked),
        overlayCompactMode: Boolean(dom.settingOverlayCompactMode?.checked),
        overlayHotkeyMode: dom.settingOverlayHotkeyMode?.value || HOTKEY_MODE_SINGLE,
        overlayHotkey: dom.settingOverlayHotkey?.value || '',
        overlayMouseSideButton: dom.settingOverlayMouseSideButton?.value || '',
        overlayPollIntervalMs: dom.settingOverlayPollIntervalMs?.value || '',
        systemPrompt: dom.settingSystemPrompt?.value || '',
        token: dom.settingToken?.value || '',
        defaultProvider: dom.aiProvider?.value || '',
        customHeaders: dom.settingCustomHeaders?.value || ''
    };
}

function setSettingsDirtyState(isDirty) {
    state.settingsDirty = Boolean(isDirty);
    if (dom.settingsUnsavedBar) {
        dom.settingsUnsavedBar.classList.toggle('hidden', !state.settingsDirty);
    }
}

function refreshSettingsDirtyState() {
    if (!state.settingsSnapshot) {
        setSettingsDirtyState(false);
        return;
    }

    const currentSnapshot = JSON.stringify(getSettingsFormSnapshot());
    const baselineSnapshot = JSON.stringify(state.settingsSnapshot);
    setSettingsDirtyState(currentSnapshot !== baselineSnapshot);
}

function setSettingsSaveInProgress(isSaving) {
    state.settingsSaveInProgress = Boolean(isSaving);

    if (dom.saveSettingsBtn) {
        dom.saveSettingsBtn.disabled = state.settingsSaveInProgress;
        dom.saveSettingsBtn.textContent = state.settingsSaveInProgress
            ? '保存中...'
            : SETTINGS_PRIMARY_SAVE_IDLE_TEXT;
    }

    if (dom.settingsUnsavedSaveBtn) {
        dom.settingsUnsavedSaveBtn.disabled = state.settingsSaveInProgress;
        dom.settingsUnsavedSaveBtn.textContent = state.settingsSaveInProgress
            ? '保存中...'
            : SETTINGS_FLOAT_SAVE_IDLE_TEXT;
    }
}

function bindSettingsDirtyTracking() {
    const trackedFields = [
        dom.settingMethod,
        dom.settingChatKey,
        dom.settingDelayOpen,
        dom.settingDelayPaste,
        dom.settingDelaySend,
        dom.settingFocusTimeout,
        dom.settingRetryCount,
        dom.settingRetryInterval,
        dom.settingDelayBetweenLines,
        dom.settingTypingCharDelay,
        dom.settingLanAccess,
        dom.settingEnableTrayOnStart,
        dom.settingOpenWebuiOnStart,
        dom.settingShowConsoleOnStart,
        dom.settingCloseAction,
        dom.settingOverlayEnabled,
        dom.settingOverlayShowWebuiStatus,
        dom.settingOverlayCompactMode,
        dom.settingOverlayHotkeyMode,
        dom.settingOverlayHotkey,
        dom.settingOverlayMouseSideButton,
        dom.settingOverlayPollIntervalMs,
        dom.settingSystemPrompt,
        dom.settingToken,
        dom.aiProvider,
        dom.settingCustomHeaders
    ].filter(Boolean);

    trackedFields.forEach((field) => {
        field.addEventListener('input', refreshSettingsDirtyState);
        field.addEventListener('change', refreshSettingsDirtyState);
    });
}

function initSettingsPanel() {
    dom.saveSettingsBtn.addEventListener('click', saveAllSettings);
    if (dom.settingsUnsavedSaveBtn) {
        dom.settingsUnsavedSaveBtn.addEventListener('click', saveAllSettings);
    }
    bindSettingsDirtyTracking();

    if (dom.settingOverlayCaptureHotkeyBtn) {
        dom.settingOverlayCaptureHotkeyBtn.addEventListener('click', () => {
            if (overlayHotkeyCaptureActive) {
                stopOverlayHotkeyCapture();
                showToast('已取消热键捕捉', 'info');
                return;
            }
            startOverlayHotkeyCapture();
        });
    }

    if (dom.settingOverlayHotkeyMode) {
        dom.settingOverlayHotkeyMode.addEventListener('change', () => {
            const mode = dom.settingOverlayHotkeyMode.value === HOTKEY_MODE_COMBO
                ? HOTKEY_MODE_COMBO
                : HOTKEY_MODE_SINGLE;

            const normalized = normalizeOverlayHotkey(dom.settingOverlayHotkey.value || 'f7') || 'f7';
            if (mode === HOTKEY_MODE_SINGLE && normalized.includes('+')) {
                const mainKey = normalized
                    .split('+')
                    .find((token) => !HOTKEY_MODIFIER_ORDER.includes(token)) || 'f7';
                dom.settingOverlayHotkey.value = mainKey;
            } else {
                dom.settingOverlayHotkey.value = normalized;
            }

            refreshSettingsDirtyState();
        });
    }

    dom.addProviderBtn.addEventListener('click', () => {
        document.getElementById('provider-modal-title').textContent = '添加服务商';
        dom.providerForm.reset();
        document.getElementById('prov-id').value = '';
        clearProviderTestResult();
        openModal('modal-provider');
    });

    // Provider form handlers
    dom.providerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProvider();
    });

    document.getElementById('test-provider-btn').addEventListener('click', async () => {
        const id = document.getElementById('prov-id').value;
        if (!id) {
            showToast('请先保存服务商后再测试', 'info');
            return;
        }
        showToast('正在测试连接...', 'info');
        try {
            const res = await apiFetch(`/api/v1/ai/test/${id}`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            renderProviderTestResult(data, res.status);
            const level = data.success ? 'success' : 'error';
            showToast(data.message || '测试完成', level);
        } catch (e) {
            renderProviderTestResult({ success: false, message: e.message }, null);
            showToast('测试失败: ' + e.message, 'error');
        }
    });

    document.getElementById('reset-prompt-btn').addEventListener('click', () => {
        dom.settingSystemPrompt.value = '';
        refreshSettingsDirtyState();
        showToast('已清空，保存后将使用内置默认提示词', 'info');
    });

    document.getElementById('reset-headers-btn').addEventListener('click', () => {
        const defaults = {
            "User-Agent": "python-httpx/0.28.1",
            "X-Stainless-Lang": "",
            "X-Stainless-Package-Version": "",
            "X-Stainless-OS": "",
            "X-Stainless-Arch": "",
            "X-Stainless-Runtime": "",
            "X-Stainless-Runtime-Version": ""
        };
        dom.settingCustomHeaders.value = JSON.stringify(defaults, null, 2);
        refreshSettingsDirtyState();
        showToast('已恢复默认请求头，请保存设置', 'info');
    });

    document.getElementById('clear-token-btn').addEventListener('click', async () => {
        try {
            await apiFetch('/api/v1/settings/server', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: '' })
            });
            clearToken();
            dom.settingToken.value = '';
            dom.settingToken.placeholder = '留空则不启用认证';
            state.settingsSnapshot = getSettingsFormSnapshot();
            setSettingsDirtyState(false);
            showToast('令牌已清除，认证已关闭', 'success');
        } catch (e) {
            if (e.message !== 'AUTH_REQUIRED') showToast('操作失败', 'error');
        }
    });
}

function renderUpdateCheckResult(data) {
    if (dom.appCurrentVersion) {
        dom.appCurrentVersion.value = data.current_version || dom.appCurrentVersion.value || '-';
    }

    if (dom.appLatestVersion) {
        dom.appLatestVersion.value = data.latest_version || '-';
    }

    const message = data.message || '检查完成';
    const hasUpdate = Boolean(data.success && data.update_available && data.latest_version);
    const latestVersionText = String(data.latest_version || '').trim();
    if (!hasUpdate) {
        state.homeUpdateBannerDismissed = false;
    }
    const shouldShowBanner = hasUpdate && !state.homeUpdateBannerDismissed;
    const updateStatusText = hasUpdate
        ? `发现新版本 v${latestVersionText}`
        : message;

    if (dom.appUpdateStatus) {
        dom.appUpdateStatus.textContent = hasUpdate
            ? `${updateStatusText}。${UPDATE_GUIDE_TEXT}`
            : message;
    }

    if (dom.homeUpdateStatus) {
        dom.homeUpdateStatus.textContent = updateStatusText;
    }

    if (dom.homeUpdateTip) {
        if (hasUpdate) {
            dom.homeUpdateTip.textContent = UPDATE_GUIDE_TEXT;
            dom.homeUpdateTip.classList.remove('hidden');
        } else {
            dom.homeUpdateTip.classList.add('hidden');
            dom.homeUpdateTip.textContent = '';
        }
    }

    if (dom.homeUpdateBanner) {
        dom.homeUpdateBanner.classList.toggle('hidden', !shouldShowBanner);
    }

    if (dom.homeUpdateBannerText) {
        dom.homeUpdateBannerText.textContent = hasUpdate
            ? `发现新版本 v${latestVersionText}，建议尽快更新。`
            : '';
    }

    if (dom.appUpdateReleaseLink) {
        if (data.release_url) {
            dom.appUpdateReleaseLink.href = data.release_url;
            dom.appUpdateReleaseLink.classList.remove('hidden');
        } else {
            dom.appUpdateReleaseLink.classList.add('hidden');
            dom.appUpdateReleaseLink.removeAttribute('href');
        }
    }

    if (dom.homeUpdateReleaseLink) {
        if (data.release_url) {
            dom.homeUpdateReleaseLink.href = data.release_url;
            dom.homeUpdateReleaseLink.classList.remove('hidden');
        } else {
            dom.homeUpdateReleaseLink.classList.add('hidden');
            dom.homeUpdateReleaseLink.removeAttribute('href');
        }
    }

    if (dom.homeUpdateBannerLink) {
        if (shouldShowBanner && data.release_url) {
            dom.homeUpdateBannerLink.href = data.release_url;
            dom.homeUpdateBannerLink.classList.remove('hidden');
        } else {
            dom.homeUpdateBannerLink.classList.add('hidden');
            dom.homeUpdateBannerLink.removeAttribute('href');
        }
    }
}

function renderPublicConfig(data) {
    renderPublicConfigSection(data, {
        card: dom.publicConfigCard,
        title: dom.publicConfigTitle,
        content: dom.publicConfigContent,
        link: dom.publicConfigLink
    });

    renderPublicConfigSection(data, {
        card: dom.homePublicConfigCard,
        title: dom.homePublicConfigTitle,
        content: dom.homePublicConfigContent,
        link: dom.homePublicConfigLink
    });
}

function renderPublicConfigSection(data, refs) {
    const card = refs?.card;
    if (!card) return;

    const contentText = String(data?.content || '').trim();
    const visible = Boolean(data?.visible && contentText);
    card.classList.toggle('hidden', !visible);

    if (!visible) {
        if (refs.title) {
            refs.title.textContent = '远程公告';
        }
        if (refs.content) {
            refs.content.textContent = '';
        }
        if (refs.link) {
            refs.link.classList.add('hidden');
            refs.link.removeAttribute('href');
            refs.link.textContent = '查看详情';
        }
        return;
    }

    const titleText = String(data?.title || '').trim() || '远程公告';
    if (refs.title) {
        refs.title.textContent = titleText;
    }
    if (refs.content) {
        refs.content.textContent = contentText;
    }

    if (refs.link) {
        const linkUrl = String(data?.link_url || '').trim();
        const linkText = String(data?.link_text || '').trim() || '查看详情';
        if (linkUrl) {
            refs.link.href = linkUrl;
            refs.link.textContent = linkText;
            refs.link.classList.remove('hidden');
        } else {
            refs.link.classList.add('hidden');
            refs.link.removeAttribute('href');
            refs.link.textContent = '查看详情';
        }
    }
}

async function fetchPublicConfig(options = {}) {
    const silent = Boolean(options.silent);
    if (!dom.publicConfigCard && !dom.homePublicConfigCard) return;

    try {
        const res = await apiFetch('/api/v1/settings/public-config');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            renderPublicConfig({ visible: false });
            if (!silent) {
                showToast(data?.message || '获取远程公告失败', 'error');
            }
            return;
        }

        renderPublicConfig(data);
    } catch (e) {
        renderPublicConfig({ visible: false });
        if (e.message !== 'AUTH_REQUIRED' && !silent) {
            showToast('获取远程公告失败', 'error');
        }
    }
}

const UPDATE_GUIDE_TEXT = '更新方法：点击“查看发布页”下载最新版，关闭程序后删除旧文件夹后解压新文件夹(或者可尝试直接覆盖)并重新启动程序。';

async function checkGitHubUpdate(options = {}) {
    const silent = Boolean(options.silent);

    if (!dom.checkUpdateBtn && !dom.homeCheckUpdateBtn) return;
    if (state.updateCheckInProgress) {
        if (!silent) {
            showToast('正在检查更新，请稍候', 'info');
        }
        return;
    }

    state.updateCheckInProgress = true;
    const previousLabel = dom.checkUpdateBtn?.textContent || '检查更新';
    const previousHomeLabel = dom.homeCheckUpdateBtn?.textContent || '立即检查';

    if (dom.checkUpdateBtn) {
        dom.checkUpdateBtn.disabled = true;
        if (!silent) {
            dom.checkUpdateBtn.textContent = '检查中...';
        }
    }

    if (dom.homeCheckUpdateBtn) {
        dom.homeCheckUpdateBtn.disabled = true;
        if (!silent) {
            dom.homeCheckUpdateBtn.textContent = '检查中...';
        }
    }

    if (dom.appUpdateStatus) {
        dom.appUpdateStatus.textContent = '正在检查更新...';
    }

    if (dom.homeUpdateStatus) {
        dom.homeUpdateStatus.textContent = '正在检查更新...';
    }

    if (dom.homeUpdateTip) {
        dom.homeUpdateTip.classList.add('hidden');
        dom.homeUpdateTip.textContent = '';
    }

    if (dom.homeUpdateBanner) {
        dom.homeUpdateBanner.classList.add('hidden');
    }

    if (dom.homeUpdateBannerText) {
        dom.homeUpdateBannerText.textContent = '';
    }

    if (dom.homeUpdateBannerLink) {
        dom.homeUpdateBannerLink.classList.add('hidden');
        dom.homeUpdateBannerLink.removeAttribute('href');
    }

    try {
        const res = await apiFetch('/api/v1/settings/update-check');
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const message = data.message || '检查更新失败，请稍后重试';
            renderUpdateCheckResult({
                success: false,
                current_version: data.current_version,
                latest_version: data.latest_version,
                update_available: false,
                release_url: null,
                message
            });
            if (!silent) {
                showToast(message, 'error');
            }
            return;
        }

        renderUpdateCheckResult(data);

        if (!data.success) {
            if (!silent) {
                showToast(data.message || '检查更新失败，请稍后重试', 'error');
            }
            return;
        }

        if (data.update_available) {
            if (!silent) {
                showToast(`发现新版本: ${data.latest_version}。${UPDATE_GUIDE_TEXT}`, 'success');
            }
        } else {
            if (!silent) {
                showToast('当前已是最新版本', 'info');
            }
        }
    } catch (e) {
        if (e.message === 'AUTH_REQUIRED') {
            if (!silent) {
                showToast('请先完成 Token 验证后再检查更新', 'error');
            }
        } else {
            renderUpdateCheckResult({
                success: false,
                current_version: dom.appCurrentVersion?.value || '',
                latest_version: dom.appLatestVersion?.value || '',
                update_available: false,
                release_url: null,
                message: '检查更新失败，请稍后重试'
            });
            if (!silent) {
                showToast('检查更新失败，请稍后重试', 'error');
            }
        }
    } finally {
        state.updateCheckInProgress = false;

        if (dom.checkUpdateBtn) {
            dom.checkUpdateBtn.disabled = false;
            if (!silent) {
                dom.checkUpdateBtn.textContent = previousLabel;
            }
        }

        if (dom.homeCheckUpdateBtn) {
            dom.homeCheckUpdateBtn.disabled = false;
            if (!silent) {
                dom.homeCheckUpdateBtn.textContent = previousHomeLabel;
            }
        }
    }
}

window.checkGitHubUpdate = checkGitHubUpdate;

function pickLanList(server, listKey, singleKey) {
    const fromList = Array.isArray(server?.[listKey])
        ? server[listKey]
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0)
        : [];
    if (fromList.length > 0) {
        return fromList;
    }

    const single = String(server?.[singleKey] || '').trim();
    return single ? [single] : [];
}

async function fetchSettings() {
    const res = await apiFetch('/api/v1/settings');
    const data = await res.json(); // {server, launch, sender, ai, quick_overlay}
    state.settings = data;
    stopOverlayHotkeyCapture();

    // Apply to UI
    dom.settingMethod.value = data.sender.method || 'clipboard';
    dom.settingChatKey.value = data.sender.chat_open_key || 't';
    dom.settingDelayOpen.value = data.sender.delay_open_chat || 450;
    dom.settingDelayPaste.value = data.sender.delay_after_paste || 160;
    dom.settingDelaySend.value = data.sender.delay_after_send || 260;
    dom.settingFocusTimeout.value = data.sender.focus_timeout || 8000;
    dom.settingRetryCount.value = data.sender.retry_count ?? 3;
    dom.settingRetryInterval.value = data.sender.retry_interval || 450;
    dom.settingDelayBetweenLines.value = data.sender.delay_between_lines || 1800;
    dom.settingTypingCharDelay.value = data.sender.typing_char_delay || 18;
    dom.sendDelay.value = data.sender.delay_between_lines || 1800;
    dom.settingLanAccess.checked = data.server.lan_access || false;
    const launch = data.launch || {};
    const traySupported = data.server.system_tray_supported ?? true;
    const enableTrayOnStart = launch.enable_tray_on_start ?? launch.start_minimized_to_tray ?? true;
    if (dom.settingEnableTrayOnStart) {
        dom.settingEnableTrayOnStart.checked = traySupported && enableTrayOnStart;
        dom.settingEnableTrayOnStart.disabled = !traySupported;
    }
    if (dom.settingOpenWebuiOnStart) {
        dom.settingOpenWebuiOnStart.checked = launch.open_webui_on_start ?? false;
    }
    if (dom.settingShowConsoleOnStart) {
        dom.settingShowConsoleOnStart.checked = launch.show_console_on_start ?? false;
    }
    if (dom.settingCloseAction) {
        dom.settingCloseAction.value = ['ask', 'minimize_to_tray', 'exit'].includes(launch.close_action)
            ? launch.close_action
            : 'ask';
        if (!traySupported) {
            dom.settingCloseAction.value = 'exit';
        }
        dom.settingCloseAction.disabled = !traySupported;
    }
    dom.settingSystemPrompt.value = data.ai.system_prompt || '';

    const quickOverlay = data.quick_overlay || {};
    dom.settingOverlayEnabled.checked = quickOverlay.enabled ?? true;
    dom.settingOverlayShowWebuiStatus.checked = quickOverlay.show_webui_send_status ?? true;
    dom.settingOverlayCompactMode.checked = quickOverlay.compact_mode || false;
    const normalizedHotkey = normalizeOverlayHotkey(quickOverlay.trigger_hotkey || 'f7') || 'f7';
    dom.settingOverlayHotkey.value = normalizedHotkey;
    dom.settingOverlayHotkeyMode.value = inferOverlayHotkeyMode(normalizedHotkey);
    dom.settingOverlayMouseSideButton.value = normalizeOverlayMouseSideButton(quickOverlay.mouse_side_button);
    dom.settingOverlayPollIntervalMs.value = quickOverlay.poll_interval_ms || 40;

    // Custom headers
    const customHeaders = data.ai.custom_headers || {};
    dom.settingCustomHeaders.value = Object.keys(customHeaders).length > 0
        ? JSON.stringify(customHeaders, null, 2)
        : '';

    // Token display
    dom.settingToken.value = '';
    dom.settingToken.placeholder = data.server.token_set ? '已设置 (输入新值可更新)' : '留空则不启用认证';

    if (dom.appCurrentVersion) {
        dom.appCurrentVersion.value = data.server.app_version || '-';
    }

    // Update LAN info
    const lanEnabled = Boolean(data.server.lan_access);
    if (dom.lanUrls) {
        dom.lanUrls.classList.toggle('hidden', !lanEnabled);
    }

    if (lanEnabled) {
        const lanPort = Number.parseInt(String(data.server.port || ''), 10) || 8730;
        const lanIpList = pickLanList(data.server, 'lan_ipv4_list', 'lan_ipv4');
        const lanUrlList = pickLanList(data.server, 'lan_urls', 'lan_url');
        const lanDocsUrlListRaw = pickLanList(data.server, 'lan_docs_urls', 'lan_docs_url');

        const lanUrlFallback = `http://<your-ip>:${lanPort}`;
        const displayLanUrlList = lanUrlList.length > 0 ? lanUrlList : [lanUrlFallback];

        const displayLanDocsUrlList = lanDocsUrlListRaw.length > 0
            ? lanDocsUrlListRaw
            : displayLanUrlList.map((url) => `${url}/docs`);

        if (dom.lanIpValue) {
            dom.lanIpValue.textContent = lanIpList.length > 0 ? lanIpList.join(' | ') : '未识别';
        }
        if (dom.lanUrlValue) {
            dom.lanUrlValue.textContent = displayLanUrlList.join(' | ');
        }
        if (dom.lanDocsUrlValue) {
            dom.lanDocsUrlValue.textContent = displayLanDocsUrlList.join(' | ');
        }
    }

    applyDesktopShellState(data.server);
    renderHomePanel(data.server);
    updateLanSecurityRisk(data.server);

    await fetchProviders();

    state.settingsSnapshot = getSettingsFormSnapshot();
    setSettingsDirtyState(false);
}

function updateLanSecurityRisk(serverSettings) {
    const warningEl = document.getElementById('lan-risk-warning');
    if (!warningEl) return;

    const hasRisk = Boolean(
        serverSettings?.risk_no_token_with_lan
        || (serverSettings?.lan_access && !serverSettings?.token_set)
    );

    if (!hasRisk) {
        warningEl.classList.add('hidden');
        warningEl.textContent = '';
        state.lanRiskToastShown = false;
        return;
    }

    warningEl.textContent = serverSettings?.security_warning
        || '已开启局域网访问且未设置 Token，局域网内设备可直接访问 API。';
    warningEl.classList.remove('hidden');

    if (!state.lanRiskToastShown) {
        showToast('安全风险：已开启局域网访问但未设置 Token', 'error');
        state.lanRiskToastShown = true;
    }
}

async function fetchProviders() {
    const res = await apiFetch('/api/v1/settings/providers');
    const providers = await res.json();
    state.settings.providers = providers;

    // Render list in Settings
    dom.providersList.innerHTML = '';
    providers.forEach(p => {
        const row = document.createElement('div');
        row.className = 'provider-row glass-card';
        row.innerHTML = `
            <div>
                <strong>${p.name}</strong>
                <div class="provider-model">${p.model}</div>
            </div>
            <div>
                <button class="btn btn-sm btn-ghost" onclick="editProvider('${p.id}')">✏️</button>
                <button class="btn btn-sm btn-ghost" onclick="deleteProvider('${p.id}')" style="color:var(--accent-danger)">🗑️</button>
            </div>
        `;
        dom.providersList.appendChild(row);
    });

    // Update AI provider dropdowns
    const preferredProviderId = state.settings.ai?.default_provider || '';
    const fillProviderSelect = (selectEl) => {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        if (providers.length === 0) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '暂无服务商';
            selectEl.appendChild(emptyOpt);
            return;
        }
        providers.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            if (preferredProviderId && p.id === preferredProviderId) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    };

    fillProviderSelect(dom.aiProvider);
    fillProviderSelect(dom.aiRewriteProvider);

    if (dom.aiRewriteProvider && dom.aiProvider.value) {
        dom.aiRewriteProvider.value = dom.aiProvider.value;
    }
}

async function saveAllSettings() {
    if (state.settingsSaveInProgress) return;

    stopOverlayHotkeyCapture();

    const overlayMode = dom.settingOverlayHotkeyMode?.value === HOTKEY_MODE_COMBO
        ? HOTKEY_MODE_COMBO
        : HOTKEY_MODE_SINGLE;
    const overlayHotkeyCheck = validateOverlayHotkeyByMode(dom.settingOverlayHotkey.value, overlayMode);
    if (!overlayHotkeyCheck.ok) {
        showToast(overlayHotkeyCheck.message, 'error');
        return;
    }

    let customHeaders;
    try {
        const rawHeaders = dom.settingCustomHeaders.value.trim();
        customHeaders = rawHeaders ? JSON.parse(rawHeaders) : {};
    } catch (parseErr) {
        showToast('自定义请求头 JSON 格式错误，请检查', 'error');
        return;
    }

    setSettingsSaveInProgress(true);

    try {
        // Sender Settings
        const rawChatKey = (dom.settingChatKey.value || '').trim();
        const chatKey = (rawChatKey ? rawChatKey[0] : 't').toLowerCase();

        await apiFetch('/api/v1/settings/sender', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: dom.settingMethod.value,
                chat_open_key: chatKey,
                delay_open_chat: parseInt(dom.settingDelayOpen.value),
                delay_after_paste: parseInt(dom.settingDelayPaste.value),
                delay_after_send: parseInt(dom.settingDelaySend.value),
                focus_timeout: parseInt(dom.settingFocusTimeout.value),
                retry_count: parseInt(dom.settingRetryCount.value),
                retry_interval: parseInt(dom.settingRetryInterval.value),
                delay_between_lines: parseInt(dom.settingDelayBetweenLines.value),
                typing_char_delay: parseInt(dom.settingTypingCharDelay.value)
            })
        });

        // Server Settings
        const serverPayload = { lan_access: dom.settingLanAccess.checked };
        const newToken = dom.settingToken.value.trim();
        if (newToken) serverPayload.token = newToken;
        await apiFetch('/api/v1/settings/server', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverPayload)
        });

        await apiFetch('/api/v1/settings/launch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enable_tray_on_start: Boolean(dom.settingEnableTrayOnStart?.checked),
                open_webui_on_start: Boolean(dom.settingOpenWebuiOnStart?.checked),
                show_console_on_start: Boolean(dom.settingShowConsoleOnStart?.checked),
                close_action: dom.settingCloseAction?.value || 'ask'
            })
        });

        // If token was changed, update localStorage too
        if (newToken) {
            setToken(newToken);
        }

        // Quick Overlay Settings
        const overlayMouseSideButton = normalizeOverlayMouseSideButton(dom.settingOverlayMouseSideButton.value);

        await apiFetch('/api/v1/settings/quick-overlay', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                enabled: dom.settingOverlayEnabled.checked,
                show_webui_send_status: dom.settingOverlayShowWebuiStatus.checked,
                compact_mode: dom.settingOverlayCompactMode.checked,
                trigger_hotkey: overlayHotkeyCheck.hotkey,
                mouse_side_button: overlayMouseSideButton,
                poll_interval_ms: parseInt(dom.settingOverlayPollIntervalMs.value)
            })
        });

        await apiFetch('/api/v1/settings/ai', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                default_provider: dom.aiProvider.value || '',
                system_prompt: dom.settingSystemPrompt.value,
                custom_headers: customHeaders
            })
        });

        showToast('设置已保存', 'success');
        await fetchSettings(); // Reload to reflect changes (e.g. LAN IP)
        await fetchPublicConfig({ silent: true });
    } catch (e) {
        showToast('保存设置失败', 'error');
    } finally {
        setSettingsSaveInProgress(false);
    }
}

async function saveProvider() {
    const id = document.getElementById('prov-id').value;
    const key = document.getElementById('prov-key').value;
    const data = {
        name: document.getElementById('prov-name').value,
        api_base: document.getElementById('prov-base').value,
        model: document.getElementById('prov-model').value,
    };
    if (!id || key) {
        data.api_key = key;
    }

    try {
        let res;
        if (id) {
            res = await apiFetch(`/api/v1/settings/providers/${id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
        } else {
            res = await apiFetch('/api/v1/settings/providers', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
            });
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast('保存服务商失败: ' + formatApiErrorDetail(payload.detail, res.status), 'error');
            return;
        }

        closeModal();
        fetchProviders();
        showToast('服务商已保存', 'success');
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            showToast('保存服务商失败: ' + e.message, 'error');
        }
    }
}

window.editProvider = (id) => {
    const p = state.settings.providers.find(x => x.id === id);
    if (!p) return;

    document.getElementById('provider-modal-title').textContent = '编辑服务商';
    document.getElementById('prov-id').value = p.id;
    document.getElementById('prov-name').value = p.name;
    document.getElementById('prov-base').value = p.api_base;
    document.getElementById('prov-key').value = ''; // Don't show key for security usually, or show if needed
    document.getElementById('prov-model').value = p.model;
    clearProviderTestResult();

    openModal('modal-provider');
};

window.deleteProvider = async (id) => {
    if (!confirm('确定删除此服务商?')) return;
    const res = await apiFetch(`/api/v1/settings/providers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showToast('删除服务商失败: ' + formatApiErrorDetail(payload.detail, res.status), 'error');
        return;
    }
    fetchProviders();
};

// --- Utils ---
function showToast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${msg}</span>`;
    dom.toastContainer.appendChild(el);

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

function getFirstModalFocusableElement(modal) {
    if (!(modal instanceof HTMLElement)) return null;

    return modal.querySelector(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    state.lastModalTrigger = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dom.modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');

    const focusTarget = getFirstModalFocusableElement(modal);
    if (focusTarget instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
            focusTarget.focus({ preventScroll: true });
        });
    }
}

function closeModal() {
    const comparisonVisible = Boolean(dom.modalAIComparison && !dom.modalAIComparison.classList.contains('hidden'));
    if (comparisonVisible && dom.applyRewriteBtn?.disabled) {
        return;
    }

    dom.modalBackdrop.classList.add('hidden');
    document.querySelectorAll('.modal').forEach((m) => {
        m.classList.add('hidden');
    });
    state.editingTextIndex = null;
    state.aiRewriteTarget = null;

    if (comparisonVisible) {
        state.pendingRewrite = null;
        resetApplyRewriteButtonState();
    }

    const trigger = state.lastModalTrigger;
    state.lastModalTrigger = null;
    if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
    }
}

// Close modal triggers
document.querySelectorAll('[data-action="close-modal"]').forEach((b) => {
    b.addEventListener('click', closeModal);
});
dom.modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (dom.modalBackdrop.classList.contains('hidden')) return;
    event.preventDefault();
    closeModal();
});
