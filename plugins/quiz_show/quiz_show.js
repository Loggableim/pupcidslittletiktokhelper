// Quiz Show Plugin - Client Side JavaScript
(function() {
    'use strict';

    // Socket.IO connection
    const socket = io();

    // State
    let currentState = {
        config: {},
        questions: [],
        leaderboard: [],
        gameState: {},
        stats: {}
    };

    let editingQuestionId = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        initializeTabs();
        initializeEventListeners();
        initializeSocketListeners();
        loadInitialState();
    });

    // Tab Navigation
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;

                // Remove active class from all
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to selected
                button.classList.add('active');
                document.getElementById(tabName).classList.add('active');
            });
        });
    }

    // Event Listeners
    function initializeEventListeners() {
        // Dashboard controls
        document.getElementById('startQuizBtn').addEventListener('click', startQuiz);
        document.getElementById('nextQuestionBtn').addEventListener('click', nextQuestion);
        document.getElementById('stopQuizBtn').addEventListener('click', stopQuiz);

        // Question management
        document.getElementById('addQuestionBtn').addEventListener('click', addQuestion);
        document.getElementById('updateQuestionBtn').addEventListener('click', updateQuestion);
        document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
        document.getElementById('uploadQuestionsBtn').addEventListener('click', uploadQuestions);
        document.getElementById('exportQuestionsBtn').addEventListener('click', exportQuestions);

        // Settings
        document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

        // Leaderboard
        document.getElementById('exportLeaderboardBtn').addEventListener('click', exportLeaderboard);
        document.getElementById('importLeaderboardBtn').addEventListener('click', () => {
            document.getElementById('importModal').classList.remove('hidden');
        });
        document.getElementById('resetLeaderboardBtn').addEventListener('click', resetLeaderboard);

        // Import modal
        document.getElementById('confirmImportBtn').addEventListener('click', importLeaderboard);
        document.getElementById('cancelImportBtn').addEventListener('click', () => {
            document.getElementById('importModal').classList.add('hidden');
        });
        document.querySelector('.modal-close').addEventListener('click', () => {
            document.getElementById('importModal').classList.add('hidden');
        });
    }

    // Socket.IO Listeners
    function initializeSocketListeners() {
        socket.on('connect', () => {
            document.getElementById('connectionStatus').textContent = 'Verbunden';
            document.getElementById('connectionStatus').className = 'status-badge status-connected';
        });

        socket.on('disconnect', () => {
            document.getElementById('connectionStatus').textContent = 'Getrennt';
            document.getElementById('connectionStatus').className = 'status-badge status-error';
        });

        socket.on('quiz-show:state-update', handleStateUpdate);
        socket.on('quiz-show:time-update', handleTimeUpdate);
        socket.on('quiz-show:round-ended', handleRoundEnded);
        socket.on('quiz-show:answer-received', handleAnswerReceived);
        socket.on('quiz-show:joker-activated', handleJokerActivated);
        socket.on('quiz-show:leaderboard-updated', handleLeaderboardUpdate);
        socket.on('quiz-show:questions-updated', handleQuestionsUpdate);
        socket.on('quiz-show:config-updated', handleConfigUpdate);
        socket.on('quiz-show:stopped', handleQuizStopped);
        socket.on('quiz-show:error', handleError);
    }

    // Load Initial State
    async function loadInitialState() {
        try {
            const response = await fetch('/api/quiz-show/state');
            const data = await response.json();

            if (data.success) {
                currentState = data;
                updateUI();
            }
        } catch (error) {
            console.error('Error loading state:', error);
            showMessage('Fehler beim Laden des Status', 'error');
        }
    }

    // Dashboard Functions
    function startQuiz() {
        socket.emit('quiz-show:start');
    }

    function nextQuestion() {
        socket.emit('quiz-show:next');
    }

    function stopQuiz() {
        if (confirm('Quiz wirklich stoppen?')) {
            socket.emit('quiz-show:stop');
        }
    }

    // Question Management
    async function addQuestion() {
        const question = document.getElementById('questionInput').value.trim();
        const answers = [
            document.getElementById('answerA').value.trim(),
            document.getElementById('answerB').value.trim(),
            document.getElementById('answerC').value.trim(),
            document.getElementById('answerD').value.trim()
        ];
        const correct = parseInt(document.getElementById('correctAnswer').value);

        if (!question || answers.some(a => !a)) {
            alert('Bitte alle Felder ausfüllen');
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answers, correct })
            });

            const data = await response.json();

            if (data.success) {
                clearQuestionForm();
                showMessage('Frage hinzugefügt', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error adding question:', error);
            showMessage('Fehler beim Hinzufügen', 'error');
        }
    }

    async function updateQuestion() {
        if (!editingQuestionId) return;

        const question = document.getElementById('questionInput').value.trim();
        const answers = [
            document.getElementById('answerA').value.trim(),
            document.getElementById('answerB').value.trim(),
            document.getElementById('answerC').value.trim(),
            document.getElementById('answerD').value.trim()
        ];
        const correct = parseInt(document.getElementById('correctAnswer').value);

        if (!question || answers.some(a => !a)) {
            alert('Bitte alle Felder ausfüllen');
            return;
        }

        try {
            const response = await fetch(`/api/quiz-show/questions/${editingQuestionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, answers, correct })
            });

            const data = await response.json();

            if (data.success) {
                clearQuestionForm();
                cancelEdit();
                showMessage('Frage aktualisiert', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error updating question:', error);
            showMessage('Fehler beim Aktualisieren', 'error');
        }
    }

    function editQuestion(questionId) {
        const question = currentState.questions.find(q => q.id === questionId);
        if (!question) return;

        editingQuestionId = questionId;

        document.getElementById('questionInput').value = question.question;
        document.getElementById('answerA').value = question.answers[0];
        document.getElementById('answerB').value = question.answers[1];
        document.getElementById('answerC').value = question.answers[2];
        document.getElementById('answerD').value = question.answers[3];
        document.getElementById('correctAnswer').value = question.correct;

        document.getElementById('addQuestionBtn').classList.add('hidden');
        document.getElementById('updateQuestionBtn').classList.remove('hidden');
        document.getElementById('cancelEditBtn').classList.remove('hidden');

        // Scroll to editor
        document.querySelector('#questions .panel').scrollIntoView({ behavior: 'smooth' });
    }

    async function deleteQuestion(questionId) {
        if (!confirm('Frage wirklich löschen?')) return;

        try {
            const response = await fetch(`/api/quiz-show/questions/${questionId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Frage gelöscht', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error deleting question:', error);
            showMessage('Fehler beim Löschen', 'error');
        }
    }

    function cancelEdit() {
        editingQuestionId = null;
        clearQuestionForm();

        document.getElementById('addQuestionBtn').classList.remove('hidden');
        document.getElementById('updateQuestionBtn').classList.add('hidden');
        document.getElementById('cancelEditBtn').classList.add('hidden');
    }

    function clearQuestionForm() {
        document.getElementById('questionInput').value = '';
        document.getElementById('answerA').value = '';
        document.getElementById('answerB').value = '';
        document.getElementById('answerC').value = '';
        document.getElementById('answerD').value = '';
        document.getElementById('correctAnswer').value = '0';
    }

    async function uploadQuestions() {
        const jsonText = document.getElementById('jsonUpload').value.trim();

        if (!jsonText) {
            alert('Bitte JSON eingeben');
            return;
        }

        try {
            const questions = JSON.parse(jsonText);

            const response = await fetch('/api/quiz-show/questions/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(questions)
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('jsonUpload').value = '';
                showMessage(`${data.added} Fragen hochgeladen`, 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error uploading questions:', error);
            alert('Ungültiges JSON Format');
        }
    }

    async function exportQuestions() {
        try {
            const response = await fetch('/api/quiz-show/questions/export');
            const questions = await response.json();

            const blob = new Blob([JSON.stringify(questions, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz-questions.json';
            a.click();
            URL.revokeObjectURL(url);

            showMessage('Fragen exportiert', 'success');
        } catch (error) {
            console.error('Error exporting questions:', error);
            showMessage('Fehler beim Exportieren', 'error');
        }
    }

    // Settings
    async function saveSettings() {
        const config = {
            roundDuration: parseInt(document.getElementById('roundDuration').value),
            pointsFirstCorrect: parseInt(document.getElementById('pointsFirstCorrect').value),
            pointsOtherCorrect: parseInt(document.getElementById('pointsOtherCorrect').value),
            multipleWinners: document.getElementById('multipleWinners').checked,
            showAnswersAfterTime: document.getElementById('showAnswersAfterTime').checked,
            shuffleAnswers: document.getElementById('shuffleAnswers').checked,
            randomQuestions: document.getElementById('randomQuestions').checked,
            joker50Enabled: document.getElementById('joker50Enabled').checked,
            jokerInfoEnabled: document.getElementById('jokerInfoEnabled').checked,
            jokerTimeEnabled: document.getElementById('jokerTimeEnabled').checked,
            jokerTimeBoost: parseInt(document.getElementById('jokerTimeBoost').value),
            jokersPerRound: parseInt(document.getElementById('jokersPerRound').value)
        };

        try {
            const response = await fetch('/api/quiz-show/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Einstellungen gespeichert', 'success', 'saveMessage');
            } else {
                showMessage('Fehler: ' + data.error, 'error', 'saveMessage');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showMessage('Fehler beim Speichern', 'error', 'saveMessage');
        }
    }

    // Leaderboard
    async function exportLeaderboard() {
        try {
            const response = await fetch('/api/quiz-show/leaderboard/export');
            const leaderboard = await response.json();

            const blob = new Blob([JSON.stringify(leaderboard, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz-leaderboard.json';
            a.click();
            URL.revokeObjectURL(url);

            showMessage('Leaderboard exportiert', 'success');
        } catch (error) {
            console.error('Error exporting leaderboard:', error);
            showMessage('Fehler beim Exportieren', 'error');
        }
    }

    async function importLeaderboard() {
        const jsonText = document.getElementById('importLeaderboardJson').value.trim();

        if (!jsonText) {
            alert('Bitte JSON eingeben');
            return;
        }

        try {
            const leaderboard = JSON.parse(jsonText);

            const response = await fetch('/api/quiz-show/leaderboard/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leaderboard)
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('importModal').classList.add('hidden');
                document.getElementById('importLeaderboardJson').value = '';
                showMessage(`${data.entries} Einträge importiert`, 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error importing leaderboard:', error);
            alert('Ungültiges JSON Format');
        }
    }

    async function resetLeaderboard() {
        if (!confirm('Leaderboard wirklich zurücksetzen? Alle Punkte gehen verloren!')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz-show/leaderboard/reset', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                showMessage('Leaderboard zurückgesetzt', 'success');
            } else {
                showMessage('Fehler: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Error resetting leaderboard:', error);
            showMessage('Fehler beim Zurücksetzen', 'error');
        }
    }

    // Socket Event Handlers
    function handleStateUpdate(state) {
        currentState.gameState = state;

        // Update UI
        if (state.isRunning) {
            document.getElementById('quizStatus').textContent = 'Läuft';
            document.getElementById('quizStatus').className = 'status-badge status-running';

            document.getElementById('startQuizBtn').disabled = true;
            document.getElementById('nextQuestionBtn').disabled = false;
            document.getElementById('stopQuizBtn').disabled = false;

            displayCurrentQuestion(state.currentQuestion);
            showTimer(state.timeRemaining, state.totalTime);
        }

        updateAnswerCount(state.answerCount || 0);
    }

    function handleTimeUpdate(data) {
        updateTimer(data.timeRemaining, data.totalTime);
    }

    function handleRoundEnded(data) {
        document.getElementById('quizStatus').textContent = 'Runde beendet';
        document.getElementById('quizStatus').className = 'status-badge status-idle';

        // Show correct answer
        highlightCorrectAnswer(data.correctAnswer.index);

        // Update statistics
        if (data.stats) {
            currentState.stats = data.stats;
            updateStatistics();
        }

        // Show results notification
        const correctCount = data.results.correctUsers.length;
        const totalCount = data.results.totalAnswers;
        showMessage(`Runde beendet: ${correctCount}/${totalCount} richtige Antworten`, 'success');
    }

    function handleAnswerReceived(data) {
        updateAnswerCount(data.totalAnswers);
    }

    function handleJokerActivated(joker) {
        addJokerEvent(joker);

        // Visual feedback
        if (joker.type === '50') {
            hideAnswers(joker.data.hiddenAnswers);
        } else if (joker.type === 'info') {
            markWrongAnswer(joker.data.revealedWrongAnswer);
        }
    }

    function handleLeaderboardUpdate(leaderboard) {
        currentState.leaderboard = leaderboard;
        updateLeaderboardTable();
    }

    function handleQuestionsUpdate(questions) {
        currentState.questions = questions;
        updateQuestionsList();
    }

    function handleConfigUpdate(config) {
        currentState.config = config;
        updateSettingsForm();
    }

    function handleQuizStopped() {
        document.getElementById('quizStatus').textContent = 'Gestoppt';
        document.getElementById('quizStatus').className = 'status-badge status-idle';

        document.getElementById('startQuizBtn').disabled = false;
        document.getElementById('nextQuestionBtn').disabled = true;
        document.getElementById('stopQuizBtn').disabled = true;

        hideQuestion();
        hideTimer();
    }

    function handleError(error) {
        showMessage('Fehler: ' + error.message, 'error');
    }

    // UI Update Functions
    function updateUI() {
        updateSettingsForm();
        updateQuestionsList();
        updateLeaderboardTable();
        updateStatistics();
    }

    function updateSettingsForm() {
        const config = currentState.config;

        document.getElementById('roundDuration').value = config.roundDuration || 30;
        document.getElementById('pointsFirstCorrect').value = config.pointsFirstCorrect || 100;
        document.getElementById('pointsOtherCorrect').value = config.pointsOtherCorrect || 50;
        document.getElementById('multipleWinners').checked = config.multipleWinners !== false;
        document.getElementById('showAnswersAfterTime').checked = config.showAnswersAfterTime || false;
        document.getElementById('shuffleAnswers').checked = config.shuffleAnswers || false;
        document.getElementById('randomQuestions').checked = config.randomQuestions !== false;
        document.getElementById('joker50Enabled').checked = config.joker50Enabled !== false;
        document.getElementById('jokerInfoEnabled').checked = config.jokerInfoEnabled !== false;
        document.getElementById('jokerTimeEnabled').checked = config.jokerTimeEnabled !== false;
        document.getElementById('jokerTimeBoost').value = config.jokerTimeBoost || 15;
        document.getElementById('jokersPerRound').value = config.jokersPerRound || 3;
    }

    function updateQuestionsList() {
        const questions = currentState.questions;
        const container = document.getElementById('questionsList');
        const countDisplay = document.getElementById('questionCount');

        countDisplay.textContent = `${questions.length} Fragen`;

        if (questions.length === 0) {
            container.innerHTML = '<p class="no-data">Keine Fragen vorhanden</p>';
            return;
        }

        container.innerHTML = questions.map((q, index) => `
            <div class="question-item" data-id="${q.id}">
                <div class="question-number">#${index + 1}</div>
                <div class="question-content">
                    <div class="question-text">${escapeHtml(q.question)}</div>
                    <div class="question-answers">
                        ${q.answers.map((ans, idx) => `
                            <span class="answer-badge ${idx === q.correct ? 'correct' : ''}">
                                ${String.fromCharCode(65 + idx)}: ${escapeHtml(ans)}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="question-actions">
                    <button class="btn-icon" onclick="window.quizShow.editQuestion(${q.id})" title="Bearbeiten">✏️</button>
                    <button class="btn-icon" onclick="window.quizShow.deleteQuestion(${q.id})" title="Löschen">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    function updateLeaderboardTable() {
        const leaderboard = currentState.leaderboard;
        const tbody = document.getElementById('leaderboardBody');

        if (leaderboard.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="no-data">Keine Einträge</td></tr>';
            return;
        }

        tbody.innerHTML = leaderboard.map((entry, index) => `
            <tr>
                <td class="rank">
                    ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </td>
                <td>${escapeHtml(entry.username)}</td>
                <td class="points">${entry.points}</td>
            </tr>
        `).join('');
    }

    function updateStatistics() {
        const stats = currentState.stats;

        document.getElementById('totalRounds').textContent = stats.totalRounds || 0;
        document.getElementById('totalCorrect').textContent = stats.totalCorrectAnswers || 0;

        const successRate = stats.totalAnswers > 0
            ? Math.round((stats.totalCorrectAnswers / stats.totalAnswers) * 100)
            : 0;
        document.getElementById('successRate').textContent = successRate + '%';
    }

    function displayCurrentQuestion(question) {
        const display = document.getElementById('currentQuestionDisplay');
        const optionsContainer = document.getElementById('answerOptions');

        display.innerHTML = `<p class="question-text">${escapeHtml(question.question)}</p>`;

        optionsContainer.innerHTML = question.answers.map((ans, idx) => `
            <div class="answer-option" data-index="${idx}">
                <span class="answer-letter">${String.fromCharCode(65 + idx)}</span>
                <span class="answer-text">${escapeHtml(ans)}</span>
            </div>
        `).join('');

        optionsContainer.classList.remove('hidden');
    }

    function hideQuestion() {
        const display = document.getElementById('currentQuestionDisplay');
        const optionsContainer = document.getElementById('answerOptions');

        display.innerHTML = '<p class="no-question">Keine Frage aktiv</p>';
        optionsContainer.classList.add('hidden');
    }

    function showTimer(seconds, total) {
        const timerDisplay = document.getElementById('timerDisplay');
        const timeRemaining = document.getElementById('timeRemaining');
        const timerBar = document.getElementById('timerBar');

        timerDisplay.classList.remove('hidden');
        timeRemaining.textContent = seconds;

        const percentage = (seconds / total) * 100;
        timerBar.style.width = percentage + '%';

        // Color coding
        if (percentage > 50) {
            timerBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        } else if (percentage > 20) {
            timerBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            timerBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
    }

    function updateTimer(seconds, total) {
        const timeRemaining = document.getElementById('timeRemaining');
        const timerBar = document.getElementById('timerBar');

        timeRemaining.textContent = seconds;

        const percentage = (seconds / total) * 100;
        timerBar.style.width = percentage + '%';

        // Color coding
        if (percentage > 50) {
            timerBar.style.background = 'linear-gradient(90deg, #10b981, #34d399)';
        } else if (percentage > 20) {
            timerBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            timerBar.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }
    }

    function hideTimer() {
        document.getElementById('timerDisplay').classList.add('hidden');
    }

    function updateAnswerCount(count) {
        document.getElementById('answerCount').textContent = count;
    }

    function highlightCorrectAnswer(index) {
        const options = document.querySelectorAll('.answer-option');
        if (options[index]) {
            options[index].classList.add('correct');
        }
    }

    function hideAnswers(indices) {
        const options = document.querySelectorAll('.answer-option');
        indices.forEach(idx => {
            if (options[idx]) {
                options[idx].classList.add('hidden-answer');
            }
        });
    }

    function markWrongAnswer(index) {
        const options = document.querySelectorAll('.answer-option');
        if (options[index]) {
            options[index].classList.add('wrong-hint');
        }
    }

    function addJokerEvent(joker) {
        const container = document.getElementById('jokerEvents');

        // Remove "no events" message if present
        const noEvents = container.querySelector('.no-events');
        if (noEvents) {
            noEvents.remove();
        }

        const jokerNames = {
            '50': '50:50 Joker',
            'info': 'Info Joker',
            'time': 'Zeit Joker'
        };

        const jokerIcons = {
            '50': '✂️',
            'info': '💡',
            'time': '⏰'
        };

        const event = document.createElement('div');
        event.className = 'joker-event';
        event.innerHTML = `
            <span class="joker-icon">${jokerIcons[joker.type]}</span>
            <span class="joker-info">
                <strong>${jokerNames[joker.type]}</strong> von ${escapeHtml(joker.username)}
            </span>
        `;

        container.insertBefore(event, container.firstChild);

        // Keep only last 5 events
        while (container.children.length > 5) {
            container.removeChild(container.lastChild);
        }
    }

    function showMessage(text, type = 'info', elementId = null) {
        if (elementId) {
            const element = document.getElementById(elementId);
            element.textContent = text;
            element.className = `message message-${type}`;
            element.classList.remove('hidden');

            setTimeout(() => {
                element.classList.add('hidden');
            }, 3000);
        } else {
            // Create floating notification
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.textContent = text;
            document.body.appendChild(notification);

            setTimeout(() => {
                notification.classList.add('show');
            }, 10);

            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Expose functions to window for onclick handlers
    window.quizShow = {
        editQuestion,
        deleteQuestion
    };
})();
