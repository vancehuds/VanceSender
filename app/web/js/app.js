/**
 * VanceSender Frontend Logic
 * Pure Vanilla JS - No Frameworks
 */

/* ── Minimal QR Code Generator (Canvas) ──────────────────────────────── */
const QRCodeGen = (() => {
    // Lightweight QR encoder — based on the QR Code specification
    // Supports numeric, alphanumeric, and byte modes for URL-length data
    function generate(text, opts = {}) {
        const moduleSize = opts.moduleSize || 4;
        const margin = opts.margin ?? 2;
        const canvas = opts.canvas || document.createElement('canvas');
        const modules = encode(text);
        const size = modules.length;
        const canvasSize = (size + margin * 2) * moduleSize;
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (modules[r][c]) {
                    ctx.fillRect((c + margin) * moduleSize, (r + margin) * moduleSize, moduleSize, moduleSize);
                }
            }
        }
        return canvas;
    }

    function encode(text) {
        // Use the well-tested qrcode-generator approach via a small shim
        // We'll use a simpler approach: create a temporary script-less encoder
        // For reliability, use the proven algorithm via the qr() helper below
        const qr = qrcodegen(0, 'M');
        qr.addData(text);
        qr.make();
        const count = qr.getModuleCount();
        const modules = [];
        for (let r = 0; r < count; r++) {
            const row = [];
            for (let c = 0; c < count; c++) {
                row.push(qr.isDark(r, c));
            }
            modules.push(row);
        }
        return modules;
    }

    // Minimal QR code encoder — Type Number 0 = auto, Error correction M
    // Ported from kazuhikoarase/qrcode-generator (MIT License)
    function qrcodegen(typeNumber, errorCorrectionLevel) {
        const PAD0 = 0xEC, PAD1 = 0x11;
        const _typeNumber = typeNumber;
        const _errorCorrectionLevel = { L: 1, M: 0, Q: 3, H: 2 }[errorCorrectionLevel] || 0;
        let _modules = null, _moduleCount = 0, _dataCache = null;
        const _dataList = [];

        const _this = {
            addData(data) { _dataList.push({ mode: 4, getLength() { return data.length; }, write(buf) { for (let i = 0; i < data.length; i++) buf.put(data.charCodeAt(i), 8); } }); _dataCache = null; },
            make() {
                let tn = _typeNumber;
                if (tn < 1) {
                    for (tn = 1; tn < 40; tn++) {
                        const rsBlocks = QRRSBlock_getRSBlocks(tn, _errorCorrectionLevel);
                        let totalDC = 0; for (const b of rsBlocks) totalDC += b.dataCount;
                        let totalBits = 0; for (const d of _dataList) { totalBits += 4; totalBits += getLengthInBits(d.mode, tn); totalBits += d.getLength() * 8; }
                        if (totalBits <= totalDC * 8) break;
                    }
                }
                _moduleCount = tn * 4 + 17;
                _modules = Array.from({ length: _moduleCount }, () => new Array(_moduleCount).fill(null));
                setupPositionProbe(0, 0); setupPositionProbe(_moduleCount - 7, 0); setupPositionProbe(0, _moduleCount - 7);
                setupPositionAdjust(tn); setupTimingPattern();
                setupTypeInfo(true, 0); if (tn >= 7) setupTypeNumber(true);
                _dataCache = _dataCache || createData(tn, _errorCorrectionLevel, _dataList);
                mapData(_dataCache, getMaskPattern(0));
                let minLostPoint = Infinity, bestPattern = 0;
                for (let p = 0; p < 8; p++) {
                    setupPositionProbe(0, 0); setupPositionProbe(_moduleCount - 7, 0); setupPositionProbe(0, _moduleCount - 7);
                    setupPositionAdjust(tn); setupTimingPattern();
                    setupTypeInfo(true, p); if (tn >= 7) setupTypeNumber(true);
                    mapData(_dataCache, getMaskPattern(p));
                    const lp = getLostPoint();
                    if (lp < minLostPoint) { minLostPoint = lp; bestPattern = p; }
                }
                _modules = Array.from({ length: _moduleCount }, () => new Array(_moduleCount).fill(null));
                setupPositionProbe(0, 0); setupPositionProbe(_moduleCount - 7, 0); setupPositionProbe(0, _moduleCount - 7);
                setupPositionAdjust(tn); setupTimingPattern();
                setupTypeInfo(false, bestPattern); if (tn >= 7) setupTypeNumber(false);
                mapData(_dataCache, getMaskPattern(bestPattern));
            },
            getModuleCount() { return _moduleCount; },
            isDark(row, col) { return _modules[row][col] === true; }
        };

        function setupPositionProbe(row, col) {
            for (let r = -1; r <= 7; r++) {
                if (row + r < 0 || _moduleCount <= row + r) continue;
                for (let c = -1; c <= 7; c++) {
                    if (col + c < 0 || _moduleCount <= col + c) continue;
                    _modules[row + r][col + c] = (0 <= r && r <= 6 && (c === 0 || c === 6)) || (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4);
                }
            }
        }

        function setupTimingPattern() {
            for (let i = 8; i < _moduleCount - 8; i++) {
                if (_modules[i][6] !== null) continue;
                _modules[i][6] = i % 2 === 0;
                _modules[6][i] = i % 2 === 0;
            }
        }

        const PATTERN_POSITION_TABLE = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]];

        function setupPositionAdjust(typeNum) {
            const pos = PATTERN_POSITION_TABLE[typeNum - 1] || [];
            for (let i = 0; i < pos.length; i++) {
                for (let j = 0; j < pos.length; j++) {
                    const row = pos[i], col = pos[j];
                    if (_modules[row][col] !== null) continue;
                    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) _modules[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
                }
            }
        }

        function setupTypeNumber(test) {
            const typeNum = _modules.length === 0 ? 1 : Math.floor((_moduleCount - 17) / 4);
            const bits = QRUtil_getBCHTypeNumber(typeNum);
            for (let i = 0; i < 18; i++) {
                const mod = !test && ((bits >> i) & 1) === 1;
                _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
                _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
            }
        }

        function setupTypeInfo(test, maskPattern) {
            const data = (_errorCorrectionLevel << 3) | maskPattern;
            const bits = QRUtil_getBCHTypeInfo(data);
            for (let i = 0; i < 15; i++) {
                const mod = !test && ((bits >> i) & 1) === 1;
                if (i < 6) _modules[i][8] = mod;
                else if (i < 8) _modules[i + 1][8] = mod;
                else _modules[_moduleCount - 15 + i][8] = mod;
                if (i < 8) _modules[8][_moduleCount - i - 1] = mod;
                else if (i < 9) _modules[8][15 - i - 1 + 1] = mod;
                else _modules[8][15 - i - 1] = mod;
            }
            _modules[_moduleCount - 8][8] = !test;
        }

        function getMaskPattern(maskPattern) {
            const fns = [
                (i, j) => (i + j) % 2 === 0,
                (i) => i % 2 === 0,
                (_, j) => j % 3 === 0,
                (i, j) => (i + j) % 3 === 0,
                (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
                (i, j) => (i * j) % 2 + (i * j) % 3 === 0,
                (i, j) => ((i * j) % 2 + (i * j) % 3) % 2 === 0,
                (i, j) => ((i * j) % 3 + (i + j) % 2) % 2 === 0
            ];
            return fns[maskPattern];
        }

        function getLostPoint() {
            let lp = 0;
            for (let row = 0; row < _moduleCount; row++) {
                for (let col = 0; col < _moduleCount; col++) {
                    let sameCount = 0, dark = _modules[row][col];
                    for (let r = -1; r <= 1; r++) {
                        if (row + r < 0 || _moduleCount <= row + r) continue;
                        for (let c = -1; c <= 1; c++) {
                            if (col + c < 0 || _moduleCount <= col + c) continue;
                            if (r === 0 && c === 0) continue;
                            if (dark === _modules[row + r][col + c]) sameCount++;
                        }
                    }
                    if (sameCount > 5) lp += (3 + sameCount - 5);
                }
            }
            for (let row = 0; row < _moduleCount - 1; row++) {
                for (let col = 0; col < _moduleCount - 1; col++) {
                    let count = 0;
                    if (_modules[row][col]) count++;
                    if (_modules[row + 1][col]) count++;
                    if (_modules[row][col + 1]) count++;
                    if (_modules[row + 1][col + 1]) count++;
                    if (count === 0 || count === 4) lp += 3;
                }
            }
            for (let row = 0; row < _moduleCount; row++) {
                for (let col = 0; col < _moduleCount - 6; col++) {
                    if (_modules[row][col] && !_modules[row][col + 1] && _modules[row][col + 2] && _modules[row][col + 3] && _modules[row][col + 4] && !_modules[row][col + 5] && _modules[row][col + 6]) lp += 40;
                }
            }
            for (let col = 0; col < _moduleCount; col++) {
                for (let row = 0; row < _moduleCount - 6; row++) {
                    if (_modules[row][col] && !_modules[row + 1][col] && _modules[row + 2][col] && _modules[row + 3][col] && _modules[row + 4][col] && !_modules[row + 5][col] && _modules[row + 6][col]) lp += 40;
                }
            }
            let darkCount = 0;
            for (let row = 0; row < _moduleCount; row++) for (let col = 0; col < _moduleCount; col++) if (_modules[row][col]) darkCount++;
            lp += Math.abs(100 * darkCount / _moduleCount / _moduleCount - 50) / 5 * 10;
            return lp;
        }

        function mapData(data, maskFunc) {
            let inc = -1, row = _moduleCount - 1, bitIndex = 7, byteIndex = 0;
            for (let col = _moduleCount - 1; col > 0; col -= 2) {
                if (col === 6) col--;
                while (true) {
                    for (let c = 0; c < 2; c++) {
                        if (_modules[row][col - c] === null) {
                            let dark = false;
                            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
                            if (maskFunc(row, col - c)) dark = !dark;
                            _modules[row][col - c] = dark;
                            bitIndex--;
                            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
                        }
                    }
                    row += inc;
                    if (row < 0 || _moduleCount <= row) { row -= inc; inc = -inc; break; }
                }
            }
        }

        function createData(typeNumber, ecLevel, dataList) {
            const rsBlocks = QRRSBlock_getRSBlocks(typeNumber, ecLevel);
            const buffer = { _buffer: [], _length: 0, put(num, length) { for (let i = 0; i < length; i++) { this._buffer[Math.floor((this._length + i) / 8)] |= ((num >>> (length - i - 1)) & 1) << (7 - (this._length + i) % 8); this._length += 1; } }, getLengthInBits() { return this._length; }, get(index) { return (this._buffer[Math.floor(index / 8)] >>> (7 - index % 8)) & 1; } };
            // Fix: ensure buffer._buffer is properly sized
            buffer._buffer = [];
            for (const data of dataList) {
                buffer.put(data.mode, 4);
                buffer.put(data.getLength(), getLengthInBits(data.mode, typeNumber));
                data.write(buffer);
            }
            let totalDataCount = 0;
            for (const b of rsBlocks) totalDataCount += b.dataCount;
            if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error('QR data overflow');
            if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
            while (buffer.getLengthInBits() % 8 !== 0) buffer.put(0, 1);
            while (true) {
                if (buffer.getLengthInBits() >= totalDataCount * 8) break;
                buffer.put(PAD0, 8);
                if (buffer.getLengthInBits() >= totalDataCount * 8) break;
                buffer.put(PAD1, 8);
            }
            return createBytes(buffer, rsBlocks);
        }

        function createBytes(buffer, rsBlocks) {
            let offset = 0, maxDcCount = 0, maxEcCount = 0;
            const dcdata = [], ecdata = [];
            for (let r = 0; r < rsBlocks.length; r++) {
                const dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
                maxDcCount = Math.max(maxDcCount, dcCount);
                maxEcCount = Math.max(maxEcCount, ecCount);
                dcdata[r] = new Array(dcCount);
                for (let i = 0; i < dcCount; i++) dcdata[r][i] = 0xff & buffer._buffer[i + offset];
                offset += dcCount;
                const rsPoly = QRUtil_getErrorCorrectPolynomial(ecCount);
                const rawPoly = { num: [...dcdata[r], ...new Array(rsPoly.num.length - 1).fill(0)], getLength() { return this.num.length; } };
                const modPoly = polyMod(rawPoly, rsPoly);
                ecdata[r] = new Array(rsPoly.num.length - 1);
                for (let i = 0; i < ecdata[r].length; i++) {
                    const modIndex = i + modPoly.num.length - ecdata[r].length;
                    ecdata[r][i] = modIndex >= 0 ? modPoly.num[modIndex] : 0;
                }
            }
            const totalCodeCount = rsBlocks.reduce((s, b) => s + b.totalCount, 0);
            const data = new Array(totalCodeCount);
            let index = 0;
            for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
            for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
            return data;
        }

        function polyMod(a, b) {
            let num = [...a.num];
            for (let i = 0; i < a.num.length - b.num.length + 1; i++) {
                const ratio = num[i];
                if (ratio === 0) continue;
                const logRatio = QR_LOG_TABLE[ratio];
                for (let j = 0; j < b.num.length; j++) {
                    num[i + j] ^= QR_EXP_TABLE[(QR_LOG_TABLE[b.num[j]] + logRatio) % 255];
                }
            }
            // Strip leading zeros
            while (num.length > 0 && num[0] === 0) num.shift();
            return { num, getLength() { return num.length; } };
        }

        return _this;
    }

    // GF(256) tables
    const QR_EXP_TABLE = new Array(256);
    const QR_LOG_TABLE = new Array(256);
    (() => {
        for (let i = 0; i < 8; i++) QR_EXP_TABLE[i] = 1 << i;
        for (let i = 8; i < 256; i++) QR_EXP_TABLE[i] = QR_EXP_TABLE[i - 4] ^ QR_EXP_TABLE[i - 5] ^ QR_EXP_TABLE[i - 6] ^ QR_EXP_TABLE[i - 8];
        for (let i = 0; i < 255; i++) QR_LOG_TABLE[QR_EXP_TABLE[i]] = i;
    })();

    function QRUtil_getErrorCorrectPolynomial(ecLength) {
        let a = { num: [1], getLength() { return this.num.length; } };
        for (let i = 0; i < ecLength; i++) {
            const b = [1, QR_EXP_TABLE[i]];
            const newNum = new Array(a.num.length + b.length - 1).fill(0);
            for (let j = 0; j < a.num.length; j++) for (let k = 0; k < b.length; k++) newNum[j + k] ^= QR_EXP_TABLE[(QR_LOG_TABLE[a.num[j]] + QR_LOG_TABLE[b[k]]) % 255];
            a = { num: newNum, getLength() { return newNum.length; } };
        }
        return a;
    }

    const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);

    function QRUtil_getBCHTypeInfo(data) {
        let d = data << 10;
        while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
        return ((data << 10) | d) ^ G15_MASK;
    }

    function QRUtil_getBCHTypeNumber(data) {
        let d = data << 12;
        while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18));
        return (data << 12) | d;
    }

    function getBCHDigit(data) {
        let digit = 0, d = data;
        while (d !== 0) { digit++; d >>>= 1; }
        return digit;
    }

    function getLengthInBits(mode, type) {
        if (type >= 1 && type <= 9) return mode === 4 ? 8 : mode === 2 ? 9 : mode === 1 ? 10 : 8;
        if (type <= 26) return mode === 4 ? 16 : mode === 2 ? 11 : mode === 1 ? 12 : 10;
        return mode === 4 ? 16 : mode === 2 ? 13 : mode === 1 ? 14 : 12;
    }

    // RS Block definitions
    const RS_BLOCK_TABLE = [
        [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
        [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
        [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
        [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
        [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
        [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
        [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
        [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
        [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
        [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
    ];

    function QRRSBlock_getRSBlocks(typeNumber, ecLevel) {
        const rsBlock = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + ecLevel];
        if (!rsBlock) throw new Error('Bad RS block for type ' + typeNumber);
        const blocks = [];
        for (let i = 0; i < rsBlock.length; i += 3) {
            const count = rsBlock[i], totalCount = rsBlock[i + 1], dataCount = rsBlock[i + 2];
            for (let j = 0; j < count; j++) blocks.push({ totalCount, dataCount });
        }
        return blocks;
    }

    return { generate };
})();

const DESKTOP_CLIENT_SESSION_KEY = 'vs_desktop_client';
const QUICK_PANEL_SESSION_KEY = 'vs_quick_panel_mode';
const QUICK_SEND_PRESET_MEMORY_KEY = 'vs_quick_send_last_preset';

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

function readRememberedQuickSendPresetId() {
    try {
        return String(window.localStorage.getItem(QUICK_SEND_PRESET_MEMORY_KEY) || '').trim();
    } catch (e) {
        return '';
    }
}

function rememberQuickSendPresetId(presetId) {
    const normalized = String(presetId || '').trim();
    try {
        if (!normalized) {
            window.localStorage.removeItem(QUICK_SEND_PRESET_MEMORY_KEY);
            return;
        }
        window.localStorage.setItem(QUICK_SEND_PRESET_MEMORY_KEY, normalized);
    } catch (e) {
        // ignore storage failures
    }
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
    presetSelectMode: false,
    selectedPresetIds: new Set(),
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
    aiTemperature: document.getElementById('ai-temperature'),
    aiTemperatureLabel: document.getElementById('ai-temperature-label'),
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
    importPresetsBtn: document.getElementById('import-presets-btn'),
    exportAllPresetsBtn: document.getElementById('export-all-presets-btn'),
    presetFileInput: document.getElementById('preset-file-input'),
    quickPresetSelect: document.getElementById('quick-preset-select'),
    quickPresetRefreshBtn: document.getElementById('quick-preset-refresh-btn'),
    togglePresetSelectBtn: document.getElementById('toggle-preset-select-btn'),
    batchDeletePresetsBtn: document.getElementById('batch-delete-presets-btn'),
    batchDeleteCount: document.getElementById('batch-delete-count'),
    cancelPresetSelectBtn: document.getElementById('cancel-preset-select-btn'),

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
    homeLanQrcode: document.getElementById('home-lan-qrcode'),
    homeLanIpSelectRow: document.getElementById('home-lan-ip-select-row'),
    homeLanIpSelect: document.getElementById('home-lan-ip-select'),
    homeCopyLanBtn: document.getElementById('home-copy-lan-btn'),
    homeSecurityWarning: document.getElementById('home-security-warning'),
    homeOpenBrowserBtn: document.getElementById('home-open-browser-btn'),
    homeCopyLocalBtn: document.getElementById('home-copy-local-btn'),
    homeUpdateBanner: document.getElementById('home-update-banner'),
    homeUpdateBannerText: document.getElementById('home-update-banner-text'),
    homeUpdateBannerDismissBtn: document.getElementById('home-update-banner-dismiss-btn'),
    homeUpdateBannerLink: document.getElementById('home-update-banner-link'),
    homeUpdateStatus: document.getElementById('home-update-status'),
    homeCurrentVersion: document.getElementById('home-current-version'),
    homeLatestVersion: document.getElementById('home-latest-version'),
    homeUpdateTip: document.getElementById('home-update-tip'),
    homeUpdateReleaseLink: document.getElementById('home-update-release-link'),
    homeCheckUpdateBtn: document.getElementById('home-check-update-btn'),
    homeIncludePrerelease: document.getElementById('home-include-prerelease'),
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
    settingOverlayBgOpacity: document.getElementById('setting-overlay-bg-opacity'),
    settingOverlayAccentColor: document.getElementById('setting-overlay-accent-color'),
    settingOverlayFontSize: document.getElementById('setting-overlay-font-size'),
    settingSystemPrompt: document.getElementById('setting-system-prompt'),
    settingToken: document.getElementById('setting-token'),
    settingCustomHeaders: document.getElementById('setting-custom-headers'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    settingsUnsavedBar: document.getElementById('settings-unsaved-bar'),
    settingsUnsavedSaveBtn: document.getElementById('settings-unsaved-save-btn'),
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
    toastContainer: document.getElementById('toast-container'),

    // Onboarding
    onboardingOverlay: document.getElementById('onboarding-overlay'),
    onboardingHighlight: document.getElementById('onboarding-highlight'),
    onboardingCard: document.getElementById('onboarding-card'),
    onboardingStepBadge: document.getElementById('onboarding-step-badge'),
    onboardingTitle: document.getElementById('onboarding-title'),
    onboardingDesc: document.getElementById('onboarding-desc'),
    onboardingDots: document.getElementById('onboarding-dots'),
    onboardingPrevBtn: document.getElementById('onboarding-prev-btn'),
    onboardingNextBtn: document.getElementById('onboarding-next-btn'),
    onboardingSkipBtn: document.getElementById('onboarding-skip-btn')
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
    initSendHistory();
    initAIHistory();

    // i18n: set language selector to saved language and wire up change
    const langSelect = document.getElementById('setting-language');
    if (langSelect) {
        langSelect.value = getCurrentLang();
        langSelect.addEventListener('change', () => setLanguage(langSelect.value));
    }
    applyLanguage();

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
            fetchPublicConfig({ silent: true }),
            loadSendStats()
        ]);
        showToast('系统已就绪', 'success');

        if (!state.startupUpdateChecked) {
            state.startupUpdateChecked = true;
            checkGitHubUpdate({ silent: true, startup: true });
        }

        // Trigger onboarding tutorial for first-time users
        initOnboarding();
    } catch (e) {
        showToast('初始化失败: ' + e.message, 'error');
    }
}

// --- Onboarding Tutorial ---
function switchToPanel(panelTarget) {
    const navItem = document.querySelector(`.nav-item[data-target="${panelTarget}"]`);
    if (!navItem) return;
    dom.navItems.forEach(n => n.classList.remove('active'));
    navItem.classList.add('active');
    dom.panels.forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(panelTarget);
    if (panel) panel.classList.add('active');
}

function initOnboarding() {
    // Skip in quick-panel mode
    if (isQuickPanelMode()) return;

    // Check if onboarding was already completed (from server config)
    if (state.settings?.launch?.onboarding_done) return;

    const steps = [
        {
            target: null, // centered welcome — no highlight target
            title: '👋 欢迎使用 VanceSender！',
            desc: '这是一款专为 FiveM Roleplay 设计的文本发送工具。接下来让我们快速了解各项核心功能吧！',
            beforeShow: () => switchToPanel('panel-home')
        },
        {
            target: '[data-target="panel-send"]',
            title: '📨 发送文本',
            desc: '在「发送」面板中导入或手动编写 RP 文本，支持批量导入与队列发送，精确控制发送间隔。',
            beforeShow: () => switchToPanel('panel-send')
        },
        {
            target: '[data-target="panel-ai"]',
            title: '✨ AI 智能生成',
            desc: '只需描述场景，AI 即可自动生成 /me 和 /do 文本。还支持对已有文本进行 AI 润色重写。',
            beforeShow: () => switchToPanel('panel-ai')
        },
        {
            target: '[data-target="panel-presets"]',
            title: '💾 预设管理',
            desc: '将常用的角色扮演文本保存为预设，分类管理、快速调用，支持导入导出分享。',
            beforeShow: () => switchToPanel('panel-presets')
        },
        {
            target: '[data-target="panel-quick-send"]',
            title: '⚡ 快捷发送',
            desc: '选择预设后一键发送，配合游戏内悬浮窗热键呼出，无需切屏即可操作。',
            beforeShow: () => switchToPanel('panel-quick-send')
        },
        {
            target: '[data-target="panel-settings"]',
            title: '⚙️ 设置',
            desc: '配置发送方式与延迟参数、局域网远程控制、AI 服务商、快捷悬浮窗热键等。',
            beforeShow: () => switchToPanel('panel-settings')
        }
    ];

    let currentStep = 0;

    // Build step indicator dots
    function renderDots() {
        if (!dom.onboardingDots) return;
        dom.onboardingDots.innerHTML = '';
        for (let i = 0; i < steps.length; i++) {
            const dot = document.createElement('span');
            dot.className = 'onboarding-dot';
            if (i === currentStep) dot.classList.add('active');
            else if (i < currentStep) dot.classList.add('done');
            dom.onboardingDots.appendChild(dot);
        }
    }

    // Build the progress bar element
    function renderProgress() {
        const bar = dom.onboardingCard?.querySelector('.onboarding-progress-fill');
        if (bar) {
            bar.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
        }
    }

    // Position the highlight box over the target element
    function positionHighlight(targetEl) {
        if (!dom.onboardingHighlight || !targetEl) return;
        const rect = targetEl.getBoundingClientRect();
        const pad = 6;
        dom.onboardingHighlight.style.top = (rect.top - pad) + 'px';
        dom.onboardingHighlight.style.left = (rect.left - pad) + 'px';
        dom.onboardingHighlight.style.width = (rect.width + pad * 2) + 'px';
        dom.onboardingHighlight.style.height = (rect.height + pad * 2) + 'px';
    }

    // Center the card when there is no target (welcome step)
    function centerCard() {
        if (!dom.onboardingCard) return;
        dom.onboardingCard.style.top = '50%';
        dom.onboardingCard.style.left = '50%';
        dom.onboardingCard.style.transform = 'translate(-50%, -50%)';
    }

    // Position the card next to the highlight
    function positionCard(targetEl) {
        if (!dom.onboardingCard) return;
        // Reset centering transform
        dom.onboardingCard.style.transform = '';

        if (!targetEl) {
            centerCard();
            return;
        }

        const rect = targetEl.getBoundingClientRect();
        const cardWidth = dom.onboardingCard.offsetWidth || 360;
        const cardHeight = dom.onboardingCard.offsetHeight || 260;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 18;

        let top, left;

        // Try right of target
        if (rect.right + gap + cardWidth < vw) {
            left = rect.right + gap;
            top = rect.top;
        }
        // Try left of target
        else if (rect.left - gap - cardWidth > 0) {
            left = rect.left - gap - cardWidth;
            top = rect.top;
        }
        // Fallback: below target
        else {
            left = Math.max(16, (vw - cardWidth) / 2);
            top = rect.bottom + gap;
        }

        // Clamp to viewport
        top = Math.max(12, Math.min(top, vh - cardHeight - 12));
        left = Math.max(12, Math.min(left, vw - cardWidth - 12));

        dom.onboardingCard.style.top = top + 'px';
        dom.onboardingCard.style.left = left + 'px';
    }

    function showStep(index) {
        currentStep = index;
        const step = steps[currentStep];

        // Run beforeShow callback (e.g. switch panel)
        if (typeof step.beforeShow === 'function') {
            step.beforeShow();
        }

        const targetEl = step.target ? document.querySelector(step.target) : null;
        const isCentered = !step.target;

        if (!isCentered && !targetEl) {
            completeOnboarding();
            return;
        }

        // Fade-out existing card content, then update
        const body = dom.onboardingCard?.querySelector('.onboarding-body');
        if (body) {
            body.classList.remove('onboarding-body-enter');
            // Force reflow to restart animation
            void body.offsetWidth;
            body.classList.add('onboarding-body-enter');
        }

        // Update card content
        dom.onboardingStepBadge.textContent = `${currentStep + 1} / ${steps.length}`;
        dom.onboardingTitle.textContent = step.title;
        dom.onboardingDesc.textContent = step.desc;

        // Update buttons
        dom.onboardingPrevBtn.disabled = currentStep === 0;
        if (currentStep === steps.length - 1) {
            dom.onboardingNextBtn.textContent = '🎉 开始使用';
        } else {
            dom.onboardingNextBtn.textContent = '下一步 →';
        }

        renderDots();
        renderProgress();

        // Toggle highlight visibility
        if (isCentered) {
            dom.onboardingHighlight.classList.add('hidden');
        } else {
            dom.onboardingHighlight.classList.remove('hidden');
            positionHighlight(targetEl);
        }

        // Show overlay & card
        dom.onboardingOverlay.classList.remove('hidden');
        dom.onboardingCard.classList.remove('hidden');
        dom.onboardingCard.classList.toggle('centered', isCentered);

        // Use rAF to position card after it's rendered
        requestAnimationFrame(() => {
            positionCard(targetEl);
        });
    }

    function completeOnboarding() {
        // Add exit animation
        dom.onboardingOverlay.classList.add('onboarding-exit');
        dom.onboardingCard.classList.add('onboarding-exit');
        dom.onboardingHighlight.classList.add('hidden');

        setTimeout(() => {
            dom.onboardingOverlay.classList.add('hidden');
            dom.onboardingCard.classList.add('hidden');
            dom.onboardingOverlay.classList.remove('onboarding-exit');
            dom.onboardingCard.classList.remove('onboarding-exit');
        }, 300);

        // Switch back to home panel
        switchToPanel('panel-home');

        // Persist to server config
        apiFetch('/api/v1/settings/launch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onboarding_done: true })
        }).catch(() => { /* ignore save failures */ });
        // Also update local state so re-init won't trigger
        if (state.settings?.launch) {
            state.settings.launch.onboarding_done = true;
        }
        window.removeEventListener('resize', handleResize);
    }

    function handleResize() {
        const step = steps[currentStep];
        if (!step) return;
        const targetEl = step.target ? document.querySelector(step.target) : null;
        if (step.target && !targetEl) return;
        if (targetEl) positionHighlight(targetEl);
        positionCard(targetEl);
    }

    // Event listeners
    if (dom.onboardingNextBtn) {
        dom.onboardingNextBtn.addEventListener('click', () => {
            if (currentStep < steps.length - 1) {
                showStep(currentStep + 1);
            } else {
                completeOnboarding();
            }
        });
    }

    if (dom.onboardingPrevBtn) {
        dom.onboardingPrevBtn.addEventListener('click', () => {
            if (currentStep > 0) {
                showStep(currentStep - 1);
            }
        });
    }

    if (dom.onboardingSkipBtn) {
        dom.onboardingSkipBtn.addEventListener('click', completeOnboarding);
    }

    window.addEventListener('resize', handleResize);

    // Start the onboarding after a brief delay so layout is settled
    setTimeout(() => showStep(0), 500);
}

function replayOnboarding() {
    // Reset local state so initOnboarding won't early-return
    if (state.settings?.launch) {
        state.settings.launch.onboarding_done = false;
    }
    // Switch to home first
    switchToPanel('panel-home');
    // Re-run the onboarding
    initOnboarding();
}

// Wire up replay-onboarding button
document.addEventListener('DOMContentLoaded', () => {
    const replayBtn = document.getElementById('replay-onboarding-btn');
    if (replayBtn) {
        replayBtn.addEventListener('click', replayOnboarding);
    }
});

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
    [dom.quickPanelWindowClose].forEach((button) => {
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

    if (dom.quickPanelWindowClose) {
        dom.quickPanelWindowClose.addEventListener('click', () => {
            void invokeQuickPanelWindowAction('dismiss');
        });
    }

    syncQuickPanelTitlebarControls();
}

async function invokeQuickPanelWindowAction(action, options = {}) {
    if (!state.quickPanel.mode || state.quickPanel.actionInProgress) {
        return false;
    }

    const silent = Boolean(options.silent);

    state.quickPanel.actionInProgress = true;
    syncQuickPanelTitlebarControls();

    let success = false;

    try {
        const response = await apiFetch('/api/v1/settings/quick-panel-window/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (!silent) {
                showToast(`快捷面板窗口控制失败: ${formatApiErrorDetail(payload.detail, response.status)}`, 'error');
            }
            if (action === 'close' && !silent) {
                window.close();
            }
            return false;
        }

        success = true;
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            if (!silent) {
                showToast('快捷面板窗口控制失败，请稍后重试', 'error');
            }
            if (action === 'close' && !silent) {
                window.close();
            }
        }
        return false;
    } finally {
        state.quickPanel.actionInProgress = false;
        syncQuickPanelTitlebarControls();
    }

    return success;
}

async function dismissQuickPanelForSend() {
    if (!isQuickPanelMode()) {
        return true;
    }

    return invokeQuickPanelWindowAction('dismiss', { silent: true });
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

/**
 * Sort LAN URLs so that 192.168.*.* addresses come first,
 * then other private IPs (10.*, 172.16-31.*), then the rest.
 */
function sortLanUrlsByPriority(urlList) {
    function ipPriority(url) {
        // Extract IP from URL like http://192.168.1.5:8730
        const match = url.match(/:\/\/([\d.]+)/);
        if (!match) return 99;
        const ip = match[1];
        if (ip.startsWith('192.168.')) return 0;
        if (ip.startsWith('10.')) return 1;
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
        return 10;
    }
    return [...urlList].sort((a, b) => ipPriority(a) - ipPriority(b));
}

function buildLanQrUrl(lanUrl, serverSettings) {
    const tokenSet = Boolean(serverSettings?.token_set);
    if (!tokenSet) return lanUrl;
    // If token is set, we can't embed the actual token from settings (it's hidden).
    // The user needs to enter it on their phone. So just use the plain URL.
    // However, if the user is currently authenticated (has a token in localStorage),
    // we can embed that token so scanning "just works".
    const currentToken = getToken();
    if (!currentToken) return lanUrl;
    const sep = lanUrl.includes('?') ? '&' : '?';
    return `${lanUrl}${sep}vs_token=${encodeURIComponent(currentToken)}`;
}

function renderLanQrCode(url) {
    if (!dom.homeLanQrcode) return;
    try {
        QRCodeGen.generate(url, {
            canvas: dom.homeLanQrcode,
            moduleSize: 4,
            margin: 2
        });
    } catch (e) {
        // If URL is too long for QR, hide the canvas
        dom.homeLanQrcode.width = 0;
        dom.homeLanQrcode.height = 0;
    }
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
    const sortedLanUrlList = sortLanUrlsByPriority(
        lanUrlList.length > 0 ? lanUrlList : [`http://<your-ip>:${lanPort}`]
    );

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
        dom.homeLanUrls.textContent = sortedLanUrlList.join('\n');
    }

    // QR Code for LAN access
    if (lanEnabled && sortedLanUrlList.length > 0 && dom.homeLanQrcode) {
        const qrUrl = buildLanQrUrl(sortedLanUrlList[0], serverSettings);
        renderLanQrCode(qrUrl);

        // Multi-IP dropdown
        if (dom.homeLanIpSelect && dom.homeLanIpSelectRow) {
            if (sortedLanUrlList.length > 1) {
                dom.homeLanIpSelect.innerHTML = '';
                sortedLanUrlList.forEach((url, index) => {
                    const opt = document.createElement('option');
                    opt.value = url;
                    opt.textContent = url;
                    if (index === 0) opt.selected = true;
                    dom.homeLanIpSelect.appendChild(opt);
                });
                dom.homeLanIpSelectRow.classList.remove('hidden');
            } else {
                dom.homeLanIpSelectRow.classList.add('hidden');
            }
        }
    }

    const tokenSet = Boolean(serverSettings?.token_set);
    const securityWarning = String(serverSettings?.security_warning || '').trim();
    const hasRisk = lanEnabled && !tokenSet;
    if (dom.homeSecurityWarning) {
        dom.homeSecurityWarning.classList.toggle('hidden', !hasRisk);
        dom.homeSecurityWarning.textContent = hasRisk
            ? (securityWarning || '⚠ 安全风险：已开启局域网访问且未设置 Token，局域网内设备可直接访问，请立即设置 Token。')
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

    // Copy LAN URL button
    if (dom.homeCopyLanBtn) {
        dom.homeCopyLanBtn.addEventListener('click', async () => {
            // Use the currently selected LAN URL (from dropdown or the first one)
            let lanUrl = '';
            if (dom.homeLanIpSelect && !dom.homeLanIpSelectRow.classList.contains('hidden')) {
                lanUrl = dom.homeLanIpSelect.value;
            } else {
                lanUrl = String(dom.homeLanUrls?.textContent || '').split('\n')[0].trim();
            }
            if (!lanUrl) {
                showToast('局域网地址未就绪', 'error');
                return;
            }
            const copied = await copyTextToClipboard(lanUrl);
            showToast(copied ? '局域网地址已复制' : '复制失败，请手动复制', copied ? 'success' : 'error');
        });
    }

    // LAN IP selector — switch QR code when user picks a different IP
    if (dom.homeLanIpSelect) {
        dom.homeLanIpSelect.addEventListener('change', () => {
            const selectedUrl = dom.homeLanIpSelect.value;
            if (!selectedUrl) return;
            const qrUrl = buildLanQrUrl(selectedUrl, state.settings?.server || {});
            renderLanQrCode(qrUrl);
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
        rememberQuickSendPresetId(state.currentQuickPresetId);
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
                if (!item || (item.type !== 'me' && item.type !== 'do' && item.type !== 'b' && item.type !== 'e') || typeof item.content !== 'string') {
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
        } else if (line.toLowerCase().startsWith('/b ')) {
            type = 'b';
            content = line.substring(3).trim();
        } else if (line.toLowerCase().startsWith('/e ')) {
            type = 'e';
            content = line.substring(3).trim();
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

    const type = dom.editTextType.value === 'do' ? 'do' : dom.editTextType.value === 'b' ? 'b' : dom.editTextType.value === 'e' ? 'e' : 'me';

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

// --- AI Generation History ---
function initAIHistory() {
    const section = document.getElementById('ai-history-section');
    const refreshBtn = document.getElementById('refresh-ai-history-btn');
    const clearBtn = document.getElementById('clear-ai-history-btn');

    if (section) section.addEventListener('toggle', () => { if (section.open) loadAIHistory(); });
    if (refreshBtn) refreshBtn.addEventListener('click', loadAIHistory);
    if (clearBtn) clearBtn.addEventListener('click', clearAIHistory);
}

async function loadAIHistory() {
    const list = document.getElementById('ai-history-list');
    const badge = document.getElementById('ai-history-count');
    if (!list) return;

    list.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await apiFetch('/api/v1/ai/history?limit=20');
        const data = await res.json();
        const items = data.items || [];
        if (badge) badge.textContent = data.total > 0 ? data.total : '';

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state small"><p>暂无生成记录</p></div>';
            return;
        }

        list.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'ai-history-item';
            const time = new Date(item.timestamp).toLocaleString();
            const starClass = item.starred ? 'starred' : '';
            el.innerHTML = `
                <div class="ai-history-item-header">
                    <span class="ai-history-scenario" title="${item.scenario}">${item.scenario}</span>
                    <span class="history-time">${time}</span>
                </div>
                <div class="ai-history-item-meta">
                    <span class="preset-tag-badge">${item.text_type || 'mixed'}</span>
                    <span class="ai-history-text-count">${(item.texts || []).length} 条文本</span>
                </div>
                <div class="ai-history-item-actions">
                    <button class="btn btn-sm btn-ghost ai-history-star ${starClass}" data-id="${item.id}" type="button" title="收藏">${item.starred ? '⭐' : '☆'}</button>
                    <button class="btn btn-sm btn-ghost ai-history-load" data-id="${item.id}" type="button" title="导入到发送列表">📥 导入</button>
                    <button class="btn btn-sm btn-ghost ai-history-delete" data-id="${item.id}" type="button" title="删除">🗑️</button>
                </div>
            `;

            // Star toggle
            el.querySelector('.ai-history-star').addEventListener('click', async () => {
                try {
                    await apiFetch(`/api/v1/ai/history/${item.id}/star`, { method: 'POST' });
                    loadAIHistory();
                } catch (e) { }
            });

            // Load/import texts
            el.querySelector('.ai-history-load').addEventListener('click', () => {
                if (item.texts && item.texts.length > 0) {
                    state.texts = item.texts.map(t => ({ type: t.type || 'me', content: t.content || '' }));
                    renderTextList();
                    showToast(`已导入 ${item.texts.length} 条文本`, 'success');
                }
            });

            // Delete
            el.querySelector('.ai-history-delete').addEventListener('click', async () => {
                try {
                    await apiFetch(`/api/v1/ai/history/${item.id}`, { method: 'DELETE' });
                    showToast('已删除', 'success');
                    loadAIHistory();
                } catch (e) { }
            });

            list.appendChild(el);
        });
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            list.innerHTML = '<div class="empty-state small"><p>加载失败</p></div>';
        }
    }
}

async function clearAIHistory() {
    try {
        await apiFetch('/api/v1/ai/history', { method: 'DELETE' });
        showToast('非收藏记录已清空', 'success');
        loadAIHistory();
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('操作失败', 'error');
    }
}

// --- Send Statistics ---
async function loadSendStats() {
    try {
        const res = await apiFetch('/api/v1/stats');
        const data = await res.json();

        const totalEl = document.getElementById('stats-total-sent');
        const rateEl = document.getElementById('stats-success-rate');
        const batchEl = document.getElementById('stats-total-batches');
        const failedEl = document.getElementById('stats-total-failed');
        const presetsEl = document.getElementById('stats-presets-list');

        if (totalEl) totalEl.textContent = data.total_sent || 0;
        if (rateEl) rateEl.textContent = (data.success_rate || 0) + '%';
        if (batchEl) batchEl.textContent = data.total_batches || 0;
        if (failedEl) failedEl.textContent = data.total_failed || 0;

        if (presetsEl && data.most_used_presets && data.most_used_presets.length > 0) {
            presetsEl.innerHTML = '<div class="stats-presets-title">常用预设</div>' +
                data.most_used_presets.map(p => `<div class="stats-preset-item"><span>${p.name}</span><span class="stats-preset-count">${p.count} 次</span></div>`).join('');
        } else if (presetsEl) {
            presetsEl.innerHTML = '';
        }
    } catch (e) {
        // Silently fail — stats are optional
    }
}

// --- Send History ---
function initSendHistory() {
    const section = document.getElementById('send-history-section');
    const refreshBtn = document.getElementById('refresh-history-btn');
    const clearBtn = document.getElementById('clear-history-btn');

    if (section) {
        section.addEventListener('toggle', () => {
            if (section.open) loadSendHistory();
        });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', loadSendHistory);
    if (clearBtn) clearBtn.addEventListener('click', clearSendHistory);
}

async function loadSendHistory() {
    const list = document.getElementById('send-history-list');
    const badge = document.getElementById('send-history-count');
    if (!list) return;

    list.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await apiFetch('/api/v1/send/history?limit=50');
        const data = await res.json();
        const items = data.items || [];
        if (badge) badge.textContent = data.total > 0 ? data.total : '';

        if (items.length === 0) {
            list.innerHTML = '<div class="empty-state small"><p>暂无发送记录</p></div>';
            return;
        }

        list.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = `send-history-item ${item.success ? '' : 'failed'}`;
            const time = new Date(item.timestamp).toLocaleTimeString();
            const statusIcon = item.success ? '✅' : '❌';
            const errorHtml = item.error ? `<span class="history-error">${item.error}</span>` : '';
            el.innerHTML = `
                <span class="history-status">${statusIcon}</span>
                <span class="history-text" title="${item.text}">${item.text}</span>
                ${errorHtml}
                <span class="history-time">${time}</span>
                <button class="btn btn-sm btn-ghost history-resend" type="button" title="重新发送">↻</button>
            `;
            const resendBtn = el.querySelector('.history-resend');
            if (resendBtn) {
                resendBtn.addEventListener('click', async () => {
                    try {
                        await apiFetch('/api/v1/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: item.text })
                        });
                        showToast('已重新发送', 'success');
                        loadSendHistory();
                    } catch (e) {
                        if (e.message !== 'AUTH_REQUIRED') showToast('发送失败', 'error');
                    }
                });
            }
            list.appendChild(el);
        });
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') {
            list.innerHTML = '<div class="empty-state small"><p>加载历史失败</p></div>';
        }
    }
}

