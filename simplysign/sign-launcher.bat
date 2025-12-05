@echo off
REM ================================================================================
REM SimplySign™ Launcher Signing Script
REM ================================================================================
REM This script signs launcher executables using the SimplySign Desktop tool
REM 
REM Prerequisites:
REM   - SimplySign Desktop tool must be installed
REM   - Valid SimplySign certificate configured
REM   - Executable files must exist in the parent directory
REM 
REM Usage:
REM   sign-launcher.bat [all|launcher|cloud]
REM   
REM   all      - Sign both launcher.exe and ltthgit.exe (default)
REM   launcher - Sign only launcher.exe
REM   cloud    - Sign only ltthgit.exe
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
set "CLOUD_LAUNCHER_PATH=..\ltthgit.exe"
set "SIMPLYSIGN_EXE=SimplySignDesktop.exe"
set "TIMESTAMP_SERVER=https://timestamp.digicert.com"

REM Determine which files to sign based on argument
set "SIGN_MODE=%~1"
if "%SIGN_MODE%"=="" set "SIGN_MODE=all"

REM Validate sign mode
if not "%SIGN_MODE%"=="all" if not "%SIGN_MODE%"=="launcher" if not "%SIGN_MODE%"=="cloud" (
    echo ERROR: Invalid argument "%SIGN_MODE%"
    echo Valid options: all, launcher, cloud
    echo.
    goto :error
)

echo Mode: %SIGN_MODE%
echo.

REM Check if SimplySign Desktop is installed
echo [1/5] Checking for SimplySign Desktop...
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

REM Check which files exist and need to be signed
set "FILES_TO_SIGN="
set "FILE_COUNT=0"

if "%SIGN_MODE%"=="all" goto :check_all
if "%SIGN_MODE%"=="launcher" goto :check_launcher
if "%SIGN_MODE%"=="cloud" goto :check_cloud

:check_all
echo [2/5] Checking for files to sign...
if exist "%LAUNCHER_PATH%" (
    echo      Found: %LAUNCHER_PATH%
    set "FILES_TO_SIGN=!FILES_TO_SIGN! launcher"
    set /a FILE_COUNT+=1
)
if exist "%CLOUD_LAUNCHER_PATH%" (
    echo      Found: %CLOUD_LAUNCHER_PATH%
    set "FILES_TO_SIGN=!FILES_TO_SIGN! cloud"
    set /a FILE_COUNT+=1
)
if !FILE_COUNT!==0 (
    echo ERROR: No executable files found to sign
    echo Expected files:
    echo   - %LAUNCHER_PATH%
    echo   - %CLOUD_LAUNCHER_PATH%
    goto :error
)
echo      Files to sign: !FILE_COUNT!
echo.
goto :start_signing

:check_launcher
echo [2/5] Checking for launcher.exe...
if not exist "%LAUNCHER_PATH%" (
    echo ERROR: launcher.exe not found at %LAUNCHER_PATH%
    echo Please ensure launcher.exe exists in the parent directory.
    goto :error
)
echo      Found: %LAUNCHER_PATH%
set "FILES_TO_SIGN=launcher"
set "FILE_COUNT=1"
echo.
goto :start_signing

:check_cloud
echo [2/5] Checking for ltthgit.exe...
if not exist "%CLOUD_LAUNCHER_PATH%" (
    echo ERROR: ltthgit.exe not found at %CLOUD_LAUNCHER_PATH%
    echo Please ensure ltthgit.exe exists in the parent directory.
    goto :error
)
echo      Found: %CLOUD_LAUNCHER_PATH%
set "FILES_TO_SIGN=cloud"
set "FILE_COUNT=1"
echo.
goto :start_signing

:start_signing
echo [3/5] Signing executable files...
echo.

set "SIGNED_COUNT=0"
set "FAILED_COUNT=0"

REM Sign launcher.exe if in list
echo !FILES_TO_SIGN! | findstr /C:"launcher" >nul
if not errorlevel 1 (
    echo   Signing launcher.exe...
    "%SIMPLYSIGN_EXE%" sign /file:"%LAUNCHER_PATH%" /timestamp:"%TIMESTAMP_SERVER%"
    if errorlevel 1 (
        echo   ERROR: Failed to sign launcher.exe
        set /a FAILED_COUNT+=1
    ) else (
        echo   SUCCESS: launcher.exe signed
        set /a SIGNED_COUNT+=1
    )
    echo.
)

REM Sign ltthgit.exe if in list
echo !FILES_TO_SIGN! | findstr /C:"cloud" >nul
if not errorlevel 1 (
    echo   Signing ltthgit.exe...
    "%SIMPLYSIGN_EXE%" sign /file:"%CLOUD_LAUNCHER_PATH%" /timestamp:"%TIMESTAMP_SERVER%"
    if errorlevel 1 (
        echo   ERROR: Failed to sign ltthgit.exe
        set /a FAILED_COUNT+=1
    ) else (
        echo   SUCCESS: ltthgit.exe signed
        set /a SIGNED_COUNT+=1
    )
    echo.
)

if !FAILED_COUNT! gtr 0 (
    echo.
    echo ERROR: Signing failed for !FAILED_COUNT! file(s)!
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

echo [4/5] Verifying signatures...
echo.

set "VERIFIED_COUNT=0"

REM Verify launcher.exe if it was signed
echo !FILES_TO_SIGN! | findstr /C:"launcher" >nul
if not errorlevel 1 (
    where signtool.exe >nul 2>&1
    if not errorlevel 1 (
        signtool verify /pa "%LAUNCHER_PATH%" >nul 2>&1
        if errorlevel 1 (
            echo   WARNING: launcher.exe signature verification failed
        ) else (
            echo   SUCCESS: launcher.exe signature verified
            set /a VERIFIED_COUNT+=1
        )
    ) else (
        echo   SKIPPED: signtool.exe not found for launcher.exe
    )
)

REM Verify ltthgit.exe if it was signed
echo !FILES_TO_SIGN! | findstr /C:"cloud" >nul
if not errorlevel 1 (
    where signtool.exe >nul 2>&1
    if not errorlevel 1 (
        signtool verify /pa "%CLOUD_LAUNCHER_PATH%" >nul 2>&1
        if errorlevel 1 (
            echo   WARNING: ltthgit.exe signature verification failed
        ) else (
            echo   SUCCESS: ltthgit.exe signature verified
            set /a VERIFIED_COUNT+=1
        )
    ) else (
        echo   SKIPPED: signtool.exe not found for ltthgit.exe
    )
)

echo.
echo [5/5] Summary
echo.
echo   Files signed: !SIGNED_COUNT!
echo   Files verified: !VERIFIED_COUNT!
echo.
echo.
echo ================================================================================
echo  SUCCESS: Signing completed!
echo ================================================================================
echo.
echo Signed !SIGNED_COUNT! file(s) successfully.
echo The signed executable(s) are ready for distribution.
echo Users will see a verified publisher when running the executable(s).
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
