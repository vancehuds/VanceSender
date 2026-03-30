// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::Write;
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Holds the sidecar child process so we can kill it on exit.
struct SidecarState(Mutex<Option<CommandChild>>);

/// Simple file logger for debugging startup issues
struct Logger {
    file: Mutex<File>,
}

impl Logger {
    fn new(path: &std::path::Path) -> std::io::Result<Self> {
        let file = File::create(path)?;
        Ok(Logger { file: Mutex::new(file) })
    }
    
    fn log(&self, msg: &str) {
        if let Ok(mut f) = self.file.lock() {
            let timestamp = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(f, "[{}] {}", timestamp, msg);
            let _ = f.flush();
        }
        eprintln!("{}", msg);
    }
}

fn get_log_path() -> std::path::PathBuf {
    // Use temp directory for logs
    std::env::temp_dir().join("vancesender-startup.log")
}

/// Launch the Python sidecar server.
fn spawn_sidecar(app: &AppHandle, logger: &Logger) -> Result<CommandChild, String> {
    logger.log("Creating sidecar command...");
    let shell = app.shell();
    let command = shell
        .sidecar("sidecar/vancesender-server")
        .map_err(|e| {
            let msg = format!("Failed to create sidecar command: {e}");
            logger.log(&msg);
            msg
        })?;

    logger.log("Spawning sidecar process...");
    let (mut rx, child) = command
        .args(["--no-webview"])
        .spawn()
        .map_err(|e| {
            let msg = format!("Failed to spawn sidecar: {e}");
            logger.log(&msg);
            msg
        })?;

    logger.log("Sidecar spawned successfully, starting event drain...");

    // Drain sidecar stdout/stderr so pipes don't block
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[sidecar:stdout] {}", text.trim_end());
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[sidecar:stderr] {}", text.trim_end());
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    eprintln!("[sidecar] terminated with code: {:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(child)
}

/// Wait for the Python server to accept TCP connections on the given port.
fn wait_for_server_sync(port: u16, timeout_secs: u64, logger: &Logger) -> bool {
    let addr = format!("127.0.0.1:{port}");
    logger.log(&format!("Waiting for server at {} (timeout: {}s)...", addr, timeout_secs));
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);

    while std::time::Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &addr.parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
        {
            logger.log("Server is ready!");
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    logger.log("Server wait timed out");
    false
}

/// Parse an ICO file, find the largest PNG entry, decode it to RGBA.
fn load_icon_from_ico(ico_data: &[u8], logger: &Logger) -> Option<Image<'static>> {
    logger.log("Loading icon from ICO data...");
    
    // Basic validation
    if ico_data.len() < 6 {
        logger.log("ICO data too short");
        return None;
    }
    
    // ICO header: 2 reserved + 2 type + 2 count
    let count = u16::from_le_bytes([ico_data[4], ico_data[5]]) as usize;
    logger.log(&format!("ICO contains {} images", count));
    
    if count == 0 {
        logger.log("ICO has no images");
        return None;
    }

    // Find the largest image entry
    let mut best_offset = 0usize;
    let mut best_size = 0u32;
    let mut best_data_len = 0usize;
    
    for i in 0..count {
        let entry_base = 6 + i * 16;
        if entry_base + 16 > ico_data.len() {
            logger.log(&format!("Entry {} header out of bounds", i));
            continue;
        }
        
        // width/height: 0 means 256
        let w = if ico_data[entry_base] == 0 { 256u32 } else { ico_data[entry_base] as u32 };
        let h = if ico_data[entry_base + 1] == 0 { 256u32 } else { ico_data[entry_base + 1] as u32 };
        let data_len = u32::from_le_bytes([
            ico_data[entry_base + 8], ico_data[entry_base + 9],
            ico_data[entry_base + 10], ico_data[entry_base + 11],
        ]) as usize;
        let offset = u32::from_le_bytes([
            ico_data[entry_base + 12], ico_data[entry_base + 13],
            ico_data[entry_base + 14], ico_data[entry_base + 15],
        ]) as usize;

        let pixels = w * h;
        if pixels > best_size {
            best_size = pixels;
            best_offset = offset;
            best_data_len = data_len;
        }
    }

    logger.log(&format!("Best icon: {}x{} at offset {}, len {}", 
        (best_size as f64).sqrt() as u32, (best_size as f64).sqrt() as u32, best_offset, best_data_len));

    // Validate bounds
    if best_offset + best_data_len > ico_data.len() {
        logger.log("Icon data out of bounds");
        return None;
    }

    // The entry data should be a PNG (starts with PNG signature)
    let entry_data = &ico_data[best_offset..best_offset + best_data_len];
    
    // Check PNG signature
    if entry_data.len() < 8 || entry_data[0..8] != [137, 80, 78, 71, 13, 10, 26, 10] {
        logger.log("Icon entry is not a valid PNG");
        return None;
    }
    
    let decoder = png::Decoder::new(entry_data);
    match decoder.read_info() {
        Ok(mut reader) => {
            let mut buf = vec![0u8; reader.output_buffer_size()];
            match reader.next_frame(&mut buf) {
                Ok(info) => {
                    buf.truncate(info.buffer_size());
                    logger.log(&format!("Icon loaded: {}x{}", info.width, info.height));
                    Some(Image::new_owned(buf, info.width, info.height))
                }
                Err(e) => {
                    logger.log(&format!("Failed to decode PNG frame: {}", e));
                    None
                }
            }
        }
        Err(e) => {
            logger.log(&format!("Failed to read PNG info: {}", e));
            None
        }
    }
}