async function clearSendHistory() {
    try {
        await apiFetch('/api/v1/send/history', { method: 'DELETE' });
        showToast('发送历史已清空', 'success');
        loadSendHistory();
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('清空失败', 'error');
    }
}

// --- AI Scene Templates ---
const SCENE_TEMPLATES = [
    { name: '交通检查', category: '执法', scenario: '一名警官在路边拦停一辆可疑车辆进行例行检查，要求驾驶员出示证件', style: '专业、严肃', textType: 'mixed' },
    { name: '嫌疑人搜身', category: '执法', scenario: '警察将嫌疑人靠墙站立并进行搜身检查，搜出了可疑物品', style: '紧张、专业', textType: 'mixed' },
    { name: '急救现场', category: '医疗', scenario: '急救人员赶到事故现场对一名受伤的市民进行紧急救治和伤口包扎', style: '紧张、专业', textType: 'mixed' },
    { name: '医院问诊', category: '医疗', scenario: '医生在诊室中为患者做检查问诊，记录病历并给出治疗建议', style: '严谨、关切', textType: 'mixed' },
    { name: '车辆维修', category: '生活', scenario: '技师在修车铺中检查和修理客户送来的一辆损坏的车辆', style: '细致、技术性', textType: 'mixed' },
    { name: '餐厅用餐', category: '生活', scenario: '服务员在高档餐厅中接待客人点菜并送上美食', style: '优雅、热情', textType: 'mixed' },
    { name: '钓鱼度假', category: '生活', scenario: '一个人坐在湖边安静地钓鱼，享受难得的假日时光', style: '悠闲、惬意', textType: 'mixed' },
    { name: '黑帮审问', category: '犯罪', scenario: '一个愤怒的黑帮老大在废弃仓库中审问叛徒', style: '冷峻、压迫感', textType: 'mixed' },
    { name: '毒品交易', category: '犯罪', scenario: '两帮人在偏僻停车场进行一笔紧张的毒品现金交易', style: '紧张、危险', textType: 'mixed' },
    { name: '银行抢劫', category: '犯罪', scenario: '几名蒙面劫匪闯入银行大厅，挟持人质要求金库密码', style: '紧张、激烈', textType: 'mixed' },
    { name: '商务谈判', category: '商业', scenario: '两家公司的代表在会议室进行一场重要的商务合作谈判', style: '正式、犀利', textType: 'mixed' },
    { name: '房产交易', category: '商业', scenario: '房产经纪人带客户看房并介绍房源优势，促成签约', style: '热情、专业', textType: 'mixed' },
];

