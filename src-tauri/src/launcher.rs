use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader};
use std::sync::{Arc, Mutex};
use std::thread;
use std::path::{Path, PathBuf};
use std::fs;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter, Manager};
use crate::models::{AppConfig, Profile};
use std::os::windows::process::CommandExt;
use walkdir::WalkDir;
use serde::{Serialize};

pub struct ServerState(pub Arc<Mutex<Option<Child>>>);

#[derive(Debug)]
struct DetectedModel {
    alias_base: String,
    quant_tag: Option<String>,
    model_path: PathBuf,
    mmproj_path: Option<PathBuf>,
}

#[derive(Serialize)]
pub struct LaunchAudit {
    pub full_command: String,
    pub ini_content: Option<String>,
}

fn push_custom_args(args: &mut Vec<String>, custom_str: &Option<String>) {
    if let Some(ref s) = custom_str {
        if !s.trim().is_empty() {
            for part in s.split_whitespace() {
                args.push(part.to_string());
            }
        }
    }
}

fn extract_quant(file_name: &str) -> Option<String> {
    let name_upper = file_name.to_uppercase();
    let markers = [".Q", "-Q", "_Q", ".IQ", "-IQ", "_IQ"];
    for marker in markers {
        if let Some(idx) = name_upper.rfind(marker) {
            let start = idx + 1;
            let end = file_name.to_lowercase().find(".gguf").unwrap_or(file_name.len());
            if start < end { return Some(file_name[start..end].to_string()); }
        }
    }
    None
}

fn scan_directory(base_dir: &Path) -> Vec<DetectedModel> {
    let mut models = Vec::new();
    let all_files: Vec<PathBuf> = WalkDir::new(base_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("gguf"))
        .map(|e| e.path().to_path_buf())
        .collect();

    let (mmprojs, candidates): (Vec<PathBuf>, Vec<PathBuf>) = all_files.into_iter().partition(|p| {
        p.file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase().starts_with("mmproj"))
            .unwrap_or(false)
    });

    for model_path in candidates {
        let file_name = model_path.file_name().and_then(|s| s.to_str()).unwrap_or_default();
        if file_name.contains("-of-") && !file_name.contains("-00001-of-") { continue; }
        let parent_dir_name = model_path.parent().and_then(|p| p.file_name()).and_then(|s| s.to_str()).unwrap_or("model");
        let alias_base = if model_path.parent() != Some(base_dir) && parent_dir_name.to_uppercase() != "GGUF" { parent_dir_name.to_string() } else { file_name.replace(".gguf", "") };
        let quant_tag = extract_quant(file_name);
        models.push(DetectedModel { alias_base, quant_tag, model_path: model_path.clone(), mmproj_path: mmprojs.iter().find(|m| m.parent() == model_path.parent()).cloned() });
    }
    models
}

fn generate_ini_content(profile: &Profile, detected: &[DetectedModel]) -> String {
    let mut ini_content = String::from("version = 1\n\n[*]\n");
    ini_content.push_str(&format!("n-gpu-layers = {}\n", profile.n_gpu_layers));
    ini_content.push_str(&format!("ctx-size = {}\n", profile.ctx_size));
    let fa_val = match profile.flash_attn.as_str() { "on" => "true", "off" => "false", _ => "auto" };
    ini_content.push_str(&format!("flash-attn = {}\n", fa_val));
    
    if profile.use_temp {
        ini_content.push_str(&format!("temp = {}\n", profile.temp));
    }
    if profile.use_top_p {
        ini_content.push_str(&format!("top-p = {}\n", profile.top_p));
    }
    if profile.use_top_k {
        ini_content.push_str(&format!("top-k = {}\n", profile.top_k));
    }
    if profile.use_min_p {
        ini_content.push_str(&format!("min-p = {}\n", profile.min_p));
    }
    if profile.use_repeat_penalty {
        ini_content.push_str(&format!("repeat-penalty = {}\n", profile.repeat_penalty));
    }
    if profile.use_presence_penalty {
        ini_content.push_str(&format!("presence-penalty = {}\n", profile.presence_penalty));
    }
    if profile.use_batch_size {
        ini_content.push_str(&format!("batch-size = {}\n", profile.batch_size));
    }
    
    ini_content.push_str(&format!("ubatch-size = {}\n", profile.ubatch_size));
    if !profile.cache_type_k.is_empty() { ini_content.push_str(&format!("cache-type-k = {}\n", profile.cache_type_k)); }
    if !profile.cache_type_v.is_empty() { ini_content.push_str(&format!("cache-type-v = {}\n", profile.cache_type_v)); }
    if profile.jinja { ini_content.push_str("jinja = true\n"); }
    if let Some(ref template) = profile.chat_template_file {
        if !template.is_empty() { ini_content.push_str(&format!("chat-template-file = {}\n", template.replace("\\", "/"))); }
    }

    let mut used_aliases = HashSet::new();
    for m in detected {
        let count_in_same_base = detected.iter().filter(|x| x.alias_base == m.alias_base).count();
        let mut final_alias = if count_in_same_base > 1 && m.quant_tag.is_some() { format!("{}-{}", m.alias_base, m.quant_tag.as_ref().unwrap()) } else { m.alias_base.clone() };
        final_alias = final_alias.chars().map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '-' }).collect::<String>().replace(" ", "-").replace("--", "-");
        let mut unique_slug = final_alias.trim_matches('-').to_string();
        let mut counter = 1;
        let base_slug = unique_slug.clone();
        while used_aliases.contains(&unique_slug) { unique_slug = format!("{}-{}", base_slug, counter); counter += 1; }
        used_aliases.insert(unique_slug.clone());
        ini_content.push_str(&format!("\n[{}]\n", unique_slug));
        ini_content.push_str(&format!("model = {}\n", m.model_path.to_string_lossy().replace("\\", "/")));
        if let Some(ref mm) = m.mmproj_path { ini_content.push_str(&format!("mmproj = {}\n", mm.to_string_lossy().replace("\\", "/"))); }
    }
    ini_content
}

