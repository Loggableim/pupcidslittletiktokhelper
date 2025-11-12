# 🚀 TTS Plugin v2.0 - Quickstart Guide

## ⚠️ WICHTIG: Server neu starten!

Nach den letzten Updates **muss der Server neu gestartet werden**:

```bash
# Server stoppen (Strg+C oder Cmd+C)
# Dann neu starten:
npm start
```

---

## 🔍 Schritt-für-Schritt Anleitung

### 1. Server starten
```bash
cd /home/user/pupcidslittletiktokhelper
npm start
```

Warten bis Sie sehen:
```
✅ All modules initialized
🔌 Plugin Loader initialized
📂 Plugin static files served from /plugins/*
✅ Plugin routes registered
[Plugin:tts] TTS Plugin initialized successfully
```

### 2. Diagnose-Test durchführen
Öffnen Sie im Browser:
```
http://localhost:3000/plugins/tts/ui/test.html
```

**Erwartetes Ergebnis**: Alle Tests sollten ✓ (grün) sein

**Häufige Probleme**:
- ❌ Test 2-3 fehlgeschlagen → Plugin nicht geladen
- ❌ Test 6-7 fehlgeschlagen → Statische Dateien nicht erreichbar
- ❌ Test 4 "DISABLED" → Plugin muss aktiviert werden

### 3. Plugin aktivieren (falls nötig)

**Option A: Über Dashboard**
1. `http://localhost:3000/dashboard.html`
2. Tab "Plugins" öffnen
3. TTS Plugin suchen
4. Toggle-Switch auf "Enabled"

**Option B: Via API**
```bash
curl -X POST http://localhost:3000/api/plugins/tts/enable
```

### 4. TTS Admin-Panel öffnen

**Option A: Über Dashboard** (Empfohlen)
1. `http://localhost:3000/dashboard.html`
2. Tab "TTS v2.0" klicken
3. Admin-Panel sollte im Iframe laden

**Option B: Direkter Zugriff**
```
http://localhost:3000/plugins/tts/ui/admin-panel.html
```

### 5. Konfiguration

Im Admin-Panel:

**Configuration Tab:**
1. Default Engine: `tiktok` (kostenlos)
2. Default Voice: `de_002` (Deutsch Weiblich) oder `en_us_001` (English)
3. Volume: `80`
4. Team Min Level: `0` (alle dürfen TTS nutzen)
5. Enable TTS for Chat: ✓ (aktiviert)
6. **"Save Configuration"** klicken

### 6. Ersten TTS-Test

**Queue & Playback Tab:**
1. Test-Text eingeben: `Hallo, ich bin ein Test`
2. **"Speak"** Button klicken
3. Audio sollte generiert und in Queue eingereiht werden
4. Im "Now Playing" Bereich sollte der Text erscheinen

---

## 🐛 Troubleshooting

### Problem: Admin-Panel ist leer / keine Einstellungen

**Lösung 1: Server neu starten**
```bash
# Strg+C zum Stoppen
npm start
```

**Lösung 2: Browser-Cache leeren**
- Strg+Shift+R (Chrome/Firefox)
- Oder Inkognito-Fenster verwenden

**Lösung 3: Diagnose durchführen**
```
http://localhost:3000/plugins/tts/ui/test.html
```

### Problem: "Plugin not found" Fehler

**Prüfen ob Plugin-Verzeichnis existiert:**
```bash
ls -la plugins/tts/
```

Sollte zeigen:
```
drwxr-xr-x  engines/
drwxr-xr-x  ui/
drwxr-xr-x  utils/
-rw-r--r--  main.js
-rw-r--r--  plugin.json
-rw-r--r--  README.md
```

### Problem: TTS wird nicht abgespielt

**Prüfen Sie:**
1. Im Browser-Console auf Fehler prüfen (F12)
2. Audio-Ausgabe im Browser aktiviert?
3. Queue-Status prüfen:
   ```bash
   curl http://localhost:3000/api/tts/queue
   ```

### Problem: "Express routes cannot be unregistered" Warning

**Status**: ℹ️ Normal - Kein Fehler!

Diese Warnung ist **erwartet** und kein Problem:
- Erscheint nur beim Plugin-Reload
- Im normalen Betrieb keine Auswirkung
- Bei Entwicklung: Server neu starten statt Reload

---

## ✅ Checkliste

- [ ] Server neu gestartet nach Updates
- [ ] Diagnose-Test erfolgreich (alle grün)
- [ ] Plugin in Plugin-Liste sichtbar und "enabled"
- [ ] Admin-Panel lädt (nicht leer)
- [ ] Konfiguration speicherbar
- [ ] Test-TTS funktioniert
- [ ] Stimmen werden angezeigt

---

## 📞 Support

Falls Probleme bestehen:

1. **Logs prüfen**:
   ```bash
   # Server-Output während Start beobachten
   npm start
   ```

2. **Browser Console prüfen**:
   - F12 → Console Tab
   - Fehler kopieren

3. **Diagnose-Output teilen**:
   - `http://localhost:3000/plugins/tts/ui/test.html`
   - Screenshot machen

4. **API-Test**:
   ```bash
   curl http://localhost:3000/api/tts/config
   curl http://localhost:3000/api/plugins
   ```

---

## 🎯 Erwartetes Verhalten nach korrekter Installation

### Server-Start Output:
```
✅ Database initialized
✅ All modules initialized
🔌 Plugin Loader initialized
📂 Plugin static files served from /plugins/*
✅ Plugin routes registered
[Plugin:tts] TTS Plugin initialized successfully
[Plugin:tts] TTS Plugin: All systems ready
🚀 Server running on http://localhost:3000
```

### Dashboard → TTS v2.0 Tab:
- Header: "🔊 TTS v2.0 - Enterprise Text-to-Speech System"
- Tabs sichtbar: Configuration, User Management, Queue, Statistics
- Alle Einstellungs-Felder sichtbar
- "Save Configuration" Button funktioniert

### Nach erstem Test-TTS:
- Queue zeigt Item an
- "Now Playing" zeigt Text
- Audio wird abgespielt
- Queue-Counter erhöht sich

---

**Version**: 2.0.0
**Letzte Aktualisierung**: 2025-01-12
