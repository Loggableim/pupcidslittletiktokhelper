# Goals HUD Integration Repair - Testing & Usage Guide

## ✅ Implementation Complete

This document describes the Goals HUD integration repair and debug logging system that has been implemented.

---

## 🔧 What Was Fixed

### 1. Debug Logging System

**Components Added:**
- `/modules/debug-logger.js` - Central debug logger with category filtering
- `/routes/debug-routes.js` - 6 API endpoints for debug control
- `/public/js/debug-panel.js` - Interactive browser-based debug panel

**Features:**
- Runtime-toggleable (no restart required)
- Category-based filtering (goals, websocket, tiktok, ui, etc.)
- Live log streaming to browser
- Export logs as JSON
- Configurable log retention (1000 entries default)
- 500 character data truncation for security

### 2. Goals Event Standardization

**New WebSocket Events:**
- `goals:subscribe` - Subscribe to all goals updates (bulk subscription)
- `goals:snapshot` - Initial state sync with all goals data
- `goals:update` - Individual goal value changed
- `goals:reset` - Goal was reset to 0

**Backward Compatible:**
- `goal:join` - Legacy single-goal subscription still works
- `goal:update` - Legacy update event still emitted

### 3. CSP Header Optimization

**Changes:**
- Added `ws://localhost:*` and `ws://127.0.0.1:*` to `connect-src`
- Added `frame-ancestors 'self' null` for OBS BrowserSource support
- Maintained strict CSP policy (no unsafe-inline for scripts)

### 4. TikTok Event Integration

**Debug Logging Added For:**
- Gift events (coins tracking)
- Follow events (followers tracking)
- Subscribe events (subs tracking)
- Like events (likes tracking)

---

## 🚀 How to Use

### Debug Panel

**Opening the Panel:**
1. Navigate to dashboard: `http://localhost:3000/dashboard.html`
2. Press **Shift + F12** to toggle the debug panel
3. Click **Start** button to enable debug logging

**Panel Controls:**
- **Start/Stop** - Enable or disable debug logging
- **Clear** - Clear all current logs
- **Export** - Download logs as JSON file
- **Close (✕)** - Hide the panel (Shift+F12 to reopen)

**Filtering:**
- Check/uncheck categories to filter logs:
  - ✅ Goals - Goal-related events
  - ✅ WebSocket - Connection and disconnect events
  - ✅ UI - User interface events
  - 🔲 TikTok - TikTok LIVE events
  - 🔲 CSP - Content Security Policy violations
  - ✅ Errors - Error messages
  - ✅ Socket Emit - Outgoing WebSocket messages
  - 🔲 Socket Receive - Incoming WebSocket messages

### API Endpoints

All debug endpoints are available under `/api/debug/`:

```bash
# Get debug status
GET /api/debug/status

# Enable/disable debug logging
POST /api/debug/enable
Body: { "enable": true }

# Set category filter
POST /api/debug/filter
Body: { "category": "goals", "enabled": true }

# Get logs
GET /api/debug/logs?category=goals&level=info&limit=100

# Export all logs
GET /api/debug/export

# Clear all logs
POST /api/debug/clear
```

### Testing Goals

**Legacy Goals API (coins, likes, followers, subs):**

```bash
# Get all goals status
GET /api/goals

# Get specific goal
GET /api/goals/coins

# Increment goal
POST /api/goals/coins/increment
Body: { "delta": 100 }

# Set goal value
POST /api/goals/coins/set
Body: { "total": 500 }

# Reset goal
POST /api/goals/coins/reset
```

**Goals Plugin API (database-backed goals):**

```bash
# Get all goals
GET /api/goals

# Create new goal
POST /api/goals
Body: {
  "name": "My Goal",
  "goal_type": "coin",
  "target_value": 1000,
  "template_id": "compact-bar",
  "animation_id": "smooth"
}

# Increment goal
POST /api/goals/{id}/increment
Body: { "amount": 50 }

# Reset goal
POST /api/goals/{id}/reset
```

