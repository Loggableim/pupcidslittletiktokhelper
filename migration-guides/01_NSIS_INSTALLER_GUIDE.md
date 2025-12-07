# NSIS Installer Implementation Guide für LTTH

**Ziel:** Setup.exe mit NSIS für LTTH erstellen  
**Aufwand:** 1-2 Tage  
**Schwierigkeit:** Niedrig  

---

## 📋 Übersicht

Diese Lösung erstellt einen professionellen Windows-Installer unter Verwendung der bereits vorhandenen `launcher.exe` und `ltthgit.exe`.

### Was wird installiert?
- Node.js Portable Runtime
- LTTH Backend (`app/` Ordner)
- Go-Launcher (`launcher.exe`)
- Desktop & Startmenü-Shortcuts
- Uninstaller

---

## 🔧 Voraussetzungen

### Software
1. **NSIS (Nullsoft Scriptable Install System)**
   - Download: https://nsis.sourceforge.io/Download
   - Version: 3.x oder höher
   - Installation: Standard-Setup durchlaufen

2. **Node.js Portable**
   - Download: https://nodejs.org/dist/v18.19.1/node-v18.19.1-win-x64.zip
   - Oder aktuellste LTS: https://nodejs.org/dist/latest-v18.x/
   - Extrahieren nach: `build-src/assets/node/`

3. **7-Zip** (optional, für Tests)
   - Download: https://www.7-zip.org/

---

## 📂 Verzeichnis-Struktur

```
pupcidslittletiktokhelper/
├── build-src/
│   ├── installer/
│   │   ├── ltth-installer.nsi      # NSIS-Skript (NEU)
│   │   ├── installer-header.bmp    # Header-Bild (NEU, optional)
│   │   ├── installer-sidebar.bmp   # Sidebar-Bild (NEU, optional)
│   │   └── license.txt             # Lizenztext (NEU, optional)
│   ├── assets/
│   │   └── node/                   # Node.js Portable (NEU)
│   │       ├── node.exe
│   │       ├── npm
│   │       └── node_modules/
│   ├── launcher.exe                # Bestehend
│   └── icon.ico                    # Bestehend
├── app/                            # Bestehend
└── package.json                    # Bestehend
```

---

## 📝 Schritt-für-Schritt Anleitung

Siehe vollständige Anleitung in der Datei.

---

**Installer-Größe:** ~150-200 MB  
**Installation-Zeit:** ~30-60 Sekunden  
**Deinstallation:** Sauber, alle Dateien entfernt  
