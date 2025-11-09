@echo off
REM TikTok Stream Tool - Launcher Script (Windows)
REM Doppelklick auf diese Datei um das Tool zu starten
REM Alle Logik wurde nach launch.js verschoben

REM UTF-8 Codepage (optional, ignoriere Fehler)
chcp 65001 >nul 2>&1

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

REM Starte launch.js
node launch.js

REM Warte nach Beendigung
pause
