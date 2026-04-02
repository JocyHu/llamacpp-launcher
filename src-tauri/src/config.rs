use std::fs;
use std::path::PathBuf;
use crate::models::AppConfig;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;

pub fn get_config_path(app: &AppHandle) -> PathBuf {
    // 使用应用数据目录存储配置，避免触发 Vite 热更新
    let path = app.path().resolve("config.json", BaseDirectory::AppData)
        .unwrap_or_else(|_| PathBuf::from("config.json"));
    
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    path
}

pub fn load(app: &AppHandle) -> AppConfig {
    let path = get_config_path(app);
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub fn save(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app);
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    Ok(())
}
