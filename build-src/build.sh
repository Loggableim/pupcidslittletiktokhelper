#!/bin/bash
# LTTH Launcher Build Script
# This script builds the modern launcher with all features

set -e

echo "================================"
echo "LTTH Launcher Build Script"
echo "================================"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "ERROR: Go is not installed"
    exit 1
fi

echo "Go version: $(go version)"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Building launcher..."

# Build for Windows (GUI mode - no console)
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    echo "Building for Windows (GUI mode)..."
    go build -ldflags "-H windowsgui" -o launcher.exe launcher-gui.go launcher-http.go
    echo "✓ Built: launcher.exe"
else
    # Cross-compile for Windows from Linux/Mac
    echo "Cross-compiling for Windows (GUI mode)..."
    GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui" -o launcher.exe launcher-gui.go launcher-http.go
    echo "✓ Built: launcher.exe"
fi

# Build console version for debugging
echo "Building console version for debugging..."
go build -o launcher-console launcher-gui.go launcher-http.go
echo "✓ Built: launcher-console (or launcher-console.exe)"

# Copy to root directory
echo "Copying launcher.exe to project root..."
cp launcher.exe ../
echo "✓ Copied to root directory"

# Show file sizes
echo ""
echo "Build complete!"
echo "File sizes:"
ls -lh launcher.exe 2>/dev/null || ls -lh launcher-console
echo ""
echo "The launcher includes:"
echo "  ✓ Language selection screen"
echo "  ✓ Profile management"
echo "  ✓ Tab-based navigation"
echo "  ✓ Real-time server logs"
echo "  ✓ Internationalization support"
echo "  ✓ Background npm install"
echo ""
echo "To run: ./launcher.exe (Windows) or wine launcher.exe (Linux/Mac)"
