@echo off
REM LTTH Launcher Build Script for Windows
echo ================================
echo LTTH Launcher Build Script
echo ================================

REM Check if Go is installed
where go >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Go is not installed
    pause
    exit /b 1
)

echo Go version:
go version

echo.
echo Building launcher...

REM Build GUI version (no console)
echo Building GUI version (no console window)...
go build -ldflags "-H windowsgui" -o launcher.exe launcher-gui.go launcher-http.go
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo [OK] Built: launcher.exe

REM Build console version for debugging
echo Building console version for debugging...
go build -o launcher-console.exe launcher-gui.go launcher-http.go
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    pause
    exit /b 1
)
echo [OK] Built: launcher-console.exe

REM Copy to root directory
echo.
echo Copying launcher.exe to project root...
copy /Y launcher.exe ..\launcher.exe
echo [OK] Copied to root directory

echo.
echo ================================
echo Build complete!
echo ================================
echo.
echo The launcher includes:
echo   [OK] Language selection screen
echo   [OK] Profile management  
echo   [OK] Tab-based navigation
echo   [OK] Real-time server logs
echo   [OK] Internationalization support
echo   [OK] Background npm install
echo.
echo To run: launcher.exe (GUI) or launcher-console.exe (with console)
echo.
pause
