# Config Import Plugin

## Overview

The Config Import plugin allows users to import their settings from old installation paths where configuration files were stored directly in the installation directory (before the migration to platform-specific config directories).

## Problem

In older versions of Pup Cid's Little TikTok Helper, configuration files were stored directly in the application installation directory. This meant that when users:
- Reinstalled the application
- Updated to a new version
- Moved the installation to a different location

...they would lose all their settings, profiles, TTS configurations, soundboard mappings, and other data.

## Solution

This plugin provides a user-friendly interface to:
1. Select the old installation directory
2. Validate that configuration files exist there
3. Import all settings to the current configuration location

## Features

- ✅ **Path Validation**: Checks if the selected path contains valid configuration files
- ✅ **Selective Import**: Shows what will be imported (user_configs, user_data, uploads)
- ✅ **Progress Feedback**: Visual feedback during the import process
- ✅ **Multi-language Support**: German and English translations
- ✅ **Safe Operation**: Preserves file timestamps and handles errors gracefully

## Usage

1. Open the plugin from the dashboard (Plugins → Config Import)
2. Enter the full path to your old installation directory:
   - Windows: `C:\old-path\pupcidslittletiktokhelper`
   - macOS: `/Users/username/old-path/pupcidslittletiktokhelper`
   - Linux: `/home/username/old-path/pupcidslittletiktokhelper`
3. Click "Validate Path" to check if configuration files exist
4. Review the found files
5. Click "Import Settings" to start the import
6. **Restart the application** to load the imported settings

## What Gets Imported

The plugin imports the following directories from your old installation:

### user_configs/
- User profile databases (`.db` files)
- TTS voice mappings
- Gift sound assignments
- Alert configurations
- Flow automations
- HUD element positions

### user_data/
- TikTok session information
- Flow logs
- Temporary data files

### uploads/
- Custom animations
- User-uploaded assets
- Custom sound files

## Important Notes

⚠️ **Backup First**: The import process will overwrite existing files with the same names. Consider backing up your current configuration before importing.

⚠️ **Restart Required**: After importing, you must restart the application for changes to take effect.

⚠️ **Path Format**: Make sure to use the correct path format for your operating system:
- Windows uses backslashes: `C:\path\to\folder`
- macOS/Linux use forward slashes: `/path/to/folder`

## Technical Details

### API Endpoints

#### POST `/api/config-import/validate`
Validates an import path and returns information about found configuration files.

**Request:**
```json
{
  "importPath": "/path/to/old/installation"
}
```

**Response:**
```json
{
  "valid": true,
  "findings": {
    "userConfigs": true,
    "userData": true,
    "uploads": false,
    "files": ["user_configs/default.db", "user_data/session.json"]
  }
}
```

#### POST `/api/config-import/import`
Imports settings from the validated path.

**Request:**
```json
{
  "importPath": "/path/to/old/installation"
}
```

**Response:**
```json
{
  "success": true,
  "imported": {
    "userConfigs": 5,
    "userData": 3,
    "uploads": 0
  },
  "errors": []
}
```

## Troubleshooting

### "Path does not exist"
- Check that you've entered the complete path to the old installation
- Make sure the path format matches your operating system
- Verify the directory actually exists

### "No configuration files found"
- The selected path may not be the correct installation directory
- Look for the `user_configs` or `user_data` folders in the path
- The path might be to a subdirectory instead of the main installation folder

### "Import succeeded but settings not visible"
- Make sure you've restarted the application
- Check the console/logs for any errors
- Verify the imported files are in the correct location (see Settings → Configuration Storage Location)

## Development

### Plugin Structure
```
config-import/
├── main.js           # Plugin backend logic
├── plugin.json       # Plugin metadata
├── ui.html          # User interface
├── locales/
│   ├── de.json      # German translations
│   └── en.json      # English translations
└── README.md        # This file
```

### Required Permissions
- `routes`: To register API endpoints
- `database`: To access configuration management

## License

MIT License - Part of Pup Cid's Little TikTok Helper

## Support

For issues or questions:
- GitHub Issues: [Create an issue](https://github.com/Loggableim/pupcidslittletiktokhelper/issues)
- Email: loggableim@gmail.com
