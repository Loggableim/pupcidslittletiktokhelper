# TikTok Session ID Extractor - User Guide

## Overview

The Session ID Extractor is a feature that helps improve TikTok LIVE connection reliability by extracting and using your TikTok session ID. This is particularly useful when encountering 504 Sign API errors or other connection issues.

## What is a Session ID?

A Session ID is a cookie that TikTok uses to identify authenticated users. When you log in to TikTok, a session cookie is created in your browser. By extracting and using this session ID, the application can make authenticated requests to TikTok's API, which can help bypass some connection issues.

## When to Use Session Extraction

You should consider using the Session Extractor when:

1. **504 Gateway Timeout Errors**: When you see "Sign Error - 504" messages
2. **500 Internal Server Errors**: When the Sign API reports internal errors
3. **Connection Failures**: When standard connection methods consistently fail
4. **Geo-Restrictions**: When your IP might be blocked or restricted

## How It Works

The Session Extractor uses browser automation (Puppeteer) to:

1. Launch a browser (headless or visible)
2. Navigate to TikTok.com
3. Extract the `sessionid` cookie from your browser session
4. Save it to the database and configuration
5. Automatically use it in future TikTok LIVE connections

## Installation Requirements

### Dependencies

The Session Extractor requires:
- Node.js 18.0.0 or higher
- Puppeteer (installed via npm)
- Chrome or Chromium browser

### Installing Chrome/Chromium

If you don't have Chrome installed, you can install it:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install chromium-browser
```

**Windows:**
Download from [Google Chrome](https://www.google.com/chrome/)

**macOS:**
```bash
brew install --cask google-chrome
```

## Usage

### Method 1: Automatic Extraction (Headless)

This method works if you're already logged in to TikTok in your system's default browser.

1. Open the Dashboard
2. Go to Settings
3. Scroll to "TikTok Session-ID Extraktion"
4. Click **"Session-ID extrahieren (Automatisch)"**
5. Wait for the extraction to complete
6. The session status will update automatically

**Limitations:**
- Requires you to be already logged in to TikTok
- May not work if TikTok requires re-authentication

### Method 2: Manual Extraction (With Login)

This method opens a visible browser window where you can log in manually.

1. Open the Dashboard
2. Go to Settings
3. Scroll to "TikTok Session-ID Extraktion"
4. Click **"Session-ID extrahieren (Manuell)"**
5. A browser window will open
6. Log in to TikTok if not already logged in
7. Wait 60 seconds for the extraction to complete
8. The session status will update automatically

**Best for:**
- First-time setup
- When automatic extraction fails
- When you need to log in with a specific account

## Session Management

### Viewing Session Status

The session status panel shows:
- Whether a session ID is active
- When it was extracted
- Masked session ID (first 10 characters)

### Clearing Session Data

To remove the stored session ID:

1. Click **"Session-ID löschen"**
2. Confirm the deletion
3. The session status will update to show no session

### Testing Browser Availability

To check if browser automation is available:

1. Click **"Browser-Verfügbarkeit testen"**
2. The system will test if it can launch a browser
3. Results will show if the feature is ready to use

## Troubleshooting

### "Browser automation not available"

**Solution:**
- Install Chrome or Chromium
- Ensure Puppeteer is installed: `npm install`

### "Session ID not found in cookies"

**Possible causes:**
1. Not logged in to TikTok
2. TikTok session expired

**Solution:**
- Use Manual Extraction and log in
- Clear browser cookies and try again

### "Session extraction failed"

**Possible causes:**
1. Network issues
2. TikTok is blocking automated browsers
3. Chrome/Chromium not found

**Solution:**
- Check your internet connection
- Try manual extraction
- Install Chrome/Chromium
- Check firewall settings

### Extraction takes too long

**Solution:**
- Check your internet speed
- TikTok might be slow to load
- Try using a VPN if you're in a restricted region

## Security Considerations

### Is it safe to extract my Session ID?

**Yes**, but with considerations:

1. **Local Storage**: Session data is stored locally on your computer
2. **No Transmission**: Session IDs are only sent to TikTok, not to third parties
3. **File Permissions**: Session files are stored in `user_data/tiktok_session.json`

### Protecting Your Session

- Don't share your session ID with others
- Keep your system secure
- Regularly clear and refresh your session
- Log out of TikTok when done streaming

### Session Expiration

TikTok sessions typically expire after:
- 30 days of inactivity
- Password changes
- Security-related events

When expired, simply extract a new session ID.

## API Reference

### Endpoints

#### POST `/api/session/extract`
Extract session ID automatically (headless)

**Request:**
```json
{
  "headless": true,
  "executablePath": "/path/to/chrome" // optional
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "abc123...",
  "extractedAt": "2025-11-17T10:30:00.000Z",
  "message": "Session ID extracted successfully"
}
```

#### POST `/api/session/extract-manual`
Extract session ID with manual login

**Request:**
```json
{
  "executablePath": "/path/to/chrome" // optional
}
```

#### GET `/api/session/status`
Get current session status

**Response:**
```json
{
  "hasSession": true,
  "sessionId": "abc123...",
  "extractedAt": "2025-11-17T10:30:00.000Z",
  "isExtracting": false
}
```

#### DELETE `/api/session/clear`
Clear stored session data

**Response:**
```json
{
  "success": true,
  "message": "Session data cleared"
}
```

#### GET `/api/session/test-browser`
Test browser automation availability

**Response:**
```json
{
  "available": true,
  "message": "Browser automation is available"
}
```

## Advanced Configuration

### Custom Chrome Path

If Chrome is installed in a non-standard location:

```javascript
// In API request
{
  "executablePath": "/usr/bin/chromium-browser"
}
```

### Environment Variables

You can set environment variables:

```bash
# Use system Chrome
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Custom executable path
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

## Best Practices

1. **Extract Once**: Only extract when needed, not on every startup
2. **Monitor Expiration**: Re-extract if connection issues return
3. **Use VPN**: Consider using a VPN if frequently blocked
4. **Keep Updated**: Update the application regularly for best compatibility
5. **Test First**: Use the browser test before attempting extraction

## FAQ

### Q: Do I need to extract a session ID every time?

**A:** No, the session ID is saved and reused automatically. Only extract when:
- First-time setup
- Session expired
- Connection issues persist

### Q: Will this work without logging in to TikTok?

**A:** No, you need to be logged in to TikTok for the session extraction to work.

### Q: Can I use multiple accounts?

**A:** The extractor uses whichever account is logged in during extraction. To switch accounts:
1. Clear the current session
2. Log in to TikTok with the desired account
3. Extract the session again

### Q: Does this affect my TikTok account security?

**A:** The session ID is stored locally and only used for API connections. However:
- Keep your computer secure
- Don't share your session files
- Log out when done

### Q: What if the extraction fails repeatedly?

**A:** Try these steps in order:
1. Use manual extraction
2. Clear browser cache and cookies
3. Try a different browser
4. Use a VPN
5. Wait a few hours and try again

## Support

If you encounter issues not covered in this guide:

1. Check the application logs
2. Try the browser availability test
3. Review the error messages
4. Report issues with:
   - Your operating system
   - Browser version
   - Error messages
   - Steps to reproduce

## Changelog

### v1.0.0 (2025-11-17)
- Initial release
- Automatic and manual extraction modes
- Session status monitoring
- Browser availability testing
- Integration with TikTok connection flow
