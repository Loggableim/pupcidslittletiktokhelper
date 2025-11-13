# Tauri Desktop Application Implementation Guide

## 🎯 Mission
Convert this TikTok Stream Tool from a Node.js web application to a native Tauri desktop application **WITHOUT code signing** to avoid additional costs. Tauri uses Rust for the backend and your existing web frontend, resulting in a much smaller (~5-10MB) installer compared to Electron.

## 📋 Prerequisites Check
- Node.js >= 18.0.0 installed
- **Rust installed** (https://rustup.rs/)
- Current application is working (test with `npm start`)
- Git repository is clean or changes are committed

## 🏗️ Implementation Overview

This implementation will:
- ✅ Wrap existing Express server in Tauri Rust backend
- ✅ Use system WebView (Edge WebView2 on Windows) instead of bundled Chromium
- ✅ Create system tray integration
- ✅ Build Windows (.exe), macOS (.dmg), and Linux (.AppImage) installers
- ✅ Implement auto-update via GitHub Releases
- ✅ **MUCH smaller installers** (~5-10MB vs 150MB for Electron)
- ⚠️ **NO code signing** (users will see SmartScreen warning on first run)

**Expected outcome:** Professional desktop app with ~5-10MB installer size.

---

## 📦 Phase 1: Rust & Tauri Setup (Week 1)

### Step 1.1: Install Rust

**Windows:**
```bash
# Download and run rustup-init.exe from https://rustup.rs/
# Or use winget:
winget install Rustlang.Rustup
```

**macOS/Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

Verify installation:
```bash
rustc --version
cargo --version
```

### Step 1.2: Install Tauri CLI

```bash
npm install --save-dev @tauri-apps/cli
```

Or install globally:
```bash
cargo install tauri-cli
```

### Step 1.3: Initialize Tauri

```bash
npm install --save @tauri-apps/api
npx tauri init
```

**Answer prompts:**
- App name: `TikTok Stream Tool`
- Window title: `TikTok Stream Tool`
- Web assets path: `../public`
- Dev server URL: `http://localhost:3000`
- Frontend dev command: `npm run start:web`
- Frontend build command: `npm run build:css`

This creates:
```
src-tauri/
├── Cargo.toml          # Rust dependencies
├── tauri.conf.json     # Tauri configuration
├── build.rs            # Build script
├── icons/              # App icons
└── src/
    └── main.rs         # Rust main file
```

### Step 1.4: Install System Dependencies

**Windows:**
- WebView2 Runtime (usually pre-installed on Windows 10/11)
- If missing, auto-installs with your app

**macOS:**
- No additional dependencies (uses system WebKit)

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

### Step 1.5: Update package.json

Add Tauri scripts to `package.json`:

```json
{
  "scripts": {
    "start:web": "node server.js",
    "start": "npm run start:web",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:build:win": "tauri build --target x86_64-pc-windows-msvc",
    "tauri:build:mac": "tauri build --target universal-apple-darwin",
    "tauri:build:linux": "tauri build --target x86_64-unknown-linux-gnu",
    "build:css": "tailwindcss -i ./public/css/tailwind.input.css -o ./public/css/tailwind.output.css --minify",
    "watch:css": "tailwindcss -i ./public/css/tailwind.input.css -o ./public/css/tailwind.output.css --watch",
    "dev": "concurrently \"npm run start:web\" \"npm run watch:css\"",
    "build": "npm run build:css && tauri build"
  }
}
```

---

## 🦀 Phase 2: Rust Backend Implementation (Week 2)

### Step 2.1: Configure Tauri

Edit `src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "beforeDevCommand": "npm run start:web",
    "beforeBuildCommand": "npm run build:css",
    "devPath": "http://localhost:3000",
    "distDir": "../public",
    "withGlobalTauri": true
  },
  "package": {
    "productName": "TikTok Stream Tool",
    "version": "1.0.3"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "window": {
        "all": false,
        "close": true,
        "hide": true,
        "show": true,
        "maximize": true,
        "minimize": true,
        "unmaximize": true,
        "unminimize": true,
        "startDragging": true
      },
      "notification": {
        "all": true
      },
      "path": {
        "all": true
      },
      "fs": {
        "all": true,
        "scope": ["$APPDATA/*", "$APPDATA/**"]
      }
    },
    "bundle": {
      "active": true,
      "targets": ["nsis", "dmg", "appimage", "deb"],
      "identifier": "com.tiktok-stream-tool.app",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": "",
        "wix": {
          "language": "en-US"
        },
        "nsis": {
          "installMode": "perUser",
          "languages": ["en-US"],
          "displayLanguageSelector": false,
          "installerIcon": "icons/icon.ico",
          "headerImage": "icons/installer-header.bmp",
          "sidebarImage": "icons/installer-sidebar.bmp"
        }
      },
      "macOS": {
        "frameworks": [],
        "minimumSystemVersion": "10.13",
        "exceptionDomain": "",
        "signingIdentity": null,
        "entitlements": null
      },
      "linux": {
        "deb": {
          "depends": []
        }
      }
    },
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob: data:;"
    },
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/YOUR_GITHUB_USERNAME/pupcidslittletiktokhelper/releases/latest/download/latest.json"
      ],
      "dialog": true,
      "pubkey": "WILL_BE_GENERATED_IN_STEP_3.4"
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "TikTok Stream Tool",
        "width": 1400,
        "height": 900,
        "minWidth": 1200,
        "minHeight": 700,
        "center": true,
        "decorations": true,
        "skipTaskbar": false,
        "transparent": false,
        "visible": true
      }
    ],
    "systemTray": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": false
    }
  }
}
```

**IMPORTANT:** Replace `YOUR_GITHUB_USERNAME` with actual username!

### Step 2.2: Implement Rust Backend

Edit `src-tauri/src/main.rs`:

```rust
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
```

### Step 2.3: Update Cargo.toml

Edit `src-tauri/Cargo.toml`:

```toml
[package]
name = "tiktok-stream-tool"
version = "1.0.3"
description = "Professional TikTok LIVE streaming tool"
authors = ["Your Name"]
license = "MIT"
repository = "https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper"
edition = "2021"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.5", features = ["api-all", "system-tray", "updater"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

---

## 🎨 Phase 3: Icons & Assets (Week 2-3)

### Step 3.1: Generate Tauri Icons

Tauri needs multiple icon sizes. Start with a 1024x1024 PNG icon.

**Option 1: Use Tauri icon generator**
```bash
npx @tauri-apps/cli icon path/to/your/icon.png
```

This generates:
- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns` (macOS)
- `src-tauri/icons/icon.ico` (Windows)
- `src-tauri/icons/icon.png` (Linux)

**Option 2: Manual creation**
Create icons manually in `src-tauri/icons/`:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256x256)
- `icon.icns` (macOS bundle)
- `icon.ico` (Windows)
- `icon.png` (512x512 for Linux)

