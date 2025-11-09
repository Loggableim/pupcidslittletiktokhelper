@echo off
setlocal enabledelayedexpansion
REM TikTok Stream Tool - Launcher Script (Windows)
REM Doppelklick auf diese Datei um das Tool zu starten

REM UTF-8 Codepage (mit Fallback)
chcp 65001 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    chcp 1252 >nul 2>&1
)

cls
echo ==========================================
echo   TikTok Stream Tool - Launcher
echo ==========================================
echo.

REM ========== 1. NODE.JS PRUEFEN ==========
echo [1/5] Pruefe Node.js Installation...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FEHLER] Node.js ist nicht installiert!
    echo.
    echo Bitte installiere Node.js von https://nodejs.org
    echo Empfohlen: Node.js LTS Version 18 oder 20
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js gefunden: %NODE_VERSION%

REM Node Version pruefen (erfordert Node 18-23)
for /f "tokens=2 delims=v." %%i in ("%NODE_VERSION%") do set NODE_MAJOR=%%i

if %NODE_MAJOR% LSS 18 (
    echo [FEHLER] Node.js Version %NODE_VERSION% ist zu alt!
    echo Erforderlich: Node.js 18.x bis 23.x
    echo Bitte update Node.js von https://nodejs.org
    echo.
    pause
    exit /b 1
)

if %NODE_MAJOR% GEQ 24 (
    echo [WARNUNG] Node.js Version %NODE_VERSION% ist zu neu!
    echo Empfohlen: Node.js 18.x bis 23.x
    echo Das Tool koennte instabil sein.
    echo.
)

REM ========== 2. NPM PRUEFEN ==========
echo [2/5] Pruefe npm Installation...
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [FEHLER] npm ist nicht installiert!
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [OK] npm gefunden: v%NPM_VERSION%
echo.

REM ========== 3. GIT UPDATE PRUEFEN (Optional) ==========
echo [3/5] Pruefe auf Updates...
where git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    REM Git gefunden, pruefe auf Updates
    git fetch origin >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        for /f "tokens=*" %%i in ('git rev-parse HEAD') do set LOCAL_COMMIT=%%i
        for /f "tokens=*" %%i in ('git rev-parse @{u}') do set REMOTE_COMMIT=%%i

        if not "!LOCAL_COMMIT!"=="!REMOTE_COMMIT!" (
            echo [INFO] Update verfuegbar!
            echo Fuehre 'git pull' aus um zu aktualisieren.
            echo.
        ) else (
            echo [OK] Projekt ist aktuell
        )
    ) else (
        echo [INFO] Git Repository-Check uebersprungen
    )
) else (
    echo [INFO] Git nicht installiert, Update-Check uebersprungen
)
echo.

REM ========== 4. DEPENDENCIES INSTALLIEREN ==========
echo [4/5] Pruefe Dependencies...
if not exist "node_modules\" (
    echo [INFO] Dependencies nicht gefunden. Installiere...
    echo.

    if exist "package-lock.json" (
        call npm ci
    ) else (
        call npm install
    )

    if !ERRORLEVEL! NEQ 0 (
        echo [FEHLER] Installation fehlgeschlagen!
        echo.
        echo Versuche es manuell mit: npm install
        echo.
        pause
        exit /b 1
    )

    echo.
    echo [OK] Dependencies erfolgreich installiert!
    echo.
) else (
    echo [OK] Dependencies bereits installiert
    echo.
)

REM ========== 5. SERVER STARTEN ==========
echo [5/5] Starte Server...
echo ==========================================
echo   TikTok Stream Tool laeuft!
echo ==========================================
echo.
echo [*] Dashboard: http://localhost:3000/dashboard.html
echo [*] Overlay:   http://localhost:3000/overlay.html
echo.
echo WICHTIG: Oeffne das Overlay und klicke 'Audio aktivieren'!
echo.
echo Zum Beenden: Strg+C druecken oder Fenster schliessen
echo ==========================================
echo.

REM Browser automatisch oeffnen (nach 3 Sekunden)
timeout /t 3 /nobreak >nul 2>&1
start http://localhost:3000/dashboard.html 2>nul

REM Server starten
node server.js

REM Nach Beendigung
echo.
echo ==========================================
echo Server wurde beendet.
echo ==========================================
echo.
pause
