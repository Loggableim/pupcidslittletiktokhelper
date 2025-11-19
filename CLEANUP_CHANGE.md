# Cache Cleanup: Launch-basiert statt Cron

## ✅ Änderung Umgesetzt (Commit b02887a)

Der Cache Cleanup läuft jetzt beim **Server-Start** statt als täglicher Cronjob.

## Was wurde geändert?

### Vorher (Cronjob)
```javascript
// Täglich um 3:00 Uhr via node-cron
this.job = cron.schedule('0 3 * * *', async () => {
    await cleanupOldFiles();
});
```

### Nachher (Launch)
```javascript
// Einmal beim Server-Start
async runOnStartup() {
    if (this.hasRun) return;
    await cleanupOldFiles();
    this.hasRun = true;
}
```

## Vorteile

✅ **Einfacher** - Keine Cron-Komplexität  
✅ **Zuverlässig** - Läuft bei jedem Server-Neustart  
✅ **Weniger Dependencies** - `node-cron` entfernt  
✅ **Non-blocking** - Verzögert Server-Start nicht  

## Wann läuft der Cleanup?

**Vorher:** 
- Jeden Tag um 3:00 Uhr (auch wenn Server wochenlang läuft)

**Nachher:**
- Bei jedem Server-Start/Neustart
- Development: Mehrmals täglich (bei häufigen Neustarts)
- Production: Bei jedem Deployment/Neustart

## Was wird gelöscht?

Unverändert: **Sounds die länger als 42 Tage (6 Wochen) nicht abgespielt wurden**

## Manueller Cleanup

Weiterhin verfügbar:
```bash
POST /api/soundboard/cache/cleanup
```

## Geänderte Dateien

1. ✅ `plugins/soundboard/cache-cleanup.js` - Cron entfernt, `runOnStartup()` hinzugefügt
2. ✅ `plugins/soundboard/main.js` - Cleanup beim Init aufgerufen
3. ✅ `package.json` - `node-cron` Dependency entfernt

## Server-Start Flow

```
Server startet
    ↓
Soundboard Plugin initialisiert
    ↓
Cache Manager erstellt
    ↓
Cleanup Job erstellt
    ↓
runOnStartup() aufgerufen (async)
    ↓
Server läuft weiter (wartet nicht)
    ↓
Cleanup läuft im Hintergrund
    ↓
Alte Dateien (>42 Tage) gelöscht
    ↓
Cleanup beendet, Logs geschrieben
```

## Logs

Beim Server-Start siehst du:
```
[CleanupJob] Starting cleanup on server launch...
[CleanupJob] Cleanup completed successfully { deletedCount: 5, freedSpaceMB: 23.4 }
[CleanupJob] Cache stats after cleanup: { totalFiles: 42, totalSizeMB: 156.7, ... }
```

## Testing

```bash
# Server starten
npm start

# In den Logs nach Cleanup-Meldungen suchen
# Bei erstem Start nach langer Zeit könnten alte Dateien gelöscht werden
```

## Fehlerbehandlung

Falls Cleanup fehlschlägt:
- Server startet trotzdem normal
- Fehler wird nur geloggt
- Nächster Versuch beim nächsten Neustart
