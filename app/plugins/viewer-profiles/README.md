# Viewer Profiles Plugin

> **Streamer Notes & Viewer CRM** – Store manual notes, tags, flags, and automated viewer data. A personal viewer database for TikTok streamers.

## Overview

The **Viewer Profiles** plugin lets you build a permanent database of your TikTok viewers. For each viewer you can:

- Write free-text notes (e.g. "loves dogs", "birthday: March 15", "from Germany")
- Assign custom tags (`vip`, `regular`, `german`, `birthday-soon`, ...)
- Toggle flags (VIP · Banned · Warned · Trusted · Friend)
- Set a custom colour and priority level
- View automatically collected engagement stats (chats, gifts, coins, likes, shares, follow)

All profile data persists between streams in a dedicated SQLite database.

---

## File Structure

```
app/plugins/viewer-profiles/
├── plugin.json              # Plugin metadata
├── main.js                  # Plugin lifecycle & route/event registration
├── backend/
│   └── database.js          # SQLite manager (better-sqlite3, WAL mode)
├── ui/
│   └── admin.html           # Self-contained admin panel (dark theme)
└── README.md                # This file
```

---

## Activation

1. Enable the plugin in the Admin → Plugins panel **or** set `"enabled": true` in `plugin.json`.
2. Open the Admin panel at: `http://localhost:<PORT>/viewer-profiles/admin`

---

## Admin Panel Features

| Feature | Description |
|---------|-------------|
| **Profile List** | Paginated grid with search, flag filter, and sort |
| **Profile Detail** | Full view with nickname, colour, notes, tags, flags, stats |
| **Notes History** | Per-profile note log with type labels (manual / auto / system) |
| **Quick-add note** | Text area directly in the detail view |
| **Tag editor** | Add/remove chip-style tags inline |
| **Flag toggles** | One-click VIP / Banned / Warned / Trusted / Friend |
| **Auto stats** | Chats · Gifts · Coins · Likes · Shares · Follow – auto-tracked |
| **Search** | Full-text search across usernames, notes, tags, nicknames |
| **Import / Export** | JSON backup and restore |

---

## Auto-Tracking (TikTok Events)

The plugin listens to live TikTok events and automatically updates viewer profiles:

| Event | Action |
|-------|--------|
| `chat` | Increment `total_chats`, update `last_seen`, auto-create profile |
| `gift` | Increment `total_gifts`, add diamond value to `total_coins` |
| `like` | Increment `total_likes` |
| `share` | Increment `total_shares` |
| `follow` | Set `total_follows = 1`, add auto-note "User followed the stream" |
| `join` | Set `first_seen` (if new), update `last_seen` |

All interactions auto-create a minimal profile for the viewer on first contact.

---

## REST API

All routes are prefixed with `/api/viewer-profiles/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profiles` | List all profiles (pagination, search, filter) |
| GET | `/profiles/:username` | Get single profile |
| POST | `/profiles/:username` | Create or update profile (upsert) |
| DELETE | `/profiles/:username` | Delete profile |
| GET | `/profiles/:username/notes` | Get all notes for a profile |
| POST | `/profiles/:username/notes` | Add a note |
| DELETE | `/notes/:noteId` | Delete a note |
| POST | `/profiles/:username/tags` | Add tags |
| DELETE | `/profiles/:username/tags/:tag` | Remove a tag |
| POST | `/profiles/:username/flags` | Update flags |
| GET | `/search?q=…` | Full-text search |
| GET | `/tags` | List all unique tags |
| GET | `/stats` | Overall counts |
| GET | `/export` | Export all data as JSON |
| POST | `/import` | Import data from JSON |

### Query parameters for `GET /profiles`

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 50 | Profiles per page |
| `offset` | 0 | Pagination offset |
| `search` | – | Search string |
| `tag` | – | Filter by tag |
| `flag` | – | Filter by flag name (`vip`, `banned`, `warned`, `trusted`, `friend`) |
| `sort` | `last_seen` | Sort field |
| `order` | `desc` | Sort direction (`asc` / `desc`) |

---

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `viewer-profiles:get-profile` | Client → Server | Request a viewer profile by username |
| `viewer-profiles:profile` | Server → Client | Send profile data |
| `viewer-profiles:updated` | Server → Client | Broadcast on any profile update |
| `viewer-profiles:search` | Client → Server | Search profiles (`{ q, limit }`) |
| `viewer-profiles:search-results` | Server → Client | Return search results |
| `viewer-profiles:note-added` | Server → Client | Broadcast when a note is added |

---

## Database

- **Location:** `<config_dir>/plugins/viewer-profiles/data/viewer-profiles.db`  
  (falls back to `<app_root>/user_data/viewer-profiles/viewer-profiles.db`)
- **Engine:** `better-sqlite3` with WAL journal mode
- **Tables:** `profiles`, `notes_history`, `settings`

---

## Priority Levels

| Value | Label |
|-------|-------|
| 0 | Normal |
| 1 | Low |
| 2 | Medium |
| 3 | High |
| 4 | Critical |

---

## Import / Export Format

```json
{
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "profiles": [ { "username": "...", ... } ],
  "notes": [ { "username": "...", "note_text": "...", ... } ]
}
```

---

## License

CC-BY-NC-4.0 · Made with ❤️ by Pup Cid
