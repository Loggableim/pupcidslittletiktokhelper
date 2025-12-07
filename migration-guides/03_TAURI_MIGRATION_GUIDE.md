# Tauri Migration Guide für LTTH

**Ziel:** Migration zu Tauri (modernste Alternative)  
**Aufwand:** 2-4 Wochen  
**Schwierigkeit:** Mittel-Hoch  

---

## 📋 Übersicht

Tauri ist eine moderne Alternative zu Electron mit drastisch kleineren Bundle-Größen. Es nutzt System-WebView statt Chromium und ist in Rust geschrieben.

### Warum Tauri?
- ✅ **95% kleiner:** 5-10 MB statt 150 MB
- ✅ **Schneller:** ~50 MB RAM statt ~200 MB
- ✅ **Sicher:** Rust-basiert mit Permission-System
- ✅ **Modern:** Aktive Entwicklung, große Community

---

## 🏗️ Architektur-Strategie für LTTH

Da LTTH Node.js benötigt, nutzen wir Tauri als **Shell** mit Node.js als **Sidecar**:

```
┌─────────────────────────────────────┐
│         Tauri App (Rust)            │
│  ┌───────────────────────────────┐  │
│  │   WebView (Frontend)          │  │
│  │   http://localhost:3000       │  │
│  └───────────────────────────────┘  │
│              ↑                       │
│              │ HTTP/WebSocket       │
│              ↓                       │
│  ┌───────────────────────────────┐  │
│  │  Node.js Sidecar Process      │  │
│  │  (app/server.js)              │  │
│  │  - Express Server             │  │
│  │  - Socket.IO                  │  │
│  │  - SQLite                     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## 🚀 Schnellstart

### Voraussetzungen

1. **Rust installieren**
   ```bash
   # Windows (PowerShell):
   winget install Rustlang.Rust.MSVC
   
   # Oder manuell: https://rustup.rs/
   ```

2. **Tauri CLI installieren**
   ```bash
   npm install --save-dev @tauri-apps/cli
   npm install @tauri-apps/api
   ```

### Initialisierung

```bash
# 1. Tauri-Projekt initialisieren
npm run tauri init

# Fragen beantworten:
# - App name: LTTH
# - Window title: PupCid's Little TikTool Helper
# - Web assets path: ../dist (oder ../app/public)
# - Dev server URL: http://localhost:3000
# - Frontend dev command: npm run dev:backend
# - Frontend build command: npm run build
```

Dies erstellt:
- `src-tauri/` Ordner mit Rust-Backend
- `tauri.conf.json` mit Konfiguration

---

## 📝 Tauri-Konfiguration

### tauri.conf.json

```json
{
  "build": {
    "beforeDevCommand": "cd app && npm run dev",
    "beforeBuildCommand": "cd app && npm install --production",
    "devPath": "http://localhost:3000",
    "distDir": "../app/public",
    "withGlobalTauri": true
  },
  "package": {
    "productName": "LTTH",
    "version": "1.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true,
        "sidecar": true,
        "scope": [
          { "name": "node-server", "sidecar": true, "args": true }
        ]
      },
      "path": {
        "all": true
      },
      "fs": {
        "all": true,
        "scope": ["$APP/**", "$APPDATA/**", "$RESOURCE/**"]
      },
      "window": {
        "all": true
      },
      "dialog": {
        "all": true
      },
      "notification": {
        "all": true
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.pupcid.ltth",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "resources": [],
      "externalBin": [
        "binaries/node-server"
      ],
      "windows": {
        "certificateThumbprint": null,
        "digestAlgorithm": "sha256",
        "timestampUrl": "",
        "wix": {
          "language": "de-DE"
        },
        "nsis": {
          "installerIcon": "icons/icon.ico",
          "installMode": "perMachine",
          "languages": ["de-DE", "en-US"],
          "displayLanguageSelector": true
        }
      }
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "LTTH",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "center": true,
        "decorations": true,
        "transparent": false,
        "fileDropEnabled": false
      }
    ],
    "systemTray": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": false
    }
  }
}
```

---

## 🔧 Node.js als Sidecar einbetten

### 1. Node.js Portable vorbereiten

```bash
# Download Node.js Portable
cd src-tauri
mkdir -p binaries
cd binaries

# Windows: Download und entpacken
# https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
# Speichere als: node-server.exe (umbenennen!)
```

### 2. Sidecar-Konfiguration

In `src-tauri/tauri.conf.json`:

```json
{
  "tauri": {
    "bundle": {
      "externalBin": [
        "binaries/node-server"
      ]
    }
  }
}
```

### 3. Server-Starter-Skript erstellen

Da wir Node.js + server.js brauchen, erstelle einen Wrapper:

**Option A: Batch-Wrapper (einfach)**

`src-tauri/binaries/node-server.bat`:
```batch
@echo off
node.exe app\server.js
```

**Option B: Rust-Sidecar (empfohlen)**

In `src-tauri/src/main.rs`:

```rust
use tauri::Manager;
use std::process::{Command, Stdio};

#[tauri::command]
fn start_node_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    let resource_path = app_handle.path_resolver()
        .resource_dir()
        .ok_or("Failed to get resource dir")?;
    
    let node_path = resource_path.join("binaries/node.exe");
    let server_path = resource_path.join("app/server.js");
    
    Command::new(node_path)
        .arg(server_path)
        .current_dir(resource_path.join("app"))
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Node.js Server beim Start starten
            let handle = app.handle();
            start_node_server(handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![start_node_server])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 🎨 Frontend-Integration

