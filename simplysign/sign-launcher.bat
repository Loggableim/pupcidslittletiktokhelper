@echo off
REM ================================================================================
REM Certum Code Signing Script (using Windows signtool)
REM ================================================================================
REM This script signs launcher executables using Windows signtool.exe
REM 
REM Prerequisites:
REM   - Windows SDK (signtool.exe) must be installed
REM   - Valid Certum certificate in Windows Certificate Store
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
echo  Certum Code Signing Tool (Windows signtool)
echo ================================================================================
echo.

REM Configuration
set "LAUNCHER_PATH=..\launcher.exe"
set "CLOUD_LAUNCHER_PATH=..\ltthgit.exe"
set "TIMESTAMP_SERVER=https://timestamp.digicert.com"
set "SIGNTOOL_EXE="

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

REM Find signtool.exe
echo [1/5] Locating signtool.exe...

REM Search common Windows SDK locations
set "SDK_PATHS[0]=%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
set "SDK_PATHS[1]=%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe"
set "SDK_PATHS[2]=%ProgramFiles(x86)%\Windows Kits\10\bin\x64\signtool.exe"
set "SDK_PATHS[3]=%ProgramFiles%\Windows Kits\10\bin\x64\signtool.exe"

set "FOUND=0"
for /L %%i in (0,1,3) do (
    if exist "!SDK_PATHS[%%i]!" (
        set "SIGNTOOL_EXE=!SDK_PATHS[%%i]!"
        set "FOUND=1"
        goto :signtool_found
    )
)

REM Try PATH as last resort
where signtool.exe >nul 2>&1
if not errorlevel 1 (
    set "SIGNTOOL_EXE=signtool.exe"
    set "FOUND=1"
    goto :signtool_found
)

REM Not found
echo ERROR: signtool.exe not found
echo.
echo signtool.exe is part of the Windows SDK
echo Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
echo.
goto :error

:signtool_found
echo      Found: !SIGNTOOL_EXE!
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
echo [3/5] Signing executable files with signtool...
echo    Using certificate from Windows Certificate Store
echo.

set "SIGNED_COUNT=0"
set "FAILED_COUNT=0"

REM Sign launcher.exe if in list
echo !FILES_TO_SIGN! | findstr /C:"launcher" >nul
if not errorlevel 1 (
    echo   Signing launcher.exe...
    "%SIGNTOOL_EXE%" sign /a /fd sha256 /tr "%TIMESTAMP_SERVER%" /td sha256 "%LAUNCHER_PATH%"
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
    "%SIGNTOOL_EXE%" sign /a /fd sha256 /tr "%TIMESTAMP_SERVER%" /td sha256 "%CLOUD_LAUNCHER_PATH%"
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
    echo   - No valid certificate in Windows Certificate Store
    echo   - Certificate expired or not yet valid
    echo   - Network issue accessing timestamp server
    echo   - File is locked or in use
    echo.
    echo For Certum SimplySign: Ensure certificate is installed in Windows Certificate Store
    goto :error
)

echo [4/5] Verifying signatures...
echo.

set "VERIFIED_COUNT=0"

REM Verify launcher.exe if it was signed
echo !FILES_TO_SIGN! | findstr /C:"launcher" >nul
if not errorlevel 1 (
    "%SIGNTOOL_EXE%" verify /pa "%LAUNCHER_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo   WARNING: launcher.exe signature verification failed
    ) else (
        echo   SUCCESS: launcher.exe signature verified
        set /a VERIFIED_COUNT+=1
    )
)

REM Verify ltthgit.exe if it was signed
echo !FILES_TO_SIGN! | findstr /C:"cloud" >nul
if not errorlevel 1 (
    "%SIGNTOOL_EXE%" verify /pa "%CLOUD_LAUNCHER_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo   WARNING: ltthgit.exe signature verification failed
    ) else (
        echo   SUCCESS: ltthgit.exe signature verified
        set /a VERIFIED_COUNT+=1
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
