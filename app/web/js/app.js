/**
 * VanceSender Frontend Logic
 * Pure Vanilla JS - No Frameworks
 */

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
        clearToken();
        showAuthGate();
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

function showAuthGate() {
    document.getElementById('auth-gate').classList.remove('hidden');
    document.getElementById('auth-token-input').focus();
}

function hideAuthGate() {
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-token-input').value = '';
}

function initAuth() {
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
            errEl.classList.remove('hidden');
            return;
        }
        setToken(token);
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
        sender: {},
        ai: {},
        providers: []
    },
    aiPreview: [],
    presets: [],
    currentPresetId: null,
    currentQuickPresetId: null
};

// --- DOM Elements ---
const dom = {
    navItems: document.querySelectorAll('.nav-item'),
    panels: document.querySelectorAll('.panel'),
    textInput: document.getElementById('main-input'),
    textList: document.getElementById('text-list'),
    totalCount: document.getElementById('total-count'),
    importBtn: document.getElementById('import-btn'),
    clearBtn: document.getElementById('clear-text-btn'),
    sendAllBtn: document.getElementById('send-all-btn'),
    cancelSendBtn: document.getElementById('cancel-send-btn'),
    sendDelay: document.getElementById('send-delay'),
    progressBar: document.getElementById('progress-bar-fill'),
    progressText: document.getElementById('progress-text'),
    progressArea: document.getElementById('send-progress-area'),
    
    // AI
    aiScenario: document.getElementById('ai-scenario'),
    aiCount: document.getElementById('ai-count'),
    aiProvider: document.getElementById('ai-provider-select'),
    aiGenerateBtn: document.getElementById('ai-generate-btn'),
    aiPreviewList: document.getElementById('ai-preview-list'),
    aiImportBtn: document.getElementById('ai-import-btn'),
    
    // Presets
    presetsGrid: document.getElementById('presets-grid'),
    savePresetBtn: document.getElementById('save-preset-btn'),
    refreshPresetsBtn: document.getElementById('refresh-presets-btn'),
    quickPresetSelect: document.getElementById('quick-preset-select'),
    quickPresetRefreshBtn: document.getElementById('quick-preset-refresh-btn'),

    // Quick Send
    quickSendPresetSelect: document.getElementById('quick-send-preset-select'),
    quickSendRefreshBtn: document.getElementById('quick-send-refresh-btn'),
    quickSendList: document.getElementById('quick-send-list'),
    
    // Settings
    settingMethod: document.getElementById('setting-method'),
    settingChatKey: document.getElementById('setting-chat-key'),
    settingDelayOpen: document.getElementById('setting-delay-open'),
    settingDelayPaste: document.getElementById('setting-delay-paste'),
    settingDelaySend: document.getElementById('setting-delay-send'),
    settingFocusTimeout: document.getElementById('setting-focus-timeout'),
    settingRetryCount: document.getElementById('setting-retry-count'),
    settingRetryInterval: document.getElementById('setting-retry-interval'),
    settingTypingCharDelay: document.getElementById('setting-typing-char-delay'),
    settingLanAccess: document.getElementById('setting-lan-access'),
    settingSystemPrompt: document.getElementById('setting-system-prompt'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    providersList: document.getElementById('providers-list'),
    addProviderBtn: document.getElementById('add-provider-btn'),
    
    // Modals
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalSavePreset: document.getElementById('modal-save-preset'),
    modalProvider: document.getElementById('modal-provider'),
    presetNameInput: document.getElementById('preset-name-input'),
    confirmSavePreset: document.getElementById('confirm-save-preset'),
    providerForm: document.getElementById('provider-form'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initSendPanel();
    initQuickSendPanel();
    initAIPanel();
    initPresetsPanel();
    initSettingsPanel();
    initAuth();

    // Auth check — use raw window.fetch to avoid triggering auth gate prematurely
    const token = getToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    try {
        const r = await window.fetch('/api/v1/send/status', { headers });
        if (r.status === 401) {
            showAuthGate();
            return;
        }
    } catch (e) { /* server unreachable — proceed, errors will surface later */ }

    loadInitialData();
});

async function loadInitialData() {
    try {
        await Promise.all([
            fetchSettings(),
            fetchPresets()
        ]);
        showToast('系统已就绪', 'success');
    } catch (e) {
        showToast('初始化失败: ' + e.message, 'error');
    }
}

// --- Navigation ---
function initNavigation() {
    dom.navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update UI
            dom.navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            dom.panels.forEach(p => p.classList.remove('active'));
            const target = document.getElementById(item.dataset.target);
            target.classList.add('active');
        });
    });
}

