# Plugin Architecture Analysis - TikTok Stream Helper

## Overview
The plugin system is a complete, modular architecture that allows plugins to:
- Register custom HTTP API endpoints
- Listen to WebSocket events
- Handle TikTok live events (chat, gift, follow, share, like, subscribe)
- Store settings in the database
- Serve static files (HTML/CSS/JS for UIs and overlays)
- Create real-time overlays

## Directory Structure

### Main Paths
```
/plugins/                       # All plugins directory
├── plugin-name/               # Each plugin is its own directory
│   ├── plugin.json           # Plugin manifest (required)
│   ├── main.js               # Plugin entry point (defined in plugin.json)
│   ├── *.html                # UI and overlay files
│   ├── *.js                  # Plugin implementation files
│   ├── *.css                 # Styling
│   ├── uploads/              # Optional: plugin upload directory
│   └── helpers/              # Optional: helper modules
├── plugins_state.json        # Plugin enabled/disabled state persistence
└── _uploads/                 # ZIP upload staging directory

/modules/plugin-loader.js     # Core plugin loader system
/routes/plugin-routes.js      # Plugin management API endpoints
/server.js                    # Main server initialization
```

## Plugin Manifest (plugin.json)

### Required Fields
```json
{
  "id": "unique-plugin-id",           // Unique identifier (lowercase, no spaces)
  "name": "Display Name",              // Human-readable name
  "version": "1.0.0",                 // Semantic versioning
  "description": "Brief description",  // What the plugin does
  "author": "Your Name",               // Author name
  "entry": "main.js",                 // Entry point file
  "enabled": true                     // Default enabled state
}
```

### Optional Fields
```json
{
  "type": "integration|utility|overlay|automation",  // Plugin category
  "permissions": [
    "routes",           // Register HTTP endpoints
    "socket.io",        // Real-time WebSocket communication
    "tiktok-events",    // Listen to TikTok events
    "database",         // Access plugin settings
    "file-upload",      // Handle file uploads
    "network"           // Make external API calls
  ],
  "dependencies": ["other-plugin-id"],  // Depend on other plugins
  "features": [                         // Detailed feature list
    {
      "id": "feature-id",
      "name": "Feature Name",
      "description": "What it does"
    }
  ],
  "config": {}  // Default configuration object
}
```

### Examples
- `/plugins/emoji-rain/plugin.json` - Overlay plugin with file upload
- `/plugins/openshock/plugin.json` - Integration with complex config
- `/plugins/goals/plugin.json` - Multi-feature plugin with dependencies

---

## Plugin API (PluginAPI Class)

### How to Access
The `PluginAPI` is passed to your plugin constructor:
```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;  // This is the PluginAPI instance
    }
}
```

### Core Methods

#### 1. HTTP Route Registration
**Method**: `api.registerRoute(method, path, handler)`

```javascript
// GET request
this.api.registerRoute('get', '/api/my-plugin/config', (req, res) => {
    try {
        const config = this.api.getConfig('main');
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST with body parsing
this.api.registerRoute('post', '/api/my-plugin/update', (req, res) => {
    const { newValue } = req.body;
    this.api.setConfig('key', newValue);
    res.json({ success: true });
});
```

**Route Characteristics**:
- Routes are wrapped with automatic error handling
- All routes are at the root level (e.g., `/api/my-plugin/*` not `/plugins/my-plugin/*`)
- Supports: GET, POST, PUT, DELETE
- Handler signature: `(req, res, next) => Promise<void>`

#### 2. WebSocket/Socket.io Event Registration
**Method**: `api.registerSocket(event, callback)`

```javascript
// Listen for custom events
this.api.registerSocket('my-event', (socket, data) => {
    console.log('Received from client:', data);
    // Broadcast to all connected clients
    this.api.emit('my-event:response', { processed: true });
});
```

**Broadcasting**: `api.emit(event, data)`
```javascript
// Send to all connected clients
this.api.emit('my-plugin:status-update', {
    status: 'running',
    data: {...}
});
```

**WebSocket Channels**:
- Events are broadcast globally to all connected clients
- Namespace convention: `[plugin-name]:[event-name]`
- Example events:
  - `emoji-rain:config-update` - Config changed
  - `emoji-rain:spawn` - Spawn emoji animation
  - `emoji-rain:toggle` - Enable/disable
  - `goal:update` - Goal progress
  - `goal:reached` - Goal completed

#### 3. TikTok Event Handling
**Method**: `api.registerTikTokEvent(event, callback)`

