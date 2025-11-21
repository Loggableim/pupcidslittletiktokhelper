# Desktop-App Migration - Archivierte Proposals

**Archivierungsdatum:** 2025-11-15
**Entscheidung:** Electron wurde gewählt

Dieses Verzeichnis enthält archivierte Desktop-App-Implementierungsvorschläge.

## Archivierte Dateien

### TAURI_IMPLEMENTATION_GUIDE.md (26KB)
- **Technologie:** Tauri (Rust + System WebView)
- **Vorteile:** Sehr kleine Installer (5-10MB), bessere Performance
- **Nachteile:** Rust-Kenntnisse erforderlich, jüngeres Ökosystem
- **Status:** Nicht gewählt

### ELECTRON_MIGRATION_ROADMAP.md (11KB)
- **Original:** Strategisches Planungsdokument
- **Inhalt:** Business Case, 7-10 Wochen Timeline
- **Status:** Konsolidiert in ELECTRON_IMPLEMENTATION_GUIDE.md

## Aktive Dokumentation

**Gewählte Lösung:** Electron

Die aktive Desktop-App-Dokumentation befindet sich in:
- **Implementation Guide:** `/docs/ELECTRON_IMPLEMENTATION_GUIDE.md`

## Entscheidungsbegründung

Electron wurde gewählt weil:
1. ✅ Gesamter Backend-Stack ist Node.js
2. ✅ TikTok-Connector benötigt Node.js
3. ✅ Kein Backend-Rewrite erforderlich
4. ✅ Schnellere Entwicklung (keine Rust-Kenntnisse nötig)
5. ✅ Größeres Ökosystem und Community
6. ✅ Auto-Start.js bereits in Node.js implementiert

## Warum Tauri archiviert?

Tauri wurde archiviert, obwohl es technische Vorteile hat:
- Installer-Größe (5-10MB vs. 150MB) ist für Streaming-Tool-Nutzer akzeptabel
- OBS, VDO.Ninja, etc. sind auch große Applikationen
- Node.js-Backend-Kompatibilität ist wichtiger
- Rust-Lernkurve würde Entwicklung verzögern

Tauri könnte in Zukunft evaluiert werden, falls:
- Backend komplett neu geschrieben wird
- Rust-Expertise im Team vorhanden ist
- Installer-Größe kritisch wird

Für Details zur Entscheidung siehe: `docs/ARCHITECTURE_DECISION_RECORDS/` (falls vorhanden)
