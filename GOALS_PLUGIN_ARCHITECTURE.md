# Goals Plugin Architecture & Persistence Documentation

## Overview

The Goals Plugin is a multi-overlay system that allows streamers to display multiple customizable goals simultaneously. Each goal has its own overlay URL and can be positioned independently in OBS.

## Data Persistence

### Storage Mechanism

**Goals are stored in the SQLite database**, NOT in JSON config files.

- **Database**: `user_configs/{profile}.db`
- **Table**: `goals`
- **History Table**: `goals_history`

### Why Database Instead of JSON?

1. **Better performance** - SQL queries are faster than file I/O
2. **ACID compliance** - Atomic transactions prevent data corruption
3. **Relational integrity** - Foreign keys maintain data consistency
4. **History tracking** - Built-in audit trail of all changes
5. **Concurrent access** - Multiple processes can safely access data

### Database Schema

```sql
CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal_type TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    current_value INTEGER DEFAULT 0,
    target_value INTEGER DEFAULT 1000,
    start_value INTEGER DEFAULT 0,
    template_id TEXT DEFAULT 'compact-bar',
    animation_on_update TEXT DEFAULT 'smooth-progress',
    animation_on_reach TEXT DEFAULT 'celebration',
    on_reach_action TEXT DEFAULT 'hide',
    on_reach_increment INTEGER DEFAULT 100,
    theme_json TEXT,
    overlay_width INTEGER DEFAULT 500,
    overlay_height INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

### REST API (HTTP)

The plugin uses proper REST API patterns:

- `POST /api/goals` - Create new goal
- `GET /api/goals` - List all goals
- `GET /api/goals/:id` - Get single goal
- `PUT /api/goals/:id` - Update goal
- `DELETE /api/goals/:id` - Delete goal
- `POST /api/goals/:id/increment` - Increment goal value
- `POST /api/goals/:id/reset` - Reset goal to start value
- `GET /api/goals/:id/history` - Get goal change history

### WebSocket API (Socket.IO)

Real-time updates via WebSocket:

- `goals:get-all` - Request all goals
- `goals:all` - Receive all goals
- `goals:created` - Broadcast when goal created
- `goals:updated` - Broadcast when goal updated
- `goals:deleted` - Broadcast when goal deleted
- `goals:value-changed` - Broadcast when value changes

## Initialization Order

```
1. Database initialized (server.js line 245)
2. PluginLoader created with db reference (line 262)
3. Plugins loaded asynchronously (line 1687)
4. Goals Plugin initialized:
   a. Database tables created/verified
   b. Existing goals loaded from database
   c. State machines initialized for each goal
   d. API routes registered
   e. WebSocket handlers registered
   f. TikTok event handlers registered
   g. Flow actions registered
5. Server starts listening (line 1749)
```

## File Structure

```
plugins/goals/
├── main.js                 # Plugin entry point
├── plugin.json            # Plugin manifest
├── ui.html                # Management UI
├── ui.js                  # UI JavaScript
├── backend/
│   ├── api.js            # HTTP API routes
│   ├── database.js       # Database operations
│   ├── websocket.js      # Socket.IO handlers
│   └── event-handlers.js # TikTok event integration
├── engine/
│   ├── state-machine.js  # Goal state management
│   ├── templates/        # Overlay templates
│   └── animations/       # Animation registry
└── overlay/
    └── index.html        # Overlay display page
```

## Common Misconceptions

### ❌ WRONG: Goals should be in `/data/plugins/goals/config.json`

**✅ CORRECT**: Goals are in the SQLite database at `user_configs/{profile}.db` in the `goals` table.

### ❌ WRONG: There should be a `savePluginConfig()` method

**✅ CORRECT**: The plugin uses direct database operations via `this.db.createGoal()`, `this.db.updateGoal()`, etc.

### ❌ WRONG: Data doesn't persist after restart

**✅ CORRECT**: Data DOES persist. The plugin loads goals from the database on every startup using `this.db.getAllGoals()`.

## Verification

To verify goals are persisting:

```bash
# Check database directly
sqlite3 user_configs/default.db "SELECT id, name, current_value, target_value FROM goals;"

# Check via API
curl http://localhost:3000/api/goals

# Check server logs
grep "Loaded.*goals from database" server.log
```

## Troubleshooting

### Goals not appearing in UI

1. **Check browser console** for JavaScript errors
2. **Verify WebSocket connection** - Look for "Connected" in console
3. **Check server logs** - Search for "Goals Plugin" messages
4. **Verify database** - Check if goals table exists and has data

### Goals not persisting

1. **Verify database file exists**: `user_configs/{profile}.db`
2. **Check file permissions**: Database file must be writable
3. **Review server logs**: Look for database errors during save
4. **Check disk space**: Ensure system has available storage

## Testing

### Manual Test for Persistence

```bash
# 1. Start server
node server.js

# 2. Create a goal
curl -X POST http://localhost:3000/api/goals \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","goal_type":"coin","target_value":1000}'

# 3. Verify creation
curl http://localhost:3000/api/goals

# 4. Restart server (Ctrl+C, then node server.js again)

# 5. Verify goal still exists
curl http://localhost:3000/api/goals
```

Expected: Goal persists across restart

## Migration from Old System

The repository contains TWO goals systems:

1. **Old System**: `/modules/goals.js` (legacy, pre-plugin)
2. **New System**: `/plugins/goals/` (current, plugin-based)

The old system is kept for backward compatibility but should not be used for new features.

## Security

- ✅ SQL injection prevention via prepared statements
- ✅ Input validation on all API endpoints
- ✅ Rate limiting via Express middleware
- ✅ CORS restrictions to prevent unauthorized access

## Performance

- Indexed database queries for fast retrieval
- WebSocket for real-time updates (no polling)
- State machines for efficient goal progression
- Optimized database writes (batch operations where possible)

## Support

For issues or questions:

1. Check this documentation
2. Review server logs: `grep "goals" server.log`
3. Verify database integrity: `sqlite3 user_configs/default.db ".schema goals"`
4. Test API directly with curl
5. Check browser console for UI errors

---

**Last Updated**: 2025-11-15
**Version**: 1.0.0
**Status**: ✅ Working as designed, data persists correctly
