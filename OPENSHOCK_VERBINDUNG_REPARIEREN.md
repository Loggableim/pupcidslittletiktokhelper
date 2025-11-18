# OpenShock API Verbindungsprobleme Beheben

## Problem: "Die OpenShock API Verbindung funktioniert nicht"

Dieses Dokument hilft Ihnen, Verbindungsprobleme mit der OpenShock API zu beheben.

---

## ✅ Schnelle Lösung (häufigste Ursache)

**Das Problem ist meist ein ungültiger oder abgelaufener API-Schlüssel.**

### Lösung:

1. **Neuen API-Schlüssel generieren:**
   - Gehen Sie zu: https://openshock.app/dashboard/tokens
   - Löschen Sie den alten Token
   - Erstellen Sie einen neuen Token

2. **API-Schlüssel im Plugin eintragen:**
   - Öffnen Sie die Plugin-Einstellungen
   - Navigieren Sie zum OpenShock Plugin
   - Geben Sie den neuen API-Schlüssel ein
   - Klicken Sie auf "Speichern"

3. **Verbindung testen:**
   - Klicken Sie auf "Verbindung testen"
   - Sie sollten eine Erfolgsmeldung sehen

---

## 🔍 Weitere mögliche Ursachen

### 1. Netzwerkprobleme

**Symptome:**
- Fehlermeldung: "Cannot reach OpenShock API server"
- Fehlermeldung: "DNS resolution failed"
- Fehlermeldung: "Connection timed out"

**Lösungen:**

✅ **Internetverbindung prüfen:**
```bash
ping google.com
```

✅ **OpenShock Status prüfen:**
- Besuchen Sie: https://status.openshock.app/
- Prüfen Sie, ob der Dienst online ist

✅ **Firewall-Einstellungen:**
- Stellen Sie sicher, dass `api.openshock.app` nicht blockiert ist
- Ports: HTTPS (443) muss offen sein

✅ **DNS-Problem beheben:**
```bash
# Test ob DNS funktioniert
nslookup api.openshock.app

# Falls nicht, versuchen Sie:
# - Router neustarten
# - DNS-Server ändern (z.B. 8.8.8.8, 1.1.1.1)
```

### 2. Ungültige Berechtigungen

**Symptome:**
- HTTP 401: Unauthorized
- HTTP 403: Forbidden

**Lösung:**
- API-Schlüssel hat möglicherweise nicht die richtigen Berechtigungen
- Generieren Sie einen neuen API-Schlüssel mit allen Berechtigungen
- Link: https://openshock.app/dashboard/tokens

### 3. Rate Limit überschritten

**Symptome:**
- HTTP 429: Too Many Requests
- Fehlermeldung: "Rate limit exceeded"

**Lösung:**
- Warten Sie 1 Minute
- OpenShock API erlaubt maximal 60 Anfragen pro Minute
- Das Plugin respektiert dieses Limit automatisch

### 4. Konfiguration wird nicht übernommen

**Symptome:**
- API-Schlüssel geändert, aber Verbindung funktioniert immer noch nicht
- Alte Fehlermeldungen erscheinen weiterhin

**Lösung:**
- Server neu starten: `npm restart` oder `node server.js`
- Browser-Cache leeren (Strg+F5)
- Überprüfen Sie, dass der API-Schlüssel korrekt gespeichert wurde

---

## 🧪 Verbindung Testen

### Option 1: Über das Plugin-Interface

1. Gehen Sie zu Plugin-Einstellungen
2. OpenShock Plugin öffnen
3. Klicken Sie auf "Verbindung testen"
4. Warten Sie auf das Ergebnis

### Option 2: Mit dem Test-Script

```bash
# Mit Umgebungsvariable
export OPENSHOCK_API_KEY="ihr-api-schlüssel-hier"
node test-openshock-api.js

# Oder direkt als Parameter
node test-openshock-api.js "ihr-api-schlüssel-hier"
```

**Erwartete Ausgabe bei Erfolg:**
```
=== Testing GET /1/shockers/own ===
✅ Success!
Status: 200
Found 1 device(s)
  Device "Mein Hub": 2 shocker(s)
    - Shocker ID: xxx-xxx-xxx, Name: Shocker 1
    - Shocker ID: yyy-yyy-yyy, Name: Shocker 2
```

**Bei Fehler:**
Das Script zeigt hilfreiche Fehlermeldungen mit Lösungsvorschlägen.

---

## 📝 Fehlermeldungen und ihre Bedeutung

### "Cannot reach OpenShock API server (DNS resolution failed)"

**Bedeutung:** Der Server kann nicht gefunden werden

**Mögliche Ursachen:**
- ❌ Keine Internetverbindung
- ❌ OpenShock Server ist offline
- ❌ DNS-Problem
- ❌ Firewall blockiert die Verbindung

