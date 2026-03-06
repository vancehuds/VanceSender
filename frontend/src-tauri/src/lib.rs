use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager,
};

/// Global handle to the backend child process so we can kill it on exit.
static BACKEND_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Default backend port when no config is found.
const DEFAULT_PORT: u16 = 8730;

/// Minimal structure to extract port from config.yaml.
#[derive(Deserialize, Default)]
struct PartialConfig {
    server: Option<ServerConfig>,
}

#[derive(Deserialize, Default)]
struct ServerConfig {
    port: Option<u16>,
}

/// Stored backend port, determined at startup.
struct BackendPort(u16);

#[tauri::command]
fn get_desktop_context() -> serde_json::Value {
    serde_json::json!({
        "isDesktop": true,
        "platform": "tauri",
    })
}

/// Return the port the Python backend is listening on.
#[tauri::command]
fn get_backend_port(state: tauri::State<'_, BackendPort>) -> u16 {
    state.0
}

/// Read the backend port from config.yaml.
///
/// The Python backend resolves its config directory as follows:
///   - Frozen (PyInstaller): `%LOCALAPPDATA%/VanceSender/config.yaml`
///   - Dev: project source root (not applicable for Tauri production builds)
fn read_port_from_config() -> u16 {
    let config_path = resolve_config_path();

    let content = match config_path.and_then(|p| fs::read_to_string(&p).ok()) {
        Some(c) => c,
        None => return DEFAULT_PORT,
    };

    // Parse just the server.port field
    match serde_yaml::from_str::<PartialConfig>(&content) {
        Ok(cfg) => cfg
            .server
            .and_then(|s| s.port)
            .unwrap_or(DEFAULT_PORT),
        Err(_) => DEFAULT_PORT,
    }
}

/// Resolve the path to config.yaml, mirroring the Python runtime_paths logic.
fn resolve_config_path() -> Option<PathBuf> {
    // Try %LOCALAPPDATA%/VanceSender/config.yaml (frozen production path)
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let p = PathBuf::from(local_app_data)
            .join("VanceSender")
            .join("config.yaml");
        if p.exists() {
            return Some(p);
        }
    }

    // Fallback: ~/.vancesender/config.yaml
    if let Some(home) = dirs::home_dir() {
        let p = home.join(".vancesender").join("config.yaml");
        if p.exists() {
            return Some(p);
        }
    }

    None
}

/// Locate and spawn the Python backend (`VanceSender.exe`).
/// The backend binary is bundled as a Tauri resource under `backend/`.
fn spawn_backend(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource dir: {e}"))?;

    let backend_exe = resource_dir.join("backend").join("VanceSender.exe");

    if !backend_exe.exists() {
        return Err(format!("Backend executable not found: {}", backend_exe.display()).into());
    }

    log::info!("Starting backend: {}", backend_exe.display());

    let child = Command::new(&backend_exe)
        .arg("--no-webview")
        .current_dir(
            backend_exe
                .parent()
                .unwrap_or(&resource_dir),
        )
        .spawn()
        .map_err(|e| format!("Failed to spawn backend: {e}"))?;

    log::info!("Backend started with PID: {}", child.id());

    if let Ok(mut guard) = BACKEND_PROCESS.lock() {
        *guard = Some(child);
    }

    Ok(())
}

/// Kill the backend process gracefully on app exit.
fn kill_backend() {
    if let Ok(mut guard) = BACKEND_PROCESS.lock() {
        if let Some(ref mut child) = *guard {
            log::info!("Stopping backend process (PID: {})...", child.id());
            let _ = child.kill();
            let _ = child.wait();
            log::info!("Backend process stopped.");
        }
        *guard = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Read the port early, before building the app
    let port = read_port_from_config();
    log::info!("Backend port resolved to: {}", port);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(BackendPort(port))
        .setup(|app| {
            // Logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start the Python backend
            if let Err(e) = spawn_backend(app) {
                log::error!("Backend launch failed: {e}");
                // Continue anyway — the UI will show connection errors
            }

            // System tray
            let quit = MenuItemBuilder::with_id("quit", "退出 VanceSender").build(app)?;
            let show = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("VanceSender")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => {
                        kill_backend();
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                kill_backend();
            }
        })
        .invoke_handler(tauri::generate_handler![get_desktop_context, get_backend_port])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
