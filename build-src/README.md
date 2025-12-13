# Launcher Build Instructions

This directory contains the source code for the LTTH launchers.

## Launchers

1. **launcher.exe** - Modern launcher with language selection, profile management, and tab navigation
2. **ltthgit.exe** - Cloud launcher that downloads files from GitHub
3. **launcher-console.exe** - Console version with visible terminal for debugging

## New Modern Launcher Features

The modern launcher (launcher-gui.go + launcher-http.go) includes:

- **Language Selection Screen**: Choose from German, English, Spanish, or French
- **Profile Management**: Create and switch between user profiles
- **Tab Navigation**: Welcome, Resources, Changelog, Community, and Logging tabs
- **Real-time Server Logs**: View live server output in the Logging tab
- **Background npm Install**: Dependencies install in background while user selects language/profile
- **API Key Resources**: Direct links to Euler Stream, OBS, Node.js, and documentation
- **Keep Launcher Open**: Checkbox to keep launcher running for log monitoring
- **Embedded Assets**: HTML/CSS/JS embedded in binary for portability

## Building the Launchers

The launchers are written in Go with embedded web assets.

### Prerequisites

- Go 1.18 or higher

### Quick Build

#### Windows
```bash
build.bat
```

#### Linux/Mac
```bash
./build.sh
```

### Manual Build

#### Modern Launcher (launcher.exe)

```bash
# Build GUI version (no console window)
go build -ldflags "-H windowsgui" -o launcher.exe launcher-gui.go launcher-http.go

# Build console version (for debugging)
go build -o launcher-console.exe launcher-gui.go launcher-http.go
```

#### Legacy Launchers

```bash
# Build the old GUI launcher
go build -o launcher-old.exe -ldflags "-H windowsgui" launcher-gui-old.go

# Build the backup launcher with logging
go build -o launcher-backup.exe launcher-backup.go

# Build the dev launcher (GUI with visible terminal)
go build -o dev_launcher.exe dev-launcher.go
```

#### Cloud Launcher (ltthgit.exe)

```bash
# Build the cloud launcher (downloads from GitHub)
go build -o ltthgit.exe -ldflags="-s -w" ltthgit.go

# Copy to project root
cp ltthgit.exe ../
```

**Size:** ~8.5MB (well under 22MB target)

The cloud launcher includes:
- Embedded splash screen HTML
- GitHub repository downloader
- Automatic dependency installation
- Browser-based progress display

## Files

### Local Launcher Files
- `launcher.go` - Console launcher (shows terminal window)
- `launcher-gui.go` - GUI launcher (no terminal, shows graphical progress)
- `dev-launcher.go` - Dev launcher (GUI with visible terminal for debugging)
- `launcher-backup.go` - Backup launcher with detailed logging (troubleshooting)
- `icon.png` - Application icon (1355x1355 PNG)
- `icon.ico` - Icon in ICO format (multi-resolution)
- `winres/winres.json` - Icon and metadata configuration
- `rsrc_windows_*.syso` - Generated Windows resource files (auto-included in build)

### Cloud Launcher Files
- `ltthgit.go` - Cloud launcher source code
- `assets/splash.html` - Embedded splash screen (HTML template)

## Launcher Types

### ltthgit.go (ltthgit.exe) - Cloud Launcher
- **Purpose:** Download and install LTTH from GitHub
- **Size:** ~8.5MB (single executable, no dependencies)
- **Features:**
  - Downloads latest version from GitHub
  - Shows progress in browser
  - Server-Sent Events (SSE) for real-time updates
  - Embedded splash screen with animations
  - Automatic Node.js check and dependency installation
  - Opens application when ready
- **Use when:** 
  - First-time installation
  - Want latest version from GitHub
  - Distributing to users without local files

### launcher-gui.go (launcher.exe) - Local Launcher
- **Purpose:** Main launcher for existing installations
- **Features:**
  - Opens in browser with background image
  - Shows progress bar and status updates
  - Auto-redirects to dashboard when ready
  - No terminal window (windowsgui mode)
- **Use when:** Normal operation with local files

### dev-launcher.go (dev_launcher.exe) - Development Launcher
- **Purpose:** Debugging version of the GUI launcher
- **Features:**
  - Same as launcher-gui.go but with visible terminal window
  - Shows console output and error messages
  - **Server terminal output is visible with detailed error logging**
  - Both launcher and Node.js server output shown in terminal
  - Output is logged to file AND displayed in console
  - **Launcher stays active to monitor server - catches crashes**
  - **Terminal stays open on crash - waits for Enter before closing**
  - **Enhanced crash detection with output flushing (500ms delay)**
  - **Prominent crash messages to ensure visibility**
  - Shows crash details and error logs when server crashes
  - Useful for troubleshooting startup issues and runtime crashes
  - Does NOT use -H windowsgui flag
- **Use when:** 
  - Debugging launcher or startup problems
  - Need to see error logs in terminal
  - Need to see Node.js server errors and output
  - **Server crashes during TikTok Live connection**
  - **Server crashes and you need to see the error logs**
  - Investigating issues before or during app startup

### launcher.go (launcher-console.exe)
- **Purpose:** Simple console launcher
- **Features:**
  - Shows terminal window with colored output
  - Step-by-step progress
  - Pauses before exit
- **Use when:** Quick debugging or preference for terminal

### launcher-backup.go (launcher-backup.exe)
- **Purpose:** Troubleshooting launcher with comprehensive logging
- **Features:**
  - **Detailed logging to launcher-debug.log file**
  - Shows all steps with timestamps
  - Logs system information (OS, architecture)
  - Logs every operation (Node.js check, npm install, etc.)
  - Terminal stays open with colored output
  - Pauses before exit to review errors
- **Use when:** 
  - launcher.exe opens terminal briefly then closes
  - Need to diagnose installation/startup issues
  - Support needs detailed error information