### WebSocket Testing

**Subscribe to all goals updates:**

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected:', socket.id);
    socket.emit('goals:subscribe');
});

socket.on('goals:snapshot', (data) => {
    console.log('Initial goals state:', data.goals);
});

socket.on('goals:update', (data) => {
    console.log('Goal updated:', data.goalId, data.total);
});

socket.on('goals:reset', (data) => {
    console.log('Goal reset:', data.goalId);
});
```

---

## 🏗️ Architecture

### Dual Goals System

The system supports two goals implementations:

**1. Legacy Goals Module** (`modules/goals.js`)
- 4 fixed goals: coins, likes, followers, subs
- In-memory state with database persistence
- Simple increment/set/reset operations
- Emits to `goal_{key}` and `goals` rooms

**2. Goals Plugin** (`plugins/goals`)
- Unlimited database-backed goals
- 6 visual templates
- 8 animation types
- State machine per goal
- Emits to `goal:{goalId}` rooms

**Both systems coexist and process TikTok events independently.**

### Event Flow

```
TikTok Event (gift, follow, like, subscribe)
    ↓
┌───┴─────────────────────────────────────────┐
│                                             │
▼                                             ▼
Legacy Goals Module                    Goals Plugin
  ↓                                          ↓
  • Process event                            • Find matching goals
  • Update state                             • Update state machine
  • Emit to 'goals' room                     • Update database
  • Emit to 'goal_{key}' room                • Emit to 'goal:{id}' room
  ↓                                          ↓
Debug Logger ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
  ↓
Debug Panel (browser)
```

### WebSocket Rooms

- `goals` - All goals updates (centralized)
- `goal_{key}` - Legacy single goal (coins, likes, followers, subs)
- `goal:{id}` - Plugin goal by ID (database-backed goals)

---

## 🧪 Test Scenarios

### Scenario 1: Test Debug Panel

1. Start server: `npm start`
2. Open dashboard: `http://localhost:3000/dashboard.html`
3. Press **Shift + F12**
4. Click **Start** in debug panel
5. Perform actions (connect TikTok, receive gifts, etc.)
6. Verify logs appear in real-time
7. Test filters by unchecking categories
8. Test export by clicking **Export** button

### Scenario 2: Test Goals Updates via API

```bash
# Enable debug logging
curl -X POST http://localhost:3000/api/debug/enable \
  -H "Content-Type: application/json" \
  -d '{"enable": true}'

# Increment coins (legacy)
curl -X POST http://localhost:3000/api/goals/coins/increment \
  -H "Content-Type: application/json" \
  -d '{"delta": 100}'

# Check debug logs
curl http://localhost:3000/api/debug/logs?category=goals

# Should show: "Coins goal incremented by 100"
```

### Scenario 3: Test WebSocket Snapshot

1. Create test HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Goals WebSocket Test</title>
    <script src="http://localhost:3000/socket.io/socket.io.js"></script>