### Step 3.2: Tray Icon

Create `src-tauri/icons/tray-icon.png` (32x32, transparent or white for dark mode)

### Step 3.3: Optional Installer Graphics

For Windows NSIS installer:
- `src-tauri/icons/installer-header.bmp` (150x57)
- `src-tauri/icons/installer-sidebar.bmp` (164x314)

---

## 🔐 Phase 4: Auto-Update Setup (Week 3)

### Step 4.1: Generate Update Keys

Tauri uses cryptographic signing for updates (different from code signing):

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/myapp.key
```

This generates:
- Private key: `~/.tauri/myapp.key` (KEEP SECRET!)
- Public key: Displayed in terminal

**IMPORTANT:**
- Save private key securely (needed for signing updates)
- Copy public key to `tauri.conf.json` under `updater.pubkey`

Example output:
```
Private key: dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5CkJXCjJCQ...
Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFBQUFBQUFBQUFB...
```

### Step 4.2: Update tauri.conf.json

Replace `WILL_BE_GENERATED_IN_STEP_3.4` with your public key:

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper/releases/latest/download/latest.json"
  ],
  "dialog": true,
  "pubkey": "YOUR_PUBLIC_KEY_HERE"
}
```

### Step 4.3: Build with Update Signing

When building for release:
```bash
TAURI_PRIVATE_KEY="$(cat ~/.tauri/myapp.key)" npm run tauri:build
```

