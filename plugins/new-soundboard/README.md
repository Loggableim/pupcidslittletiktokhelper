# New Soundboard Plugin

A modern, security-hardened soundboard plugin for TikTok Live streaming with MyInstants API integration and iframe fallback support.

## Features

- 🎵 **MyInstants Integration**: Search and play sounds from MyInstants.com
- 📁 **Local Sound Storage**: Upload and manage local audio files
- 🔒 **Security Hardened**: Input validation, rate limiting, host whitelisting
- 🎯 **Priority Queue System**: Advanced playback queue with priorities
- 👥 **Permission System**: Role-based access control with monetization
- 🌐 **WebSocket Real-time**: Live communication between dashboard and overlay
- 🎨 **Modern UI**: Responsive dashboard and animated overlay
- 🔄 **Iframe Fallback**: Automatic fallback for CORS-restricted content

## Installation

The plugin is located at `plugins/new-soundboard/` and will be automatically loaded by the plugin system.

### Dependencies

All dependencies are included in the main project's `package.json`:
- express
- ws
- multer
- express-rate-limit
- p-queue
- axios
- cheerio

## Configuration

### Environment Variables

Create a `.env` file or set these variables:

```bash
# Sound storage directory (optional, defaults to plugins/new-soundboard/sounds)
SOUND_PLUGIN_DIR=/path/to/sounds

# API authentication key (optional, auto-generated if not set)
NEW_SOUNDBOARD_KEY=your-secret-key-here

# Allowed hosts for external URLs (comma-separated)
ALLOWED_HOSTS=www.myinstants.com,instaud.io,*.cloudfront.net

# MyInstants API settings
MYINSTANTS_API_BASE=https://www.myinstants.com
CACHE_DIR=/path/to/cache
CACHE_MAX_SIZE=104857600
CACHE_TTL=86400000

# Queue settings
QUEUE_CONCURRENCY=1

# Rate limiting
PREVIEW_RATE_LIMIT=10
MAX_REMOTE_SIZE=10485760
```

### Default Configuration

The plugin uses these defaults if no configuration is provided:

```javascript
{
  enabled: true,
  requireAuth: false,
  soundDir: 'plugins/new-soundboard/sounds',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  queueConcurrency: 1,
  previewRateLimit: { windowMs: 60000, max: 10 },
  playRateLimit: { windowMs: 60000, max: 5 },
  allowedHosts: ['www.myinstants.com', 'instaud.io', '*.cloudfront.net']
}
```

## API Endpoints

### Authentication

All endpoints support optional authentication via:
- Header: `x-sb-key: YOUR_API_KEY`
- Query parameter: `?key=YOUR_API_KEY`

### POST /api/new-soundboard/preview

Preview a sound without adding to queue.

**Request:**
```json
{
  "sourceType": "myinstants|local|url",
  "id": "myinstants-slug",
  "filename": "local-file.mp3",
  "url": "https://example.com/sound.mp3"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sourceType": "myinstants",
    "instantsId": "button-id",
    "name": "Sound Name",
    "url": "https://direct-audio-url.mp3",
    "embedFallback": false,
    "licenseStatus": "unknown"
  }
}
```

**Example with curl:**
```bash
curl -X POST http://localhost:3000/api/new-soundboard/preview \
  -H "Content-Type: application/json" \
  -H "x-sb-key: YOUR_API_KEY" \
  -d '{"sourceType":"myinstants","id":"button-press"}'
```

### POST /api/new-soundboard/play

Queue a sound for playback.

**Request:**
```json
{
  "sourceType": "local",
  "filename": "sound.mp3",
  "userId": "user123",
  "priority": 0,
  "volume": 100,
  "fadeIn": 0,
  "fadeOut": 0
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "abc123xyz"
}
```

**Example with curl:**
```bash
curl -X POST http://localhost:3000/api/new-soundboard/play \
  -H "Content-Type: application/json" \
  -H "x-sb-key: YOUR_API_KEY" \
  -d '{"sourceType":"local","filename":"sound.mp3","userId":"admin"}'
```

### GET /api/new-soundboard/list

List all local sounds.