// --- Send Panel Logic ---
function initSendPanel() {
    dom.importBtn.addEventListener('click', parseAndImportText);
    dom.clearBtn.addEventListener('click', () => {
        state.texts = [];
        clearCurrentPresetSelection();
        dom.textInput.value = '';
        renderTextList();
    });
    
    dom.textInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            parseAndImportText();
        }
    });

    dom.sendAllBtn.addEventListener('click', startBatchSend);
    dom.cancelSendBtn.addEventListener('click', cancelBatchSend);
    dom.savePresetBtn.addEventListener('click', () => openModal('modal-save-preset'));
    dom.confirmSavePreset.addEventListener('click', saveCurrentAsPreset);

    dom.quickPresetSelect.addEventListener('change', (e) => {
        const presetId = e.target.value;
        if (!presetId) return;
        loadPresetById(presetId, { jumpToSend: false });
    });

    dom.quickPresetRefreshBtn.addEventListener('click', async () => {
        const ok = await fetchPresets();
        if (ok) {
            showToast('预设列表已刷新', 'success');
        }
    });
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
    if (dom.quickPresetSelect) {
        dom.quickPresetSelect.value = '';
    }
}

function parseAndImportText() {
    const raw = dom.textInput.value.trim();
    if (!raw) return;

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
    clearCurrentPresetSelection();
    renderTextList();
    dom.textInput.value = ''; // Clear input after import
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
        return;
    }

    state.texts.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'text-card';
        // Add unique ID for scrolling
        card.id = `text-card-${index}`;
        
        card.innerHTML = `
            <div class="badge badge-${item.type}">/${item.type}</div>
            <div class="text-content" title="${item.content}">${item.content}</div>
            <div class="card-actions">
                <button class="btn btn-sm btn-secondary" onclick="sendSingle(${index})">
                    <span class="icon">🚀</span>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteText(${index})">
                    <span class="icon">✕</span>
                </button>
            </div>
        `;
        dom.textList.appendChild(card);
    });
}

window.deleteText = (index) => {
    state.texts.splice(index, 1);
    clearCurrentPresetSelection();
    renderTextList();
};