### Splash-Screen während Server-Start

Erstelle `app/public/splash.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>LTTH - Starting...</title>
    <style>
        body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: white;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
            margin: 0 auto 30px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 { font-size: 28px; margin: 0 0 10px; }
        p { opacity: 0.8; font-size: 14px; }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <h1>LTTH wird gestartet...</h1>
        <p>Bitte warten...</p>
    </div>
    
    <script>
        // Prüfe ob Server bereit ist
        function checkServer() {
            fetch('http://localhost:3000')
                .then(() => {
                    window.location.href = 'http://localhost:3000';
                })
                .catch(() => {
                    setTimeout(checkServer, 500);
                });
        }
        
        setTimeout(checkServer, 2000);
    </script>
</body>
</html>
```

In `tauri.conf.json`, ändere `devPath`:
```json
{
  "build": {
    "devPath": "../app/public/splash.html"
  }
}
```

---

## 📦 Build-Prozess

### Development

```bash
# Terminal 1: Node.js Server
cd app
npm run dev

# Terminal 2: Tauri App
npm run tauri dev
```

### Production Build

```bash
# Alles in einem
npm run tauri build

# Output:
# src-tauri/target/release/bundle/
#   - nsis/LTTH_1.1.0_x64-setup.exe  (NSIS Installer)
#   - msi/LTTH_1.1.0_x64.msi          (MSI Installer)
```

### Build-Skript erstellen

`package.json`:

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "tauri:build:win": "tauri build --target x86_64-pc-windows-msvc"
  }
}
```

---

## 🎯 System-Integration

### System-Tray

In `src-tauri/src/main.rs`:

```rust
use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayEvent};

fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Beenden");
    let show = CustomMenuItem::new("show".to_string(), "LTTH öffnen");
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(tauri::MenuItem::Separator)
        .add_item(quit);

    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                let window = app.get_window("main").unwrap();
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "quit" => {
                        std::process::exit(0);
                    }
                    "show" => {
                        let window = app.get_window("main").unwrap();
                        window.show().unwrap();
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Auto-Updates

In `Cargo.toml` (src-tauri/):

```toml
[dependencies]
tauri = { version = "1.5", features = ["updater"] }
```

In `tauri.conf.json`:

```json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://releases.myapp.com/{{target}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

---

## 🐛 Troubleshooting

### Problem: "cannot find binary-name"
**Lösung:** Sidecar muss in `binaries/` als `.exe` vorliegen

### Problem: Server startet nicht
**Lösung:** Prüfe Pfade in Rust-Code:
```rust
println!("Resource dir: {:?}", resource_path);
println!("Node path: {:?}", node_path);
```

### Problem: SQLite-Fehler
**Lösung:** better-sqlite3 muss für Windows kompiliert sein:
```bash
cd app
npm rebuild better-sqlite3 --target=node18-win-x64
```

### Problem: "allowlist" Fehler
**Lösung:** Aktiviere benötigte APIs in `tauri.conf.json`

---

## 📊 Bundle-Größe Optimierung

### Vor Optimierung: ~150 MB
### Nach Optimierung: ~10-15 MB

**Optimierungs-Schritte:**

1. **Node.js minimieren:**
   - Nur node.exe einbetten (keine npm, npx, etc.)
   - Custom Node.js Build ohne unnötige Features

2. **Dependencies:**
   ```bash
   cd app
   npm install --production
   npm prune
   ```

3. **Rust Binary-Größe:**
   ```toml
   # In Cargo.toml
   [profile.release]
   opt-level = "z"     # Optimize for size
   lto = true          # Link-time optimization
   codegen-units = 1   # Better optimization
   panic = "abort"     # Smaller binary
   strip = true        # Remove symbols
   ```

---

## 🎯 Migration-Roadmap

### Woche 1-2: Setup & Proof of Concept
- [ ] Rust & Tauri installieren
- [ ] Tauri-Projekt initialisieren
- [ ] Node.js Sidecar testen
- [ ] Splash-Screen implementieren

### Woche 3: Features migrieren
- [ ] System-Tray
- [ ] Auto-Updates vorbereiten
- [ ] Native Dialoge
- [ ] Tastatur-Shortcuts

### Woche 4: Testing & Polishing
- [ ] Builds testen
- [ ] Performance-Optimierung
- [ ] Bundle-Size reduzieren
- [ ] Dokumentation

---

## 📚 Ressourcen

- **Tauri Docs:** https://tauri.app/v1/guides/
- **Sidecar Guide:** https://tauri.app/v1/guides/building/sidecar/
- **Rust lernen:** https://www.rust-lang.org/learn
- **Tauri Discord:** https://discord.com/invite/tauri

---

## 💡 Fazit

**Vorteile:**
- ✅ 95% kleinere Bundle-Größe
- ✅ Deutlich bessere Performance
- ✅ Moderne, zukunftssichere Technologie
- ✅ Aktive Community

**Nachteile:**
- ⚠️ Rust-Lernkurve
- ⚠️ Höherer Migrations-Aufwand
- ⚠️ Node.js-Integration komplexer

**Empfehlung:** Langfristig beste Lösung, wenn Zeit für ordentliche Migration vorhanden ist.

---

**Geschätzte Migrations-Zeit:** 2-4 Wochen  
**Risiko:** Mittel  
**ROI:** Hoch (beste Performance, kleinste Bundles)
