# Electron Migration Roadmap

## Overview

This document outlines the roadmap for migrating the TikTok Stream Tool from a Node.js-based web application to a native Electron desktop application.

## Current State

The application is currently built as:
- **Backend**: Node.js + Express server
- **Frontend**: HTML/CSS/JavaScript (served via Express)
- **Distribution**: Manual installation (Node.js required)
- **Updates**: Git-based or ZIP download with npm install

## Benefits of Electron Migration

### User Experience
1. **Native Desktop Application**
   - No need to open a browser
   - Native window controls (minimize, maximize, close)
   - Better integration with operating system
   - Professional appearance

2. **System Tray Integration** ⭐
   - Minimize to system tray instead of taskbar
   - Quick access menu from tray icon
   - Show connection status in tray icon
   - Notifications via tray

3. **Auto-Start Enhancement**
   - Start minimized to tray on boot
   - Silent background operation
   - No terminal window required

### Distribution
4. **One-Click Installation**
   - Windows: `.exe` installer (NSIS)
   - macOS: `.dmg` or `.pkg` installer
   - Linux: `.AppImage`, `.deb`, or `.rpm`

5. **Auto-Updates**
   - Silent background updates (Squirrel.Windows)
   - Delta updates (only changed files)
   - No manual npm install required

6. **Code Signing**
   - Windows: Authenticode signing
   - macOS: Apple Developer signing + notarization
   - Eliminates SmartScreen/Gatekeeper warnings

## Architecture Changes

### Current Architecture
```
┌─────────────────┐
│   Browser       │
│  (Frontend UI)  │
└────────┬────────┘
         │ HTTP/WebSocket
┌────────▼────────┐
│  Node.js Server │
│  (Express + IO) │
└────────┬────────┘
         │
┌────────▼────────┐
│    SQLite DB    │
└─────────────────┘
```

### Electron Architecture
```
┌──────────────────────────────────┐
│         Electron App             │
│  ┌────────────┐  ┌────────────┐  │
│  │   Main     │  │  Renderer  │  │
│  │  Process   │  │  Process   │  │
│  │ (Node.js)  │◄─┤ (Chromium) │  │
│  └──────┬─────┘  └────────────┘  │
│         │                         │
│  ┌──────▼─────┐                   │
│  │  IPC Bridge│                   │
│  └──────┬─────┘                   │
│         │                         │
│  ┌──────▼─────┐                   │
│  │ System Tray│                   │
│  └────────────┘                   │
└────────┬─────────────────────────┘
         │
┌────────▼────────┐
│    SQLite DB    │
└─────────────────┘
```

## Implementation Phases

### Phase 1: Basic Electron Wrapper (2-3 weeks)
**Goal**: Convert current app to Electron with minimal changes

1. **Setup Electron**
   - Install `electron` and `electron-builder`
   - Create `main.js` (Electron main process)
   - Migrate `server.js` logic to main process
   - Configure `electron-builder` for packaging

2. **Preserve Current Functionality**
   - Keep Express server for API structure
   - Use `BrowserWindow` to load UI
   - Maintain WebSocket communication
   - Test all existing features

3. **Basic Packaging**
   - Windows: NSIS installer
   - macOS: DMG installer
   - Linux: AppImage

**Deliverable**: Electron app with same features as current version

### Phase 2: System Tray Integration (1-2 weeks)
**Goal**: Add system tray functionality

1. **Tray Icon**
   - Create tray icon with status indicator
   - Different icons for connected/disconnected states
   - Animated icon during events (optional)

2. **Tray Menu**
   ```
   📊 TikTok Stream Tool
   ───────────────────────
   ✅ Connected to: @username
   ───────────────────────
   🖥️  Show Window
   ⚙️  Settings
   🔄 Reconnect
   ───────────────────────
   🚪 Quit
   ```