```javascript
// Handle TikTok events
this.api.registerTikTokEvent('chat', async (data) => {
    console.log(`${data.username}: ${data.message}`);
    // Your plugin logic here
    this.onChatReceived(data);
});

this.api.registerTikTokEvent('gift', async (data) => {
    console.log(`${data.username} sent ${data.giftName}`);
});
```

**Available TikTok Events**:
```
'chat'      - User sends message
'gift'      - User sends gift
'follow'    - User follows
'share'     - User shares stream
'like'      - User likes (high frequency)
'subscribe' - User subscribes to channel
```

**Event Data Structures**:

**Chat Event**:
```javascript
{
    username: "username",
    nickname: "Display Name",
    message: "chat message",
    userId: "id_123",
    profilePictureUrl: "url",
    teamMemberLevel: 0,      // 10=moderator, 1=subscriber, 0=regular
    isModerator: false,
    isSubscriber: false,
    timestamp: "2025-11-15T00:00:00.000Z"
}
```

**Gift Event**:
```javascript
{
    username: "username",
    nickname: "Display Name",
    giftName: "Rose",
    giftId: "123",
    giftPictureUrl: "url",
    repeatCount: 1,
    diamondCount: 50,
    coins: 100,              // diamonds * 2 * repeatCount
    totalCoins: 5000,        // Running total for session
    isStreakEnd: true,       // For streak-able gifts
    timestamp: "2025-11-15T00:00:00.000Z"
}
```

**Follow/Share/Subscribe Events**:
```javascript
{
    username: "username",
    nickname: "Display Name",
    userId: "id_123",
    timestamp: "2025-11-15T00:00:00.000Z"
}
```

**Like Event**:
```javascript
{
    username: "username",
    nickname: "Display Name",
    likeCount: 1,            // Likes from this user
    totalLikes: 5000,        // Running total for session
    timestamp: "2025-11-15T00:00:00.000Z"
}
```

#### 4. Settings Storage
**Get Configuration**: `api.getConfig(key)`
```javascript
// Get entire config
const config = this.api.getConfig();

// Get specific config value
const value = this.api.getConfig('myKey');
// Stored as: plugin:my-plugin-id:myKey
```

**Set Configuration**: `api.setConfig(key, value)`
```javascript
this.api.setConfig('myKey', { nested: 'object' });
// Automatically serialized as JSON
// Stored in database settings table
```

**Storage Details**:
- Stored in SQLite database under `settings` table
- Key format: `plugin:{{pluginId}}:{{key}}`
- Values are stored as JSON strings
- ON CONFLICT: Updates existing values
- Database access: `api.getDatabase()`

#### 5. Database Access
**Get Database**: `api.getDatabase()`
```javascript
const db = this.api.getDatabase();

// Execute SQL
const stmt = db.prepare('SELECT * FROM my_table WHERE id = ?');
const result = stmt.get(123);

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS my_plugin_data (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
`);
```

**Database Methods**:
- `db.prepare(sql)` - Prepare statement
- `db.exec(sql)` - Execute SQL (used for table creation)
- `db.run(sql, params)` - Execute with parameters
- `db.all(sql, params)` - Get all results
- `db.get(sql, params)` - Get single result

#### 6. Logging
**Method**: `api.log(message, level)`
```javascript
this.api.log('Plugin initialized', 'info');
this.api.log('Error occurred', 'error');
this.api.log('Debug info', 'debug');
```

**Log Levels**:
- `'info'` - General information
- `'warn'` - Warnings
- `'error'` - Errors
- `'debug'` - Debug information

#### 7. File Operations
**Get Plugin Directory**: `api.getPluginDir()`
```javascript
const pluginPath = this.api.getPluginDir();
// Used to access plugin's own files
```

**Get Public URL**: `api.getPublicURL(file)`
```javascript
const url = this.api.getPublicURL('overlay.html');
// Returns: /plugins/my-plugin-id/overlay.html
```

**Static Files**: 
- Place HTML/CSS/JS in plugin directory
- Served from `/plugins/{{pluginId}}/{{filename}}`
- Example: `/plugins/emoji-rain/overlay.html`

#### 8. Additional Accessors
```javascript
const io = this.api.getSocketIO();        // Socket.io instance
const app = this.api.getApp();             // Express app instance
```

---

## Lifecycle Hooks

### Plugin Class Structure
```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;
        // Initialize properties
    }

    async init() {
        // Called when plugin loads
        // Register routes, events, handlers
        this.registerRoutes();
        this.registerTikTokEventHandlers();
        this.loadSettings();
    }

    async destroy() {
        // Called when plugin unloads (optional)
        // Cleanup, close connections, etc.
        this.cleanup();
    }
}
```

### Initialization Order
1. PluginLoader reads `plugin.json`
2. Creates PluginAPI instance
3. Requires/instantiates plugin class
4. Calls `init()` method if exists
5. Routes/events are now active
6. Plugin is ready to receive events

### Cleanup
- Called via `unloadPlugin()` or `disablePlugin()`
- Should implement `destroy()` method
- Manually unregister everything if needed

---

## How the System Loads Plugins

### Startup Process (server.js)
```javascript
// 1. Create PluginLoader
const pluginLoader = new PluginLoader(pluginsDir, app, io, db, logger);

