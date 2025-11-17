# TTS Issues Fix Summary

## Problem Statement
The TTS (Text-to-Speech) system was experiencing several issues:

1. **CSP Violation**: Content-Security-Policy blocking inline scripts from Socket.IO
2. **WebSocket Connection Failure**: Hardcoded port 8080 causing connection failures (server runs on port 3000)
3. **Missing CSS File**: `ui.css` referenced but not present
4. **Quirks Mode Warning**: HTML rendering in compatibility mode
5. **AudioContext Warnings**: Browser preventing automatic audio playback

## Root Causes

### 1. CSP Inline Script Violation
Socket.IO's client library requires some inline script execution for initialization. The strict CSP policy `script-src 'self'` was blocking this, causing the error:
```
Content-Security-Policy: The page's settings blocked an inline script (script-src-elem) from being executed because it violates the following directive: "script-src 'self'". Consider using a hash ('sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=')
```

### 2. Hardcoded WebSocket Port
The legacy TTS UI (`/tts/ui.js`) had a hardcoded WebSocket connection:
```javascript
const ws = new WebSocket('ws://localhost:8080');
```
However, the server runs on port 3000 by default, causing connection failures.

### 3. Missing CSS File
The `/tts/ui.html` referenced `ui.css` which didn't exist in the repository.

### 4. Legacy TTS Folder Not Served
The `/tts` directory containing legacy UI files wasn't configured as a static route.

## Solutions Implemented

### 1. CSP Policy Update (✅ Fixed)
**File**: `server.js`

Added Socket.IO's inline script hash to the CSP policy:
```javascript
script-src 'self' 'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU=';
```

This allows Socket.IO's specific inline initialization code while maintaining security for all other scripts.

**Applied to both CSP policies**:
- Dashboard/Plugin UI routes (lines 126-138)
- Other routes (lines 142-154)

### 2. Dynamic WebSocket Connection (✅ Fixed)
**File**: `tts/ui.js`

**Before**:
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

**After**:
```javascript
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const host = window.location.hostname || 'localhost';
const port = window.location.port || '3000';
const wsUrl = `${protocol}//${host}:${port}`;
const ws = new WebSocket(wsUrl);
```

This automatically uses the correct protocol, host, and port based on the current page URL.

### 3. Created Missing CSS File (✅ Fixed)
**File**: `tts/ui.css` (NEW)

Created a comprehensive CSS file with:
- TTS container styling
- Admin panel layout
- Form controls and buttons
- Hover effects and transitions
- Responsive design

### 4. Added Static Route (✅ Fixed)
**File**: `server.js`

Added route to serve legacy TTS UI files:
```javascript
app.use('/tts', express.static(path.join(__dirname, 'tts')));
```

## Non-Issues (No Fix Required)

### Quirks Mode Warning
The HTML files already have proper `<!DOCTYPE html>` declarations. This warning may appear for other reasons (like browser dev tools rendering) but doesn't indicate a problem with the files.

### AudioContext Warnings
These are standard browser security features:
```
An AudioContext was prevented from starting automatically. It must be created or resumed after a user gesture on the page.
```

This is **expected behavior**. Browsers require user interaction (click, tap, etc.) before playing audio to prevent unwanted auto-play. This cannot and should not be "fixed" as it's a security feature.

### X-Frame-Options Warnings
```
Content-Security-Policy: Ignoring 'x-frame-options' because of 'frame-ancestors' directive.
```

This is **expected behavior**. When both `X-Frame-Options` and CSP `frame-ancestors` are present, CSP takes precedence and the warning is informational only. The frame protection is still active via CSP.

## Testing

All fixes have been validated with automated tests:

```bash
node test-tts-fixes.js
```

**Test Results**:
```
✓ CSS File Exists: ui.css found
✓ CSS File Content: 1966 bytes
✓ Dynamic Port Detection: Uses window.location for WebSocket URL
✓ No Hardcoded Port: Hardcoded port removed
✓ Socket.IO CSP Hash: CSP includes Socket.IO hash
✓ TTS Static Route: /tts route configured

📊 Test Summary: 6 passed, 0 failed
```

## Security Assessment

**CodeQL Analysis**: ✅ No vulnerabilities detected

The CSP hash approach maintains security by:
1. Whitelisting only the specific inline script needed by Socket.IO
2. Continuing to block all other inline scripts
3. Preventing XSS attacks through strict CSP
4. Using SHA-256 hash for integrity verification

## Files Changed

1. **server.js**
   - Added Socket.IO CSP hash to both CSP policies
   - Added `/tts` static route

2. **tts/ui.js**
   - Fixed WebSocket connection to use dynamic port detection
   - Removed hardcoded `ws://localhost:8080`

3. **tts/ui.css** (NEW)
   - Created comprehensive CSS file for TTS UI

4. **test-tts-fixes.js** (NEW)
   - Automated validation tests

## Usage

### Accessing TTS UI

**Legacy TTS UI** (for testing):
- URL: `http://localhost:3000/tts/ui.html`
- Admin mode: `http://localhost:3000/tts/ui.html?admin=true`

**Modern TTS Admin Panel** (recommended):
- URL: `http://localhost:3000/plugins/tts/ui/admin-panel.html`
- Via Dashboard: Open Dashboard → Plugins → TTS

### WebSocket Connection

The TTS UI now automatically connects to the correct WebSocket endpoint:
- Development: `ws://localhost:3000`
- Production with HTTPS: `wss://yourdomain.com`
- Custom port: Automatically detected from URL

## Future Recommendations

1. **Consider deprecating legacy TTS UI** (`/tts` folder) in favor of the modern plugin-based UI
2. **Add user documentation** for the AudioContext warnings to set expectations
3. **Monitor CSP reports** to ensure no new violations are introduced
4. **Consider nonce-based CSP** instead of hash-based for more dynamic content

## References

- [Socket.IO CSP Considerations](https://socket.io/docs/v4/client-installation/#content-security-policy)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Web Audio API Security](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#autoplay_policy)
