#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem, WindowEvent,
};
use std::process::{Child, Command};
use std::sync::Mutex;

// Node.js server process
struct NodeServer {
    process: Mutex<Option<Child>>,
}

// Start Node.js server
fn start_node_server() -> Result<Child, std::io::Error> {
    #[cfg(target_os = "windows")]
    let child = Command::new("node")
        .arg("server.js")
        .current_dir(".")
        .spawn()?;

    #[cfg(not(target_os = "windows"))]
    let child = Command::new("node")
        .arg("server.js")
        .current_dir(".")
        .spawn()?;

    Ok(child)
}

// System tray menu
fn create_tray_menu() -> SystemTrayMenu {
    let show = CustomMenuItem::new("show".to_string(), "Show Window");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide Window");
    let auto_start = CustomMenuItem::new("auto_start".to_string(), "Auto-Start on Boot");
    let check_update = CustomMenuItem::new("update".to_string(), "Check for Updates");
    let quit = CustomMenuItem::new("quit".to_string(), "Quit");

    SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(auto_start)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(check_update)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit)
}

// Tauri commands (callable from frontend)
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<(), String> {
    let updater = app.updater();
    match updater.check().await {
        Ok(update_response) => {
            if update_response.is_update_available() {
                println!("Update available: {}", update_response.latest_version());
                // Update dialog will be shown automatically if configured
                Ok(())
            } else {
                println!("App is up to date");
                Ok(())
            }
        }
        Err(e) => {
            eprintln!("Failed to check for updates: {}", e);
            Err(format!("Update check failed: {}", e))
        }
    }
}

#[tauri::command]
fn minimize_to_tray(window: tauri::Window) {
    window.hide().unwrap();
}

// Main entry point
fn main() {
    // Start Node.js server
    let server_process = start_node_server().expect("Failed to start Node.js server");
    let node_server = NodeServer {
        process: Mutex::new(Some(server_process)),
    };

    // Wait for server to start
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Create system tray
    let tray = SystemTray::new().with_menu(create_tray_menu());

    tauri::Builder::default()
        .manage(node_server)
        .system_tray(tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick {
                position: _,
                size: _,
                ..
            } => {
                println!("System tray left click");
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    let window = app.get_window("main").unwrap();
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
                "hide" => {
                    let window = app.get_window("main").unwrap();
                    window.hide().unwrap();
                }
                "auto_start" => {
                    // TODO: Implement auto-start toggle
                    println!("Auto-start toggled");
                }
                "update" => {
                    // Trigger update check
                    tauri::async_runtime::spawn(async move {
                        let app_handle = app.app_handle();
                        check_for_updates(app_handle).await.ok();
                    });
                }
                "quit" => {
                    // Clean shutdown
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let WindowEvent::CloseRequested { api, .. } = event.event() {
                // Prevent close, hide instead
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            check_for_updates,
            minimize_to_tray
        ])
        .build(tauri::generate_context!())
        .expect("Error while building Tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Kill Node.js server on exit
                let node_server = app_handle.state::<NodeServer>();
                if let Ok(mut process) = node_server.process.lock() {
                    if let Some(mut child) = process.take() {
                        child.kill().ok();
                    }
                }
                api.prevent_exit();
            }
        });
}