// 2. Load all plugins (async)
await pluginLoader.loadAllPlugins();

// 3. Register TikTok event handlers from all plugins
pluginLoader.registerPluginTikTokEvents(tiktok);

// 4. Plugin Socket events are registered per client connection
io.on('connection', (socket) => {
    pluginLoader.registerPluginSocketEvents(socket);
});
```

### Plugin Discovery
- Scans `/plugins` directory
- Ignores directories starting with `_` (e.g., `_uploads`)
- Reads `plugin.json` from each directory
- Respects `enabled` flag in state file

### State File (plugins_state.json)
```json
{
  "plugin-id": {
    "enabled": true,
    "loadedAt": "2025-11-15T00:00:00.000Z",
    "reloadCount": 0
  }
}
```

---

## Real-Time Update Pattern

### Example: Config Change Broadcasting
```javascript
// UI makes POST request
api.registerRoute('post', '/api/my-plugin/config', (req, res) => {
    const newConfig = req.body;
    
    // Save to database
    this.api.setConfig('main', newConfig);
    
    // Broadcast to all connected clients (overlays, UIs)
    this.api.emit('my-plugin:config-updated', {
        config: newConfig,
        timestamp: Date.now()
    });
    
    res.json({ success: true });
});

// Frontend listener (overlay or UI)
// socket.on('my-plugin:config-updated', (data) => {
//     console.log('Config updated:', data.config);
// });
```

---

## UI and Overlay Routes

### Serving Static Files
```javascript
// UI Panel (Dashboard)
this.api.registerRoute('get', '/plugin-name/ui', (req, res) => {
    res.sendFile(path.join(__dirname, 'ui.html'));
});

// OBS Overlay
this.api.registerRoute('get', '/plugin-name/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'overlay.html'));
});