3. **Minimize to Tray**
   - Option: "Minimize to tray instead of taskbar"
   - Option: "Close to tray" (don't quit on close)
   - Option: "Start minimized to tray"

4. **Tray Notifications**
   - Show notifications for large gifts
   - Show notifications for milestones
   - Configurable notification types

**Deliverable**: Fully functional system tray with minimize/notification features

### Phase 3: Native Features (2-3 weeks)
**Goal**: Leverage Electron-specific features

1. **Native Menus**
   - File: Import/Export, Settings, Quit
   - Edit: Cut, Copy, Paste
   - View: Reload, Toggle DevTools, Zoom
   - Window: Minimize, Zoom
   - Help: Documentation, Check for Updates, About

2. **Native Dialogs**
   - File picker for import/export
   - Confirmation dialogs
   - Error/warning dialogs

3. **Global Shortcuts**
   - Toggle window: `Ctrl+Shift+T`
   - Quick mute TTS: `Ctrl+Shift+M`
   - Emergency disconnect: `Ctrl+Shift+D`

4. **Context Menus**
   - Right-click in event log: Copy, Clear
   - Right-click on flows: Edit, Delete, Duplicate
   - Right-click in soundboard: Play, Edit, Remove

**Deliverable**: Native desktop app with OS integration

### Phase 4: Auto-Update System (1 week)
**Goal**: Implement automatic silent updates

1. **Squirrel.Windows Integration**
   - Setup Squirrel.Windows for auto-updates
   - Configure update server (GitHub Releases)
   - Implement delta updates

2. **Update UI**
   - Show "Update available" notification
   - Download progress indicator
   - "Restart to update" prompt

3. **Update Channels**
   - Stable: Official releases
   - Beta: Pre-release features
   - Dev: Nightly builds

**Deliverable**: Auto-updating desktop app

### Phase 5: Code Signing & Distribution (1 week)
**Goal**: Professional distribution with code signing

1. **Windows Code Signing**
   - Obtain Authenticode certificate
   - Sign all executables
   - Configure SmartScreen whitelist

2. **macOS Code Signing**
   - Enroll in Apple Developer Program
   - Sign with Developer ID
   - Notarize app with Apple

3. **Distribution Channels**
   - GitHub Releases (all platforms)
   - Microsoft Store (Windows)
   - Mac App Store (macOS)
   - Snap Store (Linux)

**Deliverable**: Professionally signed and distributed app

## File Structure (After Migration)

```
tiktok-stream-tool/
├── main.js                    # Electron main process
├── preload.js                 # Preload script (IPC bridge)
├── package.json               # Updated with Electron deps
├── electron-builder.yml       # Build configuration
├── src/
│   ├── server/                # Backend logic (from server.js)
│   │   ├── api.js
│   │   ├── websocket.js
│   │   └── modules/
│   ├── renderer/              # Frontend (current public/)
│   │   ├── index.html
│   │   ├── dashboard.html
│   │   └── js/
│   └── main/                  # Electron-specific
│       ├── tray.js            # System tray manager
│       ├── menu.js            # Native menus
│       ├── shortcuts.js       # Global shortcuts
│       └── updater.js         # Auto-update logic
├── build/                     # Build assets
│   ├── icon.icns              # macOS icon
│   ├── icon.ico               # Windows icon
│   └── icon.png               # Linux icon
└── dist/                      # Built installers (gitignored)
```

## Breaking Changes

### For Users
- ✅ No Node.js installation required
- ✅ One-click installation
- ✅ Auto-updates
- ⚠️ Settings location changes (from `user_configs/` to app data)
- ⚠️ May need to re-import configuration

### For Developers
- ⚠️ Different development workflow (Electron dev tools)
- ⚠️ Build process changes (electron-builder)
- ⚠️ Testing requires Electron environment

## Timeline

| Phase | Duration | Total Time |
|-------|----------|------------|
| Phase 1: Basic Electron | 2-3 weeks | 2-3 weeks |
| Phase 2: System Tray | 1-2 weeks | 3-5 weeks |
| Phase 3: Native Features | 2-3 weeks | 5-8 weeks |
| Phase 4: Auto-Update | 1 week | 6-9 weeks |
| Phase 5: Code Signing | 1 week | 7-10 weeks |

**Estimated Total: 7-10 weeks** (1.5-2.5 months)

## Current Auto-Start Implementation

### Status
- ✅ **Implemented**: Auto-start on boot (Windows/macOS/Linux)
- ❌ **Not Implemented**: Minimize to system tray (requires Electron)
- ⚠️ **Limitation**: Starts with visible terminal window

### Technical Details
- Uses `auto-launch` npm package
- Supported platforms:
  - **Windows**: Registry (HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run)
  - **macOS**: Login Items (~/.config/autostart)
  - **Linux**: Desktop Entry (~/.config/autostart)

### After Electron Migration
- ✅ Start minimized to system tray
- ✅ No terminal window
- ✅ Silent background operation
- ✅ Tray icon shows connection status

## Next Steps

1. **Decide on migration timeline**
   - Consider user feedback
   - Evaluate resource availability
   - Plan feature freeze for stable version

2. **Setup development environment**
   - Install Electron tools
   - Configure electron-builder
   - Create development branch

3. **Create prototype**
   - Basic Electron wrapper
   - Test core functionality
   - Gather feedback

4. **Plan migration strategy**
   - Gradual rollout vs. big bang
   - Beta testing program
   - User communication plan

## Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest)
- [electron-builder](https://www.electron.build/)
- [Squirrel.Windows](https://github.com/Squirrel/Squirrel.Windows)
- [Auto-launch](https://github.com/Teamwork/node-auto-launch)

## Conclusion

The Electron migration will significantly improve the user experience by providing:
- Native desktop application feel
- System tray integration
- One-click installation and updates
- Professional code signing

The implementation is feasible and can be completed in 7-10 weeks with proper planning.

---

**Last Updated**: 2025-11-12
**Status**: Planning Phase
**Priority**: Medium-High
