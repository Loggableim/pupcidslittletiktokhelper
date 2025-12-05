@echo off
REM ================================================================================
REM SimplySign™ Launcher Signing Script
REM ================================================================================
REM This script signs launcher.exe using the SimplySign Desktop tool
REM 
REM Prerequisites:
REM   - SimplySign Desktop tool must be installed
REM   - Valid SimplySign certificate configured
REM   - launcher.exe must exist in the parent directory
REM 
REM Usage:
REM   sign-launcher.bat
REM 
REM ================================================================================

setlocal enabledelayedexpansion

echo.
echo ================================================================================
echo  SimplySign™ Launcher Signing Tool
echo ================================================================================
echo.

REM Configuration
set "LAUNCHER_PATH=..\launcher.exe"
set "SIMPLYSIGN_EXE=SimplySignDesktop.exe"
set "TIMESTAMP_SERVER=http://timestamp.digicert.com"

REM Check if launcher.exe exists
echo [1/4] Checking for launcher.exe...
if not exist "%LAUNCHER_PATH%" (
    echo ERROR: launcher.exe not found at %LAUNCHER_PATH%
    echo Please ensure launcher.exe exists in the parent directory.
    goto :error
)
echo      Found: %LAUNCHER_PATH%
echo.

REM Check if SimplySign Desktop is installed
echo [2/4] Checking for SimplySign Desktop...
where "%SIMPLYSIGN_EXE%" >nul 2>&1
if errorlevel 1 (
    echo ERROR: SimplySign Desktop not found in PATH
    echo.
    echo Please install SimplySign Desktop from:
    echo https://www.simplysign.eu/en/desktop
    echo.
    echo After installation, ensure SimplySignDesktop.exe is in your PATH
    echo or update the SIMPLYSIGN_EXE variable in this script.
    goto :error
)
echo      Found: %SIMPLYSIGN_EXE%
echo.

REM Sign the launcher
echo [3/4] Signing launcher.exe...
echo      This may take a moment...
echo.

"%SIMPLYSIGN_EXE%" sign /file:"%LAUNCHER_PATH%" /timestamp:"%TIMESTAMP_SERVER%"

if errorlevel 1 (
    echo.
    echo ERROR: Signing failed!
    echo.
    echo Common issues:
    echo   - No valid certificate configured in SimplySign Desktop
    echo   - Certificate expired or not yet valid
    echo   - Network issue accessing timestamp server
    echo   - File is locked or in use
    echo.
    echo Please check SimplySign Desktop for details.
    goto :error
)

echo.
echo [4/4] Verifying signature...

REM Verify the signature using signtool (if available)
where signtool.exe >nul 2>&1
if not errorlevel 1 (
    signtool verify /pa "%LAUNCHER_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo WARNING: Signature verification failed
        echo The file was signed but signature may be invalid
        goto :error
    )
    echo      Signature verified successfully!
) else (
    echo      Skipping verification (signtool.exe not found)
)

echo.
echo ================================================================================
echo  SUCCESS: launcher.exe has been signed!
echo ================================================================================
echo.
echo The signed launcher.exe is ready for distribution.
echo Users will see a verified publisher when running the executable.
echo.

goto :end

:error
echo.
echo ================================================================================
echo  FAILED: Signing process failed
echo ================================================================================
echo.
echo Please review the error messages above and try again.
echo For help, see README.md in this directory.
echo.
exit /b 1

:end
echo Press any key to exit...
pause >nul
exit /b 0
