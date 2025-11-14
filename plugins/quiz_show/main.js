class QuizShowPlugin {
    constructor(api) {
        this.api = api;

        // Plugin configuration
        this.config = {
            roundDuration: 30,
            pointsFirstCorrect: 100,
            pointsOtherCorrect: 50,
            showAnswersAfterTime: true,
            multipleWinners: true,
            shuffleAnswers: false,
            randomQuestions: true,
            joker50Enabled: true,
            jokerInfoEnabled: true,
            jokerTimeEnabled: true,
            jokerTimeBoost: 15,
            jokersPerRound: 3
        };

        // Question database
        this.questions = [];

        // Leaderboard
        this.leaderboard = new Map();

        // Current game state
        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1,
            startTime: null,
            endTime: null,
            timeRemaining: 0,
            answers: new Map(), // userId -> {answer, timestamp}
            correctUsers: [],
            roundState: 'idle', // idle, running, ended
            jokersUsed: {
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [], // For 50:50 joker
            revealedWrongAnswer: null // For info joker
        };

        // Timer interval
        this.timerInterval = null;

        // Statistics
        this.stats = {
            totalRounds: 0,
            totalAnswers: 0,
            totalCorrectAnswers: 0
        };
    }

    async init() {
        this.api.log('Quiz Show Plugin initializing...', 'info');

        // Load saved data
        await this.loadData();

        // Register routes
        this.registerRoutes();

        // Register Socket.IO events
        this.registerSocketEvents();

        // Register TikTok event handlers
        this.registerTikTokEvents();

        this.api.log('Quiz Show Plugin initialized successfully', 'info');
    }

    async loadData() {
        try {
            // Load configuration
            const savedConfig = this.api.getConfig('config');
            if (savedConfig) {
                this.config = { ...this.config, ...savedConfig };
            }

            // Load questions
            const savedQuestions = this.api.getConfig('questions');
            if (savedQuestions) {
                this.questions = savedQuestions;
            }

            // Load leaderboard
            const savedLeaderboard = this.api.getConfig('leaderboard');
            if (savedLeaderboard) {
                this.leaderboard = new Map(Object.entries(savedLeaderboard));
            }

            // Load statistics
            const savedStats = this.api.getConfig('stats');
            if (savedStats) {
                this.stats = { ...this.stats, ...savedStats };
            }

            this.api.log(`Loaded ${this.questions.length} questions and ${this.leaderboard.size} leaderboard entries`, 'info');
        } catch (error) {
            this.api.log('Error loading data: ' + error.message, 'error');
        }
    }

    async saveData() {
        try {
            await this.api.setConfig('config', this.config);
            await this.api.setConfig('questions', this.questions);
            await this.api.setConfig('leaderboard', Object.fromEntries(this.leaderboard));
            await this.api.setConfig('stats', this.stats);
        } catch (error) {
            this.api.log('Error saving data: ' + error.message, 'error');
        }
    }

    registerRoutes() {
        const path = require('path');

        // Serve UI HTML files
        this.api.registerRoute('get', '/quiz-show/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.html'));
        });

        this.api.registerRoute('get', '/quiz-show/overlay', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.html'));
        });

        // Serve static assets
        this.api.registerRoute('get', '/quiz-show/quiz_show.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.js'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show.css'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.js', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.js'));
        });

        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.css', (req, res) => {
            res.sendFile(path.join(__dirname, 'quiz_show_overlay.css'));
        });

        // Get current state
        this.api.registerRoute('get', '/api/quiz-show/state', (req, res) => {
            res.json({
                success: true,
                config: this.config,
                questions: this.questions,
                leaderboard: Array.from(this.leaderboard.entries()).map(([userId, data]) => ({
                    userId,
                    username: data.username,
                    points: data.points
                })).sort((a, b) => b.points - a.points),
                gameState: {
                    ...this.gameState,
                    answers: Array.from(this.gameState.answers.entries())
                },
                stats: this.stats
            });
        });

        // Update configuration
        this.api.registerRoute('post', '/api/quiz-show/config', async (req, res) => {
            try {
                this.config = { ...this.config, ...req.body };
                await this.saveData();

                // Broadcast config update
                this.api.emit('quiz-show:config-updated', this.config);

                res.json({ success: true, config: this.config });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add question
        this.api.registerRoute('post', '/api/quiz-show/questions', async (req, res) => {
            try {
                const { question, answers, correct } = req.body;

                if (!question || !answers || answers.length !== 4 || correct === undefined) {
                    return res.status(400).json({ success: false, error: 'Invalid question format' });
                }

                const newQuestion = {
                    id: Date.now() + Math.random(),
                    question,
                    answers,
                    correct: parseInt(correct)
                };

                this.questions.push(newQuestion);
                await this.saveData();

                this.api.emit('quiz-show:questions-updated', this.questions);

                res.json({ success: true, question: newQuestion });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update question
        this.api.registerRoute('put', '/api/quiz-show/questions/:id', async (req, res) => {
            try {
                const questionId = parseFloat(req.params.id);
                const { question, answers, correct } = req.body;

                const index = this.questions.findIndex(q => q.id === questionId);
                if (index === -1) {
                    return res.status(404).json({ success: false, error: 'Question not found' });
                }

                this.questions[index] = {
                    ...this.questions[index],
                    question,
                    answers,
                    correct: parseInt(correct)
                };

                await this.saveData();
                this.api.emit('quiz-show:questions-updated', this.questions);

                res.json({ success: true, question: this.questions[index] });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete question
        this.api.registerRoute('delete', '/api/quiz-show/questions/:id', async (req, res) => {
            try {
                const questionId = parseFloat(req.params.id);
                const index = this.questions.findIndex(q => q.id === questionId);

                if (index === -1) {
                    return res.status(404).json({ success: false, error: 'Question not found' });
                }

                this.questions.splice(index, 1);
                await this.saveData();

                this.api.emit('quiz-show:questions-updated', this.questions);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Upload questions (JSON)
        this.api.registerRoute('post', '/api/quiz-show/questions/upload', async (req, res) => {
            try {
                const uploadedQuestions = req.body;

                if (!Array.isArray(uploadedQuestions)) {
                    return res.status(400).json({ success: false, error: 'Invalid format: expected array' });
                }

                // Validate and add IDs
                const validQuestions = uploadedQuestions.filter(q =>
                    q.question && q.answers && q.answers.length === 4 && q.correct !== undefined
                ).map(q => ({
                    id: Date.now() + Math.random(),
                    question: q.question,
                    answers: q.answers,
                    correct: parseInt(q.correct)
                }));

                this.questions.push(...validQuestions);
                await this.saveData();

                this.api.emit('quiz-show:questions-updated', this.questions);

                res.json({
                    success: true,
                    added: validQuestions.length,
                    total: this.questions.length
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export questions
        this.api.registerRoute('get', '/api/quiz-show/questions/export', (req, res) => {
            res.json(this.questions.map(q => ({
                question: q.question,
                answers: q.answers,
                correct: q.correct
            })));
        });

        // Reset leaderboard
        this.api.registerRoute('post', '/api/quiz-show/leaderboard/reset', async (req, res) => {
            try {
                this.leaderboard.clear();
                await this.saveData();

                this.api.emit('quiz-show:leaderboard-updated', []);

                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export leaderboard
        this.api.registerRoute('get', '/api/quiz-show/leaderboard/export', (req, res) => {
            const data = Array.from(this.leaderboard.entries()).map(([userId, data]) => ({
                userId,
                username: data.username,
                points: data.points
            }));
            res.json(data);
        });

        // Import leaderboard
        this.api.registerRoute('post', '/api/quiz-show/leaderboard/import', async (req, res) => {
            try {
                const data = req.body;

                if (!Array.isArray(data)) {
                    return res.status(400).json({ success: false, error: 'Invalid format' });
                }

                this.leaderboard.clear();
                data.forEach(entry => {
                    if (entry.userId && entry.username !== undefined && entry.points !== undefined) {
                        this.leaderboard.set(entry.userId, {
                            username: entry.username,
                            points: entry.points
                        });
                    }
                });

                await this.saveData();

                const leaderboardData = Array.from(this.leaderboard.entries()).map(([userId, data]) => ({
                    userId,
                    username: data.username,
                    points: data.points
                })).sort((a, b) => b.points - a.points);

                this.api.emit('quiz-show:leaderboard-updated', leaderboardData);

                res.json({ success: true, entries: this.leaderboard.size });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    registerSocketEvents() {
        // Start quiz
        this.api.registerSocket('quiz-show:start', async (socket, data) => {
            try {
                if (this.gameState.isRunning) {
                    socket.emit('quiz-show:error', { message: 'Quiz already running' });
                    return;
                }

                if (this.questions.length === 0) {
                    socket.emit('quiz-show:error', { message: 'No questions available' });
                    return;
                }

                await this.startRound();
                socket.emit('quiz-show:started', { success: true });
            } catch (error) {
                this.api.log('Error starting quiz: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });

        // Next question
        this.api.registerSocket('quiz-show:next', async (socket, data) => {
            try {
                if (this.gameState.isRunning) {
                    await this.endRound();
                }

                await this.startRound();
                socket.emit('quiz-show:next', { success: true });
            } catch (error) {
                this.api.log('Error going to next question: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });

        // Stop quiz
        this.api.registerSocket('quiz-show:stop', async (socket, data) => {
            try {
                if (!this.gameState.isRunning) {
                    socket.emit('quiz-show:error', { message: 'Quiz not running' });
                    return;
                }

                await this.endRound();
                this.resetGameState();

                this.api.emit('quiz-show:stopped', {});
                socket.emit('quiz-show:stopped', { success: true });
            } catch (error) {
                this.api.log('Error stopping quiz: ' + error.message, 'error');
                socket.emit('quiz-show:error', { message: error.message });
            }
        });
    }

    registerTikTokEvents() {
        // Handle chat messages for answers and jokers
        this.api.registerTikTokEvent('chat', async (data) => {
            if (!this.gameState.isRunning) {
                return;
            }

            const userId = data.uniqueId || data.nickname || data.userId;
            const username = data.nickname || data.username || userId;
            const message = (data.message || data.comment || '').trim();
            const isSuperFan = data.teamMemberLevel >= 1 || data.isSubscriber;

            // Check for joker commands (only superfans)
            if (isSuperFan && message.toLowerCase().startsWith('!joker')) {
                this.handleJokerCommand(userId, username, message);
                return;
            }

            // Check for answers
            this.handleAnswer(userId, username, message);
        });
    }

    async startRound() {
        // Select question
        let questionIndex;
        if (this.config.randomQuestions) {
            // Random selection
            const availableIndices = this.questions.map((_, i) => i);
            questionIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        } else {
            // Sequential
            questionIndex = (this.gameState.currentQuestionIndex + 1) % this.questions.length;
        }

        const question = this.questions[questionIndex];

        // Prepare answers (shuffle if configured)
        let answers = [...question.answers];
        let correctIndex = question.correct;

        if (this.config.shuffleAnswers) {
            // Create mapping for shuffling
            const answerMapping = answers.map((ans, idx) => ({ ans, originalIdx: idx }));

            // Fisher-Yates shuffle
            for (let i = answerMapping.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [answerMapping[i], answerMapping[j]] = [answerMapping[j], answerMapping[i]];
            }

            answers = answerMapping.map(item => item.ans);
            correctIndex = answerMapping.findIndex(item => item.originalIdx === question.correct);
        }

        // Update game state
        this.gameState = {
            isRunning: true,
            currentQuestion: {
                ...question,
                answers,
                correct: correctIndex
            },
            currentQuestionIndex: questionIndex,
            startTime: Date.now(),
            endTime: Date.now() + (this.config.roundDuration * 1000),
            timeRemaining: this.config.roundDuration,
            answers: new Map(),
            correctUsers: [],
            roundState: 'running',
            jokersUsed: {
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [],
            revealedWrongAnswer: null
        };

        // Start timer
        this.startTimer();

        // Broadcast to overlay and UI
        this.broadcastGameState();

        this.api.log(`Round started with question: ${question.question}`, 'info');
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.ceil((this.gameState.endTime - now) / 1000));

            this.gameState.timeRemaining = remaining;

            // Broadcast time update
            this.api.emit('quiz-show:time-update', {
                timeRemaining: remaining,
                totalTime: this.config.roundDuration
            });

            // End round when time is up
            if (remaining <= 0) {
                this.endRound();
            }
        }, 100);
    }

    async endRound() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        this.gameState.roundState = 'ended';
        this.gameState.isRunning = false;

        // Calculate results
        const results = this.calculateResults();

        // Update statistics
        this.stats.totalRounds++;
        this.stats.totalAnswers += this.gameState.answers.size;
        this.stats.totalCorrectAnswers += results.correctUsers.length;

        await this.saveData();

        // Broadcast results
        this.api.emit('quiz-show:round-ended', {
            question: this.gameState.currentQuestion,
            correctAnswer: this.gameState.currentQuestion.correct,
            results,
            stats: this.stats
        });

        this.api.log(`Round ended. Correct answers: ${results.correctUsers.length}/${this.gameState.answers.size}`, 'info');
    }

    calculateResults() {
        const correctAnswerIndex = this.gameState.currentQuestion.correct;
        const correctAnswerText = this.gameState.currentQuestion.answers[correctAnswerIndex];

        const correctUsers = [];
        const answers = Array.from(this.gameState.answers.entries());

        // Sort by timestamp
        answers.sort((a, b) => a[1].timestamp - b[1].timestamp);

        // Find correct answers
        for (const [userId, answerData] of answers) {
            if (this.isAnswerCorrect(answerData.answer, correctAnswerIndex, correctAnswerText)) {
                correctUsers.push({
                    userId,
                    username: answerData.username,
                    timestamp: answerData.timestamp,
                    answer: answerData.answer
                });
            }
        }

        // Award points
        if (correctUsers.length > 0) {
            // First correct answer
            const firstUser = correctUsers[0];
            this.addPoints(firstUser.userId, firstUser.username, this.config.pointsFirstCorrect);

            // Other correct answers (if multiple winners enabled)
            if (this.config.multipleWinners && correctUsers.length > 1) {
                for (let i = 1; i < correctUsers.length; i++) {
                    const user = correctUsers[i];
                    this.addPoints(user.userId, user.username, this.config.pointsOtherCorrect);
                }
            }
        }

        return {
            correctUsers,
            totalAnswers: this.gameState.answers.size,
            correctAnswer: {
                index: correctAnswerIndex,
                text: correctAnswerText
            }
        };
    }

    isAnswerCorrect(answer, correctIndex, correctText) {
        const normalized = answer.toLowerCase().trim();

        // Check letter (A, B, C, D)
        const letters = ['a', 'b', 'c', 'd'];
        if (normalized === letters[correctIndex]) {
            return true;
        }

        // Check full text match
        if (normalized === correctText.toLowerCase().trim()) {
            return true;
        }

        return false;
    }

    addPoints(userId, username, points) {
        const current = this.leaderboard.get(userId) || { username, points: 0 };
        current.points += points;
        current.username = username; // Update username in case it changed

        this.leaderboard.set(userId, current);

        // Broadcast leaderboard update
        const leaderboardData = Array.from(this.leaderboard.entries())
            .map(([userId, data]) => ({
                userId,
                username: data.username,
                points: data.points
            }))
            .sort((a, b) => b.points - a.points);

        this.api.emit('quiz-show:leaderboard-updated', leaderboardData);

        // Broadcast specific user point gain
        this.api.emit('quiz-show:points-awarded', {
            userId,
            username,
            points,
            totalPoints: current.points
        });
    }

    handleAnswer(userId, username, message) {
        // Check if user already answered
        if (this.gameState.answers.has(userId)) {
            return;
        }

        const normalized = message.toLowerCase().trim();

        // Check if it's a valid answer (A/B/C/D or full text)
        const validLetters = ['a', 'b', 'c', 'd'];
        const isLetter = validLetters.includes(normalized);
        const isFullText = this.gameState.currentQuestion.answers.some(
            ans => ans.toLowerCase().trim() === normalized
        );

        if (!isLetter && !isFullText) {
            return;
        }

        // Record answer
        this.gameState.answers.set(userId, {
            answer: message,
            username,
            timestamp: Date.now()
        });

        // Broadcast answer count update
        this.api.emit('quiz-show:answer-received', {
            userId,
            username,
            totalAnswers: this.gameState.answers.size
        });
    }

    handleJokerCommand(userId, username, message) {
        const command = message.toLowerCase().trim();

        // Check joker limits
        const totalJokers = this.gameState.jokersUsed['50'] +
                          this.gameState.jokersUsed['info'] +
                          this.gameState.jokersUsed['time'];

        if (totalJokers >= this.config.jokersPerRound) {
            return;
        }

        let jokerType = null;
        let jokerData = null;

        if (command === '!joker50' && this.config.joker50Enabled && this.gameState.jokersUsed['50'] === 0) {
            // 50:50 Joker
            jokerType = '50';
            jokerData = this.activate5050Joker();
            this.gameState.jokersUsed['50']++;
        } else if (command === '!jokerinfo' && this.config.jokerInfoEnabled && this.gameState.jokersUsed['info'] === 0) {
            // Info Joker
            jokerType = 'info';
            jokerData = this.activateInfoJoker();
            this.gameState.jokersUsed['info']++;
        } else if (command === '!jokertime' && this.config.jokerTimeEnabled && this.gameState.jokersUsed['time'] === 0) {
            // Time Joker
            jokerType = 'time';
            jokerData = this.activateTimeJoker();
            this.gameState.jokersUsed['time']++;
        }

        if (jokerType) {
            const jokerEvent = {
                type: jokerType,
                userId,
                username,
                timestamp: Date.now(),
                data: jokerData
            };

            this.gameState.jokerEvents.push(jokerEvent);

            // Broadcast joker activation
            this.api.emit('quiz-show:joker-activated', jokerEvent);

            this.api.log(`Joker ${jokerType} activated by ${username}`, 'info');
        }
    }

    activate5050Joker() {
        const correctIndex = this.gameState.currentQuestion.correct;
        const wrongIndices = [0, 1, 2, 3].filter(i => i !== correctIndex);

        // Remove 2 wrong answers
        const toHide = [];
        for (let i = 0; i < 2 && wrongIndices.length > 0; i++) {
            const randomIdx = Math.floor(Math.random() * wrongIndices.length);
            toHide.push(wrongIndices[randomIdx]);
            wrongIndices.splice(randomIdx, 1);
        }

        this.gameState.hiddenAnswers = toHide;

        return { hiddenAnswers: toHide };
    }

    activateInfoJoker() {
        const correctIndex = this.gameState.currentQuestion.correct;
        const wrongIndices = [0, 1, 2, 3].filter(i =>
            i !== correctIndex && !this.gameState.hiddenAnswers.includes(i)
        );

        if (wrongIndices.length > 0) {
            const wrongIndex = wrongIndices[Math.floor(Math.random() * wrongIndices.length)];
            this.gameState.revealedWrongAnswer = wrongIndex;

            return { revealedWrongAnswer: wrongIndex };
        }

        return null;
    }

    activateTimeJoker() {
        const boost = this.config.jokerTimeBoost;
        this.gameState.endTime += boost * 1000;

        return { timeBoost: boost };
    }

    broadcastGameState() {
        const state = {
            isRunning: this.gameState.isRunning,
            roundState: this.gameState.roundState,
            currentQuestion: {
                question: this.gameState.currentQuestion.question,
                answers: this.gameState.currentQuestion.answers,
                // Don't send correct answer to overlay yet
            },
            timeRemaining: this.gameState.timeRemaining,
            totalTime: this.config.roundDuration,
            answerCount: this.gameState.answers.size,
            jokersUsed: this.gameState.jokersUsed,
            jokerEvents: this.gameState.jokerEvents,
            hiddenAnswers: this.gameState.hiddenAnswers,
            revealedWrongAnswer: this.gameState.revealedWrongAnswer
        };

        this.api.emit('quiz-show:state-update', state);
    }

    resetGameState() {
        this.gameState = {
            isRunning: false,
            currentQuestion: null,
            currentQuestionIndex: -1,
            startTime: null,
            endTime: null,
            timeRemaining: 0,
            answers: new Map(),
            correctUsers: [],
            roundState: 'idle',
            jokersUsed: {
                '50': 0,
                'info': 0,
                'time': 0
            },
            jokerEvents: [],
            hiddenAnswers: [],
            revealedWrongAnswer: null
        };
    }

    async destroy() {
        // Cleanup
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        await this.saveData();

        this.api.log('Quiz Show Plugin destroyed', 'info');
    }
}

module.exports = QuizShowPlugin;
