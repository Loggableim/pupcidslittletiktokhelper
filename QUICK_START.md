# Quick Setup Guide - Next Steps

## ✅ Was bereits erledigt wurde:
- Icons wurden erfolgreich generiert
- Update-Signing-Keys wurden erstellt
- Tauri CLI Scripts wurden korrigiert

## ⚠️ WICHTIG: Update-Keys sicher aufbewahren!

Die Update-Keys wurden im Projektverzeichnis erstellt. Sie müssen diese an einen sicheren Ort verschieben:

### Windows (PowerShell):
```powershell
# Erstelle das .tauri Verzeichnis im Home-Verzeichnis
mkdir $env:USERPROFILE\.tauri -Force

# Verschiebe die Keys an einen sicheren Ort
Move-Item ~\.tauri\tiktok-stream-tool.key $env:USERPROFILE\.tauri\tiktok-stream-tool.key
Move-Item ~\.tauri\tiktok-stream-tool.key.pub $env:USERPROFILE\.tauri\tiktok-stream-tool.key.pub

# Lösche das falsche Verzeichnis
Remove-Item -Recurse -Force ~\.tauri
```

## 📝 Public Key in tauri.conf.json einfügen

1. **Public Key anzeigen:**
```powershell
Get-Content $env:USERPROFILE\.tauri\tiktok-stream-tool.key.pub
```

2. **Den angezeigten Key kopieren** (die gesamte Zeile)

3. **Datei öffnen:** `src-tauri\tauri.conf.json`

4. **Suche nach:** `"pubkey": "WILL_BE_GENERATED_LATER"`

5. **Ersetze** `WILL_BE_GENERATED_LATER` mit dem kopierten Public Key

Beispiel:
```json
"updater": {
  "active": true,
  "endpoints": [...],
  "dialog": true,
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk..."
}
```

## 🚀 Jetzt testen!

Nach dem Einfügen des Public Keys:

```powershell
npm run tauri:dev
```

Das startet die App im Entwicklungsmodus!

## 📦 Build für Windows

```powershell
# Setze die Umgebungsvariablen für das Signing
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $env:USERPROFILE\.tauri\tiktok-stream-tool.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "DEIN_PASSWORT"

# Baue die App
npm run tauri:build:win
```

Der Installer wird dann hier erstellt:
`src-tauri\target\release\bundle\nsis\`

## ⚠️ Sicherheitshinweise

- **NIEMALS** den Private Key (.key) ins Git committen!
- Der Public Key (.pub) kann sicher geteilt werden
- Passwort sicher aufbewahren (ohne Passwort kann Key nicht verwendet werden)
- Backup der Keys erstellen!

## 🔧 Troubleshooting

**"Error: failed to bundle project"**
- Stelle sicher, dass der Public Key in tauri.conf.json eingefügt wurde

**"WebView2 not found"**
- Windows 10/11 hat WebView2 normalerweise vorinstalliert
- Falls nicht, wird es automatisch mit dem Installer gebündelt

**"Node.js server not starting"**
- Port 3000 muss frei sein
- Node.js muss im PATH sein