fn main() {
    // Initialize logger first thing
    let log_path = get_log_path();
    let logger = match Logger::new(&log_path) {
        Ok(l) => {
            eprintln!("Logging to: {:?}", log_path);
            l
        }
        Err(e) => {
            eprintln!("Failed to create log file: {}", e);
            // Create a dummy logger that only prints to stderr
            // We'll handle this differently
            panic!("Cannot initialize logger");
        }
    };
    
    logger.log("=== VanceSender starting ===");
    logger.log(&format!("Log file: {:?}", log_path));
    logger.log(&format!("Working directory: {:?}", std::env::current_dir()));

    let logger_clone = Logger { file: Mutex::new(logger.file.lock().unwrap().try_clone().unwrap()) };
    
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(move |app| {
            let handle = app.handle().clone();
            logger_clone.log("Tauri setup started");

            // ── System Tray ──────────────────────────────────────────
            logger_clone.log("Building tray menu...");
            let show_item = MenuItemBuilder::with_id("show", "打开主窗口").build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", "退出 VanceSender").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;
            logger_clone.log("Tray menu built");

            logger_clone.log("Loading tray icon...");
            let icon_data = include_bytes!("../icons/icon.ico");
            let icon = match load_icon_from_ico(icon_data, &logger_clone) {
                Some(i) => i,
                None => {
                    logger_clone.log("Failed to load icon, using default");
                    // Try to create a simple default icon
                    let default_rgba = vec![0u8; 32 * 32 * 4];
                    Image::new_owned(default_rgba, 32, 32)
                }
            };
            logger_clone.log("Icon loaded");

            logger_clone.log("Building tray icon...");
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("VanceSender")
                .menu(&tray_menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        if let Some(state) = app.try_state::<SidecarState>() {
                            if let Ok(mut guard) = state.0.lock() {
                                if let Some(child) = guard.take() {
                                    let _ = child.kill();
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            logger_clone.log("Tray icon built");

            // ── Spawn Sidecar ────────────────────────────────────────
            logger_clone.log("Spawning sidecar...");
            match spawn_sidecar(&handle, &logger_clone) {
                Ok(child) => {
                    logger_clone.log("Sidecar spawned, storing state...");
                    if let Some(state) = handle.try_state::<SidecarState>() {
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = Some(child);
                        }
                    }
                }
                Err(e) => {
                    logger_clone.log(&format!("Warning: sidecar spawn failed: {e}"));
                    logger_clone.log("Running without sidecar — start Python server manually.");
                }
            }

            // ── Wait for server & show window ────────────────────────
            let logger_thread = Logger { file: Mutex::new(logger_clone.file.lock().unwrap().try_clone().unwrap()) };
            let handle2 = handle.clone();
            std::thread::Builder::new()
                .name("server-wait".into())
                .spawn(move || {
                    logger_thread.log("Server wait thread started");
                    let port = 8730u16;
                    if wait_for_server_sync(port, 15, &logger_thread) {
                        logger_thread.log("Server ready, navigating window...");
                        if let Some(window) = handle2.get_webview_window("main") {
                            let url = format!("http://127.0.0.1:{port}/?vs_desktop=1");
                            let _ = window.navigate(url.parse().unwrap());
                            std::thread::sleep(Duration::from_millis(500));
                            let _ = window.show();
                            let _ = window.set_focus();
                            logger_thread.log("Window shown and focused");
                        }
                    } else {
                        logger_thread.log("Server did not become ready within 15 seconds");
                        if let Some(window) = handle2.get_webview_window("main") {
                            let _ = window.show();
                        }
                    }
                })
                .ok();

            logger_clone.log("Setup complete");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    logger.log("Starting event loop...");
    app.run(|app_handle, event| {
        match event {
            // Hide to tray on window close instead of quitting
            RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } if label == "main" => {
                api.prevent_close();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
                let _ = app_handle.emit("window-hidden", ());
            }
            // Cleanup sidecar on exit
            RunEvent::Exit => {
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
            _ => {}
        }
    });
}
