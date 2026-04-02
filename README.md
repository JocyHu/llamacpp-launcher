# 🦙 llamacpp-control

[English](#english) | [简体中文](#简体中文)

---

## English

**llamacpp-control** is a modern, high-performance GUI launcher for `llama.cpp` (specifically `llama-server`). Built with Tauri v2 and React, it provides a sleek interface to manage, configure, and monitor your local LLM inference servers with ease.

### ✨ Key Features

*   **🚀 Flexible Launch Modes**:
    *   **Single Model**: Quick launch for individual `.gguf` files.
    *   **Smart Directory**: Automatically scans directories for models and generates multi-model routing configurations on the fly.
    *   **Manual Preset**: Use your existing `.ini` configuration files.
*   **🛠️ Extensive Parameter Tuning**:
    *   **Performance**: Fine-tune GPU layers, context size, Flash Attention, and KV cache types (f16, q8_0, etc.).
    *   **Sampling**: Real-time adjustment of Temperature, Top-P, Top-K, Min-P, and various penalties.
*   **🔍 Launch Audit**: Preview the exact CLI commands and auto-generated INI files before starting the server.
*   **💻 Modern UI/UX**:
    *   **Glassmorphism Design**: A clean, frosted-glass interface with dark/light mode support.
    *   **Live Logs**: Real-time terminal output streaming with auto-scroll and log level highlighting.
    *   **Smart Notifications**: Dynamic "Island" style alerts for system status.
*   **📦 System Integration**:
    *   **Minimize to Tray**: Keep your server running in the background without cluttering your taskbar.
    *   **Cross-Platform**: Powered by Rust and Tauri for native performance.
    *   **Bilingual Support**: Full support for English and Simplified Chinese.

### 🛠️ Technology Stack

*   **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
*   **Backend**: Rust, Tauri v2.
*   **Core**: Compatible with `llama-server` (from the `llama.cpp` project).

### 🚀 Getting Started

#### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (pnpm or npm)
- `llama-server.exe` (Place it in a sibling `llama.cpp/` folder or specify a custom path in settings)

#### Development
```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

#### Build
```bash
# Build the production executable
npm run tauri build
```

---

## 简体中文

**llamacpp-control** 是一款为 `llama.cpp`（特别是 `llama-server`）打造的现代化、高性能 GUI 启动器。基于 Tauri v2 和 React 构建，它为您提供了优雅的界面来轻松管理、配置和监控本地 LLM 推理服务器。

### ✨ 核心特性

*   **🚀 灵活的启动模式**:
    *   **单模型模式**: 快速启动单个 `.gguf` 模型文件。
    *   **智能目录**: 自动递归扫描目录中的模型，并动态生成多模型路由配置。
    *   **手动预设**: 直接使用现有的 `.ini` 配置文件。
*   **🛠️ 详尽的参数微调**:
    *   **性能优化**: 精细调整 GPU 加速层数、上下文长度、Flash Attention 以及 KV 缓存类型（f16, q8_0 等）。
    *   **采样策略**: 实时调整推理温度 (Temperature)、Top-P、Top-K、Min-P 及各类惩罚项。
*   **🔍 启动审计**: 在正式启动前预览具体的 CLI 命令行参数和自动生成的 INI 配置文件。
*   **💻 现代化的交互体验**:
    *   **磨砂玻璃设计**: 纯净的毛玻璃界面，支持深色/浅色/系统主题切换。
    *   **实时日志**: 类似终端的实时日志流输出，支持自动滚动和日志级别高亮。
    *   **灵动通知**: 仿“灵动岛”设计的系统状态实时提醒。
*   **📦 系统级集成**:
    *   **最小化到托盘**: 支持后台运行，确保推理服务不因窗口关闭而中断。
    *   **跨平台支持**: 基于 Rust 和 Tauri，提供原生级别的运行性能。
    *   **双语支持**: 完善的中英文界面切换。

### 🛠️ 技术栈

*   **前端**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
*   **后端**: Rust, Tauri v2.
*   **核心**: 兼容 `llama.cpp` 项目中的 `llama-server`。

### 🚀 快速上手

#### 前置要求
- [Rust](https://www.rust-lang.org/tools/install) 环境
- [Node.js](https://nodejs.org/) (推荐使用 pnpm 或 npm)
- `llama-server.exe` (请放置在同级的 `llama.cpp/` 目录下，或在程序设置中指定自定义路径)

#### 开发模式
```bash
# 安装依赖
npm install

# 运行开发服务器
npm run tauri dev
```

#### 构建发布
```bash
# 构建生产环境可执行文件
npm run tauri build
```
