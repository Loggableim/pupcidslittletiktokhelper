const fs = require('fs').promises;
const path = require('path');

/**
 * WWM GPT Plugin - "Wer wird Millionär" Quizspiel mit GPT-5 Mini Integration
 */
class WWMGPTPlugin {
    constructor(api) {
        this.api = api;
        this.db = api.getDatabase();
        this.io = api.getSocketIO();

        // Pfade
        this.dataDir = path.join(__dirname, 'data');
        this.configPath = path.join(this.dataDir, 'config.json');
        this.questionsPath = path.join(this.dataDir, 'questions_cache.json');
        this.scoresPath = path.join(this.dataDir, 'scores.json');
        this.sessionPath = path.join(this.dataDir, 'session.json');
        this.jokerMapPath = path.join(this.dataDir, 'joker_map.json');
        this.communityQuestionsPath = path.join(this.dataDir, 'community_questions.json');

        // Game State
        this.gameState = {
            active: false,
            currentQuestion: null,
            questionIndex: 0,
            timer: null,
            timerRemaining: 15,
            answers: {},
            teams: {
                fuchs: { score: 0, members: [], answers: {} },
                cid: { score: 0, members: [], answers: {} }
            },
            jokers: {
                fuchs: { fiftyFifty: 0, extraTime: 0 },
                cid: { fiftyFifty: 0, extraTime: 0 }
            },
            usedJokers: { fiftyFifty: false },
            correctAnswer: null
        };

        // Default Config
        this.config = {
            gameplay: {
                timerDuration: 15,
                questionSource: 'gpt',
                difficulty: 'medium',
                pointsPerCorrect: 100,
                pointsPerWrong: -25,
                autoNextQuestion: true,
                autoNextDelay: 5
            },
            design: {
                theme: 'dark',
                primaryColor: '#4a90e2',
                secondaryColor: '#f39c12',
                backgroundColor: '#1a1a2e',
                fontFamily: 'Arial, sans-serif',
                fontSize: 18,
                animationType: 'slide',
                animationDuration: 500,
                showAvatars: true,
                backgroundImage: '',
                soundEffects: true
            },
            teams: {
                team1: { name: 'Team Fuchs', color: '#e74c3c', icon: '🦊' },
                team2: { name: 'Team Cid', color: '#3498db', icon: '🐺' }
            },
            jokers: {
                fiftyFifty: { giftId: 5655, enabled: true, animation: 'pulse' },
                extraTime: { giftId: 5827, enabled: true, seconds: 5, animation: 'glow' }
            },
            tts: {
                enabled: false,
                readQuestion: true,
                readAnswers: false,
                voice: 'de_001'
            },
            openai: {
                apiKey: '',
                model: 'gpt-4o-mini',
                temperature: 0.7,
                categories: ['Allgemeinwissen', 'Popkultur', 'Wissenschaft', 'Geschichte', 'Sport', 'Geographie']
            },
            moderation: {
                allowedModerators: [],
                commandPrefix: '!wwm',
                modsOnly: false
            }
        };

        // Scores & Questions Cache
        this.scores = {};
        this.questionsCache = [];
        this.jokerMap = {};
        this.communityQuestions = [];
    }

    async init() {
        this.api.log('WWM GPT Plugin initializing...', 'info');

        // Ensure data directory exists
        await this.ensureDataDir();

        // Load config and data
        await this.loadConfig();
        await this.loadScores();
        await this.loadQuestionsCache();
        await this.loadSession();
        await this.loadJokerMap();
        await this.loadCommunityQuestions();

        // Register routes and events
        this.registerRoutes();
        this.registerSocketEvents();
        this.registerTikTokEvents();

        this.api.log('WWM GPT Plugin initialized successfully', 'info');
    }

    async destroy() {
        this.api.log('WWM GPT Plugin shutting down...', 'info');

        // Save current state
        await this.saveSession();

        // Stop timer if running
        if (this.gameState.timer) {
            clearInterval(this.gameState.timer);
        }

        this.api.log('WWM GPT Plugin shut down', 'info');
    }

