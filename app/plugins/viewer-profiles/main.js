/**
 * Viewer Profiles Plugin
 *
 * Streamer Notes & Viewer CRM – Store manual notes, tags, flags, and
 * automated viewer data collected from TikTok live events.
 */

const EventEmitter = require('events');
const path = require('path');
const ViewerProfilesDatabase = require('./backend/database');

class ViewerProfilesPlugin extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    this.pluginId = 'viewer-profiles';
    this.db = new ViewerProfilesDatabase(api);
  }

  /**
   * Initialize plugin: DB, routes, TikTok events, WebSocket handlers.
   */
  async init() {
    this.api.log('📋 Initializing Viewer Profiles Plugin...', 'info');

    try {
      this.db.initialize();
      this._registerRoutes();
      this._registerTikTokEvents();
      this._registerWebSocketHandlers();

      this.api.log('✅ Viewer Profiles Plugin initialized', 'info');
      this.api.log('   - Admin panel at /viewer-profiles/admin', 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing Viewer Profiles: ${error.message}`, 'error');
      throw error;
    }
  }

  // ─── Routes ──────────────────────────────────────────────────────────────────

  _registerRoutes() {
    // Admin panel UI
    this.api.registerRoute('GET', '/viewer-profiles/admin', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui', 'admin.html'));
    });

    // List profiles (pagination, search, filter)
    this.api.registerRoute('GET', '/api/viewer-profiles/profiles', (req, res) => {
      try {
        const { limit = 50, offset = 0, search = '', tag = '', flag = '', sort = 'last_seen', order = 'desc' } = req.query;
        const result = this.db.listProfiles({
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
          search,
          tag,
          flag,
          sort,
          order
        });
        res.json(result);
      } catch (error) {
        this.api.log(`Error listing profiles: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Get single profile
    this.api.registerRoute('GET', '/api/viewer-profiles/profiles/:username', (req, res) => {
      try {
        const profile = this.db.getProfile(req.params.username);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
      } catch (error) {
        this.api.log(`Error getting profile: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Create or update profile (upsert)
    this.api.registerRoute('POST', '/api/viewer-profiles/profiles/:username', (req, res) => {
      try {
        const profile = this.db.upsertProfile(req.params.username, req.body || {});
        this.api.emit('viewer-profiles:updated', { username: req.params.username, profile });
        res.json(profile);
      } catch (error) {
        this.api.log(`Error upserting profile: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Delete profile
    this.api.registerRoute('DELETE', '/api/viewer-profiles/profiles/:username', (req, res) => {
      try {
        this.db.deleteProfile(req.params.username);
        this.api.emit('viewer-profiles:updated', { username: req.params.username, deleted: true });
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error deleting profile: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Add note
    this.api.registerRoute('POST', '/api/viewer-profiles/profiles/:username/notes', (req, res) => {
      try {
        const { note_text, note_type = 'manual', created_by = 'streamer' } = req.body || {};
        if (!note_text) return res.status(400).json({ error: 'note_text is required' });
        const note = this.db.addNote(req.params.username, note_text, note_type, created_by);
        this.api.emit('viewer-profiles:note-added', { username: req.params.username, note });
        res.json(note);
      } catch (error) {
        this.api.log(`Error adding note: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Get notes for profile
    this.api.registerRoute('GET', '/api/viewer-profiles/profiles/:username/notes', (req, res) => {
      try {
        const notes = this.db.getNotes(req.params.username);
        res.json(notes);
      } catch (error) {
        this.api.log(`Error getting notes: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Delete note by ID
    this.api.registerRoute('DELETE', '/api/viewer-profiles/notes/:noteId', (req, res) => {
      try {
        this.db.deleteNote(parseInt(req.params.noteId, 10));
        res.json({ success: true });
      } catch (error) {
        this.api.log(`Error deleting note: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Add tags
    this.api.registerRoute('POST', '/api/viewer-profiles/profiles/:username/tags', (req, res) => {
      try {
        const { tags } = req.body || {};
        if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array' });
        // Normalize tags: lowercase, spaces to dashes, trim
        const normalized = tags.map(t => String(t).trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
        const profile = this.db.addTags(req.params.username, normalized);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        this.api.emit('viewer-profiles:updated', { username: req.params.username, profile });
        res.json(profile);
      } catch (error) {
        this.api.log(`Error adding tags: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Remove tag
    this.api.registerRoute('DELETE', '/api/viewer-profiles/profiles/:username/tags/:tag', (req, res) => {
      try {
        const profile = this.db.removeTag(req.params.username, req.params.tag);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        this.api.emit('viewer-profiles:updated', { username: req.params.username, profile });
        res.json(profile);
      } catch (error) {
        this.api.log(`Error removing tag: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Update flags
    this.api.registerRoute('POST', '/api/viewer-profiles/profiles/:username/flags', (req, res) => {
      try {
        const profile = this.db.updateFlags(req.params.username, req.body || {});
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        this.api.emit('viewer-profiles:updated', { username: req.params.username, profile });
        res.json(profile);
      } catch (error) {
        this.api.log(`Error updating flags: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Search profiles
    this.api.registerRoute('GET', '/api/viewer-profiles/search', (req, res) => {
      try {
        const { q = '', limit = 20 } = req.query;
        const results = this.db.search(q, parseInt(limit, 10));
        res.json(results);
      } catch (error) {
        this.api.log(`Error searching profiles: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Get all tags
    this.api.registerRoute('GET', '/api/viewer-profiles/tags', (req, res) => {
      try {
        res.json(this.db.getAllTags());
      } catch (error) {
        this.api.log(`Error getting tags: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Get overall stats
    this.api.registerRoute('GET', '/api/viewer-profiles/stats', (req, res) => {
      try {
        res.json(this.db.getStats());
      } catch (error) {
        this.api.log(`Error getting stats: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Export all profiles as JSON
    this.api.registerRoute('GET', '/api/viewer-profiles/export', (req, res) => {
      try {
        const data = this.db.exportAll();
        res.setHeader('Content-Disposition', 'attachment; filename="viewer-profiles-export.json"');
        res.setHeader('Content-Type', 'application/json');
        res.json(data);
      } catch (error) {
        this.api.log(`Error exporting profiles: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    // Import profiles from JSON
    this.api.registerRoute('POST', '/api/viewer-profiles/import', (req, res) => {
      try {
        const data = req.body;
        if (!data || !Array.isArray(data.profiles)) {
          return res.status(400).json({ error: 'Invalid import format: expected { profiles: [], notes: [] }' });
        }
        const result = this.db.importAll(data);
        this.api.emit('viewer-profiles:updated', { action: 'import', ...result });
        res.json({ success: true, ...result });
      } catch (error) {
        this.api.log(`Error importing profiles: ${error.message}`, 'error');
        res.status(500).json({ error: error.message });
      }
    });

    this.api.log('Viewer Profiles routes registered', 'debug');
  }

  // ─── TikTok Events ───────────────────────────────────────────────────────────

  _registerTikTokEvents() {
    this.api.registerTikTokEvent('chat', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        this.db.trackChat(username, data?.nickname, data?.profilePictureUrl);
        this.api.emit('viewer-profiles:updated', { username, action: 'chat' });
      } catch (error) {
        this.api.log(`Error tracking chat: ${error.message}`, 'error');
      }
    });

    this.api.registerTikTokEvent('gift', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        // TikTok reports diamondCount (TikTok diamonds) per gift × repeatCount for streaks.
        // We store the total diamonds as `total_coins` for display convenience.
        const coins = (data?.diamondCount ?? 0) * (data?.repeatCount ?? 1);
        this.db.trackGift(username, data?.nickname, data?.profilePictureUrl, coins);
        this.api.emit('viewer-profiles:updated', { username, action: 'gift' });
      } catch (error) {
        this.api.log(`Error tracking gift: ${error.message}`, 'error');
      }
    });

    this.api.registerTikTokEvent('like', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        this.db.trackLike(username, data?.nickname, data?.profilePictureUrl);
        this.api.emit('viewer-profiles:updated', { username, action: 'like' });
      } catch (error) {
        this.api.log(`Error tracking like: ${error.message}`, 'error');
      }
    });

    this.api.registerTikTokEvent('share', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        this.db.trackShare(username, data?.nickname, data?.profilePictureUrl);
        this.api.emit('viewer-profiles:updated', { username, action: 'share' });
      } catch (error) {
        this.api.log(`Error tracking share: ${error.message}`, 'error');
      }
    });

    this.api.registerTikTokEvent('follow', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        this.db.trackFollow(username, data?.nickname, data?.profilePictureUrl);
        this.db.addNote(username, '👍 User followed the stream', 'auto', 'system');
        this.api.emit('viewer-profiles:updated', { username, action: 'follow' });
        this.api.emit('viewer-profiles:note-added', { username, noteType: 'auto' });
      } catch (error) {
        this.api.log(`Error tracking follow: ${error.message}`, 'error');
      }
    });

    this.api.registerTikTokEvent('join', (data) => {
      try {
        const username = data?.uniqueId;
        if (!username) return;
        this.db.trackJoin(username, data?.nickname, data?.profilePictureUrl);
      } catch (error) {
        this.api.log(`Error tracking join: ${error.message}`, 'error');
      }
    });

    this.api.log('TikTok event handlers registered', 'debug');
  }

  // ─── WebSocket Handlers ──────────────────────────────────────────────────────

  _registerWebSocketHandlers() {
    const io = this.api.getSocketIO();

    io.on('connection', (socket) => {
      socket.on('viewer-profiles:get-profile', (username) => {
        try {
          const profile = this.db.getProfile(username);
          socket.emit('viewer-profiles:profile', profile);
        } catch (error) {
          this.api.log(`WS error getting profile: ${error.message}`, 'error');
        }
      });

      socket.on('viewer-profiles:search', (query) => {
        try {
          const results = this.db.search(query?.q ?? query ?? '', query?.limit ?? 20);
          socket.emit('viewer-profiles:search-results', results);
        } catch (error) {
          this.api.log(`WS error searching profiles: ${error.message}`, 'error');
        }
      });
    });

    this.api.log('WebSocket handlers registered', 'debug');
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async destroy() {
    this.api.log('Shutting down Viewer Profiles Plugin...', 'info');
    this.db.destroy();
    this.api.log('Viewer Profiles Plugin stopped', 'info');
  }
}

module.exports = ViewerProfilesPlugin;
