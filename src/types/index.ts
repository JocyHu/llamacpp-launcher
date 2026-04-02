export interface AppSettings {
  language: string;
  theme: string;
  server_executable: string | null;
  log_max_lines: number;
  minimize_to_tray: boolean;
}

export interface GlobalConfig {
  host: string;
  port: number;
  api_key: string;
  sleep_idle_seconds: number;
  mlock: boolean;
}

export interface Profile {
  id: string;
  name: string;
  
  // 启动模式
  launcher_mode: string; // "single", "dir", "preset"
  
  // 路径设置
  model_path: string;
  mmproj_path: string | null;
  models_dir: string | null;
  models_preset_path: string | null;
  chat_template_file: string | null;
  
  // 性能参数
  n_gpu_layers: string;
  ctx_size: number;
  batch_size: number;
  ubatch_size: number;
  flash_attn: string;
  jinja: boolean;
  cache_type_k: string;
  cache_type_v: string;
  
  // 采样参数
  temp: number;
  top_p: number;
  top_k: number;
  min_p: number;
  presence_penalty: number;
  repeat_penalty: number;
  
  // 自定义高级参数
  custom_args: string | null;
}

export interface AppConfig {
  settings: AppSettings;
  global: GlobalConfig;
  profiles: Profile[];
  current_profile_id: string | null;
}
