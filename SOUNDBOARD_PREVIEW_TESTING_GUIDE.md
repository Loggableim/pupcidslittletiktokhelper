# Soundboard Preview System - Testing & Usage Guide

## Overview

The Soundboard Preview System allows secure, client-side audio previews for the TikTok LIVE stream tool. Audio playback happens entirely in the browser using HTML5 audio - the server never decodes, plays, or streams audio files.

## Architecture

### Client-Side (Browser)
- **HTML5 Audio Player**: Hidden audio element that becomes visible during preview
- **WebSocket Client**: `dashboard_preview.js` connects to server and handles preview events
- **Security**: No unsafe DOM manipulation, only whitelisted sources

### Server-Side (Node.js/Express)
- **Preview Endpoint**: `POST /api/soundboard/preview` validates requests and broadcasts events
- **WebSocket Transport**: Tracks dashboard clients and sends preview events only to them
- **Fetcher**: Validates file paths (prevents traversal) and URLs (whitelist-based)
- **Static Serving**: `/sounds` directory serves local audio files

## Environment Variables

Add these to your `.env` file:

```bash
# Optional: API key for preview endpoint authentication
# Leave empty to disable authentication (dev mode only)
SOUNDBOARD_KEY=your-secret-key-here

# Optional: Additional allowed hosts for external URLs (comma-separated)
# Defaults: myinstants.com, www.myinstants.com, openshock.com, www.openshock.com
SOUNDBOARD_ALLOWED_HOSTS=example.com,audio.example.com

# Preview mode (only "client" is supported)
SOUNDBOARD_PREVIEW_MODE=client
```

## API Endpoint

### POST /api/soundboard/preview

Triggers an audio preview by broadcasting a WebSocket message to all connected dashboard clients.

**Headers:**
- `Content-Type: application/json`
- `x-sb-key: <your-api-key>` (required if SOUNDBOARD_KEY is set)

**Request Body:**

For local files:
```json
{
  "sourceType": "local",
  "filename": "sound.mp3"
}
```

For external URLs:
```json
{
  "sourceType": "url",
  "url": "https://www.myinstants.com/media/sounds/example.mp3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preview broadcast sent to dashboard clients",
  "clientsNotified": 1,
  "payload": {
    "sourceType": "local",
    "filename": "sound.mp3"
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Missing or invalid API key
- `400 Bad Request` - Invalid request (validation error)
- `500 Internal Server Error` - Server error

### GET /api/soundboard/preview/status

Get status of the preview system.

**Response:**
```json
{
  "success": true,
  "authenticated": true,
  "dashboardClients": 1,
  "allowedHosts": ["myinstants.com", "www.myinstants.com", "openshock.com", "www.openshock.com"],
  "soundsDirectory": "/path/to/public/sounds"
}
```

## WebSocket Protocol

### Client → Server

**Identify as Dashboard Client:**
```javascript
socket.emit('soundboard:identify', { client: 'dashboard' });
```

### Server → Client

**Identification Confirmation:**
```javascript
socket.on('soundboard:identified', (data) => {
  // { status: 'ok', clientId: 'abc123' }
});
```

**Preview Event:**
```javascript
socket.on('soundboard:preview', (message) => {
  // For local files:
  // {
  //   type: 'preview-sound',
  //   payload: {
  //     sourceType: 'local',
  //     filename: 'sound.mp3',
  //     timestamp: 1234567890
  //   }
  // }
  
  // For external URLs:
  // {
  //   type: 'preview-sound',
  //   payload: {
  //     sourceType: 'url',
  //     url: 'https://www.myinstants.com/media/sounds/example.mp3',
  //     timestamp: 1234567890
  //   }
  // }
});
```

## Usage Examples

### Testing with cURL

**Local file preview:**
```bash
curl -X POST http://localhost:3000/api/soundboard/preview \
  -H "Content-Type: application/json" \
  -H "x-sb-key: your-secret-key" \
  -d '{"sourceType":"local","filename":"test.mp3"}'
```

**External URL preview:**
```bash
curl -X POST http://localhost:3000/api/soundboard/preview \
  -H "Content-Type: application/json" \
  -H "x-sb-key: your-secret-key" \
  -d '{"sourceType":"url","url":"https://www.myinstants.com/media/sounds/test.mp3"}'
```

### Testing with JavaScript (Browser)

```javascript
// Trigger preview from browser console (must be on soundboard page)
async function previewSound(type, source) {
  const payload = type === 'local' 
    ? { sourceType: 'local', filename: source }
    : { sourceType: 'url', url: source };
  
  const response = await fetch('/api/soundboard/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sb-key': 'your-secret-key' // Or omit if auth is disabled
    },
    body: JSON.stringify(payload)
  });
  
  const result = await response.json();
  console.log('Preview result:', result);
}

