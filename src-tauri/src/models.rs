use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub language: String,
    pub theme: String,
    pub server_executable: Option<String>,
    pub log_max_lines: u32,
    pub minimize_to_tray: bool,
    pub last_active_profile_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalConfig {
    pub host: String,
    pub port: u16,
    pub api_key: String,
    pub sleep_idle_seconds: u32,
    pub mlock: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub launcher_mode: String,
    pub model_path: String,
    pub mmproj_path: Option<String>,
    pub models_dir: Option<String>,
    pub models_preset_path: Option<String>,
    pub chat_template_file: Option<String>,
    pub n_gpu_layers: String,
    pub ctx_size: u32,
    pub batch_size: u32,
    pub ubatch_size: u32,
    pub flash_attn: String,
    pub jinja: bool,
    pub cache_type_k: String,
    pub cache_type_v: String,
    pub temp: f32,
    pub top_p: f32,
    pub top_k: i32,
    pub min_p: f32,
    pub presence_penalty: f32,
    pub repeat_penalty: f32,
    pub use_temp: bool,
    pub use_presence_penalty: bool,
    pub use_top_p: bool,
    pub use_top_k: bool,
    pub use_min_p: bool,
    pub use_repeat_penalty: bool,
    pub use_batch_size: bool,
    pub custom_args: Option<String>, // 新增：自定义高级参数
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub settings: AppSettings,
    pub global: GlobalConfig,
    pub profiles: Vec<Profile>,
    pub current_profile_id: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            settings: AppSettings {
                language: "zh-CN".to_string(),
                theme: "system".to_string(),
                server_executable: None,
                log_max_lines: 500,
                minimize_to_tray: false,
                last_active_profile_id: None,
            },
            global: GlobalConfig {
                host: "0.0.0.0".to_string(),
                port: 8080,
                api_key: "".to_string(),
                sleep_idle_seconds: 600,
                mlock: false,
            },
            profiles: vec![],
            current_profile_id: None,
        }
    }
}
