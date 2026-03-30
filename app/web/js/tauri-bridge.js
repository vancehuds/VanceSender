/**
 * Tauri Bridge — replaces pywebview desktop shell integration.
 *
 * When running inside Tauri, window control actions (minimize, maximize,
 * close, hide-to-tray) go through Tauri's native window API instead of
 * the Python FastAPI desktop-window/action endpoint.
 *
 * Detection: Tauri v2 injects `window.__TAURI_INTERNALS__` at startup.
 */

const TauriBridge = (() => {
    /** @returns {boolean} */
    function isTauri() {
        return Boolean(window.__TAURI_INTERNALS__);
    }

    /** Lazy-load Tauri window API */
    async function getWindowApi() {
        if (!isTauri()) return null;
        try {
            return window.__TAURI__.window;
        } catch {
            return null;
        }
    }

    /** Get the current (main) Tauri window */
    async function getCurrentWindow() {
        const api = await getWindowApi();
        if (!api) return null;
        return api.getCurrentWindow();
    }

    /**
     * Perform a window action via Tauri native API.
     * @param {string} action - minimize | maximize | restore | toggle_maximize | hide_to_tray | show | exit | close
     * @returns {Promise<{active: boolean, maximized: boolean}>}
     */
    async function performWindowAction(action) {
        const win = await getCurrentWindow();
        if (!win) {
            throw new Error('Tauri window not available');
        }

        switch (action) {
            case 'minimize':
                await win.minimize();
                return { active: true, maximized: false };

            case 'maximize':
                await win.maximize();
                return { active: true, maximized: true };

            case 'restore':
                await win.unmaximize();
                return { active: true, maximized: false };

            case 'toggle_maximize': {
                const isMax = await win.isMaximized();
                if (isMax) {
                    await win.unmaximize();
                } else {
                    await win.maximize();
                }
                return { active: true, maximized: !isMax };
            }

            case 'hide_to_tray':
                await win.hide();
                return { active: true, maximized: false };

            case 'show':
                await win.show();
                await win.setFocus();
                return { active: true, maximized: await win.isMaximized() };

            case 'exit':
            case 'close':
                // Exit the entire Tauri app (kills sidecar too)
                try {
                    const { exit } = window.__TAURI__.process;
                    await exit(0);
                } catch {
                    // fallback: just close the window
                    await win.close();
                }
                return { active: false, maximized: false };

            default:
                throw new Error(`Unknown window action: ${action}`);
        }
    }

    /**
     * Start dragging the window (for custom titlebar).
     * Call this on mousedown of the drag region.
     */
    async function startDragging() {
        const win = await getCurrentWindow();
        if (win) {
            await win.startDragging();
        }
    }

    return {
        isTauri,
        performWindowAction,
        startDragging,
    };
})();
