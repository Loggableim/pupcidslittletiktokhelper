# Launcher & Update-System: Problemanalyse

**Datum:** 2025-11-09
**Analysiert von:** Claude AI

---

## 📋 Identifizierte Probleme

### 1. start.sh (Bash/Linux/macOS)

#### Problem: echo -e ist nicht universell
- **Zeilen:** 48, 50, 60, 66, 68, 76, 84, etc.
- **Issue:** `echo -e` funktioniert nicht unter Powershell/CMD, zeigt Escape-Sequenzen wortwörtlich
- **Impact:** Farbige Ausgaben werden roh angezeigt (z.B. `\033[31m[FEHLER]\033[0m`)

#### Problem: Shell-basierter Node-Version-Check
- **Zeile 63:** `NODE_MAJOR=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)`
- **Issue:** Kann bei leerem oder falschem Format fehlschlagen
- **Fehler:** `bash: [: : integer expression expected`
- **Impact:** Script bricht ab wenn Variable nicht numerisch

#### Problem: Integer-Vergleiche unsicher
- **Zeilen:** 65, 74
- **Code:** `if [ "$NODE_MAJOR" -lt 18 ]; then`
- **Issue:** Schlägt fehl wenn `$NODE_MAJOR` leer oder nicht numerisch ist
- **Impact:** Script-Abbruch mit kryptischer Fehlermeldung

#### Problem: Git-Abhängigkeit
- **Zeilen:** 94-158
- **Issue:** Update funktioniert nur in Git-Repositories
- **Meldung:** `⚠️ Nicht in einem Git-Repository. Update-Check übersprungen.`
- **Impact:** Benutzer die ZIP-Download verwenden können nicht updaten

#### Problem: TTY-Erkennung unvollständig
- **Zeile 8:** `if [ -t 1 ]; then`
- **Issue:** TTY wird erkannt, aber `echo -e` funktioniert trotzdem nicht überall
- **Impact:** Farben werden falsch angezeigt in non-TTY (OBS, Redirects)

---

### 2. start.bat (Windows/Batch)

#### Problem: Keine farbigen Ausgaben
- **Alle Zeilen:** Nur `echo [OK]`, `echo [FEHLER]`, etc.
- **Issue:** Keine Farben, nur Text
- **Impact:** Schlechtere UX im Vergleich zu Linux-Version

#### Problem: Git-Update rudimentär
- **Zeilen:** 67-89
- **Issue:** Nur Check ob Update verfügbar, kein automatischer Download
- **Impact:** Benutzer müssen manuell `git pull` ausführen

#### Problem: Fehlerbehandlung inkonsistent
- **Verschiedene Stellen:** Manche Fehler werden mit `pause` abgefangen, andere nicht
- **Impact:** Uneinheitliches Verhalten bei Fehlern

#### Problem: Kein Backup/Rollback
- **Gesamtes Script:** Kein Backup vor Updates
- **Impact:** Keine Rückfallposition bei fehlgeschlagenen Updates

---

### 3. modules/update-checker.js

#### Problem: Syntax-Fehler / Duplikate
- **Zeilen 95-109:**
```javascript
if (error.response) {
    this.logger.warn(`GitHub API Error: ${error.response.status}`);
this.logger.error(`Failed to check for updates: ${error.message}`); // Duplikat
// ... mehrfache return-Statements
```
- **Issue:** Code-Duplikate, falsche Einrückung, mehrfache returns
- **Impact:** Verwirrende Logs, potentielle Bugs

#### Problem: downloadUpdate() nur für Git
- **Zeilen 164-224:**
```javascript
if (!fs.existsSync(gitDir)) {
    return {
        success: false,
        error: 'Das Projekt ist kein Git-Repository. Bitte manuell von GitHub herunterladen.'
    };
}
```
- **Issue:** Keine Alternative für Non-Git-Installationen
- **Impact:** Benutzer ohne Git können nicht updaten

#### Problem: Kein Backup vor Update
- **Gesamte Funktion downloadUpdate():** Führt `git pull` ohne Backup aus
- **Impact:** Bei Fehler keine Rückfallposition

#### Problem: Kein Rollback-Mechanismus
- **Gesamtes Modul:** Keine Rollback-Funktion bei fehlgeschlagenen Updates
- **Impact:** Beschädigte Installation bei Update-Fehlern

#### Problem: Keine Platform-spezifische Logik
- **Gesamtes Modul:** Keine Unterscheidung Windows/Linux/macOS
- **Impact:** Gleiche Git-Commands werden überall ausgeführt, egal ob unterstützt

---

