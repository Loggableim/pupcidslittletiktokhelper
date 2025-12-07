@echo off
REM LTTH Development Launcher
REM Starts the backend server in development mode

echo ======================================
echo LTTH Development Launcher
echo ======================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found: 
node --version
echo.

REM Check if app directory exists
if not exist "app" (
    echo ERROR: app directory not found!
    pause
    exit /b 1
)

REM Go to app directory
cd app

REM Check if node_modules exists, install if needed
if not exist "node_modules" (
    echo Installing dependencies...
    echo This may take a few minutes...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies!
        pause
        exit /b 1
    )
)

REM Start the development server
echo.
echo Starting LTTH Backend Server in development mode...
echo Server will be available at http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Check if dev script exists, otherwise use regular start
npm run dev 2>nul
if %errorlevel% neq 0 (
    echo.
    echo Note: Using fallback start method...
    node server.js
)

pause
