# 🎯 TikFinity Goals Plugin

Complete TikTok LIVE Goals system with TikFinity Event API integration, real-time tracking, and customizable overlays.

## Features

### 📊 Four Goal Types

1. **Coin Goal** 💰
   - Tracks all gift coins received
   - Uses TikFinity Event API (ws://localhost:21213) for real-time updates
   - Fallback to internal TikTok events if TikFinity is unavailable

2. **Likes Goal** ❤️
   - Real-time like counting
   - Increments with each like event

3. **Follower Goal** 👥
   - Tracks new followers during stream
   - Counts follow events

4. **Custom Goal** 🎯
   - Manually controlled value
   - Can be increased via Flows, API calls, or manual input
   - Perfect for custom challenges or viewer interactions

### 🎨 Customization

Each goal type supports:
- **Name**: Custom display name
- **Start Value**: Initial value when reset
- **Current Value**: Real-time tracked value
- **Target Value**: Goal to reach
- **Progression Modes**:
  - `fixed`: Goal stays at target when completed
  - `add`: Increases target by increment amount
  - `double`: Doubles the target
  - `hide`: Auto-hides when completed
- **Increment Amount**: Amount to add when using 'add' mode
- **Custom Styling**:
  - Fill colors (gradient support)
  - Background color
  - Text color
  - Label template with variables: `{current}`, `{target}`, `{percent}`, `{remaining}`

### 🔄 Real-Time Updates

- **TikFinity Event API Integration**: Connects to `ws://localhost:21213` for enhanced event tracking
- **Auto-Reconnect**: Automatically reconnects if TikFinity connection is lost
- **Fallback System**: Uses internal TikTok events if TikFinity is unavailable
- **Socket.IO Broadcasting**: Real-time updates to all connected overlays

### 🎬 Overlay Features

- **Transparent Background**: Perfect for OBS Browser Source
- **Smooth Animations**: Value changes, progress updates, and completion effects
- **Confetti Celebration**: Animated confetti when goals are completed
- **Customizable Display**: Show/hide icons, percentages, and values
- **URL Parameters**:
  - `?goals=coin,likes`: Filter which goals to show
  - `?icons=false`: Hide goal icons
  - `?percent=false`: Hide percentage display

### ⚡ Flow Actions

Automate goals with the Flow system:
- `goals.set_value`: Set goal to specific value
- `goals.increment`: Increment goal by amount
- `goals.reset`: Reset goal to start value
- `goals.toggle`: Enable/disable goal

## Installation

1. The plugin is automatically loaded from `/plugins/goals/`
2. Access settings at: `http://localhost:3000/goals/ui`
3. Add overlay to OBS: `http://localhost:3000/goals/overlay`

## Configuration

### Settings UI

Access the full settings interface at `/goals/ui`:
- Enable/disable individual goals
- Set current and target values
- Configure progression modes
- Customize colors and styling
- Monitor TikFinity connection status
- Manual value adjustments
- Reset goals

### TikFinity Integration

1. **Install TikFinity** (if not already installed)
2. **Start TikFinity Event API** on `ws://localhost:21213`
3. **Plugin Auto-Connects**: The plugin will automatically connect
4. **Monitor Status**: Check connection status in the settings UI

If TikFinity is not available, the plugin will fall back to internal TikTok event handling.

### OBS Setup

1. **Add Browser Source** in OBS
2. **URL**: `http://localhost:3000/goals/overlay`
3. **Recommended Settings**:
   - Width: 1920
   - Height: 1080
   - Custom CSS (optional for positioning)
4. **URL Parameters** (optional):
   - Show only specific goals: `?goals=coin,likes`
   - Hide icons: `?icons=false`
   - Hide percentages: `?percent=false`

## API Endpoints

### Get All Goals
```http
GET /api/goals
```

### Get Single Goal
```http
GET /api/goals/:goalType
```

### Update Goal Configuration
```http
POST /api/goals/:goalType/config
Content-Type: application/json

{
  "name": "New Name",
  "target_value": 1000,
  "progression_mode": "add",
  "increment_amount": 500,
  "enabled": true,
  "style": {
    "fill_color1": "#fbbf24",
    "fill_color2": "#f59e0b",
    "label_template": "Coins: {current} / {target}"
  }
}
```

### Set Goal Value (Absolute)
```http
POST /api/goals/:goalType/set
Content-Type: application/json

{
  "value": 500
}
```

### Increment Goal (Relative)
```http
POST /api/goals/:goalType/increment
Content-Type: application/json

{
  "delta": 10
}
```

### Reset Goal
```http
POST /api/goals/:goalType/reset
```

### Toggle Goal
```http
POST /api/goals/:goalType/toggle
Content-Type: application/json

{
  "enabled": true
}
```

### TikFinity Status
```http
GET /api/goals/tikfinity/status
```

### Update TikFinity Config
```http
POST /api/goals/tikfinity/config
Content-Type: application/json

{
  "enabled": true,
  "websocket_url": "ws://localhost:21213",
  "auto_reconnect": true
}
```

### Get Goal History
```http
GET /api/goals/:goalType/history?limit=50
```

## Socket.IO Events

### Client → Server

```javascript
// Get all goals
socket.emit('goals:get-all');

// Subscribe to specific goal updates
socket.emit('goals:subscribe', { goalType: 'coin' });
```

### Server → Client

```javascript
// All goals data
socket.on('goals:all', (data) => {
  console.log(data.goals);
});

// Goal updated
socket.on('goals:update', (data) => {
  console.log('Goal updated:', data);
  // data includes: goalType, enabled, name, currentValue, targetValue,
  //                startValue, percent, remaining, isCompleted,
  //                progressionMode, incrementAmount, style
});

// Goal completed
socket.on('goals:completed', (data) => {
  console.log('Goal completed:', data);
  // data includes: goalType, name, currentValue, targetValue
});

// TikFinity connection status
socket.on('goals:tikfinity:connected', (data) => {
  console.log('TikFinity connected:', data.connected);
});
```

## Database Schema

### goals_config
Stores goal configurations:
- `goal_type`: coin, likes, follower, custom
- `enabled`: 1 or 0
- `name`: Display name
- `start_value`: Initial value
- `current_value`: Real-time value
- `target_value`: Goal target
- `progression_mode`: fixed, add, double, hide
- `increment_amount`: Amount to add in 'add' mode
- `style_json`: JSON string of style configuration

### goals_history
Logs all goal events:
- `goal_type`: Goal identifier
- `event_type`: value_changed, target_changed, etc.
- `old_value`: Previous value
- `new_value`: New value
- `delta`: Change amount
- `metadata`: Additional event data

### goals_tikfinity_config
TikFinity connection settings:
- `enabled`: Enable TikFinity integration
- `websocket_url`: WebSocket URL (default: ws://localhost:21213)
- `auto_reconnect`: Auto-reconnect on disconnect

## Flow Integration

Use goals in your automation flows:

### Example: Increment Custom Goal on Large Gift

```json
{
  "name": "Increment Custom Goal on Rose",
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": "equals",
    "field": "giftName",
    "value": "Rose"
  },
  "actions": [
    {
      "type": "goals.increment",
      "params": {
        "goalType": "custom",
        "delta": 1
      }
    }
  ]
}
```

## Troubleshooting

### TikFinity Not Connecting

1. Ensure TikFinity is running
2. Check WebSocket URL in settings (default: `ws://localhost:21213`)
3. Verify no firewall blocking the connection
4. Check console logs for connection errors
5. Plugin will auto-reconnect up to 10 times

### Goals Not Updating in Overlay

1. Check browser console for errors
2. Verify Socket.IO connection is established
3. Ensure goal is enabled in settings
4. Hard refresh overlay (Ctrl+F5)

### Values Not Persisting

1. Check database file permissions
2. Verify SQLite database is not corrupted
3. Check server logs for database errors

## Performance

- **Real-time Updates**: < 50ms latency
- **Overlay Rendering**: 60 FPS animations
- **Database**: Optimized batch writes
- **WebSocket**: Automatic reconnection with exponential backoff

## License

MIT License - Part of pupcidslittletiktokhelper

## Support

For issues, feature requests, or questions, please create an issue on GitHub.

---

**Built with ❤️ for the TikTok LIVE streaming community**
