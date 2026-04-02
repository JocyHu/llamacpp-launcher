mod models;
mod config;
mod launcher;

use models::AppConfig;
use launcher::ServerState;
use std::sync::{Arc, Mutex};
use std::process::Child;
use tauri::{AppHandle, Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    config::load(&app)
}

#[tauri::command]
fn update_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    config::save(&app, &config)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ServerState(Arc::new(Mutex::new(None))))
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit Llama Control", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            // 停止服务器（如果正在运行）
                            let state = app.state::<ServerState>();
                            if let Ok(mut handle) = state.0.lock() {
                                if let Some(mut child) = handle.take() {
                                    let _ = child.kill();
                                }
                            }
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config, 
            update_config,
            launcher::start_server,
            launcher::stop_server,
            launcher::preview_launch_arguments
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } = event {
                if label == "main" {
                    let config = config::load(app_handle);
                    if config.settings.minimize_to_tray {
                        api.prevent_close();
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    } else {
                        // 退出时确保进程被杀掉
                        let state = app_handle.state::<ServerState>();
                        let mut handle = state.0.lock().unwrap();
                        if let Some(mut child) = handle.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