Or set environment variable:
```bash
# Linux/macOS
export TAURI_PRIVATE_KEY="$(cat ~/.tauri/myapp.key)"
npm run tauri:build

# Windows (PowerShell)
$env:TAURI_PRIVATE_KEY = Get-Content ~/.tauri/myapp.key
npm run tauri:build
```

This generates update manifest files:
- `latest.json` (update info)
- `*.sig` files (signatures for each installer)

### Step 4.4: GitHub Release Structure

Upload these files to GitHub Release:

**Windows:**
- `TikTok Stream Tool_1.0.3_x64_en-US.msi`
- `TikTok Stream Tool_1.0.3_x64_en-US.msi.zip`
- `TikTok Stream Tool_1.0.3_x64_en-US.msi.zip.sig`

**macOS:**
- `TikTok Stream Tool_1.0.3_universal.dmg`
- `TikTok Stream Tool_1.0.3_universal.dmg.tar.gz`
- `TikTok Stream Tool_1.0.3_universal.dmg.tar.gz.sig`

**Linux:**
- `tiktok-stream-tool_1.0.3_amd64.AppImage`
- `tiktok-stream-tool_1.0.3_amd64.AppImage.tar.gz`
- `tiktok-stream-tool_1.0.3_amd64.AppImage.tar.gz.sig`

**Update Manifest:**
- `latest.json`

---

## 🏗️ Phase 5: Building & Testing (Week 4)

### Step 5.1: Development Testing

Run in development mode:
```bash
npm run tauri:dev
```

**What happens:**
1. Node.js server starts (port 3000)
2. Tauri window opens pointing to localhost:3000
3. Hot reload enabled
4. DevTools available (right-click → Inspect)

