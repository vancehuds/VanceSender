# AGENTS.md

## Purpose
This document guides autonomous coding agents working in `D:\gitbranch\VanceSender`.
It is evidence-based from the current repo state and avoids assumptions.

## Repo Snapshot
- Stack: Python FastAPI backend + static web frontend (Vanilla JS/CSS/HTML).
- Entry point: `main.py`.
- API router root: `app/api/routes/__init__.py` with `/api/v1` prefix.
- Core logic: `app/core/*`.
- Schemas: `app/api/schemas.py` (Pydantic v2).
- Frontend: `app/web/*` served via `/static`.

## Source-of-Truth Files
- Runtime and launch args: `main.py`, `README.md`, `start.bat`
- Dependency list: `requirements.txt`
- Type checking config: `pyrightconfig.json`, `basedpyrightconfig.json`
- API shape and behavior: `API.md`, `app/api/routes/*`, `app/api/schemas.py`
- Config and persistence: `app/core/config.py`, `.gitignore`

## Build / Lint / Test / Typecheck Commands

### Verified working commands in this repo
- Install deps:
  - `pip install -r requirements.txt`
- Upgrade pip (optional, documented):
  - `python -m pip install --upgrade pip`
- Run app (local only):
  - `python main.py`
- Run app with LAN access:
  - `python main.py --lan`
- Run app with custom port:
  - `python main.py --port 9000`
- Combined run flags:
  - `python main.py --lan --port 9000`
- One-click Windows startup (creates/uses `.venv`, installs deps as needed, then runs app):
  - `start.bat`
  - `start.bat --lan`
  - `start.bat --port 9000`

### Build status
- No explicit build command is defined in repo scripts/config.
- There is no `pyproject.toml`, `Makefile`, `justfile`, `package.json`, `nx.json`, or `turbo.json`.

### Lint status
- No lint command is defined in repo scripts/config.
- No repo lint config files found (`ruff.toml`, `.ruff.toml`, `.flake8`, etc.).

### Typecheck status
- Typecheck configs exist:
  - `pyrightconfig.json`
  - `basedpyrightconfig.json`
- `typeCheckingMode` is `basic`.
- No repo task runner script is defined for typecheck.
- If your environment has tool binaries installed, typical direct commands are:
  - `pyright`
  - `basedpyright`
  (These are tool-default invocations, not repo-defined scripts.)

### Test status
- No test suite is currently present in this repository.
- No test config file found (`pytest.ini`, `pyproject.toml` test section, etc.).
- No test files found (`tests/`, `test_*.py`, `*_test.py`).

### Running a single test (important)
- Currently **not applicable** in this repo because no tests are present.
- Therefore, there is no evidence-backed single-file or single-case test command to run today.

## Code Style Conventions (Observed)

### Python conventions
- Import order is consistent:
  1. `from __future__ import annotations`
  2. standard library imports
  3. third-party imports
  4. local `app.*` imports
- Keep one blank line between import groups.
- Use 4-space indentation and double quotes.
- Use module/function docstrings with triple double quotes.
- Naming:
  - Functions/variables: `snake_case`
  - Classes: `PascalCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Internal helpers: `_prefixed_snake_case`
- Typing style:
  - Prefer modern syntax: `list[str]`, `dict[str, Any]`, `str | None`
  - Use `Literal[...]` where domain is fixed (see schemas).
- Pydantic style (v2):
  - Define API DTOs in `app/api/schemas.py`
  - Use `Field(...)` constraints
  - Use `model_dump()` when serializing model instances

### FastAPI / API route conventions
- Keep route handlers thin; core behavior belongs in `app/core/*`.
- Validate and translate domain errors into `HTTPException` with explicit status.
- Use response models consistently (`response_model=...`).
- For partial updates, filter out `None` fields from request DTOs before patching.
- Follow existing status mapping patterns:
  - 400 for invalid request/business input
  - 401 for auth failure
  - 404 for missing resources
  - 502 for upstream AI provider errors

### Error handling conventions
- Avoid silent failures.
- If catching broad exceptions, convert into structured error details.
- In AI routes, include rich fields when available (`error_type`, `status_code`, `request_id`, `body`).
- In sender flows, ensure cancellation/state cleanup on failure paths.

### Frontend conventions (`app/web/js/app.js`)
- Vanilla JS only (no framework).
- Prefer `async/await` over `.then()` chains.
- Use `camelCase` for variables/functions.
- Use single quotes and semicolons.
- Keep shared app state in central `state` object.
- Route API calls through `apiFetch()` to keep auth behavior consistent.
- Show user-visible outcomes via `showToast()`.
- Render/update DOM via dedicated render helpers (`renderTextList`, `renderPresets`, etc.).

### CSS / HTML conventions
- CSS uses custom properties (`:root` variables) for theme tokens.
- Use utility-like component classes (`glass-card`, `btn-*`, `panel`, etc.).
- Maintain existing dark/glass visual language unless asked to redesign.

## Module Boundaries You Should Respect
- `main.py`: app composition + startup CLI.
- `app/api/routes/*`: transport layer only (HTTP concerns).
- `app/api/schemas.py`: request/response models and validation rules.
- `app/core/*`: reusable business/integration logic.
- `app/web/*`: static UI assets.
- `data/presets/*.json`: runtime-generated preset data.

## Config and Data Handling Rules
- `config.yaml` is local runtime config and is git-ignored.
- `config.yaml.example` is the shareable template.
- Do not commit secrets (tokens/API keys).
- Preset JSON under `data/presets/` is runtime data and git-ignored.

## Testing Expectations for New Work
- There is no existing test harness to extend.
- If you add tests, keep them isolated and clearly document how to run them.
- Do not claim test execution unless test files and commands actually exist.

## Cursor / Copilot Rules
- No `.cursorrules` file found.
- No `.cursor/rules/` directory found.
- No `.github/copilot-instructions.md` found.
- Therefore, there are currently no repository-level Cursor/Copilot instruction overrides to apply.

## Practical Agent Checklist Before Finishing
- Did you use existing module boundaries (`routes` vs `core` vs `schemas`)?
- Did you preserve import ordering and naming style?
- Did you keep typing consistent with pyright basic mode?
- Did you map errors to explicit HTTP status codes where appropriate?
- Did you avoid introducing assumptions about missing build/lint/test pipelines?

## Non-Goals / Anti-Patterns in This Repo Context
- Do not invent npm/make/tox commands that are not defined.
- Do not claim single-test commands exist when there are no tests.
- Do not move business logic into route files when `app/core` is the established home.
- Do not leak raw secrets/tokens in logs or API responses.
