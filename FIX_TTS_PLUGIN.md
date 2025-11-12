# 🔧 TTS Plugin Fix - DEPENDENCIES FEHLEN!

## ⚠️ PROBLEM

Das TTS-Plugin kann nicht geladen werden, weil die Node.js Dependencies nicht installiert sind!

**Fehlermeldung:**
```
Error: Cannot find module 'axios'
Error: Cannot find module 'franc-min'
```

**Ursache:**
`node_modules/` Verzeichnis existiert nicht → Dependencies wurden nie installiert

---

## ✅ LÖSUNG

### **Schritt 1: Dependencies installieren**

Im Projektverzeichnis ausführen:

```bash
cd /home/user/pupcidslittletiktokhelper
npm install
```

**Das installiert alle Dependencies aus package.json, inklusive:**
- axios (für HTTP-Requests)
- franc-min (für Spracherkennung)
- socket.io
- express
- better-sqlite3
- und alle anderen...

**Erwartete Ausgabe:**
```
added XXX packages from XXX contributors
```

### **Schritt 2: Server starten**

```bash
npm start
```

**Erwartete Ausgabe:**
```
✅ All modules initialized
🔌 Plugin Loader initialized
[Plugin:tts] TTS Plugin initialized successfully
[Plugin:tts] TTS Plugin: All systems ready
🚀 Server running on http://localhost:3000
```

### **Schritt 3: Überprüfen**

Browser öffnen:
```
http://localhost:3000/plugins/tts/ui/test.html
```

Alle Tests sollten ✓ (grün) sein!

---

## 🔍 Warum passierte das?

Mögliche Gründe:
1. `npm install` wurde nach dem git clone nie ausgeführt
2. `node_modules/` wurde versehentlich gelöscht
3. `.gitignore` verhindert, dass node_modules committet wird (normal)

---

## 📋 Checkliste

- [ ] Im richtigen Verzeichnis: `/home/user/pupcidslittletiktokhelper`
- [ ] `npm install` ausgeführt
- [ ] `node_modules/` Verzeichnis existiert jetzt
- [ ] `npm start` ausgeführt
- [ ] Server läuft ohne Fehler
- [ ] TTS Plugin in Plugin-Liste sichtbar
- [ ] Test-Seite zeigt alle ✓ grün

---

## 🐛 Falls es noch nicht funktioniert

### Check 1: Sind die Dependencies installiert?
```bash
ls node_modules/ | grep -E "^(axios|franc)" && echo "✓ Dependencies installed"
```

### Check 2: Läuft der Server?
```bash
curl http://localhost:3000/api/plugins | grep -A 5 '"id": "tts"'
```

### Check 3: Plugin-Load-Fehler im Log?
```bash
# Im Server-Output nach Fehlern suchen:
# [Plugin:tts] <-- sollte sichtbar sein
```

---

## 📞 Hilfe

Wenn nach `npm install` und `npm start` das Plugin immer noch nicht lädt:

1. **Server-Log kopieren** (komplette Ausgabe)
2. **Browser Console prüfen** (F12 → Console)
3. **Test-Seite Result** kopieren: http://localhost:3000/plugins/tts/ui/test.html

---

**Version**: 2.0.0
**Letzte Aktualisierung**: 2025-01-12