fn fallback_server_path() -> String {
    if std::path::Path::new("llama-server.exe").exists() { "llama-server.exe".to_string() }
    else { "../llama.cpp/llama-server.exe".to_string() }
}

fn build_common_args(config: &AppConfig) -> Vec<String> {
    let mut args = vec![
        "--host".to_string(), config.global.host.clone(),
        "--port".to_string(), config.global.port.to_string(),
        "--sleep-idle-seconds".to_string(), config.global.sleep_idle_seconds.to_string(),
    ];
    if config.global.mlock { args.push("--mlock".to_string()); }
    if !config.global.api_key.is_empty() { 
        args.push("--api-key".to_string()); 
        args.push(config.global.api_key.clone()); 
    }
    args
}

fn push_profile_args(args: &mut Vec<String>, profile: &Profile) {
    args.push("--model".to_string()); args.push(profile.model_path.replace("\\", "/"));
    args.push("--ctx-size".to_string()); args.push(profile.ctx_size.to_string());
    args.push("--n-gpu-layers".to_string()); args.push(profile.n_gpu_layers.clone());
    args.push("--flash-attn".to_string()); args.push(profile.flash_attn.clone());
    
    if profile.use_batch_size {
        args.push("--batch-size".to_string()); args.push(profile.batch_size.to_string());
    }
    
    args.push("--ubatch-size".to_string()); args.push(profile.ubatch_size.to_string());
    
    if profile.use_temp {
        args.push("--temp".to_string()); args.push(profile.temp.to_string());
    }
    if profile.use_top_p {
        args.push("--top-p".to_string()); args.push(profile.top_p.to_string());
    }
    if profile.use_top_k {
        args.push("--top-k".to_string()); args.push(profile.top_k.to_string());
    }
    if profile.use_min_p {
        args.push("--min-p".to_string()); args.push(profile.min_p.to_string());
    }
    if profile.use_presence_penalty {
        args.push("--presence-penalty".to_string()); args.push(profile.presence_penalty.to_string());
    }
    if profile.use_repeat_penalty {
        args.push("--repeat-penalty".to_string()); args.push(profile.repeat_penalty.to_string());
    }
    
    if let Some(ref mm) = profile.mmproj_path { 
        if !mm.is_empty() { 
            args.push("--mmproj".to_string()); 
            args.push(mm.replace("\\", "/")); 
        } 
    }
    
    if profile.jinja { args.push("--jinja".to_string()); } else { args.push("--no-jinja".to_string()); }
    
    if let Some(ref template) = profile.chat_template_file { 
        if !template.is_empty() { 
            args.push("--chat-template-file".to_string()); 
            args.push(template.replace("\\", "/")); 
        } 
    }
    
    if !profile.cache_type_k.is_empty() { 
        args.push("--cache-type-k".to_string()); args.push(profile.cache_type_k.clone()); 
    }
    if !profile.cache_type_v.is_empty() { 
        args.push("--cache-type-v".to_string()); args.push(profile.cache_type_v.clone()); 
    }
}

