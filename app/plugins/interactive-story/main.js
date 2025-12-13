/**
 * Interactive Story Plugin
 * Choose-your-own-adventure storytelling where viewers influence the narrative
 */

class InteractiveStoryPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    this.currentStory = null;
    this.currentNode = null;
    this.votes = {};
    this.voteTimeout = null;
  }

  async init() {
    this.api.log('Interactive Story plugin initializing...', 'info');

    // Initialize database table for stories
    this.initDatabase();

    // Register admin UI route
    this.api.registerRoute('get', '/plugins/interactive-story/ui', (req, res) => {
      res.sendFile('ui.html', { root: this.api.getPluginDir() });
    });

    // Register overlay route
    this.api.registerRoute('get', '/plugins/interactive-story/overlay', (req, res) => {
      res.sendFile('overlay.html', { root: this.api.getPluginDir() });
    });

    // API: Get all stories
    this.api.registerRoute('get', '/api/interactive-story/stories', (req, res) => {
      try {
        const stories = this.getStories();
        res.json({ success: true, stories });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Get story by ID
    this.api.registerRoute('get', '/api/interactive-story/stories/:id', (req, res) => {
      try {
        const story = this.getStory(req.params.id);
        res.json({ success: true, story });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Save story
    this.api.registerRoute('post', '/api/interactive-story/stories', (req, res) => {
      try {
        const storyId = this.saveStory(req.body);
        res.json({ success: true, storyId });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Delete story
    this.api.registerRoute('delete', '/api/interactive-story/stories/:id', (req, res) => {
      try {
        this.deleteStory(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Start story
    this.api.registerRoute('post', '/api/interactive-story/start/:id', (req, res) => {
      try {
        this.startStory(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Stop story
    this.api.registerRoute('post', '/api/interactive-story/stop', (req, res) => {
      try {
        this.stopStory();
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Get current state
    this.api.registerRoute('get', '/api/interactive-story/state', (req, res) => {
      res.json({
        success: true,
        active: this.currentStory !== null,
        story: this.currentStory,
        node: this.currentNode,
        votes: this.votes
      });
    });

    // API: Manual choice selection
    this.api.registerRoute('post', '/api/interactive-story/choose/:choice', (req, res) => {
      try {
        this.makeChoice(parseInt(req.params.choice));
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Register socket events
    this.api.registerSocket('interactive-story:vote', (data) => {
      this.handleVote(data);
    });

    // Subscribe to TikTok events
    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChat(data);
    });

    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGift(data);
    });

    this.api.log('Interactive Story plugin initialized successfully', 'info');
  }

  initDatabase() {
    try {
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS interactive_stories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          nodes TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `).run();
    } catch (error) {
      this.api.log(`Failed to initialize database: ${error.message}`, 'error');
    }
  }

  getStories() {
    try {
      const stmt = this.db.prepare('SELECT * FROM interactive_stories ORDER BY created_at DESC');
      const stories = stmt.all();
      return stories.map(story => ({
        ...story,
        nodes: JSON.parse(story.nodes)
      }));
    } catch (error) {
      this.api.log(`Failed to get stories: ${error.message}`, 'error');
      return [];
    }
  }

  getStory(id) {
    try {
      const stmt = this.db.prepare('SELECT * FROM interactive_stories WHERE id = ?');
      const story = stmt.get(id);
      if (story) {
        story.nodes = JSON.parse(story.nodes);
      }
      return story;
    } catch (error) {
      this.api.log(`Failed to get story: ${error.message}`, 'error');
      return null;
    }
  }

  saveStory(story) {
    try {
      const id = story.id || `story_${Date.now()}`;
      const now = Math.floor(Date.now() / 1000);
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO interactive_stories (id, name, description, nodes, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        story.name,
        story.description || '',
        JSON.stringify(story.nodes),
        now
      );
      
      return id;
    } catch (error) {
      this.api.log(`Failed to save story: ${error.message}`, 'error');
      throw error;
    }
  }

  deleteStory(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM interactive_stories WHERE id = ?');
      stmt.run(id);
    } catch (error) {
      this.api.log(`Failed to delete story: ${error.message}`, 'error');
      throw error;
    }
  }

  startStory(storyId) {
    const story = this.getStory(storyId);
    if (!story) {
      throw new Error('Story not found');
    }

    this.currentStory = story;
    this.currentNode = story.nodes.find(n => n.isStart) || story.nodes[0];
    this.votes = {};

    this.api.log(`Started story: ${story.name}`, 'info');
    this.io.emit('interactive-story:started', {
      story: story.name,
      node: this.currentNode
    });

    // If node has choices, start voting timer
    if (this.currentNode.choices && this.currentNode.choices.length > 0) {
      this.startVoting();
    }
  }

  stopStory() {
    if (this.voteTimeout) {
      clearTimeout(this.voteTimeout);
      this.voteTimeout = null;
    }

    this.currentStory = null;
    this.currentNode = null;
    this.votes = {};

    this.io.emit('interactive-story:stopped');
    this.api.log('Stopped interactive story', 'info');
  }

  startVoting() {
    // Reset votes
    this.votes = {};
    this.currentNode.choices.forEach((_, index) => {
      this.votes[index] = 0;
    });

    const voteDuration = (this.currentNode.voteDuration || 30) * 1000;

    this.io.emit('interactive-story:voting-started', {
      node: this.currentNode,
      duration: voteDuration
    });

    // Auto-select choice after voting period
    if (this.voteTimeout) {
      clearTimeout(this.voteTimeout);
    }

    this.voteTimeout = setTimeout(() => {
      this.selectWinningChoice();
    }, voteDuration);
  }

  handleVote(data) {
    if (!this.currentStory || !this.currentNode) return;

    const choiceIndex = parseInt(data.choice);
    if (choiceIndex >= 0 && choiceIndex < this.currentNode.choices.length) {
      this.votes[choiceIndex] = (this.votes[choiceIndex] || 0) + 1;
      this.io.emit('interactive-story:votes-updated', this.votes);
    }
  }

  handleChat(data) {
    if (!this.currentStory || !this.currentNode) return;
    if (!this.currentNode.choices) return;

    const message = data.comment.toLowerCase().trim();
    
    // Check for vote commands (1, 2, 3, etc.)
    const voteMatch = message.match(/^[!\/]?(\d+)$/);
    if (voteMatch) {
      const choiceIndex = parseInt(voteMatch[1]) - 1;
      this.handleVote({ choice: choiceIndex });
    }

    // Check for choice keywords
    this.currentNode.choices.forEach((choice, index) => {
      if (choice.keywords) {
        choice.keywords.forEach(keyword => {
          if (message.includes(keyword.toLowerCase())) {
            this.handleVote({ choice: index });
          }
        });
      }
    });
  }

  handleGift(data) {
    if (!this.currentStory || !this.currentNode) return;
    if (!this.currentNode.choices) return;

    // Gifts count as multiple votes based on diamond value
    const voteWeight = Math.ceil(data.diamondCount / 10);
    
    // Check if gift name matches a choice keyword
    this.currentNode.choices.forEach((choice, index) => {
      if (choice.keywords) {
        choice.keywords.forEach(keyword => {
          if (data.giftName.toLowerCase().includes(keyword.toLowerCase())) {
            for (let i = 0; i < voteWeight; i++) {
              this.handleVote({ choice: index });
            }
          }
        });
      }
    });
  }

  selectWinningChoice() {
    if (!this.currentStory || !this.currentNode) return;

    // Find choice with most votes
    let winningChoice = 0;
    let maxVotes = 0;

    Object.entries(this.votes).forEach(([index, voteCount]) => {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningChoice = parseInt(index);
      }
    });

    this.makeChoice(winningChoice);
  }

  makeChoice(choiceIndex) {
    if (!this.currentStory || !this.currentNode) return;
    if (!this.currentNode.choices || choiceIndex >= this.currentNode.choices.length) return;

    const choice = this.currentNode.choices[choiceIndex];
    
    this.io.emit('interactive-story:choice-made', {
      choice: choice.text,
      index: choiceIndex,
      votes: this.votes
    });

    // Move to next node
    if (choice.nextNode) {
      const nextNode = this.currentStory.nodes.find(n => n.id === choice.nextNode);
      if (nextNode) {
        this.currentNode = nextNode;
        this.io.emit('interactive-story:node-changed', this.currentNode);

        // Start voting if new node has choices
        if (this.currentNode.choices && this.currentNode.choices.length > 0) {
          setTimeout(() => this.startVoting(), 2000);
        } else {
          // Story ended
          this.io.emit('interactive-story:ended', {
            endingText: this.currentNode.text
          });
        }
      }
    } else {
      // No next node, story ends
      this.io.emit('interactive-story:ended', {
        endingText: this.currentNode.text
      });
    }
  }

  async destroy() {
    this.api.log('Interactive Story plugin shutting down...', 'info');
    this.stopStory();
  }
}

module.exports = InteractiveStoryPlugin;