// ── Custom scene templates (localStorage persistence) ────────────────────
const _CUSTOM_TEMPLATES_KEY = 'vancesender_custom_scene_templates';

function _loadCustomTemplates() {
    try {
        const raw = localStorage.getItem(_CUSTOM_TEMPLATES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function _saveCustomTemplates(templates) {
    try {
        localStorage.setItem(_CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
    } catch { /* quota exceeded — ignore */ }
}

function saveCurrentAsTemplate() {
    const scenario = (dom.aiScenario?.value || '').trim();
    const style = (dom.aiStyle?.value || '').trim();
    if (!scenario) {
        showToast('请先填写场景描述再保存模板', 'error');
        return;
    }

    // Prompt for a name
    const name = prompt('为模板起个名字：');
    if (!name || !name.trim()) return;

    const textTypeRadio = document.querySelector('input[name="ai-type"]:checked');
    const textType = textTypeRadio ? textTypeRadio.value : 'mixed';

    const customs = _loadCustomTemplates();
    customs.push({
        id: 'ct_' + Date.now(),
        name: name.trim(),
        category: '⭐ 自定义',
        scenario,
        style,
        textType,
        custom: true,
    });
    _saveCustomTemplates(customs);
    renderSceneTemplates();
    showToast(`模板「${name.trim()}」已保存`, 'success');
}

function deleteCustomTemplate(templateId) {
    const customs = _loadCustomTemplates().filter(t => t.id !== templateId);
    _saveCustomTemplates(customs);
    renderSceneTemplates();
    showToast('自定义模板已删除', 'info');
}

function renderSceneTemplates() {
    const bar = document.getElementById('scene-templates-bar');
    if (!bar) return;

    // Merge built-in + custom templates
    const customs = _loadCustomTemplates();
    const allTemplates = [...customs, ...SCENE_TEMPLATES];

    // Group by category — custom first
    const categories = {};
    allTemplates.forEach(t => {
        const cat = t.category || '其他';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(t);
    });

    bar.innerHTML = '';

    for (const [cat, templates] of Object.entries(categories)) {
        const group = document.createElement('div');
        group.className = 'scene-template-group';
        group.innerHTML = `<span class="scene-template-category">${cat}</span>`;
        templates.forEach(t => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'btn btn-sm btn-outline scene-template-pill';
            if (t.custom) pill.classList.add('scene-template-custom');
            pill.textContent = t.name;
            pill.title = t.scenario;
            pill.addEventListener('click', () => applySceneTemplate(t));

            // Add delete button for custom templates
            if (t.custom && t.id) {
                const delBtn = document.createElement('span');
                delBtn.className = 'scene-template-delete';
                delBtn.textContent = '×';
                delBtn.title = '删除此模板';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteCustomTemplate(t.id);
                });
                pill.appendChild(delBtn);
            }

            group.appendChild(pill);
        });
        bar.appendChild(group);
    }

    // Add "save as template" button at the end
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-sm btn-outline scene-template-pill scene-template-save';
    saveBtn.innerHTML = '💾 保存为模板';
    saveBtn.title = '将当前场景描述和风格保存为自定义模板';
    saveBtn.addEventListener('click', saveCurrentAsTemplate);
    bar.appendChild(saveBtn);
}

function applySceneTemplate(template) {
    if (dom.aiScenario) dom.aiScenario.value = template.scenario;
    if (dom.aiStyle) dom.aiStyle.value = template.style || '';
    // Set text type radio
    const radio = document.querySelector(`input[name="ai-type"][value="${template.textType || 'mixed'}"]`);
    if (radio) radio.checked = true;
    showToast(`已应用模板「${template.name}」`, 'success');
}

// --- AI Panel Logic ---
function initAIPanel() {
    renderSceneTemplates();
    dom.aiGenerateBtn.addEventListener('click', generateAI);

    // Temperature slider live update
    if (dom.aiTemperature && dom.aiTemperatureLabel) {
        dom.aiTemperature.addEventListener('input', () => {
            dom.aiTemperatureLabel.textContent = dom.aiTemperature.value;
        });
    }

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

// ── Friendly AI error mapping ────────────────────────────────────────────
const _AI_ERROR_MAP = [
    { pattern: /invalid.*api.*key|api.*key.*invalid|unauthorized|authentication/i, msg: 'API Key 无效或已过期，请到设置中检查服务商密钥' },
    { pattern: /rate.*limit|too.*many.*requests|429/i, msg: 'AI 服务请求过于频繁，请稍后再试' },
    { pattern: /model.*not.*found|does not exist|no such model/i, msg: '所选模型不存在，请在设置中检查模型名称' },
    { pattern: /insufficient.*quota|billing|exceeded.*quota|payment/i, msg: 'AI 服务余额不足，请检查账户充值情况' },
    { pattern: /timeout|timed.*out|deadline/i, msg: 'AI 服务响应超时，请稍后重试或更换服务商' },
    { pattern: /connection.*refused|connect.*error|network/i, msg: '无法连接到 AI 服务，请检查网络或 API 地址' },
    { pattern: /context.*length|too.*long|max.*tokens/i, msg: '输入内容过长，请缩短场景描述后重试' },
];

function friendlyAIError(rawError) {
    const str = typeof rawError === 'string' ? rawError : String(rawError);
    for (const entry of _AI_ERROR_MAP) {
        if (entry.pattern.test(str)) return entry.msg;
    }
    return str;  // fallback to original message
}

// ── Active stream abort controller (for cancel support) ──────────────────
let _aiStreamAbort = null;
let _aiLastGenTime = 0; // debounce timestamp

async function generateAI() {
    const scenario = dom.aiScenario.value.trim();
    if (!scenario) return showToast('请输入场景描述', 'error');

    // Prevent double-click while already streaming
    if (_aiStreamAbort) {
        _aiStreamAbort.abort();
        _aiStreamAbort = null;
        return;
    }

    const style = (dom.aiStyle?.value || '').trim();
    const providerId = dom.aiProvider.value;
    const type = document.querySelector('input[name="ai-type"]:checked').value;
    const count = parseInt(dom.aiCount.value) || 5;
    const temperature = dom.aiTemperature ? parseFloat(dom.aiTemperature.value) : null;

    // Debounce: prevent rapid clicks within 500ms
    const now = Date.now();
    if (now - _aiLastGenTime < 500) return;
    _aiLastGenTime = now;

    dom.aiGenerateBtn.disabled = false;
    dom.aiGenerateBtn.innerHTML = '<span class="icon">⏹</span> 取消生成';
    dom.aiPreviewList.innerHTML = '';
    state.aiPreview = [];
    dom.aiImportBtn.disabled = true;

    const abortCtrl = new AbortController();
    _aiStreamAbort = abortCtrl;

    // Accumulate raw stream text and parse incrementally
    let rawAccumulator = '';
    let lastRenderedCount = 0;

    try {
        const token = getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const res = await window.fetch('/api/v1/ai/generate/stream', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                scenario,
                provider_id: providerId,
                count,
                text_type: type,
                style: style || null,
                temperature: temperature,
            }),
            signal: abortCtrl.signal,
        });

        if (res.status === 401) {
            const hadToken = Boolean(token);
            clearToken();
            showAuthGate({ showError: hadToken, message: 'Token 错误，请重新输入' });
            throw new Error('AUTH_REQUIRED');
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const detailed = formatApiErrorDetail(errData.detail, res.status);
            throw new Error(detailed);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (value) {
                const text = decoder.decode(value, { stream: !done });
                // Parse SSE lines
                const lines = text.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6);

                    if (payload === '[DONE]') {
                        done = true;
                        break;
                    }

                    // Check for error event
                    try {
                        const parsed = JSON.parse(payload);
                        if (parsed && parsed.error) {
                            showToast('生成失败: ' + friendlyAIError(parsed.error), 'error');
                            done = true;
                            break;
                        }
                    } catch (_) {
                        // Not JSON — it's a text chunk, accumulate it
                    }

                    rawAccumulator += payload;

                    // Try incremental parsing of accumulated text
                    const parsed = _tryParseStreamTexts(rawAccumulator);
                    if (parsed.length > lastRenderedCount) {
                        state.aiPreview = parsed;
                        _renderStreamPreview(parsed, lastRenderedCount);
                        lastRenderedCount = parsed.length;
                    }
                }
            }
        }

        // Final parse of complete accumulated text
        const finalTexts = _tryParseStreamTexts(rawAccumulator);
        if (finalTexts.length > lastRenderedCount) {
            state.aiPreview = finalTexts;
            _renderStreamPreview(finalTexts, lastRenderedCount);
        }

        if (state.aiPreview.length === 0) {
            renderAIPreview();
            showToast('生成失败: 未返回可用文本，请调整场景或服务商重试', 'error');
        } else {
            dom.aiImportBtn.disabled = false;
            showToast(`已生成 ${state.aiPreview.length} 条文本`, 'success');
        }

    } catch (e) {
        if (e.name === 'AbortError') {
            showToast('已取消生成', 'info');
        } else if (e.message !== 'AUTH_REQUIRED') {
            showToast('AI生成错误: ' + friendlyAIError(e.message), 'error');
        }
    } finally {
        _aiStreamAbort = null;
        dom.aiGenerateBtn.disabled = false;
        dom.aiGenerateBtn.innerHTML = '<span class="icon">✨</span> 开始生成';
    }
}

