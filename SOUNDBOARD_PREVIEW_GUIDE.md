# Soundboard Preview - Benutzerhandbuch / User Guide

## Deutsch

### Problem behoben
Das Soundboard-Preview funktioniert jetzt korrekt. Die MyInstants-API Integration wurde verbessert.

### Was wurde geändert?
- Bessere Unterstützung für verschiedene MyInstants-API Antwortformate
- Automatische Umwandlung von relativen zu absoluten URLs
- Filterung von ungültigen Einträgen
- Verbesserte Fehlersuche durch detaillierte Logs

### Wie benutzen?
1. Öffne die Soundboard-Oberfläche
2. Klicke auf "Picker" bei einem Gift
3. Suche nach Sounds (z.B. "wow")
4. Klicke auf den ▶ Button zum Testen
5. Der Sound sollte sofort abspielen

### Fehlerbehebung
Wenn der Preview nicht funktioniert:
1. Öffne die Browser-Konsole (F12)
2. Suche nach `[MyInstants]` Logs
3. Prüfe ob URLs korrekt extrahiert werden
4. Stelle sicher, dass dein Browser Audio abspielen kann

---

## English

### Problem Fixed
The soundboard preview now works correctly. The MyInstants API integration has been improved.

### What Changed?
- Better support for different MyInstants API response formats
- Automatic conversion of relative to absolute URLs
- Filtering of invalid entries
- Improved debugging through detailed logs

### How to Use?
1. Open the soundboard interface
2. Click "Picker" on any gift
3. Search for sounds (e.g., "wow")
4. Click the ▶ button to test
5. The sound should play immediately

### Troubleshooting
If the preview doesn't work:
1. Open browser console (F12)
2. Look for `[MyInstants]` logs
3. Check if URLs are being extracted correctly
4. Make sure your browser can play audio

---

## Technical Details

### Supported MyInstants Response Formats

The enhanced implementation supports multiple field name variations:

```javascript
// Format 1: Standard API response
{
  id: 123,
  title: "Sound Name",
  mp3: "/media/sounds/file.mp3",
  description: "Description",
  tags: ["tag1", "tag2"]
}

// Format 2: Alternative field names
{
  id: 456,
  name: "Sound Name",
  sound: "https://www.myinstants.com/media/sounds/file.mp3",
  desc: "Description",
  categories: ["category1"]
}

// Format 3: Another variant
{
  id: 789,
  label: "Sound Name",
  url: "/media/sounds/file.mp3"
}
```

All of these formats are now properly handled and converted to:
```javascript
{
  id: 123,
  name: "Sound Name",
  url: "https://www.myinstants.com/media/sounds/file.mp3",
  description: "Description",
  tags: ["tag1", "tag2"],
  color: null
}
```

### API Endpoints Supported
- Search: `https://myinstants-api.vercel.app/search`
- Trending: `https://myinstants-api.vercel.app/trending`
- Random: `https://myinstants-api.vercel.app/random`
- Fallback: Direct website scraping as backup

### Browser Compatibility
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ℹ️ Audio autoplay policies may require user interaction first

---

**Version:** 1.0.3  
**Last Updated:** November 18, 2025
