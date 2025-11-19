# EulerStream Key Test - Anleitung

## Problem
Du hast zwei verschiedene Schlüssel und musst herausfinden, welcher für WebSocket-Verbindungen funktioniert:

1. **Webhook Secret** (hexadezimal): `69247cb1f28bac46e315f650c64507e828acb4f61718b2bf5526c5fbbdebb7a8`
2. **REST API Key** (euler_ prefix): `euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2`

## Test 1: Webhook Secret verwenden

```bash
# Setze den Webhook Secret als EULER_API_KEY
export EULER_API_KEY=69247cb1f28bac46e315f650c64507e828acb4f61718b2bf5526c5fbbdebb7a8

# Starte die Anwendung
npm start
```

**Oder** in der `.env` Datei:
```
EULER_API_KEY=69247cb1f28bac46e315f650c64507e828acb4f61718b2bf5526c5fbbdebb7a8
```

**Was zu erwarten ist:**
- ✅ Wenn es funktioniert: Verbindung erfolgreich + Stream-Daten werden empfangen
- ❌ Wenn es nicht funktioniert: Fehler 4401 (INVALID_AUTH) oder keine Daten

## Test 2: REST API Key verwenden

```bash
# Setze den REST API Key als EULER_API_KEY
export EULER_API_KEY=euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2

# Starte die Anwendung
npm start
```

**Oder** in der `.env` Datei:
```
EULER_API_KEY=euler_NTI1MTFmMmJkZmE2MTFmODA4Njk5NWVjZDA1NDk1OTUxZDMyNzE0NDIyYzJmZDVlZDRjOWU2
```

**Was zu erwarten ist:**
- ✅ Wenn es funktioniert: Verbindung erfolgreich + Stream-Daten werden empfangen
- ❌ Wenn es nicht funktioniert: Fehler 4401 (INVALID_AUTH) oder keine Daten

## Was die Logs zeigen sollten

Die Anwendung zeigt jetzt an, welcher Key-Typ verwendet wird:

```
🔑 Authentication Key configured (69247cb1...b7a8)
   Key Type: Webhook Secret (64-char hexadecimal)
```

ODER

```
🔑 Authentication Key configured (euler_NT...OWU2)
   Key Type: REST API Key (starts with "euler_")
   ⚠️  If connection fails: Try using Webhook Secret instead!
```

## Erfolgskriterien

Eine erfolgreiche Verbindung zeigt:
```
✅ Connected to TikTok LIVE: @username via Eulerstream
💬 Chat: user123 - Hello!
🎁 Gift: user456 - Rose
```

Eine fehlgeschlagene Verbindung zeigt:
```
❌ INVALID_AUTH - Your API key is invalid or expired
```

## Ergebnis melden

Bitte teile mit:
1. ✅ Welcher Key funktioniert hat
2. ❌ Welcher Key nicht funktioniert hat
3. 📋 Die genauen Fehlermeldungen

## Hinweise

- Stelle sicher, dass du einen TikTok-User verbindest, der **tatsächlich live** ist
- Verwende den korrekten Username (ohne @ Symbol)
- Wenn BEIDE Keys nicht funktionieren, könnte es sein:
  - Der User ist nicht live
  - Die Keys sind abgelaufen
  - Es gibt ein Netzwerk/Firewall-Problem