/**
 * Incrementally parse streamed text into structured items.
 * Tries JSON array first, then falls back to /me /do line regex.
 */
function _tryParseStreamTexts(raw) {
    // Try JSON array parse
    const trimmed = raw.trim();
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try {
            const arr = JSON.parse(trimmed.slice(start, end + 1));
            if (Array.isArray(arr)) {
                const items = arr
                    .filter(item => item && typeof item.content === 'string')
                    .map(item => {
                        let t = item.type;
                        if (typeof t === 'string' && t.startsWith('/')) t = t.slice(1);
                        if (!['me', 'do', 'b', 'e'].includes(t)) return null;
                        const c = item.content.trim();
                        return c ? { type: t, content: c } : null;
                    })
                    .filter(Boolean);
                if (items.length > 0) return items;
            }
        } catch (_) { /* JSON incomplete, fall through */ }
    }

    // Fallback: regex line parsing
    const lineRe = /^(?:\d+\.\s*)?\/?(me|do|b|e)\s+(.+)$/gm;
    const results = [];
    let match;
    while ((match = lineRe.exec(raw)) !== null) {
        const content = match[2].trim();
        if (content) results.push({ type: match[1], content });
    }
    return results;
}

/**
 * Render only the newly parsed items into the preview list (incremental).
 */