    async ensureDataDir() {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
        } catch (error) {
            this.api.log(`Failed to create data directory: ${error.message}`, 'error');
        }
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            this.config = { ...this.config, ...JSON.parse(data) };
        } catch (error) {
            // File doesn't exist, use defaults
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            this.api.log(`Failed to save config: ${error.message}`, 'error');
        }
    }

    async loadScores() {
        try {
            const data = await fs.readFile(this.scoresPath, 'utf8');
            this.scores = JSON.parse(data);
        } catch (error) {
            this.scores = {};
            await this.saveScores();
        }
    }

    async saveScores() {
        try {
            await fs.writeFile(this.scoresPath, JSON.stringify(this.scores, null, 2));
        } catch (error) {
            this.api.log(`Failed to save scores: ${error.message}`, 'error');
        }
    }

    async loadQuestionsCache() {
        try {
            const data = await fs.readFile(this.questionsPath, 'utf8');
            this.questionsCache = JSON.parse(data);
        } catch (error) {
            this.questionsCache = [];
            await this.saveQuestionsCache();
        }
    }

    async saveQuestionsCache() {
        try {
            await fs.writeFile(this.questionsPath, JSON.stringify(this.questionsCache, null, 2));
        } catch (error) {
            this.api.log(`Failed to save questions cache: ${error.message}`, 'error');
        }
    }

    async loadSession() {
        try {
            const data = await fs.readFile(this.sessionPath, 'utf8');
            const session = JSON.parse(data);
            // Only restore if game was active
            if (session.active) {
                this.gameState = { ...this.gameState, ...session };
                this.api.log('Previous game session restored', 'info');
            }
        } catch (error) {
            // No session to restore
        }
    }

    async saveSession() {
        try {
            await fs.writeFile(this.sessionPath, JSON.stringify(this.gameState, null, 2));
        } catch (error) {
            this.api.log(`Failed to save session: ${error.message}`, 'error');
        }
    }

    async loadJokerMap() {
        try {
            const data = await fs.readFile(this.jokerMapPath, 'utf8');
            this.jokerMap = JSON.parse(data);
        } catch (error) {
            this.jokerMap = {
                '5655': { type: 'fiftyFifty', name: 'Rose' },
                '5827': { type: 'extraTime', name: 'TikTok', seconds: 5 }
            };
            await this.saveJokerMap();
        }
    }

    async saveJokerMap() {
        try {
            await fs.writeFile(this.jokerMapPath, JSON.stringify(this.jokerMap, null, 2));
        } catch (error) {
            this.api.log(`Failed to save joker map: ${error.message}`, 'error');
        }
    }

    async loadCommunityQuestions() {
        try {
            const data = await fs.readFile(this.communityQuestionsPath, 'utf8');
            this.communityQuestions = JSON.parse(data);
        } catch (error) {
            this.communityQuestions = [];
            await this.saveCommunityQuestions();
        }
    }

    async saveCommunityQuestions() {
        try {
            await fs.writeFile(this.communityQuestionsPath, JSON.stringify(this.communityQuestions, null, 2));
        } catch (error) {
            this.api.log(`Failed to save community questions: ${error.message}`, 'error');
        }
    }

    registerRoutes() {
        // Config endpoints
        this.api.registerRoute('GET', '/api/wwm_gpt/config', (req, res) => {
            res.json({ success: true, config: this.config });
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/config', async (req, res) => {
            try {
                this.config = { ...this.config, ...req.body };
                await this.saveConfig();
                this.io.emit('wwm:config-update', this.config);
                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Game control endpoints
        this.api.registerRoute('POST', '/api/wwm_gpt/start', async (req, res) => {
            try {
                await this.startGame();
                res.json({ success: true, message: 'Game started' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/stop', async (req, res) => {
            try {
                await this.stopGame();
                res.json({ success: true, message: 'Game stopped' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/next', async (req, res) => {
            try {
                await this.nextQuestion();
                res.json({ success: true, message: 'Next question loaded' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/skip', async (req, res) => {
            try {
                await this.skipQuestion();
                res.json({ success: true, message: 'Question skipped' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // State endpoint
        this.api.registerRoute('GET', '/api/wwm_gpt/state', (req, res) => {
            res.json({
                success: true,
                state: {
                    active: this.gameState.active,
                    currentQuestion: this.gameState.currentQuestion,
                    timerRemaining: this.gameState.timerRemaining,
                    teams: this.gameState.teams,
                    scores: this.getTopScores(10)
                }
            });
        });

        // Questions endpoints
        this.api.registerRoute('POST', '/api/wwm_gpt/questions/generate', async (req, res) => {
            try {
                const { count = 10, difficulty, category } = req.body;
                const questions = await this.generateQuestions(count, difficulty, category);
                res.json({ success: true, count: questions.length, questions });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('GET', '/api/wwm_gpt/questions/cache', (req, res) => {
            res.json({ success: true, count: this.questionsCache.length, questions: this.questionsCache });
        });

        this.api.registerRoute('DELETE', '/api/wwm_gpt/questions/cache', async (req, res) => {
            try {
                this.questionsCache = [];
                await this.saveQuestionsCache();
                res.json({ success: true, message: 'Cache cleared' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Scores endpoints
        this.api.registerRoute('GET', '/api/wwm_gpt/scores', (req, res) => {
            const limit = parseInt(req.query.limit) || 10;
            res.json({ success: true, scores: this.getTopScores(limit) });
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/scores/reset', async (req, res) => {
            try {
                this.scores = {};
                await this.saveScores();
                this.io.emit('wwm:scores-reset');
                res.json({ success: true, message: 'Scores reset' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Moderation endpoints
        this.api.registerRoute('POST', '/api/wwm_gpt/mod/force-correct', async (req, res) => {
            try {
                const { team } = req.body;
                await this.forceCorrect(team);
                res.json({ success: true, message: `${team} marked correct` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/mod/bonus-points', async (req, res) => {
            try {
                const { username, points } = req.body;
                this.addScore(username, points);
                res.json({ success: true, message: `Added ${points} points to ${username}` });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Community questions
        this.api.registerRoute('POST', '/api/wwm_gpt/questions/community', async (req, res) => {
            try {
                const questions = req.body;
                if (!Array.isArray(questions)) {
                    return res.status(400).json({ success: false, error: 'Invalid format' });
                }
                this.communityQuestions.push(...questions);
                await this.saveCommunityQuestions();
                res.json({ success: true, count: questions.length });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Joker map
        this.api.registerRoute('GET', '/api/wwm_gpt/jokers', (req, res) => {
            res.json({ success: true, jokers: this.jokerMap });
        });

        this.api.registerRoute('POST', '/api/wwm_gpt/jokers', async (req, res) => {
            try {
                this.jokerMap = req.body;
                await this.saveJokerMap();
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Serve overlay
        this.api.registerRoute('GET', '/plugin/wwm_gpt/overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'overlay.html'));
        });

        // Serve settings UI
        this.api.registerRoute('GET', '/plugin/wwm_gpt/settings', (req, res) => {
            res.sendFile(path.join(__dirname, 'settings.html'));
        });
    }

    registerSocketEvents() {
        // Client requests current state
        this.api.registerSocket('wwm:get-state', () => {
            this.io.emit('wwm:state-update', this.getGameState());
        });

        // Admin controls
        this.api.registerSocket('wwm:start-game', async () => {
            await this.startGame();
        });

        this.api.registerSocket('wwm:stop-game', async () => {
            await this.stopGame();
        });

        this.api.registerSocket('wwm:next-question', async () => {
            await this.nextQuestion();
        });

        this.api.registerSocket('wwm:skip-question', async () => {
            await this.skipQuestion();
        });
    }

    registerTikTokEvents() {
        // Chat events for team join and answers
        this.api.registerTikTokEvent('chat', async (data) => {
            const message = data.message.toLowerCase().trim();
            const username = data.username;

            // Team join commands
            if (message === '!join fuchs' || message === '!team fuchs') {
                this.joinTeam(username, 'fuchs');
            } else if (message === '!join cid' || message === '!team cid') {
                this.joinTeam(username, 'cid');
            }

            // Answer commands (A, B, C, D)
            if (this.gameState.active && this.gameState.currentQuestion) {
                const answer = message.match(/^[abcd]$/i);
                if (answer) {
                    this.submitAnswer(username, answer[0].toUpperCase());
                }
            }

            // Mod commands
            if (message.startsWith(this.config.moderation.commandPrefix)) {
                await this.handleModCommand(username, message, data);
            }
        });

        // Gift events for jokers
        this.api.registerTikTokEvent('gift', async (data) => {
            if (!this.gameState.active) return;

            const giftId = data.giftId.toString();
            const joker = this.jokerMap[giftId];

            if (joker && this.config.jokers[joker.type]?.enabled) {
                const team = this.getUserTeam(data.username);
                if (team) {
                    await this.activateJoker(team, joker.type, data.username);
                }
            }
        });
    }

    async handleModCommand(username, message, data) {
        // Check if user is mod/broadcaster
        if (this.config.moderation.modsOnly) {
            const isMod = data.isModerator || data.isBroadcaster ||
                         this.config.moderation.allowedModerators.includes(username);
            if (!isMod) return;
        }

        const parts = message.split(' ');
        const command = parts[1]?.toLowerCase();

        switch (command) {
            case 'start':
                await this.startGame();
                break;
            case 'stop':
                await this.stopGame();
                break;
            case 'next':
                await this.nextQuestion();
                break;
            case 'skip':
                await this.skipQuestion();
                break;
            case 'reset':
                await this.resetGame();
                break;
        }
    }

    joinTeam(username, team) {
        // Remove from other team
        const otherTeam = team === 'fuchs' ? 'cid' : 'fuchs';
        this.gameState.teams[otherTeam].members = this.gameState.teams[otherTeam].members.filter(m => m !== username);

        // Add to new team
        if (!this.gameState.teams[team].members.includes(username)) {
            this.gameState.teams[team].members.push(username);
            this.io.emit('wwm:team-join', { username, team });
            this.api.log(`${username} joined ${team}`, 'info');
        }
    }

    getUserTeam(username) {
        if (this.gameState.teams.fuchs.members.includes(username)) return 'fuchs';
        if (this.gameState.teams.cid.members.includes(username)) return 'cid';
        return null;
    }

    submitAnswer(username, answer) {
        const team = this.getUserTeam(username);

        // Track individual answer
        this.gameState.answers[username] = answer;

        // Track team answer
        if (team) {
            if (!this.gameState.teams[team].answers[answer]) {
                this.gameState.teams[team].answers[answer] = 0;
            }
            this.gameState.teams[team].answers[answer]++;
        }

        this.io.emit('wwm:answer-submitted', { username, answer, team });
    }

    async activateJoker(team, type, username) {
        if (type === 'fiftyFifty' && !this.gameState.usedJokers.fiftyFifty) {
            this.gameState.usedJokers.fiftyFifty = true;
            const wrongAnswers = this.getFiftyFiftyWrongAnswers();
            this.io.emit('wwm:joker-activated', {
                team,
                type,
                username,
                data: { removedAnswers: wrongAnswers }
            });
            this.api.log(`${team} activated 50:50 joker via ${username}`, 'info');
        } else if (type === 'extraTime') {
            const extraSeconds = this.config.jokers.extraTime.seconds;
            this.gameState.timerRemaining += extraSeconds;
            this.io.emit('wwm:joker-activated', {
                team,
                type,
                username,
                data: { extraSeconds }
            });
            this.api.log(`${team} activated extra time (+${extraSeconds}s) via ${username}`, 'info');
        }
    }

    getFiftyFiftyWrongAnswers() {
        if (!this.gameState.currentQuestion) return [];

        const correct = this.gameState.correctAnswer;
        const answers = ['A', 'B', 'C', 'D'].filter(a => a !== correct);

        // Randomly select 2 wrong answers to remove
        const toRemove = [];
        while (toRemove.length < 2 && answers.length > 0) {
            const idx = Math.floor(Math.random() * answers.length);
            toRemove.push(answers[idx]);
            answers.splice(idx, 1);
        }

        return toRemove;
    }

    async startGame() {
        if (this.gameState.active) {
            this.api.log('Game already active', 'warn');
            return;
        }

        this.api.log('Starting WWM game...', 'info');
        this.gameState.active = true;
        this.gameState.questionIndex = 0;

        // Reset teams
        this.gameState.teams.fuchs.score = 0;
        this.gameState.teams.fuchs.answers = {};
        this.gameState.teams.cid.score = 0;
        this.gameState.teams.cid.answers = {};

        this.io.emit('wwm:game-started');

        await this.nextQuestion();
    }

    async stopGame() {
        if (!this.gameState.active) {
            this.api.log('Game not active', 'warn');
            return;
        }

        this.api.log('Stopping WWM game...', 'info');

        if (this.gameState.timer) {
            clearInterval(this.gameState.timer);
            this.gameState.timer = null;
        }

        this.gameState.active = false;
        this.io.emit('wwm:game-stopped', {
            finalScores: {
                fuchs: this.gameState.teams.fuchs.score,
                cid: this.gameState.teams.cid.score
            },
            topPlayers: this.getTopScores(10)
        });

        await this.saveSession();
    }

    async resetGame() {
        await this.stopGame();
        this.gameState.teams.fuchs.members = [];
        this.gameState.teams.cid.members = [];
        this.gameState.questionIndex = 0;
        this.io.emit('wwm:game-reset');
    }

    async nextQuestion() {
        if (!this.gameState.active) {
            this.api.log('Cannot load next question: game not active', 'warn');
            return;
        }

        // Clear timer
        if (this.gameState.timer) {
            clearInterval(this.gameState.timer);
            this.gameState.timer = null;
        }

        // Get next question
        const question = await this.getNextQuestion();
        if (!question) {
            this.api.log('No more questions available', 'error');
            await this.stopGame();
            return;
        }

        this.gameState.currentQuestion = question;
        this.gameState.correctAnswer = question.correct;
        this.gameState.answers = {};
        this.gameState.teams.fuchs.answers = {};
        this.gameState.teams.cid.answers = {};
        this.gameState.usedJokers = { fiftyFifty: false };
        this.gameState.timerRemaining = this.config.gameplay.timerDuration;

        // Emit question
        this.io.emit('wwm:question-start', {
            question: {
                text: question.question,
                answers: question.answers
            },
            index: this.gameState.questionIndex,
            timer: this.gameState.timerRemaining
        });

        // TTS
        if (this.config.tts.enabled) {
            await this.readQuestionTTS(question);
        }

        // Start timer
        this.startTimer();

        this.gameState.questionIndex++;
    }

    async skipQuestion() {
        this.api.log('Skipping current question', 'info');
        await this.nextQuestion();
    }

    async getNextQuestion() {
        // Try to get from cache first
        if (this.questionsCache.length > 0) {
            return this.questionsCache.shift();
        }

        // Try community questions
        if (this.communityQuestions.length > 0) {
            return this.communityQuestions.shift();
        }

        // Generate new questions
        if (this.config.gameplay.questionSource === 'gpt' && this.config.openai.apiKey) {
            const questions = await this.generateQuestions(5);
            if (questions.length > 0) {
                this.questionsCache.push(...questions);
                await this.saveQuestionsCache();
                return this.questionsCache.shift();
            }
        }

        return null;
    }

    async generateQuestions(count = 10, difficulty = null, category = null) {
        if (!this.config.openai.apiKey) {
            this.api.log('OpenAI API key not configured', 'error');
            return [];
        }

        difficulty = difficulty || this.config.gameplay.difficulty;
        const categories = category ? [category] : this.config.openai.categories;
        const categoryStr = categories.join(', ');

        const prompt = `Erstelle ${count} Multiple-Choice-Fragen im Stil von "Wer wird Millionär" auf Deutsch mit jeweils 4 Antworten.
Schwierigkeitsgrad: ${difficulty}
Kategorien: ${categoryStr}

Format (JSON):
[
  {
    "question": "Frage?",
    "answers": {
      "A": "Antwort 1",
      "B": "Antwort 2",
      "C": "Antwort 3",
      "D": "Antwort 4"
    },
    "correct": "A",
    "category": "Kategorie",
    "difficulty": "${difficulty}"
  }
]

Gib NUR das JSON-Array zurück, ohne zusätzlichen Text.`;

        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.openai.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.openai.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'Du bist ein Quizmaster der hochwertige Multiple-Choice-Fragen erstellt. Antworte nur mit validen JSON.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: this.config.openai.temperature,
                    max_tokens: 2000
                })
            });

            const data = await response.json();
            const content = data.choices[0].message.content.trim();

            // Extract JSON from response (might have markdown code blocks)
            let jsonStr = content;
            const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1];
            }

            const questions = JSON.parse(jsonStr);

            this.api.log(`Generated ${questions.length} questions via GPT`, 'info');

            // Add to cache
            this.questionsCache.push(...questions);
            await this.saveQuestionsCache();

            return questions;

        } catch (error) {
            this.api.log(`Failed to generate questions: ${error.message}`, 'error');
            return [];
        }
    }

    startTimer() {
        this.gameState.timer = setInterval(() => {
            this.gameState.timerRemaining--;

            this.io.emit('wwm:timer-tick', {
                remaining: this.gameState.timerRemaining
            });

            if (this.gameState.timerRemaining <= 0) {
                clearInterval(this.gameState.timer);
                this.gameState.timer = null;
                this.evaluateAnswers();
            }
        }, 1000);
    }

    evaluateAnswers() {
        const correct = this.gameState.correctAnswer;
        const teamFuchsAnswers = this.gameState.teams.fuchs.answers;
        const teamCidAnswers = this.gameState.teams.cid.answers;

        // Determine team answers by majority vote
        const fuchsAnswer = this.getMajorityAnswer(teamFuchsAnswers);
        const cidAnswer = this.getMajorityAnswer(teamCidAnswers);

        const fuchsCorrect = fuchsAnswer === correct;
        const cidCorrect = cidAnswer === correct;

        // Update team scores
        if (fuchsCorrect) {
            this.gameState.teams.fuchs.score += this.config.gameplay.pointsPerCorrect;
        } else if (fuchsAnswer) {
            this.gameState.teams.fuchs.score += this.config.gameplay.pointsPerWrong;
        }

        if (cidCorrect) {
            this.gameState.teams.cid.score += this.config.gameplay.pointsPerCorrect;
        } else if (cidAnswer) {
            this.gameState.teams.cid.score += this.config.gameplay.pointsPerWrong;
        }

        // Update individual scores
        for (const [username, answer] of Object.entries(this.gameState.answers)) {
            const isCorrect = answer === correct;
            const points = isCorrect ? this.config.gameplay.pointsPerCorrect : this.config.gameplay.pointsPerWrong;
            this.addScore(username, points);
        }

        // Calculate answer distribution
        const distribution = this.calculateAnswerDistribution();

        // Emit results
        this.io.emit('wwm:question-end', {
            correctAnswer: correct,
            teamResults: {
                fuchs: { answer: fuchsAnswer, correct: fuchsCorrect, score: this.gameState.teams.fuchs.score },
                cid: { answer: cidAnswer, correct: cidCorrect, score: this.gameState.teams.cid.score }
            },
            distribution,
            topPlayers: this.getTopScores(5)
        });

        // Auto next question
        if (this.config.gameplay.autoNextQuestion) {
            setTimeout(() => {
                if (this.gameState.active) {
                    this.nextQuestion();
                }
            }, this.config.gameplay.autoNextDelay * 1000);
        }
    }

    getMajorityAnswer(answers) {
        if (Object.keys(answers).length === 0) return null;

        return Object.entries(answers).reduce((a, b) =>
            answers[a[0]] > answers[b[0]] ? a : b
        )[0];
    }

    calculateAnswerDistribution() {
        const total = Object.keys(this.gameState.answers).length;
        const distribution = { A: 0, B: 0, C: 0, D: 0 };

        for (const answer of Object.values(this.gameState.answers)) {
            distribution[answer]++;
        }

        // Convert to percentages
        for (const key in distribution) {
            distribution[key] = total > 0 ? Math.round((distribution[key] / total) * 100) : 0;
        }

        // Team distributions
        const teamDistribution = {
            fuchs: { ...this.gameState.teams.fuchs.answers },
            cid: { ...this.gameState.teams.cid.answers }
        };

        return { overall: distribution, teams: teamDistribution };
    }

    addScore(username, points) {
        if (!this.scores[username]) {
            this.scores[username] = { username, score: 0, correct: 0, wrong: 0 };
        }

        this.scores[username].score += points;

        if (points > 0) {
            this.scores[username].correct++;
        } else if (points < 0) {
            this.scores[username].wrong++;
        }

        this.saveScores();
    }

    getTopScores(limit = 10) {
        return Object.values(this.scores)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    async forceCorrect(team) {
        if (!this.gameState.active || !this.gameState.currentQuestion) {
            return;
        }

        this.gameState.teams[team].score += this.config.gameplay.pointsPerCorrect;

        this.io.emit('wwm:force-correct', { team, score: this.gameState.teams[team].score });

        this.api.log(`Moderator forced correct answer for ${team}`, 'info');
    }

    async readQuestionTTS(question) {
        try {
            let text = question.question;

            if (this.config.tts.readAnswers) {
                text += '. A: ' + question.answers.A;
                text += '. B: ' + question.answers.B;
                text += '. C: ' + question.answers.C;
                text += '. D: ' + question.answers.D;
            }

            // Emit TTS request (will be handled by TTS plugin if enabled)
            this.io.emit('tts:speak', {
                username: 'WWM',
                text,
                voice: this.config.tts.voice,
                priority: true
            });
        } catch (error) {
            this.api.log(`TTS failed: ${error.message}`, 'error');
        }
    }

    getGameState() {
        return {
            active: this.gameState.active,
            currentQuestion: this.gameState.currentQuestion ? {
                text: this.gameState.currentQuestion.question,
                answers: this.gameState.currentQuestion.answers
            } : null,
            questionIndex: this.gameState.questionIndex,
            timerRemaining: this.gameState.timerRemaining,
            teams: {
                fuchs: {
                    name: this.config.teams.team1.name,
                    color: this.config.teams.team1.color,
                    icon: this.config.teams.team1.icon,
                    score: this.gameState.teams.fuchs.score,
                    memberCount: this.gameState.teams.fuchs.members.length,
                    answers: this.gameState.teams.fuchs.answers
                },
                cid: {
                    name: this.config.teams.team2.name,
                    color: this.config.teams.team2.color,
                    icon: this.config.teams.team2.icon,
                    score: this.gameState.teams.cid.score,
                    memberCount: this.gameState.teams.cid.members.length,
                    answers: this.gameState.teams.cid.answers
                }
            },
            jokers: this.gameState.jokers,
            usedJokers: this.gameState.usedJokers,
            config: this.config.design
        };
    }
}

module.exports = WWMGPTPlugin;
