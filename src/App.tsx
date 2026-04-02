import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { 
  Settings, Play, Square, Plus, Trash2, Terminal, Save,
  Zap, Activity, Monitor, FolderOpen, Code2, HardDrive, Sparkles,
  Lock, Thermometer, Lightbulb, CheckCircle2, AlertCircle, FolderTree,
  FileCode2, Box, Eye, EyeOff, Key, X, Palette, Globe, Binary, History, Moon, Sun, Laptop
} from "lucide-react";
import { AppConfig, Profile } from "./types";
import { translations, TranslationKey } from "./translations";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CACHE_TYPES = ["f16", "q8_0", "q4_0", "q4_1", "q5_0", "q5_1"];

interface Toast {
  message: string;
  type: "success" | "error";
  id: number;
}

interface LaunchAudit {
  full_command: string;
  ini_content: string | null;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  const [auditData, setAuditData] = useState<LaunchAudit | null>(null);
  const [auditTab, setAuditTab] = useState<"cli" | "ini">("cli");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  const t = (key: TranslationKey): string => {
    if (!config) return "";
    const lang = (config.settings.language as keyof typeof translations) || "zh-CN";
    return translations[lang][key] || key;
  };

  const applyTheme = (theme: string) => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(isDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { message, type, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data: AppConfig = await invoke("get_config");
        setConfig(data);
        setActiveProfileId(data.current_profile_id || (data.profiles.length > 0 ? data.profiles[0].id : null));
        if (data.settings) applyTheme(data.settings.theme);
      } catch (e) {
        showToast("FAILED TO LOAD CONFIG", "error");
      }
    };
    init();

    const unlisten = listen<string>("server-log", (event) => {
      setLogs((prev) => {
        const max = config?.settings?.log_max_lines || 500;
        return [...prev.slice(-(max - 1)), event.payload];
      }); 
    });

    const unlistenExit = listen<number | null>("server-exit", (event) => {
      setIsRunning(false);
      console.log("Server exited with code:", event.payload);
    });