function _renderStreamPreview(texts, fromIndex) {
    // On first item, clear the empty-state placeholder
    if (fromIndex === 0) {
        dom.aiPreviewList.innerHTML = '';
    }

    for (let i = fromIndex; i < texts.length; i++) {
        const item = texts[i];
        const score = _scoreText(item);
        const card = document.createElement('div');
        card.className = 'text-card ai-stream-card';
        card.style.animation = 'fadeInUp 0.3s ease-out';
        card.innerHTML = `
            <div class="badge badge-${item.type}">/${item.type}</div>
            <div class="text-content">${item.content}</div>
            <span class="quality-badge quality-${score.level}" title="${score.hint}">${score.icon}</span>
        `;
        dom.aiPreviewList.appendChild(card);
    }
}

/**
 * Score text quality based on length and content.
 * Returns { level: 'good'|'warn', icon: string, hint: string }.
 */
function _scoreText(item) {
    const len = item.content.length;
    if (len >= 15 && len <= 75) {
        return { level: 'good', icon: '✅', hint: `${len}字 · 长度合适` };
    } else if (len < 15) {
        return { level: 'warn', icon: '⚠️', hint: `${len}字 · 内容偏短，建议丰富描述` };
    } else {
        return { level: 'warn', icon: '⚠️', hint: `${len}字 · 内容偏长，可能超出游戏限制` };
    }
}

