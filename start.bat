@echo off
REM TikTok Stream Tool - Launcher Script (Windows)
REM Doppelklick auf diese Datei um das Tool zu starten

chcp 65001 >nul
cls
echo ==========================================
echo   TikTok Stream Tool - Launcher
echo ==========================================
echo.

REM 1. Pruefe ob Node.js installiert ist
echo Pruefe Node.js Installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [31m[X] Node.js ist nicht installiert![0m
    echo.
    echo Bitte installiere Node.js von https://nodejs.org
    echo Empfohlen: Node.js LTS Version
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [32m[OK] Node.js gefunden: %NODE_VERSION%[0m

REM 2. Pruefe ob npm installiert ist
echo Pruefe npm Installation...
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [31m[X] npm ist nicht installiert![0m
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [32m[OK] npm gefunden: %NPM_VERSION%[0m
echo.

REM 3. Pruefe ob node_modules existiert
if not exist "node_modules\" (
    echo [33m[!] Dependencies nicht gefunden. Installiere...[0m
    echo.
    call npm install

    if %ERRORLEVEL% NEQ 0 (
        echo [31m[X] Installation fehlgeschlagen![0m
        echo.
        pause
        exit /b 1
    )

    echo [32m[OK] Dependencies erfolgreich installiert![0m
    echo.
) else (
    echo [32m[OK] Dependencies bereits installiert[0m
    echo.
)

REM 4. Server starten
echo ==========================================
echo Starte TikTok Stream Tool...
echo ==========================================
echo.
echo Dashboard: http://localhost:3000/dashboard.html
echo Overlay:   http://localhost:3000/overlay.html
echo.
echo WICHTIG: Oeffne das Overlay und klicke auf 'Audio aktivieren'!
echo.
echo Zum Beenden: Strg+C druecken oder Fenster schliessen
echo ==========================================
echo.

REM Browser oeffnen
timeout /t 2 /nobreak >nul
start http://localhost:3000/dashboard.html

REM Server starten
node server.js

REM Nach Beendigung
echo.
echo ==========================================
echo Server wurde beendet.
echo ==========================================
pause