**Lösungen:**
1. Internetverbindung prüfen
2. https://status.openshock.app/ besuchen
3. DNS-Server ändern
4. Firewall-Einstellungen prüfen

### "HTTP 401: Invalid API key"

**Bedeutung:** API-Schlüssel ist ungültig oder abgelaufen

**Lösung:**
1. Neuen API-Schlüssel generieren: https://openshock.app/dashboard/tokens
2. In Plugin-Einstellungen eintragen
3. Verbindung erneut testen

### "HTTP 403: Forbidden"

**Bedeutung:** API-Schlüssel hat keine Berechtigung

**Lösung:**
- Neuen API-Schlüssel mit allen Berechtigungen generieren
- Sicherstellen, dass der Schlüssel für die richtigen Geräte gilt

### "Connection timed out"

**Bedeutung:** Server antwortet nicht rechtzeitig

**Mögliche Ursachen:**
- ❌ Langsame Internetverbindung
- ❌ Server überlastet
- ❌ Firewall verzögert Verbindung

**Lösungen:**
1. Internetgeschwindigkeit prüfen
2. Später erneut versuchen
3. Firewall-Einstellungen prüfen

### "HTTP 429: Rate limit exceeded"

**Bedeutung:** Zu viele Anfragen in kurzer Zeit

**Lösung:**
- 1 Minute warten
- Das Plugin respektiert das Limit normalerweise automatisch
- Falls häufig auftritt: Plugins prüfen, die evtl. zu viele Anfragen senden

---

## 🔒 Sicherheitshinweise

### ⚠️ WICHTIG: API-Schlüssel schützen

- **Teilen Sie Ihren API-Schlüssel NIE öffentlich**
- **Commiten Sie API-Schlüssel NICHT in Git**
- **Falls Sie einen Schlüssel versehentlich geteilt haben:**
  1. Sofort bei https://openshock.app/dashboard/tokens löschen
  2. Neuen Schlüssel generieren
  3. Im Plugin aktualisieren

### API-Schlüssel speichern

✅ **Richtig:**
```bash
# Als Umgebungsvariable
export OPENSHOCK_API_KEY="ihr-schlüssel"

# Oder in .env Datei (NICHT committen!)
OPENSHOCK_API_KEY=ihr-schlüssel
```

❌ **Falsch:**
```javascript
// NIEMALS direkt im Code!
const API_KEY = 'mein-api-schlüssel-123';
```

---

## 🛠️ Erweiterte Fehlersuche

### Debug-Logging aktivieren

1. Öffnen Sie `plugins/openshock/helpers/openShockClient.js`
2. Das Logging ist bereits aktiviert
3. Überprüfen Sie die Konsole/Logs für detaillierte Informationen

### Manuelle API-Anfrage testen

```bash
# Mit curl testen
curl -X GET "https://api.openshock.app/1/shockers/own" \
  -H "Open-Shock-Token: IHR-API-SCHLÜSSEL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "User-Agent: OpenShockClient/1.0"
```

**Erwartete Antwort:**
```json
{
  "message": "",
  "data": [
    {
      "id": "device-uuid",
      "name": "Mein Hub",
      "shockers": [...]
    }
  ]
}
```

### Netzwerk-Trace

```bash
# Mit traceroute
traceroute api.openshock.app

# Oder mit tracert (Windows)
tracert api.openshock.app
```

Dies zeigt den Netzwerkpfad zum Server und hilft, Netzwerkprobleme zu identifizieren.

---

## 📞 Hilfe erhalten

Falls die Verbindung immer noch nicht funktioniert:

1. **OpenShock Discord:** https://discord.gg/openshock
2. **OpenShock Dokumentation:** https://wiki.openshock.org/
3. **GitHub Issues:** Erstellen Sie ein Issue mit:
   - Fehlermeldung (ohne API-Schlüssel!)
   - Betriebssystem
   - Node.js Version (`node --version`)
   - Plugin Version

---

## ✅ Checkliste

Gehen Sie diese Punkte durch:

- [ ] Neuen API-Schlüssel generiert
- [ ] API-Schlüssel in Plugin-Einstellungen eingetragen
- [ ] Server neugestartet
- [ ] Verbindungstest durchgeführt
- [ ] Internetverbindung funktioniert
- [ ] OpenShock Server ist online (status.openshock.app)
- [ ] Firewall lässt api.openshock.app zu
- [ ] Keine Rate-Limit-Fehler
- [ ] Browser-Cache geleert

---

## 🎉 Erfolgreich verbunden?

Nach erfolgreicher Verbindung können Sie:

1. **Geräte sehen:** Liste Ihrer OpenShock-Geräte erscheint
2. **Befehle testen:** Test-Buttons (Vibration, Shock, Sound) verwenden
3. **TikTok-Mappings erstellen:** Events mit Aktionen verknüpfen
4. **Patterns erstellen:** Eigene Befehlsabfolgen definieren

Viel Spaß mit dem OpenShock Plugin! 🎊
