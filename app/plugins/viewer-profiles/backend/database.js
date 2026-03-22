/**
 * Viewer Profiles Database Module
 *
 * Manages persistent storage for viewer notes, tags, flags, and automated event data.
 * Uses a dedicated SQLite database file per streamer configuration.
 */

const path = require('path');
const fs = require('fs');

/** Default flags for a new profile. */
const DEFAULT_FLAGS = { vip: false, banned: false, warned: false, trusted: false, friend: false };

class ViewerProfilesDatabase {
  constructor(api) {
    this.api = api;
    this.db = null;
  }

  /**
   * Resolve the database file path and ensure the directory exists.
   * Uses ConfigPathManager when available, falls back to user_data/.
   */
  _resolveDatabasePath() {
    const configPathManager = this.api.getConfigPathManager
      ? this.api.getConfigPathManager()
      : null;

    let dbDir;
    if (configPathManager && typeof configPathManager.getPluginDataDir === 'function') {
      dbDir = configPathManager.getPluginDataDir('viewer-profiles');
    } else {
      // Fallback: <app_root>/user_data/viewer-profiles
      dbDir = path.join(this.api.getPluginDir(), '..', '..', '..', 'user_data', 'viewer-profiles');
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return path.join(dbDir, 'viewer-profiles.db');
  }

  /**
   * Initialize the database: open file, enable WAL mode, create all tables.
   */
  initialize() {
    const Database = require('better-sqlite3');
    const dbPath = this._resolveDatabasePath();

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this._createTables();
    this.api.log(`Viewer Profiles DB opened at: ${dbPath}`, 'info');
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        username              TEXT PRIMARY KEY,
        display_name          TEXT,
        profile_picture_url   TEXT,
        custom_nickname       TEXT,
        notes                 TEXT,
        tags                  TEXT DEFAULT '[]',
        flags                 TEXT DEFAULT '{"vip":false,"banned":false,"warned":false,"trusted":false,"friend":false}',
        color                 TEXT,
        priority              INTEGER DEFAULT 0,
        first_seen            TEXT,
        last_seen             TEXT,
        total_chats           INTEGER DEFAULT 0,
        total_gifts           INTEGER DEFAULT 0,
        total_coins           INTEGER DEFAULT 0,
        total_likes           INTEGER DEFAULT 0,
        total_shares          INTEGER DEFAULT 0,
        total_follows         INTEGER DEFAULT 0,
        created_at            TEXT,
        updated_at            TEXT
      );

      CREATE TABLE IF NOT EXISTS notes_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT NOT NULL,
        note_text   TEXT NOT NULL,
        note_type   TEXT DEFAULT 'manual',
        created_by  TEXT DEFAULT 'streamer',
        created_at  TEXT NOT NULL,
        FOREIGN KEY (username) REFERENCES profiles(username) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_profiles_last_seen
        ON profiles(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_profiles_priority
        ON profiles(priority DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_history_username
        ON notes_history(username);
      CREATE INDEX IF NOT EXISTS idx_notes_history_created
        ON notes_history(created_at DESC);
    `);
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  _now() {
    return new Date().toISOString();
  }

  _parseJSON(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  _serializeProfile(row) {
    if (!row) return null;
    return {
      ...row,
      tags: this._parseJSON(row.tags, []),
      flags: this._parseJSON(row.flags, { ...DEFAULT_FLAGS })
    };
  }

  // ─── Profile CRUD ────────────────────────────────────────────────────────────

  /**
   * List profiles with optional pagination, search, and filter.
   * @param {object} opts
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @param {string} [opts.search]          – substring match on username/display_name/notes
   * @param {string} [opts.tag]             – filter by tag
   * @param {string} [opts.flag]            – filter by flag name (must be true)
   * @param {string} [opts.sort='last_seen']
   * @param {string} [opts.order='desc']
   * @returns {{ profiles: object[], total: number }}
   */
  listProfiles({ limit = 50, offset = 0, search = '', tag = '', flag = '', sort = 'last_seen', order = 'desc' } = {}) {
    const allowedSort = ['username', 'display_name', 'last_seen', 'first_seen', 'total_chats',
      'total_gifts', 'total_coins', 'total_likes', 'priority', 'created_at'];
    const safeSort = allowedSort.includes(sort) ? sort : 'last_seen';
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';

    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(`(username LIKE ? OR display_name LIKE ? OR notes LIKE ? OR tags LIKE ?)`);
      const q = `%${search}%`;
      params.push(q, q, q, q);
    }
    if (tag) {
      conditions.push(`json_each.value = ?`);
      params.push(tag);
    }
    if (flag) {
      conditions.push(`json_extract(flags, '$.' || ?) = 1`);
      params.push(flag);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // When filtering by tag we need a JOIN against json_each
    const fromClause = tag
      ? `FROM profiles, json_each(profiles.tags)`
      : `FROM profiles`;

    const countStmt = this.db.prepare(
      `SELECT COUNT(DISTINCT username) as cnt ${fromClause} ${whereClause}`
    );
    const total = countStmt.get(...params)?.cnt ?? 0;

    const rows = this.db.prepare(
      `SELECT DISTINCT profiles.* ${fromClause} ${whereClause}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    return { profiles: rows.map(r => this._serializeProfile(r)), total };
  }

  /**
   * Get a single profile by username. Returns null if not found.
   */
  getProfile(username) {
    const row = this.db.prepare(`SELECT * FROM profiles WHERE username = ?`).get(username);
    return this._serializeProfile(row);
  }

  /**
   * Upsert a profile. Creates it if it doesn't exist, merges fields if it does.
   */
  upsertProfile(username, data = {}) {
    const now = this._now();
    const existing = this.db.prepare(`SELECT * FROM profiles WHERE username = ?`).get(username);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO profiles (
          username, display_name, profile_picture_url, custom_nickname, notes,
          tags, flags, color, priority, first_seen, last_seen,
          total_chats, total_gifts, total_coins, total_likes, total_shares, total_follows,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      stmt.run(
        username,
        data.display_name ?? null,
        data.profile_picture_url ?? null,
        data.custom_nickname ?? null,
        data.notes ?? null,
        JSON.stringify(data.tags ?? []),
        JSON.stringify(data.flags ?? { ...DEFAULT_FLAGS }),
        data.color ?? null,
        data.priority ?? 0,
        data.first_seen ?? now,
        data.last_seen ?? now,
        data.total_chats ?? 0,
        data.total_gifts ?? 0,
        data.total_coins ?? 0,
        data.total_likes ?? 0,
        data.total_shares ?? 0,
        data.total_follows ?? 0,
        now,
        now
      );
    } else {
      const fields = [];
      const values = [];

      const updatable = [
        'display_name', 'profile_picture_url', 'custom_nickname', 'notes',
        'color', 'priority', 'last_seen', 'first_seen',
        'total_chats', 'total_gifts', 'total_coins', 'total_likes',
        'total_shares', 'total_follows'
      ];

      for (const key of updatable) {
        if (key in data) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      // JSON fields
      if ('tags' in data) {
        fields.push(`tags = ?`);
        values.push(JSON.stringify(data.tags));
      }
      if ('flags' in data) {
        fields.push(`flags = ?`);
        values.push(JSON.stringify(data.flags));
      }

      if (fields.length > 0) {
        fields.push(`updated_at = ?`);
        values.push(now);
        values.push(username);
        this.db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE username = ?`).run(...values);
      }
    }

    return this.getProfile(username);
  }

  /**
   * Delete a profile and all its notes.
   */
  deleteProfile(username) {
    this.db.prepare(`DELETE FROM profiles WHERE username = ?`).run(username);
  }

  // ─── Auto-tracking helpers ───────────────────────────────────────────────────

  /**
   * Ensure a profile exists (auto-create from TikTok event data).
   * Returns true if the profile was newly created.
   */
  _ensureProfile(username, displayName, profilePicture) {
    const existing = this.db.prepare(`SELECT username FROM profiles WHERE username = ?`).get(username);
    if (!existing) {
      this.upsertProfile(username, {
        display_name: displayName || username,
        profile_picture_url: profilePicture || null
      });
      return true;
    }
    // Always update display_name / picture if provided
    if (displayName || profilePicture) {
      const updates = {};
      if (displayName) updates.display_name = displayName;
      if (profilePicture) updates.profile_picture_url = profilePicture;
      this.upsertProfile(username, updates);
    }
    return false;
  }

  _touchLastSeen(username) {
    this.db.prepare(`UPDATE profiles SET last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(this._now(), this._now(), username);
  }

  trackChat(username, displayName, profilePicture) {
    this._ensureProfile(username, displayName, profilePicture);
    this.db.prepare(`UPDATE profiles SET total_chats = total_chats + 1, last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(this._now(), this._now(), username);
  }

  trackGift(username, displayName, profilePicture, coins = 0) {
    this._ensureProfile(username, displayName, profilePicture);
    this.db.prepare(`UPDATE profiles SET total_gifts = total_gifts + 1, total_coins = total_coins + ?, last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(coins, this._now(), this._now(), username);
  }

  trackLike(username, displayName, profilePicture) {
    this._ensureProfile(username, displayName, profilePicture);
    this.db.prepare(`UPDATE profiles SET total_likes = total_likes + 1, last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(this._now(), this._now(), username);
  }

  trackShare(username, displayName, profilePicture) {
    this._ensureProfile(username, displayName, profilePicture);
    this.db.prepare(`UPDATE profiles SET total_shares = total_shares + 1, last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(this._now(), this._now(), username);
  }

  trackFollow(username, displayName, profilePicture) {
    this._ensureProfile(username, displayName, profilePicture);
    this.db.prepare(`UPDATE profiles SET total_follows = 1, last_seen = ?, updated_at = ? WHERE username = ?`)
      .run(this._now(), this._now(), username);
  }

  trackJoin(username, displayName, profilePicture) {
    const isNew = this._ensureProfile(username, displayName, profilePicture);
    if (!isNew) {
      this._touchLastSeen(username);
    }
  }

  // ─── Notes CRUD ──────────────────────────────────────────────────────────────

  addNote(username, noteText, noteType = 'manual', createdBy = 'streamer') {
    const stmt = this.db.prepare(`
      INSERT INTO notes_history (username, note_text, note_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(username, noteText, noteType, createdBy, this._now());
    return this.getNote(result.lastInsertRowid);
  }

  getNote(id) {
    return this.db.prepare(`SELECT * FROM notes_history WHERE id = ?`).get(id) ?? null;
  }

  getNotes(username) {
    return this.db.prepare(
      `SELECT * FROM notes_history WHERE username = ? ORDER BY created_at DESC`
    ).all(username);
  }

  deleteNote(id) {
    this.db.prepare(`DELETE FROM notes_history WHERE id = ?`).run(id);
  }

  // ─── Tags ────────────────────────────────────────────────────────────────────

  addTags(username, newTags) {
    const profile = this.getProfile(username);
    if (!profile) return null;
    const existing = profile.tags;
    const merged = [...new Set([...existing, ...newTags])];
    this.db.prepare(`UPDATE profiles SET tags = ?, updated_at = ? WHERE username = ?`)
      .run(JSON.stringify(merged), this._now(), username);
    return this.getProfile(username);
  }

  removeTag(username, tag) {
    const profile = this.getProfile(username);
    if (!profile) return null;
    const filtered = profile.tags.filter(t => t !== tag);
    this.db.prepare(`UPDATE profiles SET tags = ?, updated_at = ? WHERE username = ?`)
      .run(JSON.stringify(filtered), this._now(), username);
    return this.getProfile(username);
  }

  /**
   * Get all unique tags used across all profiles.
   */
  getAllTags() {
    const rows = this.db.prepare(`SELECT tags FROM profiles WHERE tags IS NOT NULL AND tags != '[]'`).all();
    const tagSet = new Set();
    for (const row of rows) {
      const tags = this._parseJSON(row.tags, []);
      tags.forEach(t => tagSet.add(t));
    }
    return [...tagSet].sort();
  }

  // ─── Flags ───────────────────────────────────────────────────────────────────

  updateFlags(username, flagUpdates) {
    const profile = this.getProfile(username);
    if (!profile) return null;
    const merged = { ...profile.flags, ...flagUpdates };
    this.db.prepare(`UPDATE profiles SET flags = ?, updated_at = ? WHERE username = ?`)
      .run(JSON.stringify(merged), this._now(), username);
    return this.getProfile(username);
  }

  // ─── Search ──────────────────────────────────────────────────────────────────

  search(query, limit = 20) {
    const q = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT * FROM profiles
      WHERE username LIKE ? OR display_name LIKE ? OR notes LIKE ? OR custom_nickname LIKE ? OR tags LIKE ?
      ORDER BY last_seen DESC
      LIMIT ?
    `).all(q, q, q, q, q, limit);
    return rows.map(r => this._serializeProfile(r));
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats() {
    const total = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles`).get()?.cnt ?? 0;
    const withNotes = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE notes IS NOT NULL AND notes != ''`).get()?.cnt ?? 0;
    const vip = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE json_extract(flags, '$.vip') = 1`).get()?.cnt ?? 0;
    const banned = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE json_extract(flags, '$.banned') = 1`).get()?.cnt ?? 0;
    const warned = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE json_extract(flags, '$.warned') = 1`).get()?.cnt ?? 0;
    const trusted = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE json_extract(flags, '$.trusted') = 1`).get()?.cnt ?? 0;
    const friend = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE json_extract(flags, '$.friend') = 1`).get()?.cnt ?? 0;
    const highPriority = this.db.prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE priority >= 3`).get()?.cnt ?? 0;
    const totalNotes = this.db.prepare(`SELECT COUNT(*) as cnt FROM notes_history`).get()?.cnt ?? 0;
    return { total, withNotes, vip, banned, warned, trusted, friend, highPriority, totalNotes };
  }

  // ─── Export / Import ─────────────────────────────────────────────────────────

  exportAll() {
    const profiles = this.db.prepare(`SELECT * FROM profiles ORDER BY username`).all()
      .map(r => this._serializeProfile(r));
    const notes = this.db.prepare(`SELECT * FROM notes_history ORDER BY id`).all();
    return { exportedAt: this._now(), version: '1.0.0', profiles, notes };
  }

  importAll(data) {
    const insertProfile = this.db.prepare(`
      INSERT OR REPLACE INTO profiles (
        username, display_name, profile_picture_url, custom_nickname, notes,
        tags, flags, color, priority, first_seen, last_seen,
        total_chats, total_gifts, total_coins, total_likes, total_shares, total_follows,
        created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const insertNote = this.db.prepare(`
      INSERT INTO notes_history (username, note_text, note_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const doImport = this.db.transaction((exportData) => {
      let profilesImported = 0;
      let notesImported = 0;

      for (const p of exportData.profiles || []) {
        insertProfile.run(
          p.username,
          p.display_name ?? null,
          p.profile_picture_url ?? null,
          p.custom_nickname ?? null,
          p.notes ?? null,
          JSON.stringify(p.tags ?? []),
          JSON.stringify(p.flags ?? { ...DEFAULT_FLAGS }),
          p.color ?? null,
          p.priority ?? 0,
          p.first_seen ?? this._now(),
          p.last_seen ?? this._now(),
          p.total_chats ?? 0,
          p.total_gifts ?? 0,
          p.total_coins ?? 0,
          p.total_likes ?? 0,
          p.total_shares ?? 0,
          p.total_follows ?? 0,
          p.created_at ?? this._now(),
          p.updated_at ?? this._now()
        );
        profilesImported++;
      }

      for (const n of exportData.notes || []) {
        insertNote.run(
          n.username,
          n.note_text,
          n.note_type ?? 'manual',
          n.created_by ?? 'streamer',
          n.created_at ?? this._now()
        );
        notesImported++;
      }

      return { profilesImported, notesImported };
    });

    return doImport(data);
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  getSetting(key) {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? this._parseJSON(row.value, row.value) : null;
  }

  setSetting(key, value) {
    this.db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, JSON.stringify(value));
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  destroy() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.api.log('Viewer Profiles DB closed', 'info');
    }
  }
}

module.exports = ViewerProfilesDatabase;
