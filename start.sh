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

# 3. Git Auto-Update Feature
echo "🔄 Prüfe auf Updates..."
if command -v git &> /dev/null; then
    # Prüfe ob wir in einem Git-Repository sind
    if git rev-parse --git-dir > /dev/null 2>&1; then
        # Aktuellen Branch speichern
        CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

        # Aktuellen Commit-Hash speichern (vor Update)
        BEFORE_UPDATE=$(git rev-parse HEAD)

        # Stille git fetch um zu prüfen ob Updates verfügbar sind
        echo "📡 Verbinde mit Remote-Repository..."
        if git fetch origin $CURRENT_BRANCH 2>/dev/null; then
            # Prüfe ob es Unterschiede gibt
            LOCAL=$(git rev-parse HEAD)
            REMOTE=$(git rev-parse origin/$CURRENT_BRANCH 2>/dev/null || echo $LOCAL)

            if [ "$LOCAL" != "$REMOTE" ]; then
                echo -e "${YELLOW}⬇️  Neue Version verfügbar! Lade Updates herunter...${NC}"

                # Prüfe ob es lokale Änderungen gibt
                if [ -n "$(git status --porcelain)" ]; then
                    echo -e "${YELLOW}⚠️  Lokale Änderungen gefunden. Versuche diese zu sichern...${NC}"
                    git stash save "Auto-stash vor Update $(date +%Y-%m-%d_%H-%M-%S)" > /dev/null 2>&1
                fi

                # Führe git pull durch
                if git pull origin $CURRENT_BRANCH --no-edit > /dev/null 2>&1; then
                    # Nach Update Commit-Hash
                    AFTER_UPDATE=$(git rev-parse HEAD)

                    echo -e "${GREEN}✅ Update erfolgreich! ($BEFORE_UPDATE -> $AFTER_UPDATE)${NC}"

                    # Prüfe ob package.json sich geändert hat
                    if git diff --name-only $BEFORE_UPDATE $AFTER_UPDATE | grep -q "package.json"; then
                        echo -e "${YELLOW}📦 package.json wurde aktualisiert. Installiere Dependencies...${NC}"
                        npm install
                        if [ $? -eq 0 ]; then
                            echo -e "${GREEN}✅ Dependencies erfolgreich aktualisiert!${NC}"
                        else
                            echo -e "${RED}❌ Fehler beim Installieren der Dependencies!${NC}"
                        fi
                    fi

                    echo ""
                else
                    echo -e "${RED}❌ Git pull fehlgeschlagen!${NC}"
                    echo -e "${YELLOW}   Fortfahre mit aktueller Version...${NC}"
                fi
            else
                echo -e "${GREEN}✅ Bereits auf dem neuesten Stand!${NC}"
            fi
        else
            echo -e "${YELLOW}⚠️  Konnte nicht mit Remote verbinden. Offline-Modus?${NC}"
        fi
        echo ""
    else
        echo -e "${YELLOW}⚠️  Nicht in einem Git-Repository. Update-Check übersprungen.${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}⚠️  Git nicht installiert. Auto-Update nicht verfügbar.${NC}"
    echo ""
fi

# 4. Prüfe ob node_modules existiert
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

# 5. Server starten
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
