@echo off
REM TikTok Stream Tool - Launcher Script (Windows)
REM Doppelklick auf diese Datei um das Tool zu starten

REM UTF-8 Codepage (optional, ignoriere Fehler)
chcp 65001 >nul 2>&1

echo ================================================
echo   TikTok Stream Tool - Launcher
echo ================================================
echo.

REM Prüfe ob Node.js installiert ist
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ===============================================
    echo   FEHLER: Node.js ist nicht installiert!
    echo ===============================================
    echo.
    echo Bitte installiere Node.js von:
    echo https://nodejs.org
    echo.
    echo Empfohlen: Node.js LTS Version 18 oder 20
    echo.
    pause
    exit /b 1
)

REM Zeige Node.js Version
echo Node.js Version:
node --version
echo.

REM Wechsel in app Verzeichnis
cd app

REM Prüfe ob node_modules existiert
if not exist "node_modules" (
    echo Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ===============================================
        echo   FEHLER: Installation fehlgeschlagen!
        echo ===============================================
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Installation erfolgreich abgeschlossen!
    echo.
)

REM Starte das Tool
echo Starte Tool...
echo.
node launch.js

REM Warte nach Beendigung
echo.
pause
