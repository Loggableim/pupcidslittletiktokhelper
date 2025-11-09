#!/bin/bash

# TikTok Stream Tool - Launcher Script (Linux/Mac)
# Doppelklick auf diese Datei um das Tool zu starten

clear
echo "=========================================="
echo "  TikTok Stream Tool - Launcher"
echo "=========================================="
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Prüfe ob Node.js installiert ist
echo "🔍 Prüfe Node.js Installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js ist nicht installiert!${NC}"
    echo ""
    echo "Bitte installiere Node.js von https://nodejs.org"
    echo "Empfohlen: Node.js LTS Version"
    echo ""
    read -p "Drücke Enter zum Beenden..."
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js gefunden: $NODE_VERSION${NC}"

# 2. Prüfe ob npm installiert ist
echo "🔍 Prüfe npm Installation..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm ist nicht installiert!${NC}"
    echo ""
    read -p "Drücke Enter zum Beenden..."
    exit 1
fi

NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm gefunden: $NPM_VERSION${NC}"
echo ""

# 3. Prüfe ob node_modules existiert
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Dependencies nicht gefunden. Installiere...${NC}"
    echo ""
    npm install

    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Installation fehlgeschlagen!${NC}"
        echo ""
        read -p "Drücke Enter zum Beenden..."
        exit 1
    fi

    echo -e "${GREEN}✅ Dependencies erfolgreich installiert!${NC}"
    echo ""
else
    echo -e "${GREEN}✅ Dependencies bereits installiert${NC}"
    echo ""
fi

# 4. Server starten
echo "=========================================="
echo "🚀 Starte TikTok Stream Tool..."
echo "=========================================="
echo ""
echo "📊 Dashboard: http://localhost:3000/dashboard.html"
echo "🖼️  Overlay:   http://localhost:3000/overlay.html"
echo ""
echo "⚠️  WICHTIG: Öffne das Overlay und klicke auf '🔊 Audio aktivieren'!"
echo ""
echo "Zum Beenden: Strg+C drücken"
echo "=========================================="
echo ""

# Browser öffnen (optional, falls xdg-open verfügbar)
sleep 2
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000/dashboard.html" 2>/dev/null &
elif command -v open &> /dev/null; then
    # macOS
    open "http://localhost:3000/dashboard.html" 2>/dev/null &
fi

# Server starten
node server.js

# Nach Beendigung
echo ""
echo "=========================================="
echo "Server wurde beendet."
echo "=========================================="
read -p "Drücke Enter zum Beenden..."