async function sendTextNow(text, successMessage = '发送成功') {
    try {
        const res = await apiFetch('/api/v1/send', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text })
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
    const delay = parseInt(dom.sendDelay.value) || 1500;

    try {
        const response = await apiFetch('/api/v1/send/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                texts: textsToSend,
                delay_between: delay
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
            cards[event.index].scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    Array.from(dom.textList.children).forEach(c => c.style.borderColor = '');
}

// --- AI Panel Logic ---
function initAIPanel() {
    dom.aiGenerateBtn.addEventListener('click', generateAI);
    dom.aiImportBtn.addEventListener('click', () => {
        state.texts = [...state.texts, ...state.aiPreview];
        clearCurrentPresetSelection();
        renderTextList(); // update main list
        showToast('已导入到发送列表', 'success');
        // Switch back to send panel
        document.querySelector('[data-target="panel-send"]').click();
    });
}

async function generateAI() {
    const scenario = dom.aiScenario.value.trim();
    if (!scenario) return showToast('请输入场景描述', 'error');

    const providerId = dom.aiProvider.value;
    const type = document.querySelector('input[name="ai-type"]:checked').value;
    const count = parseInt(dom.aiCount.value) || 5;

    dom.aiGenerateBtn.disabled = true;
    dom.aiGenerateBtn.innerHTML = '<span class="loading-spinner"></span> 生成中...';
    dom.aiPreviewList.innerHTML = '';
    state.aiPreview = [];

    try {
        const res = await apiFetch('/api/v1/ai/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                scenario,
                provider_id: providerId,
                count,
                text_type: type
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const detailed = formatApiErrorDetail(data.detail, res.status);
            console.error('AI generate failed', { status: res.status, detail: data.detail });
            showToast('生成失败: ' + detailed, 'error');
            return;
        }

        if (data.texts) {
            state.aiPreview = data.texts;
            renderAIPreview();
            dom.aiImportBtn.disabled = false;
        } else {
            showToast('生成失败: 无数据', 'error');
        }

    } catch (e) {
        showToast('AI生成错误: ' + e.message, 'error');
    } finally {
        dom.aiGenerateBtn.disabled = false;
        dom.aiGenerateBtn.innerHTML = '<span class="icon">✨</span> 开始生成';
    }
}

function renderAIPreview() {
    dom.aiPreviewList.innerHTML = '';
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
            <button class="delete-preset" data-id="${p.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        
        // Add click listener for loading
        el.addEventListener('click', (e) => {
            // Prevent if delete button was clicked
            if (e.target.closest('.delete-preset')) return;
            loadPreset(p);
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
            const sent = await sendTextNow(textToSend, '快速发送成功');
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
        return;
    }
    loadPreset(preset, options);
}

function loadPreset(preset, options = {}) {
    const { jumpToSend = true } = options;

    state.texts = [...preset.texts]; // Clone
    state.currentPresetId = preset.id;
    renderQuickPresetSwitcher();
    renderTextList();
    showToast(`已加载预设 "${preset.name}"`, 'success');
    if (jumpToSend) {
        document.querySelector('[data-target="panel-send"]').click();
    }
}

async function saveCurrentAsPreset() {
    const name = dom.presetNameInput.value.trim();
    if (!name) return showToast('请输入名称', 'error');
    if (state.texts.length === 0) return showToast('列表为空', 'error');

    try {
        const res = await apiFetch('/api/v1/presets', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name,
                texts: state.texts
            })
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
            if (payload.id) {
                state.currentPresetId = payload.id;
            }
            showToast('保存成功', 'success');
            closeModal();
            await fetchPresets(); // Refresh list
        }
    } catch (e) {
        showToast('保存失败', 'error');
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
function initSettingsPanel() {
    dom.saveSettingsBtn.addEventListener('click', saveAllSettings);
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
        document.getElementById('setting-custom-headers').value = JSON.stringify(defaults, null, 2);
        showToast('已恢复默认请求头，请保存设置', 'info');
    });

    document.getElementById('clear-token-btn').addEventListener('click', async () => {
        try {
            await apiFetch('/api/v1/settings/server', {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ token: '' })
            });
            clearToken();
            document.getElementById('setting-token').value = '';
            document.getElementById('setting-token').placeholder = '留空则不启用认证';
            showToast('令牌已清除，认证已关闭', 'success');
        } catch (e) {
            if (e.message !== 'AUTH_REQUIRED') showToast('操作失败', 'error');
        }
    });
}

