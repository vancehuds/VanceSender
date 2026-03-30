// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

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

/// Launch the Python sidecar server.
fn spawn_sidecar(app: &AppHandle) -> Result<CommandChild, String> {
    let shell = app.shell();
    let command = shell
        .sidecar("sidecar/vancesender-server")
        .map_err(|e| format!("Failed to create sidecar command: {e}"))?;

    let (mut rx, child) = command
        .args(["--no-webview"])
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {e}"))?;

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
fn wait_for_server_sync(port: u16, timeout_secs: u64) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let deadline = std::time::Instant::now() + Duration::from_secs(timeout_secs);

    while std::time::Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &addr.parse().unwrap(),
            Duration::from_millis(500),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

/// Parse an ICO file, find the largest PNG entry, decode it to RGBA.
fn load_icon_from_ico(ico_data: &[u8]) -> Image<'static> {
    // ICO header: 2 reserved + 2 type + 2 count
    let count = u16::from_le_bytes([ico_data[4], ico_data[5]]) as usize;

    // Find the largest image entry
    let mut best_offset = 0usize;
    let mut best_size = 0u32;
    let mut best_data_len = 0usize;
    for i in 0..count {
        let entry_base = 6 + i * 16;
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

    // The entry data should be a PNG (starts with PNG signature)
    let entry_data = &ico_data[best_offset..best_offset + best_data_len];
    let decoder = png::Decoder::new(entry_data);
    let mut reader = decoder.read_info().expect("failed to read PNG from ICO");
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).expect("failed to decode PNG frame from ICO");
    buf.truncate(info.buffer_size());
    Image::new_owned(buf, info.width, info.height)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            // ── System Tray ──────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "打开主窗口").build(app)?;
            let quit_item =
                MenuItemBuilder::with_id("quit", "退出 VanceSender").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let icon = load_icon_from_ico(include_bytes!("../icons/icon.ico"));

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

            // ── Spawn Sidecar ────────────────────────────────────────
            match spawn_sidecar(&handle) {
                Ok(child) => {
                    if let Some(state) = handle.try_state::<SidecarState>() {
                        if let Ok(mut guard) = state.0.lock() {
                            *guard = Some(child);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Warning: sidecar spawn failed: {e}");
                    eprintln!(
                        "Running without sidecar — start Python server manually."
                    );
                }
            }

            // ── Wait for server & show window ────────────────────────
            let handle2 = handle.clone();
            std::thread::Builder::new()
                .name("server-wait".into())
                .spawn(move || {
                    let port = 8730u16;
                    if wait_for_server_sync(port, 15) {
                        if let Some(window) = handle2.get_webview_window("main") {
                            let url = format!("http://127.0.0.1:{port}/?vs_desktop=1");
                            let _ = window.navigate(url.parse().unwrap());
                            std::thread::sleep(Duration::from_millis(500));
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else {
                        eprintln!("Server did not become ready within 15 seconds");
                        if let Some(window) = handle2.get_webview_window("main") {
                            let _ = window.show();
                        }
                    }
                })
                .ok();

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

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