    return () => { 
      unlisten.then(fn => fn()); 
      unlistenExit.then(fn => fn());
    };
  }, [config?.settings?.log_max_lines]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const activeProfile = config?.profiles?.find(p => p.id === activeProfileId);

  const handleUpdateConfig = async (newConfig: AppConfig, silent = false) => {
    setConfig(newConfig);
    if (!silent) setIsSaving(true);
    try {
      await invoke("update_config", { config: newConfig });
      if (!silent) showToast(t("config_saved"));
      if (newConfig.settings?.theme) applyTheme(newConfig.settings.theme);
    } catch (e) {
      showToast(t("save_failed") + ": " + e, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const switchProfile = (id: string | null) => {
    if (!config) return;
    setActiveProfileId(id);
    const newConfig = { ...config, current_profile_id: id };
    handleUpdateConfig(newConfig, true);
  };

  const addProfile = () => {
    if (!config) return;
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name: t("mode_single") + " " + (config.profiles.length + 1),
      launcher_mode: "single",
      model_path: "",
      mmproj_path: null,
      models_dir: null,
      models_preset_path: null,
      chat_template_file: null,
      n_gpu_layers: "auto",
      ctx_size: 131072,
      batch_size: 4096,
      ubatch_size: 1024,
      flash_attn: "auto",
      jinja: true,
      cache_type_k: "q8_0",
      cache_type_v: "q8_0",
      temp: 0.6,
      top_p: 0.95,
      top_k: 20,
      min_p: 0.0,
      presence_penalty: 0.0,
      repeat_penalty: 1.0,
      custom_args: null,
    };
    const newConfig: AppConfig = { ...config, profiles: [...(config.profiles || []), newProfile], current_profile_id: newProfile.id };
    handleUpdateConfig(newConfig, true);
    setActiveProfileId(newProfile.id);
  };

  const deleteProfile = (id: string) => {
    if (!config) return;
    const nextProfiles = config.profiles.filter(p => p.id !== id);
    const nextId = activeProfileId === id ? (nextProfiles[0]?.id || null) : activeProfileId;
    const newConfig = { ...config, profiles: nextProfiles, current_profile_id: nextId };
    handleUpdateConfig(newConfig);
    setActiveProfileId(nextId);
  };

  const updateProfileField = (id: string, field: keyof Profile, value: any) => {
    if (!config) return;
    const newConfig = {
      ...config,
      profiles: config.profiles.map(p => p.id === id ? { ...p, [field]: value } : p)
    };
    setConfig(newConfig);
  };

  const handleBrowse = async (type: "file" | "directory" | "preset" | "exe", field: keyof Profile | "server_executable") => {
    try {
      const isDir = type === "directory";
      const selected = await open({
        multiple: false,
        directory: isDir,
        filters: isDir ? undefined : [{
          name: type === "preset" ? 'INI' : (type === "exe" ? 'EXE' : 'GGUF'),
          extensions: type === "preset" ? ['ini'] : (type === "exe" ? ['exe'] : ['gguf', 'jinja', 'txt'])
        }]
      });
      if (selected && typeof selected === 'string') {
        if (field === "server_executable") {
          handleUpdateConfig({ ...config!, settings: { ...config!.settings, server_executable: selected }});
        } else {
          updateProfileField(activeProfileId!, field as keyof Profile, selected);
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleOpenAudit = async () => {
    if (!activeProfileId || !config) return;
    try {
      const data: LaunchAudit = await invoke("preview_launch_arguments", { config, profileId: activeProfileId });
      setAuditData(data);
      setAuditTab(data.ini_content ? "ini" : "cli");
    } catch (e) { showToast(t("save_failed"), "error"); }
  };

  const toggleServer = async () => {
    if (isRunning) {
      try { await invoke("stop_server"); setIsRunning(false); showToast(t("server_stopped")); } catch (e) { showToast(t("save_failed"), "error"); }
    } else {
      if (!activeProfileId || !config) return;
      setLogs([]);
      try { await invoke("start_server", { config, profileId: activeProfileId }); setIsRunning(true); showToast(t("server_started")); } 
      catch (e: any) { showToast(e.message || e, "error"); setIsRunning(false); }
    }
  };

  if (!config) return (
    <div className="flex items-center justify-center h-screen bg-background text-primary">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-current"></div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20 relative transition-colors duration-300">
      
      {/* 灵动岛通知 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[150] flex flex-col items-center gap-2 w-full pointer-events-none px-4">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            "flex items-center gap-3 px-6 py-2.5 rounded-full shadow-2xl border backdrop-blur-2xl transition-all duration-500 pointer-events-auto",
            "animate-in slide-in-from-top-8 zoom-in-95 ease-out",
            t.type === "success" ? "bg-slate-900/90 text-white border-white/10 dark:bg-white/90 dark:text-slate-900" : "bg-red-600 text-white border-red-500/20"
          )}>
            {t.type === "success" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-xs font-black tracking-tight uppercase tracking-wider">{t.message}</span>
          </div>
        ))}
      </div>

      {/* 启动审计弹窗 */}
      {auditData && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAuditData(null)} />
          <div className="bg-card w-full max-w-5xl max-h-full rounded-[2.5rem] border shadow-2xl overflow-hidden flex flex-col relative z-10 animate-in zoom-in-95 duration-300 text-foreground">
            <div className="px-8 py-6 border-b flex items-center justify-between bg-secondary/30 backdrop-blur-xl text-foreground">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Sparkles className="w-5 h-5" /></div>
                <div><h3 className="font-black text-lg tracking-tight">{t("audit_title")}</h3><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{t("audit_subtitle")}</p></div>
              </div>
              <div className="flex bg-secondary/50 rounded-2xl p-1 border">
                {auditData.ini_content && <button onClick={() => setAuditTab("ini")} className={cn("px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all", auditTab === "ini" ? "bg-white dark:bg-slate-800 shadow text-primary" : "text-muted-foreground")}>{t("tab_ini")}</button>}
                <button onClick={() => setAuditTab("cli")} className={cn("px-4 py-1.5 rounded-xl text-[10px] font-bold transition-all", auditTab === "cli" ? "bg-white dark:bg-slate-800 shadow text-primary" : "text-muted-foreground")}>{t("tab_cli")}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-950 font-mono text-sm leading-relaxed text-blue-100/80 custom-scrollbar">
              <pre className="whitespace-pre-wrap break-all selection:bg-primary/30">{auditTab === "ini" ? auditData.ini_content : auditData.full_command}</pre>
            </div>
            <div className="px-8 py-4 border-t bg-secondary/30 flex justify-end"><button onClick={() => setAuditData(null)} className="bg-primary text-primary-foreground px-8 py-2 rounded-xl font-bold text-xs">{t("return_editor")}</button></div>
          </div>
        </div>
      )}

      {/* 系统设置弹窗 */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
          <div className="bg-card w-full max-w-2xl rounded-[3rem] border shadow-2xl overflow-hidden flex flex-col relative z-10 animate-in zoom-in-95 duration-300 text-foreground">
            <div className="px-10 py-8 border-b flex items-center justify-between bg-secondary/30 backdrop-blur-xl text-foreground">
              <div className="flex items-center gap-4 text-foreground">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20"><Settings className="w-6 h-6" /></div>
                <div><h3 className="font-black text-2xl tracking-tight text-foreground">{t("sys_settings_title")}</h3><p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{t("sys_settings_subtitle")}</p></div>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-3 hover:bg-muted rounded-full transition-colors"><X className="w-6 h-6 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar text-foreground">
              <section className="space-y-6">
                <div className="flex items-center gap-3 text-primary"><Palette className="w-5 h-5" /><h4 className="font-black text-sm uppercase tracking-wider">{t("appearance_group")}</h4></div>
                <div className="grid grid-cols-2 gap-8 text-foreground">
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> {t("language_label")}</label>
                    <select value={config.settings.language} onChange={(e) => handleUpdateConfig({ ...config, settings: { ...config.settings, language: e.target.value }})} className="w-full bg-secondary/50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none text-foreground">
                      <option value="zh-CN">简体中文</option><option value="en-US">English</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-2"><Moon className="w-3.5 h-3.5" /> {t("theme_label")}</label>
                    <div className="flex p-1 bg-secondary rounded-2xl gap-1">
                      {[{id: "light", icon: Sun}, {id: "dark", icon: Moon}, {id: "system", icon: Laptop}].map(t => (
                        <button key={t.id} onClick={() => handleUpdateConfig({ ...config, settings: { ...config.settings, theme: t.id }})} className={cn("flex-1 flex items-center justify-center py-2 rounded-xl transition-all", config.settings.theme === t.id ? "bg-white dark:bg-slate-800 shadow text-primary" : "text-muted-foreground hover:text-foreground")}><t.icon className="w-4 h-4" /></button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <section className="space-y-6 pt-6 border-t border-dashed border-border/60">
                <div className="flex items-center gap-3 text-primary"><Binary className="w-5 h-5" /><h4 className="font-black text-sm uppercase tracking-wider">{t("exec_group")}</h4></div>
                <div className="space-y-3 text-foreground">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase px-1">{t("custom_exe_label")}</label>
                  <div className="flex gap-3">
                    <input value={config.settings.server_executable || ""} readOnly className="flex-1 bg-secondary/50 border-none rounded-2xl px-4 py-3 text-xs text-muted-foreground outline-none" placeholder={t("select_path")} />
                    <button onClick={() => handleBrowse("exe", "server_executable")} className="px-6 bg-primary text-primary-foreground rounded-2xl font-bold text-xs hover:bg-primary/90 transition-all tracking-tighter">选择路径</button>
                    {config.settings.server_executable && <button onClick={() => handleUpdateConfig({ ...config, settings: { ...config.settings, server_executable: null }})} className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all"><X className="w-4 h-4" /></button>}
                  </div>
                </div>
              </section>
              <section className="space-y-6 pt-6 border-t border-dashed border-border/60 pb-6 text-foreground">
                <div className="flex items-center gap-3 text-primary"><History className="w-5 h-5" /><h4 className="font-black text-sm uppercase tracking-wider">{t("log_group")}</h4></div>
                <div className="grid grid-cols-2 gap-8 text-foreground">
                  <div className="space-y-3"><label className="text-[11px] font-bold text-muted-foreground uppercase">{t("max_log_lines")}</label><input type="number" value={config.settings.log_max_lines} onChange={(e) => handleUpdateConfig({ ...config, settings: { ...config.settings, log_max_lines: parseInt(e.target.value) || 500 }})} className="w-full bg-secondary/50 border-none rounded-2xl px-4 py-3 text-sm outline-none text-foreground" /></div>
                  <div className="flex items-center justify-between pt-8 px-2"><span className="text-[11px] font-bold text-muted-foreground uppercase">{t("tray_label")}</span><div onClick={() => handleUpdateConfig({ ...config, settings: { ...config.settings, minimize_to_tray: !config.settings.minimize_to_tray }})} className={cn("w-12 h-6 rounded-full p-1 cursor-pointer transition-colors", config.settings.minimize_to_tray ? "bg-primary" : "bg-muted-foreground/30")}><div className={cn("w-4 h-4 bg-white rounded-full transition-transform duration-200", config.settings.minimize_to_tray ? "translate-x-6" : "translate-x-0")} /></div></div>
                </div>
              </section>
            </div>
            <div className="px-10 py-6 border-t bg-secondary/30 flex justify-end items-center gap-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest"><span>所有设置即时保存</span><button onClick={() => setIsSettingsOpen(false)} className="bg-primary text-primary-foreground px-10 py-3 rounded-2xl font-black shadow-lg shadow-primary/20">{t("finish_settings")}</button></div>
          </div>
        </div>
      )}

      {/* 侧边栏 */}
      <div className="w-64 bg-secondary/30 border-r border-border/60 flex flex-col backdrop-blur-xl shrink-0 transition-colors text-foreground">
        <div className="p-6 border-b border-border/60 flex items-center gap-3 text-primary transition-colors"><Zap className="w-6 h-6 fill-current" /><span className="font-black text-lg tracking-tighter uppercase">{t("app_title")}</span></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide text-foreground">
          <section>
            <div className="px-2 mb-3 flex items-center justify-between"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("preset_manager")}</span><button onClick={addProfile} className="hover:text-primary transition-colors p-1 text-foreground"><Plus className="w-4 h-4" /></button></div>
            <div className="space-y-1">
              {(config.profiles || []).map(p => (
                <div key={p.id} onClick={() => switchProfile(p.id)} className={cn("group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border border-transparent", activeProfileId === p.id ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]" : "hover:bg-secondary/80")}>
                  <Box className={cn("w-4 h-4 shrink-0", activeProfileId === p.id ? "text-white" : "text-muted-foreground")} /><span className="truncate text-xs font-bold flex-1">{p.name}</span><button onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </section>
          <section className="bg-secondary/50 rounded-2xl p-4 border border-border/60 shadow-inner space-y-4 text-foreground">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-2 text-primary"><Activity className="w-3 h-3" /> {t("global_settings")}</div>
            <div className="space-y-3">
              <div className="space-y-1"><label className="text-[9px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter">{t("listen_host")}</label><input value={config.global.host} onChange={(e) => handleUpdateConfig({ ...config, global: { ...config.global, host: e.target.value }}, true)} className="w-full bg-background/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 text-foreground" /></div>
              <div className="space-y-1 relative group/key">
                <label className="text-[9px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter flex items-center gap-1.5">
                  <Key className="w-3 h-3" /> {t("api_key_label")}
                </label>
                <div className="relative">
                  <input 
                    type={showApiKey ? "text" : "password"}
                    value={config.global.api_key} 
                    onChange={(e) => handleUpdateConfig({ ...config, global: { ...config.global, api_key: e.target.value }}, true)} 
                    placeholder={t("api_key_hint")}
                    className="w-full bg-background/50 border border-border/60 rounded-lg pl-2.5 pr-10 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 text-foreground transition-all" 
                  />
                  <button 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-secondary rounded-md text-muted-foreground transition-colors"
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 text-foreground">
                <div className="flex-1 space-y-1"><label className="text-[9px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter">{t("port")}</label><input type="number" value={config.global.port} onChange={(e) => handleUpdateConfig({ ...config, global: { ...config.global, port: parseInt(e.target.value) || 8080 }}, true)} className="w-full bg-background/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs outline-none text-foreground" /></div>
                <div className="flex-1 space-y-1"><label className="text-[9px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter">{t("idle_time")}</label><input type="number" value={config.global.sleep_idle_seconds} onChange={(e) => handleUpdateConfig({ ...config, global: { ...config.global, sleep_idle_seconds: parseInt(e.target.value) || 0 }}, true)} className="w-full bg-background/50 border border-border/60 rounded-lg px-2.5 py-1.5 text-xs outline-none text-foreground" /></div>
              </div>
              <div onClick={() => handleUpdateConfig({ ...config, global: { ...config.global, mlock: !config.global.mlock }}, true)} className="flex items-center justify-between px-1 py-2 cursor-pointer group border-t border-dashed border-border/60 mt-2 text-foreground"><div className="flex items-center gap-2"><Lock className={cn("w-3 h-3 transition-colors", config.global.mlock ? "text-primary" : "text-muted-foreground")} /><span className="text-[10px] font-bold text-muted-foreground group-hover:text-primary transition-colors uppercase tracking-tighter font-black">{t("mlock")}</span></div><div className={cn("w-8 h-4 rounded-full p-0.5 transition-colors", config.global.mlock ? "bg-primary" : "bg-muted-foreground/30")}><div className={cn("w-3 h-3 bg-white rounded-full transition-transform duration-200", config.global.mlock ? "translate-x-4" : "translate-x-0")} /></div></div>
            </div>
          </section>
        </div>
        <div className="p-4 border-t border-border/60 bg-background/20 text-foreground"><button onClick={() => setIsSettingsOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-secondary transition-all group focus:outline-none"><Settings className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:rotate-90 transition-all duration-500" /><span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">{t("system_settings")}</span></button></div>
      </div>

      {/* 主界面 */}
      <div className="flex-1 flex flex-col bg-background/50 relative overflow-hidden min-w-0 transition-colors text-foreground">
        {activeProfile ? (
          <>
            <header className="h-16 border-b border-border/60 flex items-center justify-between px-8 bg-background/40 backdrop-blur-xl shrink-0 z-20 text-foreground">
              <div className="flex items-center gap-4 min-w-0 text-foreground">
                <input value={activeProfile.name} onChange={(e) => updateProfileField(activeProfile.id, "name", e.target.value)} onBlur={() => handleUpdateConfig(config)} className="text-xl font-black bg-transparent border-none focus:ring-0 p-1 hover:bg-muted/30 transition-colors rounded truncate max-w-sm outline-none shrink text-foreground" />
                <div className={cn("px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest shrink-0 border", isRunning ? "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse" : "bg-muted text-muted-foreground border-transparent")}>{isRunning ? t("running") : t("standby")}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-foreground">
                <button onClick={handleOpenAudit} className="p-2.5 rounded-xl border border-border/60 hover:bg-secondary/80 transition-all text-muted-foreground active:scale-95"><Eye className="w-4.5 h-4.5" /></button>
                <button onClick={() => handleUpdateConfig(config)} disabled={isSaving} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/60 hover:bg-secondary/80 transition-all text-[10px] font-black active:scale-95", isSaving ? "opacity-50" : "")}><Save className={cn("w-4 h-4 text-muted-foreground", isSaving ? "animate-spin" : "")} /><span>{isSaving ? t("saving") : t("save_config")}</span></button>
                <div className="h-6 w-px bg-border/60 mx-1" />
                <button onClick={toggleServer} className={cn("flex items-center gap-3 px-8 py-2.5 rounded-xl font-black text-sm transition-all shadow-xl active:scale-95", isRunning ? "bg-destructive text-destructive-foreground shadow-destructive/20" : "bg-primary text-primary-foreground shadow-primary/20")}>{isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}<span>{isRunning ? t("stop_server") : t("launch_server")}</span></button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar pb-20 text-foreground">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start text-foreground">
                <div className="bg-card p-6 rounded-[2.5rem] border border-border/60 shadow-xl space-y-6 text-foreground transition-colors">
                  <div className="flex items-center justify-between px-1"><div className="flex items-center gap-2 text-primary transition-colors"><Settings className="w-5 h-5" /><h3 className="font-black text-sm uppercase tracking-tight">{t("model_resource_title")}</h3></div>
                    <div className="flex p-1 bg-secondary/30 rounded-xl gap-1">
                      {[{ id: "single", label: t("mode_single"), icon: Box }, { id: "dir", label: t("mode_dir"), icon: FolderTree }, { id: "preset", label: t("mode_preset"), icon: FileCode2 }].map(m => (
                        <button key={m.id} onClick={() => updateProfileField(activeProfile.id, "launcher_mode", m.id)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all", activeProfile.launcher_mode === m.id ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}><m.icon className="w-3 h-3" /><span>{m.label}</span></button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-5 text-foreground">
                    {activeProfile.launcher_mode === "single" && (
                      <><div className="space-y-2"><label className="text-[10px] font-bold text-muted-foreground uppercase px-1 tracking-tight">{t("model_file")}</label><div className="flex gap-2"><input value={activeProfile.model_path} onChange={(e) => updateProfileField(activeProfile.id, "model_path", e.target.value)} className="flex-1 bg-secondary/20 border border-border/60 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none text-foreground" placeholder={t("select_path")} /><button onClick={() => handleBrowse("file", "model_path")} className="px-4 bg-secondary rounded-2xl hover:bg-primary hover:text-white transition-all"><FolderOpen className="w-5 h-5" /></button></div></div>
                        <div className="space-y-2 pt-2 border-t border-dashed border-border/60 text-foreground"><label className="text-[10px] font-bold text-muted-foreground uppercase px-1 tracking-tight">{t("vision_proj")}</label><div className="flex gap-2 text-foreground"><input value={activeProfile.mmproj_path || ""} onChange={(e) => updateProfileField(activeProfile.id, "mmproj_path", e.target.value || null)} className="flex-1 bg-secondary/20 border border-border/60 rounded-2xl px-4 py-2.5 text-xs outline-none text-foreground" placeholder="Optional..." /><button onClick={() => handleBrowse("file", "mmproj_path")} className="px-3 bg-secondary rounded-xl hover:bg-primary hover:text-white transition-all text-foreground"><FolderOpen className="w-4 h-4" /></button></div></div>
                      </>
                    )}
                    {activeProfile.launcher_mode === "dir" && (
                      <div className="space-y-2 bg-blue-500/5 p-4 rounded-3xl border border-blue-500/10 transition-colors text-foreground"><label className="text-[10px] font-bold text-blue-600 uppercase px-1 flex items-center gap-2"><FolderTree className="w-3.5 h-3.5" /> {t("models_dir")}</label>
                        <div className="flex gap-2 mt-2"><input value={activeProfile.models_dir || ""} onChange={(e) => updateProfileField(activeProfile.id, "models_dir", e.target.value || null)} className="flex-1 bg-white/50 dark:bg-black/20 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none text-foreground" placeholder={t("select_path")} /><button onClick={() => handleBrowse("directory", "models_dir")} className="px-4 bg-blue-500 text-white rounded-2xl hover:bg-blue-600 transition-all shadow-lg text-foreground"><FolderTree className="w-5 h-5" /></button></div>
                        <p className="text-[9px] text-blue-600/70 italic px-1 mt-2 text-foreground">{t("dir_hint")}</p>
                      </div>
                    )}
                    {activeProfile.launcher_mode === "preset" && (
                      <div className="space-y-2 bg-purple-500/5 p-4 rounded-3xl border border-purple-500/10 transition-colors text-foreground"><label className="text-[10px] font-bold text-purple-600 uppercase px-1 text-foreground">{t("models_preset")}</label>
                        <div className="flex gap-2 text-foreground"><input value={activeProfile.models_preset_path || ""} onChange={(e) => updateProfileField(activeProfile.id, "models_preset_path", e.target.value || null)} className="flex-1 bg-white/50 dark:bg-black/20 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500/20 outline-none text-foreground" placeholder={t("select_path")} /><button onClick={() => handleBrowse("preset", "models_preset_path")} className="px-4 bg-purple-500 text-white rounded-2xl hover:bg-purple-600 transition-all shadow-lg text-foreground"><FileCode2 className="w-5 h-5" /></button></div>
                      </div>
                    )}
                    <div className="space-y-2 pt-2 border-t border-dashed border-border/60 text-foreground"><label className="text-[10px] font-bold text-muted-foreground uppercase px-1 flex items-center justify-between text-foreground"><span>{t("chat_template")}</span><div className="flex items-center gap-1.5"><input type="checkbox" checked={activeProfile.jinja} onChange={(e) => updateProfileField(activeProfile.id, "jinja", e.target.checked)} className="w-3 h-3 rounded" /><span className="text-[9px] text-primary font-bold">{t("force_enable")}</span></div></label>
                      <div className="flex gap-2 text-foreground"><input value={activeProfile.chat_template_file || ""} onChange={(e) => updateProfileField(activeProfile.id, "chat_template_file", e.target.value || null)} className="flex-1 bg-secondary/20 border border-border/60 rounded-2xl px-4 py-2 text-xs outline-none text-foreground" placeholder={t("select_path")} /><button onClick={() => handleBrowse("file", "chat_template_file")} className="px-3 bg-secondary rounded-xl hover:bg-primary hover:text-white transition-all text-foreground"><Code2 className="w-4 h-4" /></button></div>
                    </div>
                  </div>
                </div>

                <div className="bg-card p-6 rounded-[2.5rem] border border-border/60 shadow-xl space-y-6 transition-all text-foreground">
                  <div className="flex items-center gap-2 px-1 text-purple-500 transition-colors"><Activity className="w-5 h-5" /><h3 className="font-black text-sm uppercase tracking-tight">{t("performance_title")}</h3></div>
                  <div className="space-y-5 text-foreground">
                    <div className="space-y-2"><div className="flex justify-between items-center px-1"><label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t("gpu_layers")}</label><span className={cn("text-[9px] font-mono font-bold px-2 py-0.5 rounded-md uppercase", activeProfile.n_gpu_layers === "auto" ? "text-blue-500 bg-blue-500/10" : "text-primary bg-primary/10")}>{activeProfile.n_gpu_layers}</span></div>
                      <div className="flex p-1 bg-secondary/20 rounded-2xl gap-1">
                        {[{id: "auto", l: t("mode_auto")}, {id: "all", l: t("mode_all")}, {id: "0", l: t("mode_cpu")}].map(m => (<button key={m.id} onClick={() => updateProfileField(activeProfile.id, "n_gpu_layers", m.id)} className={cn("flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all", activeProfile.n_gpu_layers === m.id ? "bg-primary text-primary-foreground shadow-md" : "hover:bg-background/50 text-muted-foreground")}>{m.l}</button>))}
                        <input value={(activeProfile.n_gpu_layers !== "auto" && activeProfile.n_gpu_layers !== "all" && activeProfile.n_gpu_layers !== "0") ? activeProfile.n_gpu_layers : ""} onChange={(e) => updateProfileField(activeProfile.id, "n_gpu_layers", e.target.value)} className="flex-1 bg-background/40 border-none text-center text-xs font-mono font-bold rounded-xl outline-none transition-colors text-foreground" placeholder="..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-border/60">
                      <div className="space-y-1"><label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter">{t("ctx_size")}</label><input type="number" value={activeProfile.ctx_size} onChange={(e) => updateProfileField(activeProfile.id, "ctx_size", parseInt(e.target.value))} className="w-full bg-secondary/20 border border-border/60 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 text-foreground" /></div>
                      <div className="space-y-1 text-foreground"><label className="text-[10px] font-bold text-muted-foreground ml-1 flex items-center gap-1.5 uppercase tracking-tighter">{t("flash_attn")} <Lightbulb className={cn("w-3 h-3", activeProfile.flash_attn === "off" ? "text-muted-foreground" : "text-yellow-500")} /></label>
                        <div className="flex p-0.5 bg-secondary/20 rounded-xl gap-0.5">{["auto", "on", "off"].map(v => (<button key={v} onClick={() => updateProfileField(activeProfile.id, "flash_attn", v)} className={cn("flex-1 py-1 rounded-lg text-[9px] font-bold transition-all uppercase", activeProfile.flash_attn === v ? "bg-white dark:bg-slate-800 shadow-sm text-primary" : "text-muted-foreground hover:bg-background/50")}>{v}</button>))}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1"><label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter text-[9px]">{t("kv_cache_k")}</label><select value={activeProfile.cache_type_k} onChange={(e) => updateProfileField(activeProfile.id, "cache_type_k", e.target.value)} className="w-full bg-secondary/20 border border-border/60 rounded-xl px-3 py-2 text-xs outline-none transition-colors text-foreground">{CACHE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                      <div className="space-y-1"><label className="text-[10px] font-bold text-muted-foreground ml-1 uppercase tracking-tighter text-[9px]">{t("kv_cache_v")}</label><select value={activeProfile.cache_type_v} onChange={(e) => updateProfileField(activeProfile.id, "cache_type_v", e.target.value)} className="w-full bg-secondary/20 border border-border/60 rounded-xl px-3 py-2 text-xs outline-none transition-colors text-foreground">{CACHE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    </div>
                  </div>
                </div>

                <div className="bg-card p-6 rounded-[2.5rem] border border-border/60 shadow-xl space-y-6 xl:col-span-2 transition-all text-foreground">
                  <div className="flex items-center gap-2 px-1 text-orange-500 transition-colors">
                    <Monitor className="w-5 h-5" />
                    <h3 className="font-black text-sm uppercase tracking-tight">{t("sampler_title")}</h3>
                  </div>
                  
                  <div className="space-y-8 bg-secondary/10 p-6 rounded-[2rem] transition-colors">
                    {/* Tier 1: Core Controls (Full Width) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Temperature Slider */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Thermometer className="w-4 h-4 text-orange-500" /> {t("temperature")}
                          </label>
                          <input 
                            type="number" step="0.01" value={activeProfile.temp} 
                            onChange={(e) => updateProfileField(activeProfile.id, "temp", parseFloat(e.target.value))}
                            className="w-16 bg-background border border-orange-200/50 rounded-lg px-2 py-1 text-xs font-mono font-bold text-orange-600 outline-none text-center transition-colors" 
                          />
                        </div>
                        <input 
                          type="range" min="0" max="2" step="0.01" value={activeProfile.temp} 
                          onChange={(e) => updateProfileField(activeProfile.id, "temp", parseFloat(e.target.value))}
                          className="w-full h-2 bg-orange-200/30 rounded-lg appearance-none cursor-pointer accent-orange-500" 
                        />
                        <div className="flex justify-between px-1 text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">
                          <span>{t("precision")}</span><span>{t("creative")}</span>
                        </div>
                      </div>

                      {/* Presence Penalty Slider */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" /> {t("presence_penalty")}
                          </label>
                          <input 
                            type="number" step="0.1" value={activeProfile.presence_penalty} 
                            onChange={(e) => updateProfileField(activeProfile.id, "presence_penalty", parseFloat(e.target.value))}
                            className="w-16 bg-background border border-amber-200/50 rounded-lg px-2 py-1 text-xs font-mono font-bold text-amber-600 outline-none text-center transition-colors" 
                          />
                        </div>
                        <input 
                          type="range" min="-2" max="2" step="0.1" value={activeProfile.presence_penalty} 
                          onChange={(e) => updateProfileField(activeProfile.id, "presence_penalty", parseFloat(e.target.value))}
                          className="w-full h-2 bg-amber-200/30 rounded-lg appearance-none cursor-pointer accent-amber-500" 
                        />
                      </div>
                    </div>

                    {/* Tier 2: Expert Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-6 border-t border-dashed border-border/40 text-foreground">
                      {[
                        {l: "Top-P", f: "top_p", s: 0.01},
                        {l: "Top-K", f: "top_k", s: 1},
                        {l: "Min-P", f: "min_p", s: 0.01},
                        {l: t("repeat_penalty"), f: "repeat_penalty", s: 0.05},
                        {l: t("batch_size"), f: "batch_size", s: 8}
                      ].map(p => (
                        <div key={p.f} className="space-y-1.5">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase ml-1 tracking-tighter truncate block">{p.l}</label>
                          <input 
                            type="number" step={p.s} value={(activeProfile as any)[p.f]} 
                            onChange={(e) => updateProfileField(activeProfile.id, p.f as any, p.f === 'batch_size' ? parseInt(e.target.value) : parseFloat(e.target.value))}
                            className="w-full bg-background border border-border/60 rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 高级自定义参数区域 */}
                <div className="bg-card p-6 rounded-[2.5rem] border border-border/60 shadow-xl space-y-4 xl:col-span-2 transition-all text-foreground">
                  <div className="flex items-center gap-2 px-1 text-slate-500"><Terminal className="w-5 h-5" /><h3 className="font-black text-sm uppercase tracking-tight">{t("advanced_args_title")}</h3></div>
                  <div className="bg-slate-900/5 dark:bg-white/5 p-4 rounded-3xl border border-dashed border-border/60">
                    <textarea value={activeProfile.custom_args || ""} onChange={(e) => updateProfileField(activeProfile.id, "custom_args", e.target.value)} className="w-full h-24 bg-transparent border-none text-xs font-mono resize-none focus:ring-0 outline-none text-foreground placeholder:text-muted-foreground/40" placeholder={t("advanced_args_hint")} />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-[350px] flex flex-col bg-slate-950 rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden group mb-10 text-white">
                <div className="px-8 py-4 border-b border-white/5 bg-white/5 flex items-center justify-between backdrop-blur-md shrink-0"><div className="flex items-center gap-3 text-primary transition-colors"><Terminal className="w-5 h-5" /><span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] font-mono">{t("terminal_title")}</span></div><button onClick={() => setLogs([])} className="text-[9px] font-bold text-white/30 hover:text-white border border-white/10 hover:border-white/20 px-4 py-1.5 rounded-full transition-all tracking-widest uppercase">{t("clear_logs")}</button></div>
                <div className="flex-1 overflow-y-auto p-8 font-mono text-[11px] leading-relaxed text-blue-100/70 space-y-2 custom-scrollbar bg-slate-950">
                  {logs.length === 0 && <div className="h-full flex flex-col items-center justify-center text-white/5 gap-4"><HardDrive className="w-12 h-12 opacity-5 animate-pulse" /><span className="text-[10px] tracking-[0.5em] uppercase font-light">{t("waiting_stream")}</span></div>}
                  {(logs || []).map((log, i) => (<div key={i} className="break-all whitespace-pre-wrap flex gap-4 animate-in slide-in-from-left-1 duration-200"><span className="text-white/10 shrink-0 select-none w-10 text-right italic font-light">{i+1}</span><span className={cn("text-blue-100/80", log.toLowerCase().includes("error") ? "text-red-400 font-bold" : log.toLowerCase().includes("warning") ? "text-yellow-400" : log.startsWith("[GUI]") ? "text-primary font-bold" : "")}>{log}</span></div>))}
                  <div ref={logEndRef} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-10 animate-in fade-in duration-1000">
            <div className="w-40 h-40 bg-secondary rounded-[4rem] flex items-center justify-center shadow-2xl border-4 border-dashed border-muted relative overflow-hidden group cursor-pointer transition-all hover:scale-105 duration-500" onClick={addProfile}><div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" /><Plus className="w-16 h-16 text-muted-foreground group-hover:text-primary transition-colors" /></div>
            <div className="max-w-md space-y-4 text-foreground"><h2 className="text-4xl font-black tracking-tighter text-muted-foreground/50 uppercase">{t("welcome_title")}</h2><p className="text-muted-foreground/60 text-sm font-medium leading-relaxed">{t("welcome_subtitle")}</p><button onClick={addProfile} className="mt-6 bg-primary text-primary-foreground px-12 py-4 rounded-3xl font-black text-sm shadow-2xl hover:shadow-primary/40 hover:-translate-y-1 transition-all active:scale-95 tracking-widest uppercase">{t("start_session")}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