#[tauri::command]
pub async fn preview_launch_arguments(_app: AppHandle, config: AppConfig, profile_id: String) -> Result<LaunchAudit, String> {
    let profile = config.profiles.iter().find(|p| p.id == profile_id).ok_or_else(|| format!("NotFound: {}", profile_id))?;
    let mut args = build_common_args(&config);

    let mut ini_content = None;
    match profile.launcher_mode.as_str() {
        "dir" => {
            let dir_str = profile.models_dir.as_ref().ok_or("NoDir")?;
            let detected = scan_directory(Path::new(dir_str));
            ini_content = Some(generate_ini_content(profile, &detected));
            args.push("--models-preset".to_string());
            args.push("[AUTO_GENERATED_INI]".to_string());
        },
        "preset" => {
            let preset = profile.models_preset_path.as_ref().ok_or("NoPreset")?;
            args.push("--models-preset".to_string());
            args.push(preset.clone());
        },
        _ => {
            // Single model mode - use CLI args
            push_profile_args(&mut args, profile);
        }
    }
    
    push_custom_args(&mut args, &profile.custom_args);
    
    // Path-related keys that should always have their values quoted in the audit string
    let path_keys = ["--model", "--mmproj", "--models-preset", "--chat-template-file", "--models-dir"];
    
    // Build the quoted argument list for display
    let mut quoted_args = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        quoted_args.push(arg.clone());
        
        // If this is a path key, quote the NEXT argument (the path itself)
        if path_keys.contains(&arg.as_str()) && i + 1 < args.len() {
            let path_val = &args[i + 1];
            quoted_args.push(format!("\"{}\"", path_val));
            i += 2;
        } else {
            // Otherwise, quote only if it contains spaces (fallback safety)
            if i + 1 < args.len() && !args[i+1].starts_with("--") {
                 let next_val = &args[i+1];
                 if next_val.contains(' ') {
                     quoted_args.push(format!("\"{}\"", next_val));
                 } else {
                     quoted_args.push(next_val.clone());
                 }
                 i += 2;
            } else {
                i += 1;
            }
        }
    }

    let server_path = "llama-server.exe";
    Ok(LaunchAudit { full_command: format!("{} {}", server_path, quoted_args.join(" ")), ini_content })
}

#[tauri::command]
pub async fn start_server(app: AppHandle, config: AppConfig, profile_id: String, state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|_| "LockError")?;
    if lock.is_some() { return Err("AlreadyRunning".to_string()); }
    let profile = config.profiles.iter().find(|p| p.id == profile_id).ok_or_else(|| format!("NotFound: {}", profile_id))?;
    let mut args = build_common_args(&config);
    
    match profile.launcher_mode.as_str() {
        "dir" => {
            let dir_str = profile.models_dir.as_ref().ok_or("NoDir")?;
            let detected = scan_directory(Path::new(dir_str));
            if detected.is_empty() { return Err("NoModels".to_string()); }
            let ini_content = generate_ini_content(&profile, &detected);
            let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
            fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
            let path = cache_dir.join("auto_models.ini");
            fs::write(&path, ini_content).map_err(|e| format!("WriteError: {}", e))?;
            args.push("--models-preset".to_string());
            args.push(path.to_string_lossy().to_string());
        },
        "preset" => {
            let preset = profile.models_preset_path.as_ref().ok_or("NoPreset")?;
            args.push("--models-preset".to_string());
            args.push(preset.clone());
        },
        _ => {
            // Single model mode - use CLI args
            push_profile_args(&mut args, profile);
        }
    }
    
    push_custom_args(&mut args, &profile.custom_args);

    let server_path = if let Some(ref custom) = config.settings.server_executable { if !custom.is_empty() { custom.clone() } else { fallback_server_path() } } else { fallback_server_path() };
    let mut child = Command::new(&server_path).args(args).stdout(Stdio::piped()).stderr(Stdio::piped()).creation_flags(0x08000000).spawn().map_err(|e| format!("SpawnError: {}", e))?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    *lock = Some(child);
    let app_clone = app.clone();
    thread::spawn(move || { let reader = BufReader::new(stdout); for line in reader.lines() { if let Ok(l) = line { let _ = app_clone.emit("server-log", l); } } });
    let app_clone_err = app.clone();
    thread::spawn(move || { let reader = BufReader::new(stderr); for line in reader.lines() { if let Ok(l) = line { let _ = app_clone_err.emit("server-log", l); } } });

    let app_exit_handle = app.clone();
    let state_clone = Arc::clone(&state.0);
    thread::spawn(move || {
        loop {
            thread::sleep(std::time::Duration::from_millis(500));
            let mut lock = state_clone.lock().unwrap();
            if lock.is_none() { break; } 
            
            if let Some(ref mut child) = *lock {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let msg = format!("[GUI] Server Exited (Code: {})", status);
                        let _ = app_exit_handle.emit("server-log", msg);
                        let _ = app_exit_handle.emit("server-exit", status.code());
                        *lock = None;
                        break;
                    }
                    Ok(None) => { }
                    Err(e) => {
                        let _ = app_exit_handle.emit("server-log", format!("[GUI] Monitor Error: {}", e));
                        *lock = None;
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_server(state: tauri::State<'_, ServerState>) -> Result<(), String> {
    let mut lock = state.0.lock().map_err(|_| "LockError")?;
    if let Some(mut child) = lock.take() { let _ = child.kill(); Ok(()) } else { Err("NotRunning".to_string()) }
}
