#!/bin/bash

# TikTok Stream Tool - Launcher Script (Linux/Mac)
# Doppelklick auf diese Datei um das Tool zu starten

echo "================================================"
echo "  TikTok Stream Tool - Launcher"
echo "================================================"
echo ""

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

# Zeige Node.js Version
echo "Node.js Version:"
node --version
echo ""

# Wechsel in app Verzeichnis
cd app

# Prüfe ob node_modules existiert
if [ ! -d "node_modules" ]; then
    echo "Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)"
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "==============================================="
        echo "  FEHLER: Installation fehlgeschlagen!"
        echo "==============================================="
        echo ""
        read -p "Druecke Enter zum Beenden..."
        exit 1
    fi
    echo ""
    echo "Installation erfolgreich abgeschlossen!"
    echo ""
fi

# Starte das Tool
echo "Starte Tool..."
echo ""
node launch.js

# Warte auf Enter nach Beendigung (nur wenn interaktiv)
echo ""
if [ -t 0 ]; then
    read -p "Druecke Enter zum Beenden..."
fi