## 🎯 Anforderungen für neue Implementierung

### Muss-Features

✅ **Cross-Platform:** Windows, Linux, macOS vollständig unterstützt
✅ **TTY-sicheres Logging:** Automatische Erkennung, Fallback auf Plain Text
✅ **Git-unabhängig:** Updates auch ohne Git-Repository
✅ **Robuste Version-Checks:** Node/npm Version-Prüfung in JavaScript
✅ **Backup vor Update:** Automatisches Backup user_data/ und user_configs/
✅ **Rollback bei Fehler:** Automatisches Wiederherstellen bei fehlgeschlagenem Update
✅ **GitHub Release Download:** Unterstützung für ZIP-basierte Updates
✅ **Dependency-Management:** Intelligente npm install/ci Entscheidung
✅ **Klare Status-Meldungen:** Einheitliche, verständliche Ausgaben
✅ **Dashboard-Integration:** Kompatibel mit bestehendem Update-UI

### Architektur

**Neue Module:**

1. **modules/launcher.js**
   - Platform-agnostisches Launcher-Modul
   - TTY-Logging
   - Node/npm Version-Check
   - Dependency-Check
   - Integration mit Update-Manager

2. **modules/update-manager.js** (ersetzt update-checker.js)
   - Git-basiertes Update (wenn vorhanden)
   - GitHub Release ZIP Download (ohne Git)
   - Backup vor Update
   - Rollback bei Fehler
   - Progress-Tracking
   - Platform-agnostisch

3. **launch.js** (neu, root-level)
   - Haupt-Einstiegspunkt
   - Ruft modules/launcher.js auf
   - Minimale Logik (nur Bootstrap)

**Überarbeitete Scripts:**

4. **start.sh** (überarbeitet)
   - Minimalistisch: Prüft nur Node-Verfügbarkeit
   - Ruft `node launch.js` auf
   - Kein Shell-Logic mehr

5. **start.bat** (überarbeitet)
   - Minimalistisch: Prüft nur Node-Verfügbarkeit
   - Ruft `node launch.js` auf
   - Kein Batch-Logic mehr

---

## 🔧 Technische Details

### TTY-Detection in Node.js

```javascript
const isTTY = process.stdout.isTTY;
const supportsColor = isTTY && process.stdout.hasColors && process.stdout.hasColors();

function log(message, color = null) {
    if (supportsColor && color) {
        console.log(`${color}${message}\x1b[0m`);
    } else {
        console.log(message);
    }
}
```

### Platform Detection

```javascript
const platform = process.platform; // 'win32', 'darwin', 'linux'
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';
```

### Version Comparison (Semver)

```javascript
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(n => parseInt(n) || 0);
    const parts2 = v2.split('.').map(n => parseInt(n) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}
```

### Backup Strategy

```javascript
// Backup vor Update:
// 1. Erstelle backup_TIMESTAMP/ Ordner
// 2. Kopiere user_data/ → backup_TIMESTAMP/user_data/
// 3. Kopiere user_configs/ → backup_TIMESTAMP/user_configs/
// 4. Kopiere package.json, package-lock.json

// Rollback bei Fehler:
// 1. Lösche fehlerhafte Dateien
// 2. Restore aus backup_TIMESTAMP/
// 3. Melde Fehler an Benutzer
```

### Update-Strategien

**Git-basiert (wenn .git/ vorhanden):**
```bash
1. git fetch origin
2. git diff --name-only HEAD origin/main
3. Backup erstellen
4. git pull origin main
5. npm install (wenn package.json geändert)
6. Bei Fehler: Rollback
```

**GitHub Release (ohne Git):**
```javascript
1. GET https://api.github.com/repos/USER/REPO/releases/latest
2. Download zipball_url
3. Backup erstellen
4. Entpacke ZIP (außer user_data/, user_configs/)
5. npm install
6. Bei Fehler: Rollback
```

---

## 📝 Migration Plan

### Phase 1: Neue Module erstellen
- ✅ modules/launcher.js
- ✅ modules/update-manager.js

### Phase 2: Launcher-Scripts überarbeiten
- ✅ launch.js (root)
- ✅ start.sh (minimal)
- ✅ start.bat (minimal)

### Phase 3: Integration & Testing
- ✅ Dashboard-API anpassen (evtl.)
- ✅ Tests durchführen (Windows, Linux, macOS)

### Phase 4: Dokumentation
- ✅ CHANGELOG.md aktualisieren
- ✅ infos/llm_start_here.md aktualisieren
- ✅ llm_info erstellen

---

**Status:** Analyse abgeschlossen, bereit für Implementierung
