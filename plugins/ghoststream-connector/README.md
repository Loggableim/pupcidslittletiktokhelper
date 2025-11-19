# GhostStream Connector

Alternative TikTok LIVE connection layer using Playwright browser automation. Replaces the problematic EulerStream API with a controlled browser instance.

## Overview

GhostStream Connector provides a robust alternative to the standard TikTok LIVE connector by using Playwright to control a real Chromium browser. This approach offers several advantages:

- **No API Dependencies**: Works without relying on third-party APIs like EulerStream
- **Real Browser**: Uses a real Chromium instance for authentic TikTok interaction
- **Visual Debugging**: Can run in headed mode to see what's happening
- **DOM Monitoring**: Directly monitors the TikTok LIVE chat DOM for events
- **Login Persistence**: Supports cookie-based login for persistent sessions

## Features

- ✅ Playwright-based browser automation
- ✅ WebSocket event streaming
- ✅ OBS overlay generation
- ✅ Chat command system (!tts, !scene, !click)
- ✅ Session management with JWT authentication
- ✅ Rate limiting and security controls
- ✅ Auto-restart on crash
- ✅ Multi-session support (up to 5 concurrent)

## Installation

1. **Install Dependencies**:
   ```bash
   npm install playwright jsonwebtoken
   npx playwright install chromium
   ```

2. **Enable the Plugin**:
   - Open the dashboard
   - Navigate to Plugin Manager
   - Find "GhostStream Connector"
   - Click "Enable"

## Usage

### Starting a Session

1. Navigate to the GhostStream Connector UI at `/plugins/ghoststream-connector/ui.html`
2. Enter your TikTok username
3. Choose headless/headed mode
4. Click "Start Session"
5. If not logged in, the browser will open for you to log in manually

### Using the Overlay

After starting a session, you'll receive an overlay URL:
```
http://localhost:3000/api/ghoststream/overlay/{sessionId}
```

Add this URL as a Browser Source in OBS:
1. In OBS, add a new Browser Source
2. Paste the overlay URL
3. Set width: 1920, height: 1080
4. Check "Shutdown source when not visible" and "Refresh browser when scene becomes active"

### Chat Commands

If chat commands are enabled, viewers can trigger actions:

- `!tts Hello World` - Trigger text-to-speech
- `!scene Main` - Switch to OBS scene "Main"
- `!click #button` - Click a browser element (admin only)

## API Endpoints

### POST /api/ghoststream/connect
Start a new GhostStream session.

**Request Body**:
```json
{
  "accountId": "username",
  "username": "tiktok_username",
  "options": {
    "headless": false,
    "autoRestart": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "gs_1234567890_abc123",
  "token": "jwt_token_here",
  "overlayUrl": "http://localhost:3000/api/ghoststream/overlay/gs_1234567890_abc123",
  "wsUrl": "ws://localhost:3000/ws/ghoststream/gs_1234567890_abc123"
}
```

### POST /api/ghoststream/disconnect
Stop a GhostStream session.

**Request Body**:
```json
{
  "sessionId": "gs_1234567890_abc123"
}
```

### GET /api/ghoststream/status/:sessionId
Get session status.

**Response**:
```json
{
  "success": true,
  "session": {
    "sessionId": "gs_1234567890_abc123",
    "accountId": "username",
    "username": "tiktok_username",
    "status": "connected",
    "createdAt": 1234567890,
    "lastActivity": 1234567890
  }
}
```

### GET /api/ghoststream/sessions
List all active sessions.

### POST /api/ghoststream/command
Execute a command in the browser.

**Request Body**:
```json
{
  "sessionId": "gs_1234567890_abc123",
  "token": "jwt_token_here",
  "command": {
    "type": "click",
    "selector": "#button"
  }
}
```

**Command Types**:
- `click` - Click an element
- `type` - Type text into an input
- `press` - Press a key
- `screenshot` - Take a screenshot
- `execute` - Execute JavaScript code

## WebSocket Events

Subscribe to events by emitting `ghoststream:subscribe`:

```javascript
socket.emit('ghoststream:subscribe', {
  sessionId: 'gs_1234567890_abc123',
  token: 'jwt_token_here'
});
```

**Available Events**:
- `ghoststream:chat_message` - Chat message received
- `ghoststream:gift` - Gift received
- `ghoststream:login_required` - User needs to log in
- `ghoststream:error` - Error occurred
- `ghoststream:crash` - Browser crashed

## Configuration

Plugin settings are stored in the database:

- `ghoststream_headless_mode` - Run browser in headless mode (default: false)
- `ghoststream_auto_restart` - Auto-restart on crash (default: true)
- `commandRateLimit` - Max commands per minute per user (default: 10)
- `maxSessions` - Max concurrent sessions (default: 5)
- `sessionTimeout` - Session timeout in ms (default: 3600000)
- `chatCommands.enabled` - Enable chat commands (default: true)
- `chatCommands.prefix` - Command prefix (default: !)

## Security

- **JWT Authentication**: Sessions are protected with JWT tokens
- **Rate Limiting**: Commands are rate-limited per user
- **Selector Validation**: Browser commands validate selectors to prevent XSS
- **Session Cleanup**: Inactive sessions are automatically cleaned up
- **Audit Logging**: All commands are logged for audit purposes

## Troubleshooting

### Browser Won't Start
- Ensure Playwright is installed: `npx playwright install chromium`
- Check system dependencies for Chromium
- Try running in headed mode to see errors

### Login Required
- GhostStream will show a browser window when login is required
- Log in manually and the session will continue
- Cookies are saved for future sessions

### Chat Not Detected
- TikTok may change their DOM structure
- Update the browser controller's CSS selectors
- Check browser console for errors

### Session Crashes
- Enable auto-restart in settings
- Check logs for crash reasons
- Consider increasing system resources

## Known Limitations

- Requires Chromium browser (installed via Playwright)
- May not work in environments without display server (use Xvfb)
- TikTok DOM structure changes may require updates
- Performance overhead compared to API-based connectors

## Comparison with EulerStream

| Feature | GhostStream | EulerStream |
|---------|-------------|-------------|
| API Dependency | ❌ None | ✅ Required |
| Browser Required | ✅ Yes | ❌ No |
| Login Required | ✅ Yes | ⚠️ Optional |
| Visual Debugging | ✅ Yes | ❌ No |
| Resource Usage | ⚠️ Higher | ✅ Lower |
| Reliability | ✅ High | ⚠️ Variable |
| Cost | ✅ Free | 💰 Paid API |

## License

Same as parent project (MIT)

## Credits

Inspired by [Euler-Connect](https://github.com/EulerStream/Euler-Connect)