**Test checklist:**
- [ ] Window opens correctly
- [ ] App loads and displays UI
- [ ] TikTok connection works
- [ ] Plugins load
- [ ] System tray appears
- [ ] Close button hides to tray (doesn't quit)
- [ ] Tray double-click shows window
- [ ] Tray menu items work

### Step 5.2: Production Build - Windows

```bash
npm run tauri:build:win
```

**Output location:**
```
src-tauri/target/release/bundle/nsis/
├── TikTok Stream Tool_1.0.3_x64_en-US.nsis.zip
└── TikTok Stream Tool_1.0.3_x64_en-US.nsis.zip.sig
```

**Installer size:** ~5-10MB (vs. 150MB for Electron!)

**Testing:**
1. Install on clean Windows 10/11 VM
2. Check SmartScreen warning appears (expected)
3. Verify app runs after installation
4. Test system tray
5. Test auto-start (if implemented)
6. Uninstall and verify cleanup

### Step 5.3: Production Build - macOS

```bash
npm run tauri:build:mac
```

**Output location:**
```
src-tauri/target/release/bundle/dmg/
├── TikTok Stream Tool_1.0.3_universal.dmg
└── TikTok Stream Tool_1.0.3_universal.dmg.tar.gz.sig
```

**Universal binary:** Works on both Intel and Apple Silicon Macs

**Testing:**
1. Install on macOS
2. Check Gatekeeper warning (expected)
3. Verify right-click → Open works
4. Test app functionality

### Step 5.4: Production Build - Linux

```bash
npm run tauri:build:linux
```

**Output location:**
```
src-tauri/target/release/bundle/appimage/
├── tiktok-stream-tool_1.0.3_amd64.AppImage
└── tiktok-stream-tool_1.0.3_amd64.AppImage.tar.gz.sig

src-tauri/target/release/bundle/deb/
└── tiktok-stream-tool_1.0.3_amd64.deb
```

**Testing:**
```bash
chmod +x tiktok-stream-tool_1.0.3_amd64.AppImage
./tiktok-stream-tool_1.0.3_amd64.AppImage
```

---

## 🚀 Phase 6: Distribution (Week 4)

### Step 6.1: Create GitHub Release

```bash
git tag v1.0.3
git push origin v1.0.3
```

Create release on GitHub and upload:

**Windows:**
- `TikTok Stream Tool_1.0.3_x64_en-US.nsis.zip`
- `TikTok Stream Tool_1.0.3_x64_en-US.nsis.zip.sig`

**macOS:**
- `TikTok Stream Tool_1.0.3_universal.dmg`
- `TikTok Stream Tool_1.0.3_universal.dmg.tar.gz`
- `TikTok Stream Tool_1.0.3_universal.dmg.tar.gz.sig`

**Linux:**
- `tiktok-stream-tool_1.0.3_amd64.AppImage`
- `tiktok-stream-tool_1.0.3_amd64.AppImage.tar.gz`
- `tiktok-stream-tool_1.0.3_amd64.AppImage.tar.gz.sig`
- `tiktok-stream-tool_1.0.3_amd64.deb`

**Update manifest:**
- `latest.json`

### Step 6.2: Update Documentation

Add to README.md:

```markdown
## Installation

### Windows
1. Download `TikTok Stream Tool_{version}_x64_en-US.nsis.zip` from [Releases](https://github.com/YOUR_USERNAME/pupcidslittletiktokhelper/releases)
2. Extract and run installer
3. **Important:** Windows SmartScreen will show a warning
   - Click "More info"
   - Click "Run anyway"
4. App installs and launches

**Note:** Installer is only ~5-10MB thanks to Tauri!

### macOS
1. Download `TikTok Stream Tool_{version}_universal.dmg`
2. Open DMG and drag to Applications
3. **Important:** Right-click app and select "Open" (don't double-click)
4. Click "Open" in Gatekeeper dialog

**Universal Binary:** Works on Intel and Apple Silicon Macs

### Linux
**AppImage (recommended):**
```bash
chmod +x tiktok-stream-tool_*.AppImage
./tiktok-stream-tool_*.AppImage
```

**Debian/Ubuntu (.deb):**
```bash
sudo dpkg -i tiktok-stream-tool_*.deb
```

## System Tray
- **Double-click:** Show/hide window
- **Right-click:** Menu (auto-start, updates, quit)

## Auto-Updates
The app checks for updates on startup. When available:
1. Dialog appears
2. Click "Install" to download
3. Restart to apply

## Technical Details
- Built with Tauri (Rust + Web)
- Uses system WebView (no Chromium bundled)
- ~5-10MB installer vs. 150MB for Electron
- Lower memory usage
```

---

## 🐛 Troubleshooting

### Build Issues

**Error: `Rust compiler not found`**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Error: `WebView2 not found` (Windows)**
- Install WebView2 Runtime: https://developer.microsoft.com/en-us/microsoft-edge/webview2/
- Or it will be bundled with your installer automatically

**Error: `Failed to bundle project`**
- Check all icon files exist in `src-tauri/icons/`
- Verify `tauri.conf.json` paths are correct

**Error: `Node.js server not starting`**
- Check `server.js` path in `main.rs`
- Ensure Node.js is in PATH
- Check port 3000 is not in use

### Runtime Issues

**Window doesn't load**
- Check if Node.js server started (check logs)
- Increase sleep duration in `main.rs` (line with `std::thread::sleep`)
- Check firewall isn't blocking localhost:3000

**Tray icon not showing**
- Check `icons/tray-icon.png` exists
- Try different icon format (PNG, 32x32)
- Check system tray is enabled on OS

**Auto-update fails**
- Verify `latest.json` is uploaded to GitHub Release
- Check public key matches in `tauri.conf.json`
- Ensure `.sig` files are uploaded

### Platform-Specific

**Windows: "App won't run on older Windows"**
- Target Windows 7+ requires WebView2
- WebView2 auto-bundled if not installed

**macOS: "Cannot verify developer"**
- Users must right-click → Open (first time only)
- Subsequent launches work normally

**Linux: "AppImage won't execute"**
- Install FUSE: `sudo apt install libfuse2`
- Make executable: `chmod +x *.AppImage`

---

## 📊 Tauri vs Electron Comparison

| Feature | Tauri | Electron |
|---------|-------|----------|
| **Installer Size** | ~5-10MB | ~150-200MB |
| **Memory Usage** | ~50-100MB | ~150-300MB |
| **Startup Time** | ~1-2 seconds | ~3-5 seconds |
| **Browser Engine** | System WebView | Bundled Chromium |
| **Backend** | Rust | Node.js |
| **Learning Curve** | Higher (Rust) | Lower (JavaScript) |
| **Maturity** | Newer (2019) | Established (2013) |
| **Code Signing Cost** | Same | Same |
| **Auto-Update** | Built-in (cryptographic) | electron-updater |
| **System Tray** | Built-in | Built-in |

**Why choose Tauri:**
- ✅ Much smaller downloads
- ✅ Better performance
- ✅ Lower resource usage
- ✅ More "native" feel

**Why choose Electron:**
- ✅ More mature ecosystem
- ✅ No Rust required
- ✅ Larger community
- ✅ More plugins/examples

---

## 📝 Migration Checklist

### Rust Setup
- [ ] Install Rust toolchain
- [ ] Install Tauri CLI
- [ ] Initialize Tauri project
- [ ] Install system dependencies (Linux)

### Implementation
- [ ] Configure `tauri.conf.json`
- [ ] Implement `main.rs` with Node.js server spawn
- [ ] Create system tray menu
- [ ] Add window close → minimize to tray
- [ ] Generate update signing keys
- [ ] Configure auto-updater

### Assets
- [ ] Generate all icon sizes
- [ ] Create tray icon
- [ ] Optional: Installer graphics

### Testing
- [ ] Test dev mode (`npm run tauri:dev`)
- [ ] Test all existing features
- [ ] Test TikTok connection
- [ ] Test plugins
- [ ] Test system tray functionality

### Building
- [ ] Build for Windows
- [ ] Build for macOS (if available)
- [ ] Build for Linux
- [ ] Sign updates with private key
- [ ] Test installers on clean systems

### Distribution
- [ ] Create GitHub Release
- [ ] Upload all installers
- [ ] Upload `.sig` files
- [ ] Upload `latest.json`
- [ ] Update README with install instructions

---

## 🎯 Success Criteria

✅ **Functionality:**
- All features work identically to web version
- Node.js server starts automatically
- System tray integration works
- Auto-updates work

✅ **Performance:**
- App starts in < 3 seconds
- Memory usage < 100MB idle
- Installer size < 15MB

✅ **Distribution:**
- Windows installer works (~5-10MB)
- macOS installer works (universal binary)
- Linux AppImage works
- Auto-update works across platforms

---

## 📚 Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [Tauri API Reference](https://tauri.app/v1/api/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [System Tray Guide](https://tauri.app/v1/guides/features/system-tray)
- [Auto-Updater Guide](https://tauri.app/v1/guides/distribution/updater)

---

## ⚠️ Important Notes for LLMs

1. **DO install Rust first** - Tauri won't work without it
2. **DO NOT modify server.js** - Rust spawns it as child process
3. **DO use system WebView** - that's Tauri's advantage
4. **DO generate update keys** - required for auto-update
5. **DO keep private key secret** - never commit to git
6. **DO test on all platforms** - WebView behavior differs
7. **DO NOT attempt code signing** - this guide is for unsigned builds
8. **DO increase sleep time** if server doesn't start in time
9. **DO bundle WebView2** on Windows if needed (automatic)
10. **DO document SmartScreen warning** - users must know it's normal

### Common Pitfalls

- ❌ Forgetting to start Node.js server in `main.rs`
- ❌ Not waiting for server to start before opening window
- ❌ Wrong paths in `tauri.conf.json`
- ❌ Missing icon files
- ❌ Not uploading `.sig` files to GitHub
- ❌ Committing private key to git
- ❌ Not installing system dependencies on Linux

### Key Advantages

- **5-10MB installers** - users love this!
- **Fast startup** - system WebView is already loaded
- **Low memory** - no Chromium overhead
- **Native feel** - uses OS rendering

### When to Choose Tauri Over Electron

- ✅ You want smallest possible download
- ✅ You're willing to learn basic Rust
- ✅ You want best performance
- ✅ You care about resource usage

---

**Last Updated:** 2025-11-13
**Status:** Ready for Implementation
**Estimated Effort:** 4 weeks
**Cost:** $0 (no code signing)
**Installer Size:** ~5-10MB
**Learning Required:** Basic Rust (guide provides all code)
