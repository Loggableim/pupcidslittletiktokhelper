# LTTH Launcher - User Guide

## Quick Start

1. **Run the Launcher**
   ```
   launcher.exe
   ```
   The launcher will automatically open in your default browser.

2. **Select Your Language**
   - Choose from German (🇩🇪), English (🇬🇧), Spanish (🇪🇸), or French (🇫🇷)
   - Click on your preferred language
   - Click "Continue"

3. **Create or Select a Profile**
   - Create a new profile with your stream name
   - Optionally add your TikTok @username
   - Or select an existing profile from the list
   - Click "Continue"

4. **Explore the Launcher**
   - **Welcome Tab**: Read about LTTH features
   - **Resources Tab**: Get API keys and dependencies
   - **Changelog Tab**: See what's new
   - **Community Tab**: Join Discord, visit the website
   - **Logging Tab**: Watch real-time server logs

5. **Launch the Dashboard**
   - Wait for the progress bar to reach 100%
   - Click "Launch Dashboard" button
   - You'll be redirected to the LTTH dashboard

## Features

### Language Selection
- 4 languages supported: German, English, Spanish, French
- Your selection is saved for next time
- Translation help notices for incomplete languages

### Profile Management
- Create multiple profiles for different streams
- Switch between profiles easily
- Store TikTok username with each profile
- Profiles are saved in `user_configs/`

### Tab Navigation
- **Welcome**: Installation info and features overview
- **Resources**: Direct links to required tools and API keys
- **Changelog**: Full changelog from latest version
- **Community**: Links to Discord, website, and GitHub
- **Logging**: Real-time server logs with enable/disable toggle

### Real-time Logging
- See live server output as it happens
- Enable/disable logging with toggle
- Clear logs button
- Auto-scrolls to newest entries
- Color-coded (errors in red, warnings in yellow)

### Keep Launcher Open
- Check "Keep Launcher Open" to monitor logs after dashboard launches
- Useful for debugging and monitoring
- Preference is saved

## Important Links

### Required: Euler Stream API
⚠️ **Mandatory for TikTok connection!**
- Get your key: https://eulerstream.com
- Add it to Settings → API Keys in the dashboard

### Optional: OBS WebSocket
- For scene automation and overlays
- Download: https://obsproject.com

### Required: Node.js
- Runtime environment (v16 or higher)
- Download: https://nodejs.org

### Documentation
- Full guides: https://ltth.app
- GitHub: https://github.com/Loggableim/pupcidslittletiktokhelper
- Discord: https://discord.gg/pawsunited

## Troubleshooting

### Launcher doesn't open in browser
- Manually navigate to: http://127.0.0.1:58734
- Check if port 58734 is available
- Check firewall settings

### "Node.js not installed" error
- Download Node.js from https://nodejs.org
- Install version 16 or higher
- Restart your computer
- Run launcher again

### npm install takes too long
- This is normal for first-time setup
- Can take 5-10 minutes on slow connections
- Watch the progress in the status bar
- Check Logging tab for details

### Server won't start
- Check Logging tab for error messages
- Ensure port 3000 is available
- Make sure .env file exists (auto-created)
- Check app/logs/ folder for detailed logs

### Profile creation fails
- Use only letters, numbers, hyphens, and underscores
- Profile names must be unique
- Don't use special characters

## Advanced Features

### Keep Launcher Open
- Check the box at bottom right
- Launcher stays open after dashboard launches
- Useful for:
  - Monitoring server logs
  - Debugging issues
  - Watching server status
- Uncheck to auto-close after launch

### Logging Tab
- Real-time server output
- Toggle logging on/off
- Clear logs button
- Auto-scroll to bottom
- Color coding:
  - Green: Info messages
  - Yellow: Warnings
  - Red: Errors

### Background npm Install
- Happens automatically if node_modules missing
- Runs in background during language/profile selection
- Progress shown in status bar and Logging tab
- Can take several minutes

## Files and Directories

### Launcher Files
- `launcher.exe` - Main launcher (9.7MB)
- `launcher-console.exe` - Debug version with console

### Configuration Files
- `app/launcher-prefs.json` - Launcher preferences
- `app/.env` - Server configuration (auto-created)
- `user_configs/*.db` - User profile databases

### Log Files
- `app/logs/launcher_YYYY-MM-DD_HH-MM-SS.log` - Launcher logs
- Check these for detailed error information

## Building from Source

### Windows
```batch
cd build-src
build.bat
```

### Linux/Mac
```bash
cd build-src
./build.sh
```

This creates:
- `launcher.exe` - GUI version
- `launcher-console.exe` - Console version

## Support

Need help?
- 💬 Discord: https://discord.gg/pawsunited
- 📚 Documentation: https://ltth.app
- 🐛 Issues: https://github.com/Loggableim/pupcidslittletiktokhelper/issues

## Language Contributions

Help translate LTTH!
- Spanish and French translations are incomplete
- Edit `app/locales/es.json` or `app/locales/fr.json`
- Submit a pull request on GitHub
- Your contribution helps the community!

---

**Version**: 2.0 (Modern Launcher)
**Last Updated**: December 2025
**License**: CC-BY-NC-4.0