function renderAIPreview() {
    dom.aiPreviewList.innerHTML = '';

    if (!Array.isArray(state.aiPreview) || state.aiPreview.length === 0) {
        dom.aiPreviewList.innerHTML = `
            <div class="empty-state small">
                <div class="empty-icon">✨</div>
                <p>暂无可预览内容，请重新生成</p>
            </div>`;
        return;
    }

    state.aiPreview.forEach(item => {
        const score = _scoreText(item);
        const card = document.createElement('div');
        card.className = 'text-card';
        card.innerHTML = `
            <div class="badge badge-${item.type}">/${item.type}</div>
            <div class="text-content">${item.content}</div>
            <span class="quality-badge quality-${score.level}" title="${score.hint}">${score.icon}</span>
        `;
        dom.aiPreviewList.appendChild(card);
    });
}

// --- Presets Panel Logic ---
function initPresetsPanel() {
    dom.refreshPresetsBtn.addEventListener('click', fetchPresets);

    // Import / Export
    if (dom.importPresetsBtn) {
        dom.importPresetsBtn.addEventListener('click', () => {
            if (dom.presetFileInput) dom.presetFileInput.click();
        });
    }
    if (dom.presetFileInput) {
        dom.presetFileInput.addEventListener('change', importPresetsFromFile);
    }
    if (dom.exportAllPresetsBtn) {
        dom.exportAllPresetsBtn.addEventListener('click', exportAllPresets);
    }

    // Multi-select mode
    if (dom.togglePresetSelectBtn) {
        dom.togglePresetSelectBtn.addEventListener('click', () => {
            enterPresetSelectMode();
        });
    }
    if (dom.cancelPresetSelectBtn) {
        dom.cancelPresetSelectBtn.addEventListener('click', () => {
            exitPresetSelectMode();
        });
    }
    if (dom.batchDeletePresetsBtn) {
        dom.batchDeletePresetsBtn.addEventListener('click', () => {
            batchDeletePresets();
        });
    }
}

