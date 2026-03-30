# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VanceSender is a FiveM `/me` `/do` roleplay text sender with AI generation, built as a Python desktop app with a web UI. It simulates keyboard input to send text into FiveM's chat, supports multiple AI providers, and runs as an embedded WebView window with system tray integration.

## Development Commands

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dev dependencies (Tailwind CSS only)
npm install

# Run development server
python main.py                # localhost:8730 with embedded webview
python main.py --lan          # LAN access (0.0.0.0)
python main.py --port 9000    # Custom port
python main.py --no-webview   # Browser-only mode, no desktop window

# Rebuild Tailwind CSS (after changing styles)
npx tailwindcss -i app/web/css/input.css -o app/web/css/tailwind.css

# Build Windows executable
pyinstaller vancesender.spec
```

There are no automated tests configured (`npm test` is a stub).

## Architecture

### Backend (Python / FastAPI)

- **Entry point:** `main.py` — starts Uvicorn server, optional pywebview desktop window, and system tray
- **API:** FastAPI app at `/api/v1/*` with optional Bearer token auth (`app/api/auth.py`)
- **Routes:** `app/api/routes/` — 6 modules: `ai.py`, `sender.py`, `presets.py`, `settings.py`, `stats.py`, `tunnel.py`
- **Schemas:** `app/api/schemas.py` — Pydantic v2 models for all request/response validation
- **Core logic:** `app/core/` — business logic, Windows integration, AI clients, config management

### Key Core Modules

| Module | Purpose |
|--------|---------|
| `sender.py` | Windows keyboard/clipboard simulation via ctypes SendInput API |
| `ai_client.py` | OpenAI-compatible multi-provider client (OpenAI, DeepSeek, Ollama) |
| `ai_gemini.py` | Google Gemini-specific AI client |
| `ai_conversation_tree.py` | AI-driven branching narrative/story tree system |
| `config.py` | Thread-safe YAML config with mtime-based caching |
| `quick_overlay.py` | Global hotkey listener + popup preset selector overlay |
| `desktop_shell.py` | pywebview embedded window + pystray system tray |
| `tunnel.py` | Cloudflare Tunnel management with auto cloudflared installation |

### Frontend (Vanilla JS)

- **Location:** `app/web/` — HTML, CSS, JS served as static files
- **No build framework** — vanilla JavaScript, no bundler or transpiler
- **Styling:** Tailwind CSS v3 with macOS-inspired dark glassmorphic theme
- **i18n:** `app/web/js/i18n.js` — attribute-based (`data-i18n`, `data-i18n-placeholder`) Chinese/English
- **SPA routing:** Panel switching in `app/web/js/app.js`

### Data & Config

- **Config file:** `config.yaml` (YAML) — server, sender, AI providers, overlay, tunnel settings
- **Config template:** `config.yaml.example`
- **Presets:** Individual JSON files in `%LOCALAPPDATA%\VanceSender\data\presets\`
- **Runtime data path:** `%LOCALAPPDATA%\VanceSender\` (resolved by `app/core/runtime_paths.py`)

## Key Patterns

- **SSE streaming** for long-running operations (batch send progress, AI generation) — routes yield `text/event-stream` responses
- **Multi-provider AI abstraction** — OpenAI-compatible endpoint for most providers, separate Gemini client
- **Thread-safe config** — `load_config()` uses file mtime to cache/reload; `update_config()` does atomic writes via temp file
- **Windows-only sender** — `app/core/sender.py` uses ctypes WinDLL for keyboard simulation; clipboard method (`pyperclip`) as alternative to typing method
- **Atomic file writes** throughout for crash safety (write to temp, then rename)

## CI/CD

- `.github/workflows/package-windows.yml` — PyInstaller build on Windows runner, uploads to GitHub Releases
- `.github/workflows/package-beta.yml` — Pre-release builds
- `.github/workflows/deploy-pages-docs.yml` — Documentation deployment to GitHub Pages
- `pages/` directory is the GitHub Pages static site

## Language

The codebase, comments, and commit messages use a mix of English and Chinese. The README and most user-facing strings are in Chinese with i18n English translations available.