</head>
<body>
    <h1>Goals WebSocket Test</h1>
    <div id="output"></div>
    
    <script>
        const socket = io('http://localhost:3000');
        const output = document.getElementById('output');
        
        socket.on('connect', () => {
            output.innerHTML += '<p>✅ Connected: ' + socket.id + '</p>';
            socket.emit('goals:subscribe');
        });
        
        socket.on('goals:snapshot', (data) => {
            output.innerHTML += '<h3>📊 Goals Snapshot:</h3>';
            output.innerHTML += '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        });
        
        socket.on('goals:update', (data) => {
            output.innerHTML += '<p>🔄 Goal Updated: ' + data.goalId + ' → ' + data.total + '</p>';
        });
    </script>
</body>
</html>
```

2. Open file in browser
3. Verify connection and snapshot
4. Update goals via API or TikTok events
5. Verify real-time updates appear

### Scenario 4: Test OBS BrowserSource

1. Open OBS Studio
2. Add Browser Source
3. URL: `http://localhost:3000/goals/overlay?id={goal-id}`
4. Width: 1920, Height: 1080
5. Custom CSS: (none required)
6. Check "Shutdown source when not visible" = false
7. Check "Refresh browser when scene becomes active" = false
8. Verify no CSP errors in OBS console
9. Update goal via API/TikTok
10. Verify HUD updates in real-time

---

## 🔒 Security Summary

### Implemented Security Measures

✅ **CSP Compliance**
- No inline scripts allowed (`script-src 'self'`)
- All JavaScript external files only
- Styles allow inline for framework compatibility

✅ **WebSocket Security**
- Localhost connections only
- No external WebSocket sources
- CORS restricted to whitelist

✅ **Debug Logging Security**
- Data truncated to 500 characters
- No sensitive data logged
- Runtime toggleable (disabled by default)

✅ **OBS BrowserSource Support**
- `frame-ancestors 'self' null` allows OBS embedding
- No additional security risks
- Same CSP policy applies

### No Vulnerabilities Detected

CodeQL analysis passed with **0 alerts** for JavaScript.

---

## 📊 Performance Considerations

### Debug Logger
- Max 1000 log entries in memory
- Automatic rotation (FIFO)
- Minimal overhead when disabled
- 500ms polling interval for UI

### WebSocket Events
- Efficient room-based broadcasting
- No global broadcasts
- State snapshots on-demand only

### Goals Processing
- In-memory state with database sync
- Async event processing
- No blocking operations

---

## 🐛 Troubleshooting

### Debug Panel Not Appearing
- Press Shift+F12 (not just F12)
- Check browser console for errors
- Verify `/js/debug-panel.js` loaded successfully

### No Logs Appearing
- Click "Start" button in debug panel
- Verify filters are enabled (checkboxes)
- Check API: `GET /api/debug/status` should show `"enabled": true`

### Goals Not Updating
1. Check debug logs for events
2. Verify TikTok connection active
3. Check which goals system is being used (plugin vs. legacy)
4. Test with API increment to isolate issue

### WebSocket Connection Failed
- Check CSP headers in browser console
- Verify server running on port 3000
- Check firewall/antivirus blocking localhost
- Try clearing browser cache

### OBS BrowserSource Not Working
- Verify URL includes `?id={goal-id}`
- Check browser console in OBS (Right-click → Interact)
- Ensure goal exists in database
- Test URL in regular browser first

---

## 📝 Future Improvements

Potential enhancements not in scope for this PR:

- [ ] Persistent debug logs (file storage)
- [ ] WebSocket compression
- [ ] Goals update throttling (60 FPS limit)
- [ ] Virtual scrolling for debug panel (1000+ logs)
- [ ] LocalStorage cache for goal configs
- [ ] Grafana/Prometheus metrics export
- [ ] Multi-user WebSocket rooms

---

## 🎯 Validation Checklist

✅ **Completed:**
- [x] Debug logger module created and tested
- [x] Debug API routes implemented and functional
- [x] Debug panel UI integrated into dashboard
- [x] Goals event standardization complete
- [x] WebSocket snapshot support added
- [x] CSP headers optimized
- [x] TikTok event debug logging integrated
- [x] Server startup tested successfully
- [x] CodeQL security scan passed
- [x] Documentation created

⏳ **Pending Manual Testing:**
- [ ] Debug panel UI tested in browser
- [ ] Goals overlay tested in OBS
- [ ] TikTok events tested with live stream
- [ ] Multi-client WebSocket synchronization

---

## 📞 Support

If issues persist after following this guide:

1. Check debug logs via API or panel
2. Review server logs in console
3. Verify all dependencies installed (`npm install`)
4. Clear browser cache and cookies
5. Test with different browser

## 🙏 Credits

- Original Goals Module: Pup Cid
- Goals Plugin System: Pup Cid  
- Debug Logging System: GitHub Copilot Developer Action
- Integration & Documentation: GitHub Copilot Developer Action

---

**Version:** 1.0.0  
**Date:** 2025-11-15  
**Status:** ✅ Ready for Testing
