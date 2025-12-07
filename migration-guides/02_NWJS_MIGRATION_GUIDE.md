# NW.js Migration Guide für LTTH

**Ziel:** Migration von Electron zu NW.js  
**Aufwand:** 1-2 Wochen  
**Schwierigkeit:** Niedrig-Mittel  

---

## 📋 Übersicht

NW.js ist der direkteste Electron-Ersatz. Die Migration ist einfach, da beide Frameworks sehr ähnlich sind.

### Vorteile der Migration
- ✅ Kleinere Bundle-Größe (~100-120 MB vs. ~150 MB)
- ✅ Node.js direkt im Renderer-Prozess (einfacher als Electron IPC)
- ✅ Minimale Code-Änderungen erforderlich
- ✅ Bessere Performance bei manchen Anwendungsfällen

---

## 🚀 Schnellstart

```bash
# 1. NW.js Dependencies installieren
npm install --save-dev nw nw-builder

# 2. package.json anpassen (siehe unten)

# 3. Development testen
npx nw .

# 4. Production Build
npx nw-builder --mode=build --platform=win --arch=x64 .
```

---

## 📝 package.json Konfiguration

### Root package.json anpassen

```json
{
  "name": "ltth-nwjs",
  "version": "1.1.0",
  "description": "LTTH - NW.js Edition",
  "main": "nw-bootstrap.html",
  "chromium-args": "--disable-gpu --enable-logging",
  "window": {
    "title": "LTTH",
    "icon": "app/ltthappicon.png",
    "width": 1200,
    "height": 800,
    "min_width": 800,
    "min_height": 600,
    "position": "center",
    "resizable": true,
    "show": false,
    "frame": true,
    "toolbar": false
  },
  "webkit": {
    "plugin": true
  },
  "node-remote": "http://localhost:3000",
  "scripts": {
    "start": "nw .",
    "build": "nw-builder --mode=build --platform=win --arch=x64 .",
    "build:all": "nw-builder --mode=build --platform=win,linux,osx --arch=x64 ."
  },
  "devDependencies": {
    "nw": "^0.83.0",
    "nw-builder": "^4.7.1"
  }
}
```

---

## 🔧 Bootstrap-HTML erstellen