**Response:**
```json
{
  "success": true,
  "sounds": [
    {
      "sourceType": "local",
      "filename": "sound.mp3",
      "size": 12345,
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST /api/new-soundboard/upload

Upload a new sound file.

**Request:** multipart/form-data with `file` field

**Response:**
```json
{
  "success": true,
  "file": {
    "filename": "sound.mp3",
    "size": 12345,
    "checksum": "abc123...",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Example with curl:**
```bash
curl -X POST http://localhost:3000/api/new-soundboard/upload \
  -H "x-sb-key: YOUR_API_KEY" \
  -F "file=@/path/to/sound.mp3"
```

### GET /api/new-soundboard/meta/:soundId

Get sound metadata.

### POST /api/new-soundboard/meta/:soundId

Update sound metadata.

### GET /api/new-soundboard/metrics

Get system metrics and statistics.

**Response:**
```json
{
  "success": true,
  "metrics": {
    "queue": {
      "totalProcessed": 42,
      "totalFailed": 0,
      "queueSize": 0,
      "activeJobs": 0
    },
    "storage": {
      "fileCount": 10,
      "totalSize": 12345678
    },
    "websocket": {
      "total": 3,
      "byType": {
        "dashboard": 1,
        "overlay": 2
      }
    },
    "myinstants": {
      "circuitState": "closed",
      "failureCount": 0
    }
  }
}
```

## WebSocket Protocol

Connect to: `ws://localhost:3000/ws/new-soundboard`

### Client → Server Messages

**Hello (Register Client):**
```json
{
  "type": "hello",
  "client": "dashboard|overlay|admin",
  "userId": "optional-user-id"
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

### Server → Client Messages

**Welcome:**
```json
{
  "type": "welcome",
  "clientId": "client_123",
  "message": "Connected to new-soundboard WebSocket"
}
```

**Preview:**
```json
{
  "type": "preview",
  "payload": {
    "sourceType": "myinstants",
    "instantsId": "button",
    "name": "Sound Name",
    "url": "https://...",
    "embedFallback": false
  }
}
```

**Play Start:**
```json
{
  "type": "play-start",
  "meta": {
    "jobId": "abc123",
    "sourceType": "local",
    "filename": "sound.mp3",
    "url": "/plugins/new-soundboard/sounds/sound.mp3",
    "volume": 100,
    "fadeIn": 0,
    "fadeOut": 0,
    "userId": "user123"
  }
}
```

## UI Components

### Dashboard

Access at: `http://localhost:3000/new-soundboard/dashboard`

Features:
- Search MyInstants
- Browse local sounds
- Upload audio files
- Preview sounds (with iframe fallback support)
- Manage queue
- Real-time updates via WebSocket

### Overlay

Add to OBS as Browser Source: `http://localhost:3000/new-soundboard/overlay`

Settings:
- Width: 1920
- Height: 1080
- Check "Shutdown source when not visible"

Features:
- Animated sound widgets
- HTML5 audio playback
- Iframe fallback for restricted content
- Auto-hide after playback

## MyInstants Integration

### Direct Audio Playback

When possible, the plugin resolves direct audio URLs from MyInstants:
1. Fetch instant page
2. Parse audio source URL
3. Validate accessibility
4. Stream directly via HTML5 audio

### Iframe Fallback

When direct playback is not available (CORS, hosting restrictions):
1. Server detects inaccessible URL
2. Sets `embedFallback: true` in response
3. Overlay loads sandboxed iframe with MyInstants player
4. User can interact with MyInstants UI directly

**Iframe Security:**
```html
<iframe 
  sandbox="allow-scripts allow-same-origin" 
  referrerpolicy="no-referrer"
  src="https://www.myinstants.com/instant/sound-name/"
></iframe>
```

## Permission System

### Roles

- `everyone`: All users
- `follower`: TikTok followers
- `superfan`: TikTok superfans
- `subscriber`: TikTok subscribers
- `team-member`: Team members
- `top-gifter`: Top gifters

### Per-Sound Configuration

```json
{
  "allowedRoles": ["follower", "subscriber"],
  "coinCost": 100,
  "cooldown": 60000
}
```

### Rate Limits

Default limits:
- 10 triggers per hour per user
- 50 triggers per day per user

## Security

### Input Validation

- All inputs sanitized and validated
- Filename sanitization prevents path traversal
- MIME type checking for uploads
- File size limits enforced

### Host Whitelisting

Only allowed hosts can be fetched:
```javascript
allowedHosts: [
  'www.myinstants.com',
  'instaud.io',
  '*.cloudfront.net'
]
```

### Rate Limiting

- Preview endpoint: 10 requests/minute
- Play endpoint: 5 requests/minute
- Upload endpoint: included in Express middleware

### Bounded Downloads

- Maximum file size: 10MB (configurable)
- Timeout: 10 seconds
- Content-type validation

## Limitations

### Browser Autoplay Policies

- Modern browsers may block autoplay
- User interaction may be required on first load
- Iframe fallback requires user click in some cases

### CORS Restrictions

- Some external hosts block cross-origin requests
- Iframe fallback used automatically when needed
- CSP may need adjustment for iframe embedding

### MyInstants Licensing

- Content on MyInstants has various licenses
- Plugin marks license status as "unknown"
- Users responsible for checking usage rights
- No guarantee of availability or legality

## Troubleshooting

### Sounds not playing

1. Check browser console for errors
2. Verify API key is correct
3. Check WebSocket connection status
4. Ensure sound file exists and is accessible

### MyInstants preview fails

1. Check internet connection
2. Verify MyInstants.com is accessible
3. Check circuit breaker status in metrics
4. Try iframe fallback mode

### Upload fails

1. Check file size (max 10MB)
2. Verify file format (MP3, WAV, OGG, etc.)
3. Check disk space
4. Verify permissions on sounds directory

### WebSocket not connecting

1. Check if server is running
2. Verify WebSocket port is accessible
3. Check firewall settings
4. Try refreshing the page

## Migration from Old Soundboard

The old soundboard at `plugins/soundboard/` remains completely unchanged. This is a separate, independent implementation.

To migrate:
1. Export your old sound list
2. Upload sounds to new soundboard via dashboard
3. Update any integrations to use new API endpoints
4. Test thoroughly before disabling old soundboard

## Development

### Running Tests

```bash
npm test -- plugins/new-soundboard/test/
```

### Adding Features

1. Add module in `src/`
2. Update `main.js` to initialize module
3. Add API endpoint in `src/api/routes.js`
4. Update UI if needed
5. Add tests
6. Update README

## License

MIT License - See main project LICENSE file

## Support

For issues, please create a GitHub issue with:
- Plugin version
- Error messages
- Steps to reproduce
- Browser/OS information