// Examples:
previewSound('local', 'test.mp3');
previewSound('url', 'https://www.myinstants.com/media/sounds/example.mp3');
```

### Manual Client Testing

```javascript
// Check if preview client is loaded and working
if (window.DashboardPreviewClient) {
  console.log('Preview client loaded');
  console.log('Connected:', DashboardPreviewClient.isConnected());
  console.log('Identified:', DashboardPreviewClient.isIdentified());
  
  // Manual control
  DashboardPreviewClient.setVolume(0.5); // 50% volume
  DashboardPreviewClient.play('/sounds/test.mp3');
  DashboardPreviewClient.stop();
  
  // Enable debug logging
  DashboardPreviewClient.enableDebug();
}
```

## Running Tests

### Unit Tests (Fetcher)

Tests path validation and URL whitelist functionality:

```bash
node test-soundboard-preview.js
```

**What it tests:**
- Valid and invalid file extensions (.mp3, .wav, .ogg, .m4a vs .exe, .js)
- Path traversal protection (../, subdirectories)
- URL protocol validation (https/http only)
- URL whitelist enforcement
- Dynamic host addition

### Integration Tests (Full API)

Tests the complete preview system including authentication, validation, and WebSocket broadcasting:

```bash
node test-soundboard-preview-api.js
```

**What it tests:**
- Authentication (API key validation)
- Request validation (sourceType, filename, url)
- Path traversal protection
- URL whitelist enforcement
- WebSocket client identification
- Preview event broadcasting
- Client count tracking
- Status endpoint

## Security Features

### Path Traversal Protection

❌ **Blocked:**
```
../../../etc/passwd
subdir/file.mp3
subdir\file.mp3
```

✅ **Allowed:**
```
test.mp3
sound.wav
audio.ogg
```

### URL Whitelist

❌ **Blocked:**
```
https://evil.com/malware.mp3
file:///etc/passwd
javascript:alert(1)
ftp://example.com/file.mp3
```

✅ **Allowed (Default):**
```
https://www.myinstants.com/media/sounds/test.mp3
https://cdn.myinstants.com/sounds/test.mp3
https://openshock.com/audio/test.mp3
http://www.myinstants.com/test.mp3 (HTTP is allowed)
```

### File Extension Whitelist

✅ **Allowed:**
- `.mp3`
- `.wav`
- `.ogg`
- `.m4a`

❌ **Blocked:**
- `.exe`
- `.js`
- `.html`
- `.sh`
- Any other extension

### No Server-Side Audio Processing

The server **never**:
- Decodes audio files
- Plays audio
- Streams audio data
- Processes audio in any way

The server **only**:
- Validates requests
- Broadcasts WebSocket messages
- Serves static files via Express

## Troubleshooting

### Preview not playing

1. **Check browser console for errors**
   ```javascript
   DashboardPreviewClient.enableDebug();
   ```

2. **Verify WebSocket connection**
   ```javascript
   console.log('Connected:', DashboardPreviewClient.isConnected());
   console.log('Identified:', DashboardPreviewClient.isIdentified());
   ```

3. **Check for autoplay blocking**
   - Some browsers block autoplay
   - Audio player will be visible - click play button manually

4. **Verify API response**
   ```bash
   curl -X GET http://localhost:3000/api/soundboard/preview/status
   ```

### Audio file not found (404)

1. **Verify file exists in `/public/sounds/`**
   ```bash
   ls -la public/sounds/
   ```

2. **Check file permissions**
   ```bash
   chmod 644 public/sounds/test.mp3
   ```

3. **Test direct access**
   ```
   http://localhost:3000/sounds/test.mp3
   ```

### External URL not allowed

1. **Check URL whitelist**
   ```bash
   curl http://localhost:3000/api/soundboard/preview/status
   ```

2. **Add host to whitelist**
   ```bash
   # In .env
   SOUNDBOARD_ALLOWED_HOSTS=example.com,audio.example.com
   ```

3. **Restart server** to apply changes

### Authentication errors

1. **Check if API key is set**
   ```bash
   echo $SOUNDBOARD_KEY
   ```

2. **Verify header in request**
   ```bash
   curl -v http://localhost:3000/api/soundboard/preview \
     -H "x-sb-key: your-key" \
     ...
   ```

3. **Disable auth for testing** (remove SOUNDBOARD_KEY from .env)

## Best Practices

1. **Always use HTTPS in production** for external URLs
2. **Set SOUNDBOARD_KEY** in production environments
3. **Keep whitelist minimal** - only add trusted hosts
4. **Monitor rate limits** - default is handled by Express rate-limiter
5. **Test preview before going live** - use test files first
6. **Handle autoplay blocking gracefully** - it's expected browser behavior
7. **Use descriptive filenames** for local sounds (no spaces, special chars)

## Performance Notes

- **No audio processing overhead** - server only validates and broadcasts
- **Minimal bandwidth** - WebSocket messages are tiny (~200 bytes)
- **Scalable** - can handle many concurrent dashboard clients
- **Fast** - typical preview latency <100ms (network dependent)

## Support

If you encounter issues:

1. Run unit tests: `node test-soundboard-preview.js`
2. Run integration tests: `node test-soundboard-preview-api.js`
3. Check browser console for client-side errors
4. Check server logs for backend errors
5. Verify environment variables are set correctly
6. Test with simple local file first before external URLs