function enterPresetSelectMode() {
    state.presetSelectMode = true;
    state.selectedPresetIds.clear();
    dom.togglePresetSelectBtn.classList.add('hidden');
    dom.cancelPresetSelectBtn.classList.remove('hidden');
    dom.batchDeletePresetsBtn.classList.add('hidden');
    dom.presetsGrid.classList.add('preset-select-mode');
    updateBatchDeleteCount();
    renderPresets(state.activeTagFilter
        ? state.presets.filter(p => (p.tags || []).includes(state.activeTagFilter))
        : state.presets
    );
}

function exitPresetSelectMode() {
    state.presetSelectMode = false;
    state.selectedPresetIds.clear();
    dom.togglePresetSelectBtn.classList.remove('hidden');
    dom.cancelPresetSelectBtn.classList.add('hidden');
    dom.batchDeletePresetsBtn.classList.add('hidden');
    dom.presetsGrid.classList.remove('preset-select-mode');
    renderPresets(state.activeTagFilter
        ? state.presets.filter(p => (p.tags || []).includes(state.activeTagFilter))
        : state.presets
    );
}

function updateBatchDeleteCount() {
    const count = state.selectedPresetIds.size;
    if (dom.batchDeleteCount) dom.batchDeleteCount.textContent = count;
    if (count > 0) {
        dom.batchDeletePresetsBtn.classList.remove('hidden');
    } else {
        dom.batchDeletePresetsBtn.classList.add('hidden');
    }
}

async function batchDeletePresets() {
    const ids = Array.from(state.selectedPresetIds);
    if (ids.length === 0) return;
    if (!confirm(`确定删除选中的 ${ids.length} 个预设吗？此操作不可撤销。`)) return;

    try {
        const res = await apiFetch('/api/v1/presets/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        const data = await res.json();
        if (res.ok) {
            // If current preset was among deleted, clear selection
            if (state.currentPresetId && ids.includes(state.currentPresetId)) {
                clearCurrentPresetSelection();
            }
            showToast(data.message || `已删除 ${data.deleted} 个预设`, 'success');
            exitPresetSelectMode();
            await fetchPresets();
        } else {
            showToast(data.detail || '批量删除失败', 'error');
        }
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('批量删除失败', 'error');
    }
}

async function importPresetsFromFile() {
    const file = dom.presetFileInput && dom.presetFileInput.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch {
            showToast('文件不是有效的 JSON 格式', 'error');
            return;
        }
        const res = await apiFetch('/api/v1/presets/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || `成功导入 ${data.imported} 个预设`, 'success');
            await fetchPresets();
        } else {
            showToast(data.detail || '导入失败', 'error');
        }
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('导入预设失败', 'error');
    } finally {
        if (dom.presetFileInput) dom.presetFileInput.value = '';
    }
}

async function exportAllPresets() {
    try {
        const res = await apiFetch('/api/v1/presets/export/all');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vancesender_presets.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('全部预设已导出', 'success');
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('导出失败', 'error');
    }
}

