#!/bin/bash

# TikTok Stream Tool - Launcher Script (Linux/Mac)
# Doppelklick auf diese Datei um das Tool zu starten
# Alle Logik wurde nach launch.js verschoben

# Prüfe ob Node.js installiert ist
if ! command -v node &> /dev/null; then
    echo "==============================================="
    echo "  FEHLER: Node.js ist nicht installiert!"
    echo "==============================================="
    echo ""
    echo "Bitte installiere Node.js von:"
    echo "https://nodejs.org"
    echo ""
    echo "Empfohlen: Node.js LTS Version 18 oder 20"
    echo ""
    read -p "Druecke Enter zum Beenden..."
    exit 1
fi

# Starte launch.js
node launch.js

# Warte auf Enter nach Beendigung (nur wenn interaktiv)
if [ -t 0 ]; then
    read -p "Druecke Enter zum Beenden..."
fi
