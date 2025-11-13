# Tauri Icons

## Generating Icons

To generate icons for the Tauri application, you need a 1024x1024 PNG source icon.

### Option 1: Using Tauri Icon Generator (Recommended)

```bash
npx @tauri-apps/cli icon path/to/your/icon.png
```

This will automatically generate:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png` (256x256)
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon.png` (512x512 for Linux)

### Option 2: Manual Creation

Create the following icons manually:
- `32x32.png` - 32x32 pixels
- `128x128.png` - 128x128 pixels
- `128x128@2x.png` - 256x256 pixels
- `icon.icns` - macOS bundle icon
- `icon.ico` - Windows icon (multi-size .ico file)
- `icon.png` - 512x512 pixels for Linux
- `tray-icon.png` - 32x32 pixels for system tray

### Required Icons

All of these icons are referenced in `tauri.conf.json` and must be present for the build to succeed.

### Temporary Placeholder

For development purposes, you can use simple colored squares as placeholders until you have a proper logo design.