// CSS/JS Assets
this.api.registerRoute('get', '/plugin-name/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});
```

### Public Static Files
Files in plugin directory are automatically served:
- Request: `GET /plugins/plugin-id/uploads/file.png`
- File: `/plugins/plugin-id/uploads/file.png`

### Overlay HTML Template Pattern
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: transparent; }
    </style>
</head>
<body>
    <div id="container"></div>
    <script src="/plugins/plugin-id/overlay.js"></script>
</body>
</html>
```

### Overlay WebSocket Connection
```javascript
// In overlay.js or overlay HTML
const socket = io();

// Listen for plugin events
socket.on('plugin-name:event', (data) => {
    console.log('Event received:', data);
    updateOverlay(data);
});

// Emit to plugin (if needed)
socket.emit('plugin-name:command', { action: 'start' });
```

---

## Plugin API Routes Management

### API Route Registration
```javascript
setupPluginRoutes(app, pluginLoader, apiLimiter, uploadLimiter, logger);
```

**Available Plugin Management Routes**:

```
GET /api/plugins                 # List all plugins (loaded and disabled)
GET /api/plugins/:id             # Get plugin details
POST /api/plugins/upload         # Upload plugin ZIP
POST /api/plugins/:id/enable     # Enable a plugin
POST /api/plugins/:id/disable    # Disable a plugin
POST /api/plugins/:id/reload     # Reload single plugin
POST /api/plugins/reload         # Reload all plugins
DELETE /api/plugins/:id          # Delete plugin
GET /api/plugins/:id/log         # Get plugin logs
```

### Plugin Response Format
```javascript
GET /api/plugins response:
{
    "success": true,
    "plugins": [
        {
            "id": "plugin-id",
            "name": "Plugin Name",
            "description": "...",
            "version": "1.0.0",
            "author": "Author",
            "type": "integration",
            "enabled": true,
            "loadedAt": "2025-11-15T00:00:00.000Z"
        }
    ]
}

GET /api/plugins/:id response:
{
    "success": true,
    "plugin": {
        "id": "plugin-id",
        "name": "...",
        "version": "1.0.0",
        "routes": [
            { "method": "GET", "path": "/api/my-plugin/config" }
        ],
        "socketEvents": ["my-event"],
        "tiktokEvents": ["chat", "gift"]
    }
}
```

---

## Plugin Upload (ZIP Format)

### ZIP Structure
```
plugin-name.zip
├── plugin.json
├── main.js
├── *.html (optional)
├── *.js (optional)
└── *.css (optional)
```

### Upload Process
1. POST to `/api/plugins/upload` with ZIP file
2. ZIP extracted to temp directory
3. `plugin.json` validated
4. Entry point verified
5. Moved to `/plugins/{{pluginId}}/`
6. Plugin loaded immediately
7. State saved to `plugins_state.json`

---

## Error Handling

### Route Error Handling
Routes are wrapped with automatic error handling:
```javascript
// Errors caught automatically
this.api.registerRoute('get', '/api/my-plugin/data', (req, res) => {
    throw new Error('Something went wrong');
    // Automatically returns 500 with error message
});
```

### TikTok Event Error Handling
```javascript
// Errors are caught and logged, plugin continues running
this.api.registerTikTokEvent('chat', async (data) => {
    throw new Error('Processing error');
    // Logged as: "TikTok event error in chat: Processing error"
});
```

### Socket Event Error Handling
```javascript
// Errors send plugin:error event to client
this.api.registerSocket('my-event', async (socket, data) => {
    throw new Error('Processing failed');
    // Client receives: { plugin, event, error }
});
```

---

## Memory and Performance Notes

### Important Limitations
1. **Express Routes Cannot Be Unregistered** - Memory leak with frequent reloads
2. **Socket Events Can Be Unregistered** - Properly cleaned up
3. **Server Restart Required** - For frequent plugin reloads (>10)

### Best Practices
- Avoid frequent plugin reloads in production
- Clean up timers and intervals in `destroy()`
- Limit database queries in event handlers
- Use connection pooling for external APIs

---

## Example: Creating "LastEvent Spotlight" Plugin

### plugin.json
```json
{
  "id": "lastevent-spotlight",
  "name": "Last Event Spotlight",
  "version": "1.0.0",
  "description": "Highlights and displays the last significant event (gift, follow, etc.)",
  "author": "Your Name",
  "entry": "main.js",
  "enabled": true,
  "permissions": [
    "routes",
    "socket.io",
    "tiktok-events",
    "database"
  ]
}
```

### main.js Structure
```javascript
class LastEventSpotlightPlugin {
    constructor(api) {
        this.api = api;
        this.lastEvent = null;
    }

    async init() {
        // Register routes for UI
        this.registerRoutes();
        
        // Listen to TikTok events
        this.registerTikTokEvents();
        
        // Load saved state
        this.lastEvent = this.api.getConfig('lastEvent');
        
        this.api.log('Last Event Spotlight initialized', 'info');
    }

    registerRoutes() {
        // UI endpoint
        this.api.registerRoute('get', '/lastevent-spotlight/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui.html'));
        });
        
        // Overlay endpoint
        this.api.registerRoute('get', '/lastevent-spotlight/overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'overlay.html'));
        });
        
        // Get last event API
        this.api.registerRoute('get', '/api/lastevent-spotlight/last', (req, res) => {
            res.json({ success: true, event: this.lastEvent });
        });
        
        // Clear last event
        this.api.registerRoute('post', '/api/lastevent-spotlight/clear', (req, res) => {
            this.lastEvent = null;
            this.api.setConfig('lastEvent', null);
            this.api.emit('lastevent:cleared');
            res.json({ success: true });
        });
    }

    registerTikTokEvents() {
        // Listen to all significant events
        ['gift', 'follow', 'subscribe', 'share'].forEach(event => {
            this.api.registerTikTokEvent(event, async (data) => {
                this.lastEvent = {
                    type: event,
                    data: data,
                    timestamp: Date.now()
                };
                this.api.setConfig('lastEvent', this.lastEvent);
                this.api.emit('lastevent:updated', this.lastEvent);
            });
        });
    }

    async destroy() {
        // Cleanup if needed
    }
}

module.exports = LastEventSpotlightPlugin;
```

---

## Key Files Reference
- `/modules/plugin-loader.js` - Core PluginLoader and PluginAPI classes
- `/routes/plugin-routes.js` - Plugin management API endpoints
- `/server.js` - Lines 1634-1637: Plugin initialization
- `/plugins/emoji-rain/` - Example: Simple overlay plugin
- `/plugins/openshock/` - Example: Complex integration plugin
- `/plugins/goals/` - Example: Multi-module plugin