async function exportSinglePreset(presetId, presetName) {
    try {
        const res = await apiFetch(`/api/v1/presets/export/${presetId}`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `preset_${presetName || presetId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`预设 "${presetName}" 已导出`, 'success');
    } catch (e) {
        if (e.message !== 'AUTH_REQUIRED') showToast('导出失败', 'error');
    }
}

async function fetchPresets() {
    dom.presetsGrid.innerHTML = '<div class="loading-spinner"></div>';
    try {
        const res = await apiFetch('/api/v1/presets');
        const data = await res.json();
        state.presets = Array.isArray(data) ? data : [];
        renderPresetTagFilter(state.presets);
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

function renderPresetTagFilter(presets) {
    const container = document.getElementById('preset-tag-filter');
    if (!container) return;

    // Collect all unique tags
    const allTags = new Set();
    presets.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));

    container.innerHTML = '';
    if (allTags.size === 0) return;

    // "All" pill
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = 'btn btn-sm btn-outline tag-filter-pill active';
    allPill.textContent = '全部';
    allPill.addEventListener('click', () => {
        state.activeTagFilter = null;
        container.querySelectorAll('.tag-filter-pill').forEach(p => p.classList.remove('active'));
        allPill.classList.add('active');
        renderPresets(state.presets);
    });
    container.appendChild(allPill);

    allTags.forEach(tag => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'btn btn-sm btn-outline tag-filter-pill';
        pill.textContent = tag;
        pill.addEventListener('click', () => {
            state.activeTagFilter = tag;
            container.querySelectorAll('.tag-filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderPresets(state.presets.filter(p => (p.tags || []).includes(tag)));
        });
        container.appendChild(pill);
    });
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

    const isSelectMode = state.presetSelectMode;

    presets.forEach(p => {
        const el = document.createElement('div');
        el.className = 'preset-card glass-card';
        el.dataset.presetId = p.id;

        // In select mode, add selected class if applicable
        if (isSelectMode && state.selectedPresetIds.has(p.id)) {
            el.classList.add('selected');
        }

        // Disable drag in select mode
        el.draggable = !isSelectMode;

        // Build tags HTML
        const tagsHtml = (p.tags && p.tags.length > 0)
            ? `<div class="preset-tags">${p.tags.map(t => `<span class="preset-tag-badge">${t}</span>`).join('')}</div>`
            : '';

        // Build checkbox HTML for select mode
        const checkboxHtml = isSelectMode
            ? `<label class="preset-select-checkbox" onclick="event.stopPropagation()">
                   <input type="checkbox" ${state.selectedPresetIds.has(p.id) ? 'checked' : ''} />
                   <span class="preset-checkbox-mark"></span>
               </label>`
            : '';

        el.innerHTML = `
            ${checkboxHtml}
            <div class="preset-name">${p.name}</div>
            ${tagsHtml}
            <div class="preset-meta">
                <span>${p.texts.length} 条文本</span>
                <span>${new Date(p.created_at).toLocaleDateString()}</span>
            </div>
            ${!isSelectMode ? `
            <div class="preset-card-actions">
                <button class="export-preset btn btn-sm btn-ghost" data-id="${p.id}" data-name="${p.name}" type="button" title="导出此预设">
                    📥 导出
                </button>
                <button class="rewrite-preset btn btn-sm btn-ghost" data-id="${p.id}" type="button" title="AI重写整套预设">
                    ✨ 重写
                </button>
            </div>
            <button class="delete-preset" data-id="${p.id}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>` : ''}
        `;

        if (isSelectMode) {
            // Toggle selection on card click
            el.addEventListener('click', (e) => {
                if (state.selectedPresetIds.has(p.id)) {
                    state.selectedPresetIds.delete(p.id);
                    el.classList.remove('selected');
                } else {
                    state.selectedPresetIds.add(p.id);
                    el.classList.add('selected');
                }
                // Sync checkbox
                const cb = el.querySelector('.preset-select-checkbox input');
                if (cb) cb.checked = state.selectedPresetIds.has(p.id);
                updateBatchDeleteCount();
            });

            // Checkbox change
            const cb = el.querySelector('.preset-select-checkbox input');
            if (cb) {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        state.selectedPresetIds.add(p.id);
                        el.classList.add('selected');
                    } else {
                        state.selectedPresetIds.delete(p.id);
                        el.classList.remove('selected');
                    }
                    updateBatchDeleteCount();
                });
            }
        } else {
            // Normal mode: click to load preset
            el.addEventListener('click', (e) => {
                if (e.target.closest('.delete-preset') || e.target.closest('.rewrite-preset') || e.target.closest('.export-preset')) return;
                loadPreset(p);
            });

            const rewriteBtn = el.querySelector('.rewrite-preset');
            rewriteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.openPresetRewrite(p.id);
            });

            const exportBtn = el.querySelector('.export-preset');
            if (exportBtn) {
                exportBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    exportSinglePreset(p.id, p.name);
                });
            }

            const deleteBtn = el.querySelector('.delete-preset');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.deletePreset(p.id, e);
            });

            // Drag and drop for reordering
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', p.id);
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => el.classList.remove('dragging'));
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                el.classList.add('drag-over');
            });
            el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
            el.addEventListener('drop', async (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId === p.id) return;
                const ids = Array.from(dom.presetsGrid.querySelectorAll('.preset-card')).map(c => c.dataset.presetId);
                const fromIdx = ids.indexOf(draggedId);
                const toIdx = ids.indexOf(p.id);
                if (fromIdx === -1 || toIdx === -1) return;
                ids.splice(fromIdx, 1);
                ids.splice(toIdx, 0, draggedId);
                try {
                    await apiFetch('/api/v1/presets/reorder', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids })
                    });
                    await fetchPresets();
                    showToast('预设顺序已更新', 'success');
                } catch (err) {
                    if (err.message !== 'AUTH_REQUIRED') showToast('排序失败', 'error');
                }
            });
        }

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
        rememberQuickSendPresetId('');
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

    const currentValid = state.presets.some((preset) => preset.id === state.currentQuickPresetId);
    if (!currentValid) {
        const rememberedPresetId = readRememberedQuickSendPresetId();
        const rememberedValid = state.presets.some((preset) => preset.id === rememberedPresetId);
        state.currentQuickPresetId = rememberedValid ? rememberedPresetId : state.presets[0].id;
    }

    dom.quickSendPresetSelect.value = state.currentQuickPresetId;
    rememberQuickSendPresetId(state.currentQuickPresetId);
    renderQuickSendList();
}

function renderQuickSendList() {
    if (!dom.quickSendList) return;

    const preset = state.presets.find((item) => item.id === state.currentQuickPresetId);

    dom.quickSendList.innerHTML = '';

    if (!preset || !Array.isArray(preset.texts) || preset.texts.length === 0) {
        dom.quickSendList.innerHTML = `
        < div class="empty-state small" >
            <p>当前预设暂无可发送文本</p>
            </div > `;
        return;
    }

    preset.texts.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quick-send-item';

        const badge = document.createElement('span');
        badge.className = `badge badge - ${item.type} `;
        badge.textContent = `/ ${item.type} `;

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
            const textToSend = `/ ${item.type} ${item.content} `;
            button.disabled = true;

            const dismissed = await dismissQuickPanelForSend();
            if (isQuickPanelMode() && !dismissed) {
                showToast('无法自动隐藏快捷面板，请手动切回游戏窗口', 'error');
            }

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
            showToast('重写失败: ' + friendlyAIError(formatApiErrorDetail(rewritePayload.detail, rewriteRes.status)), 'error');
            return;
        }

        const rewritten = (Array.isArray(rewritePayload.texts) ? rewritePayload.texts : [])
            .map((item) => {
                if (!item || (item.type !== 'me' && item.type !== 'do' && item.type !== 'b') || typeof item.content !== 'string') {
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
            showToast('重写失败: ' + friendlyAIError(e.message), 'error');
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
        const res = await apiFetch(`/ api / v1 / presets / ${state.currentPresetId} `, {
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
        showToast(`热键已设置为 ${captured} `, 'success');
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
        customHeaders: dom.settingCustomHeaders?.value || '',
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
        dom.settingCustomHeaders,
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
            const res = await apiFetch(`/ api / v1 / ai / test / ${id} `, { method: 'POST' });
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
    const currentVersionText = String(data.current_version || '').trim();
    const latestVersionText = String(data.latest_version || '').trim();

    if (dom.homeCurrentVersion) {
        dom.homeCurrentVersion.textContent = currentVersionText || dom.homeCurrentVersion.textContent || '-';
    }

    if (dom.homeLatestVersion) {
        dom.homeLatestVersion.textContent = latestVersionText || '-';
    }

    const message = data.message || '检查完成';
    const hasUpdate = Boolean(data.success && data.update_available && latestVersionText);
    if (!hasUpdate) {
        state.homeUpdateBannerDismissed = false;
    }
    const shouldShowBanner = hasUpdate && !state.homeUpdateBannerDismissed;
    const updateStatusText = hasUpdate
        ? `发现新版本 v${latestVersionText}，可前往发布页下载更新`
        : message;

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

    if (!dom.homeCheckUpdateBtn) return;
    if (state.updateCheckInProgress) {
        if (!silent) {
            showToast('正在检查更新，请稍候', 'info');
        }
        return;
    }

    state.updateCheckInProgress = true;
    const previousHomeLabel = dom.homeCheckUpdateBtn.textContent || '立即检查更新';

    dom.homeCheckUpdateBtn.disabled = true;
    if (!silent) {
        dom.homeCheckUpdateBtn.textContent = '检查中...';
    }

    if (dom.homeUpdateStatus) {
        dom.homeUpdateStatus.textContent = '正在检查更新...';
    }

    if (dom.homeUpdateTip) {
        dom.homeUpdateTip.classList.add('hidden');
        dom.homeUpdateTip.textContent = '';
    }

    if (dom.homeUpdateReleaseLink) {
        dom.homeUpdateReleaseLink.classList.add('hidden');
        dom.homeUpdateReleaseLink.removeAttribute('href');
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
        const includePrerelease = dom.homeIncludePrerelease?.checked ? 'true' : 'false';
        const res = await apiFetch(`/api/v1/settings/update-check?include_prerelease=${includePrerelease}`);
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
                showToast(`发现新版本: ${data.latest_version}。${UPDATE_GUIDE_TEXT} `, 'success');
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
                current_version: dom.homeCurrentVersion?.textContent || '',
                latest_version: dom.homeLatestVersion?.textContent || '',
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
        dom.homeCheckUpdateBtn.disabled = false;
        if (!silent) {
            dom.homeCheckUpdateBtn.textContent = previousHomeLabel;
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

    // Overlay theme
    const overlayTheme = quickOverlay.theme || {};
    if (dom.settingOverlayBgOpacity) {
        dom.settingOverlayBgOpacity.value = overlayTheme.bg_opacity ?? 0.92;
        const opVal = document.getElementById('overlay-opacity-value');
        if (opVal) opVal.textContent = dom.settingOverlayBgOpacity.value;
        dom.settingOverlayBgOpacity.addEventListener('input', () => {
            if (opVal) opVal.textContent = dom.settingOverlayBgOpacity.value;
        });
    }
    if (dom.settingOverlayAccentColor) dom.settingOverlayAccentColor.value = overlayTheme.accent_color || '#7c5cff';
    if (dom.settingOverlayFontSize) dom.settingOverlayFontSize.value = overlayTheme.font_size ?? 12;

    // Custom headers
    const customHeaders = data.ai.custom_headers || {};
    dom.settingCustomHeaders.value = Object.keys(customHeaders).length > 0
        ? JSON.stringify(customHeaders, null, 2)
        : '';

    // Token display
    dom.settingToken.value = '';
    dom.settingToken.placeholder = data.server.token_set ? '已设置 (输入新值可更新)' : '留空则不启用认证';

    if (dom.homeCurrentVersion) {
        dom.homeCurrentVersion.textContent = data.server.app_version || '-';
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
                poll_interval_ms: parseInt(dom.settingOverlayPollIntervalMs.value),
                theme: {
                    bg_opacity: parseFloat(dom.settingOverlayBgOpacity?.value ?? 0.92),
                    accent_color: dom.settingOverlayAccentColor?.value || '#7c5cff',
                    font_size: parseInt(dom.settingOverlayFontSize?.value ?? 12)
                }
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