Erstelle `nw-bootstrap.html` im Root:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LTTH - Starting...</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: 'Segoe UI', Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
        }
        
        .loading-container {
            text-align: center;
            color: white;
        }
        
        .logo {
            width: 150px;
            height: 150px;
            margin: 0 auto 30px;
            animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
        }
        
        h1 {
            font-size: 32px;
            margin: 0 0 20px;
        }
        
        .progress-bar {
            width: 300px;
            height: 6px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
            overflow: hidden;
            margin: 20px auto;
        }
        
        .progress-fill {
            height: 100%;
            background: white;
            width: 0%;
            animation: progress 3s ease-out forwards;
        }
        
        @keyframes progress {
            0% { width: 0%; }
            30% { width: 50%; }
            80% { width: 90%; }
            100% { width: 100%; }
        }
        
        .status {
            font-size: 14px;
            opacity: 0.9;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="loading-container">
        <img src="app/ltthappicon.png" class="logo" alt="LTTH">
        <h1>LTTH wird gestartet...</h1>
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <div class="status" id="status">Server wird initialisiert...</div>
    </div>

    <script>
        const { spawn } = require('child_process');
        const path = require('path');
        const http = require('http');

        let win = nw.Window.get();
        win.show();

        function updateStatus(text) {
            document.getElementById('status').textContent = text;
        }

        function checkServer(maxAttempts = 30, attempt = 1) {
            http.get('http://localhost:3000', (res) => {
                if (res.statusCode === 200 || res.statusCode === 304) {
                    updateStatus('Server läuft, öffne Dashboard...');
                    setTimeout(() => {
                        window.location.href = 'http://localhost:3000';
                    }, 500);
                } else {
                    retry();
                }
            }).on('error', (err) => {
                retry();
            });

            function retry() {
                if (attempt < maxAttempts) {
                    setTimeout(() => {
                        checkServer(maxAttempts, attempt + 1);
                    }, 1000);
                } else {
                    updateStatus('Server konnte nicht gestartet werden. Bitte manuell starten.');
                }
            }
        }

        // Node.js Server starten
        const serverPath = path.join(process.cwd(), 'app', 'server.js');
        const nodeProcess = spawn('node', [serverPath], {
            cwd: path.join(process.cwd(), 'app'),
            stdio: 'inherit'
        });

        nodeProcess.on('error', (err) => {
            updateStatus('Fehler beim Starten: ' + err.message);
            console.error('Server start error:', err);
        });

        // Warte 2 Sekunden, dann prüfe ob Server läuft
        updateStatus('Warte auf Server...');
        setTimeout(() => {
            checkServer();
        }, 2000);

        // Cleanup beim Schließen
        win.on('close', function() {
            nodeProcess.kill();
            this.close(true);
        });
    </script>
</body>
</html>
```

---

## 🏗️ Build-Konfiguration

### nw-builder Konfiguration

Erstelle `nwbuild.json`:

```json
{
  "mode": "build",
  "version": "0.83.0",
  "flavor": "normal",
  "platform": "win",
  "arch": "x64",
  "srcDir": "./",
  "outDir": "./dist",
  "cacheDir": "./cache",
  "buildType": "default",
  "winIco": "./build-src/icon.ico",
  "macIcns": "./build-src/icon.icns",
  "zip": false,
  "glob": true,
  "excludes": [
    "node_modules/electron*/**",
    "dist/**",
    "cache/**",
    "screenshots/**",
    ".git/**",
    ".github/**",
    "*.md",
    "build-src/**"
  ]
}
```

---

## 📦 Build-Prozess

### 1. Development Build testen

```bash
# Direkt starten (Development)
npx nw .

# Mit DevTools
npx nw . --remote-debugging-port=9222
```

### 2. Production Build

```bash
# Windows x64
npx nw-builder --mode=build --platform=win --arch=x64 .

# Output: dist/ltth-nwjs-win-x64/
```

### 3. Mit Installer (NSIS)

Nach dem Build NSIS-Installer erstellen (ähnlich zu 01_NSIS_INSTALLER_GUIDE.md):

```nsis
; NSIS-Skript für NW.js Build
!define PRODUCT_NAME "LTTH"
!define PRODUCT_VERSION "1.1.0"

OutFile "LTTH-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME}"

Section "Install"
    SetOutPath $INSTDIR
    File /r "dist\ltth-nwjs-win-x64\*.*"
    
    CreateShortCut "$DESKTOP\LTTH.lnk" "$INSTDIR\nw.exe"
    CreateDirectory "$SMPROGRAMS\LTTH"
    CreateShortCut "$SMPROGRAMS\LTTH\LTTH.lnk" "$INSTDIR\nw.exe"
    
    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd
```

---

## 🔄 Migration von Electron

### Was muss geändert werden?

#### 1. Keine main.js mehr
Electron's `main.js` wird durch `nw-bootstrap.html` ersetzt.

#### 2. IPC nicht nötig
NW.js hat Node.js direkt im Renderer, kein IPC erforderlich:

```javascript
// Electron (IPC):
const { ipcRenderer } = require('electron');
ipcRenderer.send('do-something', data);

// NW.js (direkt):
const fs = require('fs');
fs.writeFileSync('file.txt', data);
```

#### 3. Window Management

```javascript
// Electron:
const { BrowserWindow } = require('electron');
let win = new BrowserWindow({ width: 800, height: 600 });

// NW.js:
let win = nw.Window.get();
win.resizeTo(800, 600);

// Oder neues Fenster:
nw.Window.open('other.html', {width: 800, height: 600});
```

#### 4. System-Tray

```javascript
// Electron:
const { Tray } = require('electron');
let tray = new Tray('icon.png');

// NW.js:
let tray = new nw.Tray({ icon: 'icon.png' });
tray.on('click', () => {
    win.show();
});
```

---

## 🧪 Testing

```bash
# Unit-Tests (bestehende bleiben gleich)
cd app
npm test

# E2E-Tests mit NW.js
npx nw . --test
```

---

## 📊 Vergleich: Vorher/Nachher

| Metrik | Electron | NW.js |
|--------|----------|-------|
| Bundle-Größe | ~150 MB | ~100-120 MB |
| RAM-Verbrauch | ~200 MB | ~150 MB |
| Startup-Zeit | ~3s | ~2s |
| Node.js-Integration | IPC | Direkt |
| Code-Änderungen | - | Minimal |

---

## 🐛 Troubleshooting

### Problem: "Cannot find module 'better-sqlite3'"
**Lösung:** Native Module neu kompilieren:
```bash
npm install --save-dev nw-gyp
npm rebuild --runtime=node-webkit --target=0.83.0
```

### Problem: Server startet nicht
**Lösung:** Prüfe Pfade in nw-bootstrap.html:
```javascript
console.log('CWD:', process.cwd());
console.log('Server path:', serverPath);
```

### Problem: "DevTools not available"
**Lösung:** SDK-Flavor nutzen für Development:
```bash
npx nw . --flavor=sdk
```

---

## 🎯 Nächste Schritte

1. **Auto-Updates:** Implementiere Update-Check
2. **Code-Signing:** Signiere nw.exe
3. **Weitere Optimierung:** Kleinere Bundle-Größe durch Tree-Shaking

---

**Geschätzte Migrations-Zeit:** 1-2 Wochen  
**Risiko:** Niedrig  
**ROI:** Mittel (kleinere Bundles, einfachere Architektur)
