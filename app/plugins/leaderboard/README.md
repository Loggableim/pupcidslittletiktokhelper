# Leaderboard Plugin

A real-time leaderboard plugin for "Pup Cid's Little TikTok Helper" that tracks top gifters for both the current session and all-time.

## Features

- **Dual Tracking**: 
  - **Session Leaderboard**: In-memory tracking of top gifters for the current streaming session
  - **All-Time Leaderboard**: Persistent database storage for historical top contributors
  
- **Real-Time Updates**: WebSocket-based live updates to the overlay
- **Performance Optimized**: Debounced database writes (5-second delay) to minimize disk I/O during gift spam
- **Robust Data Handling**: Protection against undefined values in gift payloads
- **Dynamic User Updates**: Automatically updates nicknames and profile pictures when users change them
- **Session Management**: Admin command to reset the current session
- **Modern UI**: Neon/dark theme overlay with smooth CSS animations
- **OBS Compatible**: Transparent background perfect for OBS Browser Source

## Installation

The plugin is automatically loaded when the server starts. No manual installation required.

## Usage

### OBS Overlay Setup

1. Open OBS Studio
2. Add a new **Browser Source**
3. Set the URL to: `http://localhost:3000/leaderboard/overlay`
4. Set dimensions to: **450x800** (or adjust to your preference)
5. Check "Shutdown source when not visible" for better performance
6. Click OK

### Overlay Features

The overlay has two tabs that can be switched manually:
- **🔥 Current Session**: Shows top gifters for the current streaming session
- **👑 All Time Champions**: Shows the all-time top contributors

### API Endpoints

#### Get Session Leaderboard
```
GET /api/plugins/leaderboard/session?limit=10
```
Returns the top gifters for the current session.

#### Get All-Time Leaderboard
```
GET /api/plugins/leaderboard/alltime?limit=10&minCoins=0
```
Returns the all-time top gifters.

#### Get Combined Data
```
GET /api/plugins/leaderboard/combined?limit=10
```
Returns both session and all-time leaderboards in a single response.

#### Get User Stats
```
GET /api/plugins/leaderboard/user/:userId
```
Returns statistics for a specific user (both session and all-time).

#### Reset Session
```
POST /api/plugins/leaderboard/reset-session
```
Clears the current session data. All-time data remains intact.

#### Get Configuration
```
GET /api/plugins/leaderboard/config
```
Returns the current plugin configuration.

#### Update Configuration
```
POST /api/plugins/leaderboard/config
Content-Type: application/json

{
  "top_count": 10,
  "min_coins_to_show": 0
}
```

## Configuration

The plugin stores configuration in the database:
- `top_count`: Maximum number of entries to display (default: 10)
- `min_coins_to_show`: Minimum coins required to appear on leaderboard (default: 0)

## Database Schema

### leaderboard_alltime
Stores all-time gifter data:
- `user_id` (PRIMARY KEY): Unique user identifier
- `nickname`: User's display name
- `unique_id`: User's unique handle
- `profile_picture_url`: URL to profile picture
- `total_coins`: Total coins gifted all-time
- `last_gift_at`: Timestamp of last gift
- `created_at`: First appearance timestamp
- `updated_at`: Last update timestamp

### leaderboard_config
Stores plugin configuration:
- `session_start_time`: When the current session started
- `top_count`: Max entries to display
- `min_coins_to_show`: Minimum coins filter

## WebSocket Events

### Emitted Events
- `leaderboard:update`: Sent when leaderboard data changes
  ```javascript
  {
    session: { data: [...], startTime: "..." },
    alltime: { data: [...] }
  }
  ```
- `leaderboard:session-reset`: Sent when session is reset

### Client Events
- `leaderboard:request-update`: Request current leaderboard data
- `leaderboard:reset-session`: Request session reset (admin only)

## Technical Details

### Performance
- **Debounced Writes**: Database writes are batched and delayed by 5 seconds to prevent excessive I/O during gift spam
- **Prepared Statements**: Reusable prepared statements for optimal database performance
- **Indexed Queries**: Database indexes on `total_coins` for fast sorting

### Security
- **XSS Protection**: All user inputs are HTML-escaped before rendering
- **URL Validation**: Profile picture URLs are validated before display
- **Input Sanitization**: Null/undefined values are handled gracefully
- **SQL Injection Protection**: All queries use parameterized statements

### Data Flow
1. TikTok sends gift event
2. Plugin receives gift data via TikTok event handler
3. Session data is updated in-memory immediately
4. All-time data is queued for database write (debounced)
5. WebSocket update is emitted to all connected clients
6. Overlay receives update and re-renders with animations

## Customization

### Styling
Edit `/plugins/leaderboard/public/style.css` to customize:
- Colors (neon cyan/magenta theme by default)
- Animations (rank change effects, slide-ins)
- Layout (dimensions, spacing)
- Font styles

### Auto-Rotation
Enable automatic tab rotation in `script.js`:
```javascript
this.enableAutoRotate = true; // Set to true in constructor
```
Tabs will rotate every 30 seconds.

## Troubleshooting

### Overlay not showing data
1. Check if server is running: `http://localhost:3000`
2. Verify plugin is loaded in server logs
3. Check browser console for WebSocket connection errors
4. Ensure database is writable

### Data not persisting
1. Check database file permissions
2. Verify debounce timeout completed (wait 5 seconds after last gift)
3. Check server logs for database errors

### Performance issues
1. Reduce `top_count` to show fewer entries
2. Increase `debounceDelay` in db.js for less frequent writes
3. Set `min_coins_to_show` to filter out small contributors

## Version History

- **v1.0.0** (2025-11-23)
  - Initial release
  - Session and all-time tracking
  - Real-time WebSocket updates
  - Debounced database writes
  - Modern neon/dark theme overlay
  - Security hardening (XSS protection, input validation)

## Credits

Created for "Pup Cid's Little TikTok Helper"
Author: Pup Cid