async function fetchSettings() {
    const res = await apiFetch('/api/v1/settings');
    const data = await res.json(); // {server, sender, ai}
    state.settings = data;
    
    // Apply to UI
    dom.settingMethod.value = data.sender.method || 'clipboard';
    dom.settingChatKey.value = data.sender.chat_open_key || 't';
    dom.settingDelayOpen.value = data.sender.delay_open_chat || 300;
    dom.settingDelayPaste.value = data.sender.delay_after_paste || 100;
    dom.settingDelaySend.value = data.sender.delay_after_send || 200;
    dom.settingFocusTimeout.value = data.sender.focus_timeout || 5000;
    dom.settingRetryCount.value = data.sender.retry_count ?? 2;
    dom.settingRetryInterval.value = data.sender.retry_interval || 300;
    dom.settingTypingCharDelay.value = data.sender.typing_char_delay || 18;
    dom.settingLanAccess.checked = data.server.lan_access || false;
    dom.settingSystemPrompt.value = data.ai.system_prompt || '';

    // Custom headers
    const customHeaders = data.ai.custom_headers || {};
    const headersEl = document.getElementById('setting-custom-headers');
    headersEl.value = Object.keys(customHeaders).length > 0
        ? JSON.stringify(customHeaders, null, 2)
        : '';

    // Token display
    const tokenInput = document.getElementById('setting-token');
    tokenInput.value = '';
    tokenInput.placeholder = data.server.token_set ? '已设置 (输入新值可更新)' : '留空则不启用认证';
    
    // Update LAN info
    const lanDiv = document.getElementById('lan-urls');
    if (data.server.lan_access) {
        lanDiv.classList.remove('hidden');
        // We'd ideally get the actual IP from API, but hardcoded hint for now
        // or the API returns it in server object
    } else {
        lanDiv.classList.add('hidden');
    }

    await fetchProviders();
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
        row.style.marginBottom = '10px';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.innerHTML = `
            <div>
                <strong>${p.name}</strong>
                <div style="font-size:0.8rem;color:var(--text-muted)">${p.model}</div>
            </div>
            <div>
                <button class="btn btn-sm btn-ghost" onclick="editProvider('${p.id}')">✏️</button>
                <button class="btn btn-sm btn-ghost" onclick="deleteProvider('${p.id}')" style="color:var(--accent-danger)">🗑️</button>
            </div>
        `;
        dom.providersList.appendChild(row);
    });

    // Update AI Panel dropdown
    dom.aiProvider.innerHTML = '';
    const preferredProviderId = state.settings.ai?.default_provider || '';
    providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (preferredProviderId && p.id === preferredProviderId) {
            opt.selected = true;
        }
        dom.aiProvider.appendChild(opt);
    });
}

async function saveAllSettings() {
    try {
        // Sender Settings
        const rawChatKey = (dom.settingChatKey.value || '').trim();
        const chatKey = (rawChatKey ? rawChatKey[0] : 't').toLowerCase();

        await apiFetch('/api/v1/settings/sender', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: dom.settingMethod.value,
                chat_open_key: chatKey,
                delay_open_chat: parseInt(dom.settingDelayOpen.value),
                delay_after_paste: parseInt(dom.settingDelayPaste.value),
                delay_after_send: parseInt(dom.settingDelaySend.value),
                focus_timeout: parseInt(dom.settingFocusTimeout.value),
                retry_count: parseInt(dom.settingRetryCount.value),
                retry_interval: parseInt(dom.settingRetryInterval.value),
                typing_char_delay: parseInt(dom.settingTypingCharDelay.value)
            })
        });

        // Server Settings
        const serverPayload = { lan_access: dom.settingLanAccess.checked };
        const newToken = document.getElementById('setting-token').value.trim();
        if (newToken) serverPayload.token = newToken;
        await apiFetch('/api/v1/settings/server', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(serverPayload)
        });

        // If token was changed, update localStorage too
        if (newToken) {
            setToken(newToken);
        }

        // AI Settings (Prompt + Custom Headers)
        let customHeaders;
        try {
            const rawHeaders = document.getElementById('setting-custom-headers').value.trim();
            customHeaders = rawHeaders ? JSON.parse(rawHeaders) : {};
        } catch (parseErr) {
            showToast('自定义请求头 JSON 格式错误，请检查', 'error');
            return;
        }

        await apiFetch('/api/v1/settings/ai', {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                default_provider: dom.aiProvider.value || '',
                system_prompt: dom.settingSystemPrompt.value,
                custom_headers: customHeaders
            })
        });

        showToast('设置已保存', 'success');
        fetchSettings(); // Reload to reflect changes (e.g. LAN IP)
    } catch (e) {
        showToast('保存设置失败', 'error');
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
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
            });
        } else {
            res = await apiFetch('/api/v1/settings/providers', {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)
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

function openModal(id) {
    dom.modalBackdrop.classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
}

function closeModal() {
    dom.modalBackdrop.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// Close modal triggers
document.querySelectorAll('[data-action="close-modal"]').forEach(b => b.addEventListener('click', closeModal));
dom.modalBackdrop.addEventListener('click', closeModal);
