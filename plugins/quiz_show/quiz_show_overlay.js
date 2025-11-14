// ============================================
// Quiz Show Overlay - Professional HUD System
// Vollständig konfigurierbar mit Drag & Drop
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION & STATE
    // ============================================

    const socket = io();

    // State Machine States
    const States = {
        IDLE: 'idle',
        QUESTION_INTRO: 'question_intro',
        RUNNING: 'running',
        TIME_LOW: 'time_low',
        TIME_UP: 'time_up',
        REVEAL_CORRECT: 'reveal_correct',
        WAIT_NEXT: 'wait_next'
    };

    let currentState = States.IDLE;
    let stateTimeout = null;

    // Game Data
    let gameData = {
        question: null,
        answers: [],
        correctIndex: null,
        timeRemaining: 0,
        totalTime: 30,
        hiddenAnswers: [],
        revealedWrongAnswer: null
    };

    // HUD Configuration (loaded from server)
    let hudConfig = {
        theme: 'dark',
        questionAnimation: 'slide-in-bottom',
        correctAnimation: 'glow-pulse',
        wrongAnimation: 'shake',
        timerVariant: 'circular',
        answersLayout: 'grid',
        animationSpeed: 1,
        glowIntensity: 1,
        customCSS: '',
        streamWidth: 1920,
        streamHeight: 1080,
        positions: {
            question: { top: null, left: null, width: '100%', maxWidth: '1200px' },
            answers: { top: null, left: null, width: '100%', maxWidth: '1200px' },
            timer: { top: null, left: null }
        },
        colors: {
            primary: '#3b82f6',
            secondary: '#8b5cf6',
            success: '#10b981',
            danger: '#ef4444',
            warning: '#f59e0b'
        },
        fonts: {
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            sizeQuestion: '2.2rem',
            sizeAnswer: '1.1rem'
        }
    };

    // Drag & Drop State
    let dragState = {
        isDragging: false,
        element: null,
        offsetX: 0,
        offsetY: 0,
        snapToGrid: true,
        gridSize: 10
    };

    // Timer Animation
    let timerAnimation = null;

    // ============================================
    // INITIALIZATION
    // ============================================

    document.addEventListener('DOMContentLoaded', () => {
        initializeSocketListeners();
        loadHUDConfig();
        initializeDragAndDrop();
        preloadAnimations();
        console.log('Quiz Show Overlay initialized');
    });

    // ============================================
    // CONFIGURATION LOADING
    // ============================================

    async function loadHUDConfig() {
        try {
            const response = await fetch('/api/quiz-show/hud-config');
            if (response.ok) {
                const config = await response.json();
                if (config.success && config.config) {
                    hudConfig = { ...hudConfig, ...config.config };
                    applyHUDConfig();
                }
            }
        } catch (error) {
            console.error('Error loading HUD config:', error);
        }
    }

    function applyHUDConfig() {
        const root = document.documentElement;
        const overlay = document.getElementById('overlay-container');

        // Apply Theme
        overlay.setAttribute('data-theme', hudConfig.theme);

        // Apply Colors
        if (hudConfig.colors) {
            root.style.setProperty('--color-primary', hudConfig.colors.primary);
            root.style.setProperty('--color-secondary', hudConfig.colors.secondary);
            root.style.setProperty('--color-success', hudConfig.colors.success);
            root.style.setProperty('--color-danger', hudConfig.colors.danger);
            root.style.setProperty('--color-warning', hudConfig.colors.warning);
        }

        // Apply Fonts
        if (hudConfig.fonts) {
            root.style.setProperty('--font-family', hudConfig.fonts.family);
            root.style.setProperty('--font-size-xl', hudConfig.fonts.sizeQuestion);
            root.style.setProperty('--font-size-md', hudConfig.fonts.sizeAnswer);
        }

        // Apply Animation Settings
        root.style.setProperty('--animation-speed', hudConfig.animationSpeed);
        root.style.setProperty('--glow-intensity', hudConfig.glowIntensity);

        // Apply Positions
        applyElementPositions();

        // Apply Timer Variant
        switchTimerVariant(hudConfig.timerVariant);

        // Apply Answers Layout
        const answersGrid = document.getElementById('answersGrid');
        answersGrid.className = 'answers-grid';
        if (hudConfig.answersLayout === 'vertical') {
            answersGrid.classList.add('layout-vertical');
        } else if (hudConfig.answersLayout === 'horizontal') {
            answersGrid.classList.add('layout-horizontal');
        }

        // Apply Custom CSS
        if (hudConfig.customCSS) {
            applyCustomCSS(hudConfig.customCSS);
        }

        console.log('HUD Config applied:', hudConfig);
    }

    function applyElementPositions() {
        if (!hudConfig.positions) return;

        // Question
        if (hudConfig.positions.question) {
            const questionSection = document.getElementById('questionSection');
            const pos = hudConfig.positions.question;
            if (pos.top !== null) questionSection.style.top = pos.top + 'px';
            if (pos.left !== null) questionSection.style.left = pos.left + 'px';
            if (pos.width) questionSection.style.width = pos.width;
            if (pos.maxWidth) questionSection.style.maxWidth = pos.maxWidth;
        }

        // Answers
        if (hudConfig.positions.answers) {
            const answersSection = document.getElementById('answersSection');
            const pos = hudConfig.positions.answers;
            if (pos.top !== null) answersSection.style.top = pos.top + 'px';
            if (pos.left !== null) answersSection.style.left = pos.left + 'px';
            if (pos.width) answersSection.style.width = pos.width;
            if (pos.maxWidth) answersSection.style.maxWidth = pos.maxWidth;
        }

        // Timer
        if (hudConfig.positions.timer) {
            const timerSection = document.getElementById('timerSection');
            const pos = hudConfig.positions.timer;
            if (pos.top !== null) timerSection.style.top = pos.top + 'px';
            if (pos.left !== null) timerSection.style.left = pos.left + 'px';
        }
    }

    function switchTimerVariant(variant) {
        const timers = ['timerCircular', 'timerBar', 'timerNeon', 'timerRing'];
        timers.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('active');
            }
        });

        let activeTimer = 'timerCircular';
        if (variant === 'bar') activeTimer = 'timerBar';
        else if (variant === 'neon') activeTimer = 'timerNeon';
        else if (variant === 'ring') activeTimer = 'timerRing';

        const element = document.getElementById(activeTimer);
        if (element) {
            element.classList.add('active');
        }
    }

    function applyCustomCSS(css) {
        let styleElement = document.getElementById('custom-hud-css');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'custom-hud-css';
            document.head.appendChild(styleElement);
        }
        styleElement.textContent = css;
    }

    // ============================================
    // DRAG & DROP SYSTEM
    // ============================================

    function initializeDragAndDrop() {
        const draggableElements = document.querySelectorAll('.draggable');

        draggableElements.forEach(element => {
            element.addEventListener('mousedown', startDrag);
        });

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'g' || e.key === 'G') {
                dragState.snapToGrid = !dragState.snapToGrid;
                console.log('Snap to grid:', dragState.snapToGrid);
            }
        });
    }

    function startDrag(e) {
        // Only allow dragging with Ctrl/Cmd key to prevent accidental moves
        if (!e.ctrlKey && !e.metaKey) return;

        dragState.isDragging = true;
        dragState.element = e.currentTarget;

        const rect = dragState.element.getBoundingClientRect();
        dragState.offsetX = e.clientX - rect.left;
        dragState.offsetY = e.clientY - rect.top;

        dragState.element.classList.add('dragging');
        e.preventDefault();
    }

    function doDrag(e) {
        if (!dragState.isDragging || !dragState.element) return;

        let x = e.clientX - dragState.offsetX;
        let y = e.clientY - dragState.offsetY;

        // Snap to grid
        if (dragState.snapToGrid) {
            x = Math.round(x / dragState.gridSize) * dragState.gridSize;
            y = Math.round(y / dragState.gridSize) * dragState.gridSize;
        }

        // Apply position
        dragState.element.style.position = 'fixed';
        dragState.element.style.left = x + 'px';
        dragState.element.style.top = y + 'px';
        dragState.element.style.transform = 'none';

        e.preventDefault();
    }

    function stopDrag(e) {
        if (!dragState.isDragging) return;

        dragState.element.classList.remove('dragging');

        // Save position
        const elementType = dragState.element.getAttribute('data-element');
        const rect = dragState.element.getBoundingClientRect();

        if (!hudConfig.positions) hudConfig.positions = {};
        if (!hudConfig.positions[elementType]) hudConfig.positions[elementType] = {};

        hudConfig.positions[elementType].top = rect.top;
        hudConfig.positions[elementType].left = rect.left;

        // Send to server
        saveHUDConfig();

        dragState.isDragging = false;
        dragState.element = null;
    }

    async function saveHUDConfig() {
        try {
            const response = await fetch('/api/quiz-show/hud-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(hudConfig)
            });

            if (!response.ok) {
                console.error('Failed to save HUD config');
            }
        } catch (error) {
            console.error('Error saving HUD config:', error);
        }
    }

    // ============================================
    // SOCKET.IO LISTENERS
    // ============================================

    function initializeSocketListeners() {
        socket.on('connect', () => {
            console.log('Overlay connected to server');
        });

        socket.on('disconnect', () => {
            console.log('Overlay disconnected from server');
        });

        socket.on('quiz-show:state-update', handleStateUpdate);
        socket.on('quiz-show:time-update', handleTimeUpdate);
        socket.on('quiz-show:round-ended', handleRoundEnded);
        socket.on('quiz-show:joker-activated', handleJokerActivated);
        socket.on('quiz-show:stopped', handleQuizStopped);
        socket.on('quiz-show:hud-config-updated', handleHUDConfigUpdated);
    }

    function handleHUDConfigUpdated(config) {
        console.log('HUD config updated:', config);
        hudConfig = { ...hudConfig, ...config };
        applyHUDConfig();
    }

    // ============================================
    // STATE MACHINE
    // ============================================

    function transitionToState(newState) {
        console.log(`State transition: ${currentState} -> ${newState}`);

        if (stateTimeout) {
            clearTimeout(stateTimeout);
            stateTimeout = null;
        }

        exitState(currentState);
        currentState = newState;
        enterState(newState);
    }

    function exitState(state) {
        switch (state) {
            case States.RUNNING:
                if (timerAnimation) {
                    cancelAnimationFrame(timerAnimation);
                    timerAnimation = null;
                }
                break;
        }
    }

    function enterState(state) {
        switch (state) {
            case States.IDLE:
                hideOverlay();
                break;

            case States.QUESTION_INTRO:
                showOverlay();
                animateQuestionIntro();
                stateTimeout = setTimeout(() => {
                    transitionToState(States.RUNNING);
                }, 1500 / hudConfig.animationSpeed);
                break;

            case States.RUNNING:
                startTimer();
                break;

            case States.TIME_LOW:
                // Just a marker state, timer handles visual changes
                break;

            case States.TIME_UP:
                stopTimer();
                animateTimeUp();
                stateTimeout = setTimeout(() => {
                    transitionToState(States.REVEAL_CORRECT);
                }, 1000 / hudConfig.animationSpeed);
                break;

            case States.REVEAL_CORRECT:
                revealCorrectAnswer();
                stateTimeout = setTimeout(() => {
                    transitionToState(States.WAIT_NEXT);
                }, 3000 / hudConfig.animationSpeed);
                break;

            case States.WAIT_NEXT:
                break;
        }
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    function handleStateUpdate(state) {
        console.log('State update received:', state);

        if (state.isRunning && state.currentQuestion) {
            gameData = {
                question: state.currentQuestion.question,
                answers: state.currentQuestion.answers,
                correctIndex: null,
                timeRemaining: state.timeRemaining,
                totalTime: state.totalTime,
                hiddenAnswers: state.hiddenAnswers || [],
                revealedWrongAnswer: state.revealedWrongAnswer
            };

            displayQuestion(gameData.question);
            displayAnswers(gameData.answers);

            if (gameData.hiddenAnswers.length > 0) {
                hideAnswers(gameData.hiddenAnswers);
            }
            if (gameData.revealedWrongAnswer !== null) {
                markWrongAnswer(gameData.revealedWrongAnswer);
            }

            if (currentState === States.IDLE || currentState === States.WAIT_NEXT) {
                transitionToState(States.QUESTION_INTRO);
            }
        }
    }

    function handleTimeUpdate(data) {
        gameData.timeRemaining = data.timeRemaining;
        gameData.totalTime = data.totalTime;

        updateTimerDisplay(data.timeRemaining, data.totalTime);

        // Check for state transitions
        if (data.timeRemaining === 0 && currentState === States.RUNNING) {
            transitionToState(States.TIME_UP);
        } else if (data.timeRemaining <= 5 && currentState === States.RUNNING) {
            transitionToState(States.TIME_LOW);
        }
    }

    function handleRoundEnded(data) {
        console.log('Round ended:', data);
        gameData.correctIndex = data.correctAnswer;

        if (currentState === States.RUNNING || currentState === States.TIME_LOW) {
            transitionToState(States.TIME_UP);
        }
    }

    function handleJokerActivated(joker) {
        console.log('Joker activated:', joker);

        showJokerNotification(joker);

        if (joker.type === '50' && joker.data && joker.data.hiddenAnswers) {
            animateHideAnswers(joker.data.hiddenAnswers);
        } else if (joker.type === 'info' && joker.data && joker.data.revealedWrongAnswer !== undefined) {
            animateMarkWrongAnswer(joker.data.revealedWrongAnswer);
        } else if (joker.type === 'time' && joker.data) {
            animateTimeBoost();
        }
    }

    function handleQuizStopped() {
        transitionToState(States.IDLE);
    }

    // ============================================
    // DISPLAY FUNCTIONS
    // ============================================

    function showOverlay() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.add('hidden');
    }

    function displayQuestion(questionText) {
        const questionElement = document.getElementById('questionText');
        questionElement.textContent = questionText;

        // Dynamic font sizing
        const length = questionText.length;
        if (length > 150) {
            questionElement.style.fontSize = '1.5rem';
        } else if (length > 100) {
            questionElement.style.fontSize = '1.8rem';
        } else {
            questionElement.style.fontSize = hudConfig.fonts.sizeQuestion;
        }
    }

    function displayAnswers(answers) {
        answers.forEach((answer, index) => {
            const element = document.getElementById(`answer${String.fromCharCode(65 + index)}`);
            if (element) {
                element.textContent = answer;

                // Dynamic font sizing
                const length = answer.length;
                if (length > 50) {
                    element.style.fontSize = '0.9rem';
                } else if (length > 30) {
                    element.style.fontSize = '1rem';
                } else {
                    element.style.fontSize = hudConfig.fonts.sizeAnswer;
                }
            }
        });

        // Reset all answer cards
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            card.className = 'answer-card';
        });
    }

    // ============================================
    // TIMER FUNCTIONS
    // ============================================

    function startTimer() {
        const animate = () => {
            if (currentState !== States.RUNNING && currentState !== States.TIME_LOW) return;

            updateTimerDisplay(gameData.timeRemaining, gameData.totalTime);
            timerAnimation = requestAnimationFrame(animate);
        };

        animate();
    }

    function stopTimer() {
        if (timerAnimation) {
            cancelAnimationFrame(timerAnimation);
            timerAnimation = null;
        }
    }

    function updateTimerDisplay(seconds, total) {
        const percentage = seconds / total;

        // Update all timer variants
        updateCircularTimer(seconds, total, percentage);
        updateBarTimer(seconds, total, percentage);
        updateNeonTimer(seconds);
        updateRingTimer(seconds, total, percentage);
    }

    function updateCircularTimer(seconds, total, percentage) {
        const timerValue = document.getElementById('timerValue');
        const timerProgress = document.getElementById('timerProgress');

        if (timerValue) timerValue.textContent = seconds;

        if (timerProgress) {
            const circumference = 2 * Math.PI * 85;
            const offset = circumference * (1 - percentage);
            timerProgress.style.strokeDashoffset = offset;

            // Change color based on remaining time
            if (percentage > 0.5) {
                timerProgress.style.stroke = 'url(#timerGradient)';
                timerProgress.classList.remove('pulse');
            } else if (percentage > 0.2) {
                timerProgress.style.stroke = 'url(#timerGradientWarning)';
                timerProgress.classList.remove('pulse');
            } else {
                timerProgress.style.stroke = 'url(#timerGradientDanger)';
                timerProgress.classList.add('pulse');
            }
        }
    }

    function updateBarTimer(seconds, total, percentage) {
        const timerBarValue = document.getElementById('timerBarValue');
        const timerBarProgress = document.getElementById('timerBarProgress');

        if (timerBarValue) timerBarValue.textContent = seconds;

        if (timerBarProgress) {
            timerBarProgress.style.width = (percentage * 100) + '%';

            // Change color
            if (percentage > 0.5) {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-success), var(--color-primary))';
            } else if (percentage > 0.2) {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-warning), var(--color-primary))';
            } else {
                timerBarProgress.style.background = 'linear-gradient(90deg, var(--color-danger), var(--color-warning))';
            }
        }
    }

    function updateNeonTimer(seconds) {
        const timerNeonValue = document.getElementById('timerNeonValue');
        if (timerNeonValue) {
            timerNeonValue.textContent = seconds;
        }
    }

    function updateRingTimer(seconds, total, percentage) {
        const timerRingValue = document.getElementById('timerRingValue');
        const timerRingProgress = document.getElementById('timerRingProgress');

        if (timerRingValue) timerRingValue.textContent = seconds;

        if (timerRingProgress) {
            const circumference = 2 * Math.PI * 90;
            const offset = circumference * (1 - percentage);
            timerRingProgress.style.strokeDashoffset = offset;
        }
    }

    // ============================================
    // ANIMATION FUNCTIONS
    // ============================================

    function preloadAnimations() {
        const overlay = document.getElementById('overlay-container');
        overlay.style.transform = 'translateZ(0)';
    }

    function animateQuestionIntro() {
        const questionSection = document.getElementById('questionSection');
        const answersSection = document.getElementById('answersSection');
        const timerSection = document.getElementById('timerSection');

        const animClass = `animate-${hudConfig.questionAnimation}`;

        questionSection.classList.add(animClass);
        answersSection.classList.add(animClass);
        timerSection.classList.add(animClass);

        setTimeout(() => {
            questionSection.classList.remove(animClass);
            answersSection.classList.remove(animClass);
            timerSection.classList.remove(animClass);
        }, 1500 / hudConfig.animationSpeed);
    }

    function animateTimeUp() {
        const overlay = document.getElementById('overlay-container');
        overlay.classList.add('time-up-flash');

        setTimeout(() => {
            overlay.classList.remove('time-up-flash');
        }, 500 / hudConfig.animationSpeed);

        // Lock all answers
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            if (!card.classList.contains('hidden-answer')) {
                card.classList.add('locked');
            }
        });

        // Apply color wipe after timeout
        setTimeout(() => {
            cards.forEach((card, index) => {
                if (!card.classList.contains('hidden-answer')) {
                    if (index === gameData.correctIndex) {
                        card.classList.add('color-wipe-green');
                    } else {
                        card.classList.add('color-wipe-red');
                    }
                }
            });
        }, 200);
    }

    function revealCorrectAnswer() {
        if (gameData.correctIndex === null) return;

        const cards = document.querySelectorAll('.answer-card');
        const correctCard = cards[gameData.correctIndex];

        if (correctCard) {
            correctCard.classList.add('correct-answer');

            // Apply selected animation
            const animClass = `anim-${hudConfig.correctAnimation}`;
            correctCard.classList.add(animClass);

            // Show correct reveal overlay
            const correctReveal = document.getElementById('correctReveal');
            correctReveal.classList.remove('hidden');
            correctReveal.classList.add('animate-reveal');

            setTimeout(() => {
                correctReveal.classList.add('hidden');
                correctReveal.classList.remove('animate-reveal');
            }, 2000 / hudConfig.animationSpeed);
        }

        // Mark wrong answers with shake animation
        cards.forEach((card, index) => {
            if (index !== gameData.correctIndex && !card.classList.contains('hidden-answer')) {
                const wrongAnimClass = `anim-${hudConfig.wrongAnimation}`;
                card.classList.add('wrong-answer', wrongAnimClass);

                setTimeout(() => {
                    card.classList.remove(wrongAnimClass);
                }, 500 / hudConfig.animationSpeed);
            }
        });
    }

    // ============================================
    // JOKER FUNCTIONS
    // ============================================

    function showJokerNotification(joker) {
        const notification = document.getElementById('jokerNotification');
        const icon = document.getElementById('jokerIcon');
        const title = document.getElementById('jokerTitle');
        const user = document.getElementById('jokerUser');

        const jokerData = {
            '50': { icon: '✂️', title: '50:50 Joker' },
            'info': { icon: '💡', title: 'Info Joker' },
            'time': { icon: '⏰', title: 'Zeit Joker' }
        };

        const data = jokerData[joker.type] || { icon: '✨', title: 'Joker' };

        icon.textContent = data.icon;
        title.textContent = data.title;
        user.textContent = `von ${joker.username}`;

        notification.classList.remove('hidden');
        notification.classList.add('animate-slide-in');

        setTimeout(() => {
            notification.classList.add('hidden');
            notification.classList.remove('animate-slide-in');
        }, 3000 / hudConfig.animationSpeed);
    }

    function animateHideAnswers(indices) {
        const cards = document.querySelectorAll('.answer-card');

        indices.forEach((index, i) => {
            if (cards[index]) {
                setTimeout(() => {
                    cards[index].classList.add('hidden-answer');
                }, i * 200 / hudConfig.animationSpeed);
            }
        });

        gameData.hiddenAnswers = indices;
    }

    function hideAnswers(indices) {
        const cards = document.querySelectorAll('.answer-card');
        indices.forEach(index => {
            if (cards[index]) {
                cards[index].classList.add('hidden-answer');
            }
        });
    }

    function animateMarkWrongAnswer(index) {
        const cards = document.querySelectorAll('.answer-card');
        if (cards[index]) {
            cards[index].classList.add('wrong-hint');

            setTimeout(() => {
                cards[index].classList.add('reveal-line');
            }, 100);
        }

        gameData.revealedWrongAnswer = index;
    }

    function markWrongAnswer(index) {
        const cards = document.querySelectorAll('.answer-card');
        if (cards[index]) {
            cards[index].classList.add('wrong-hint');
        }
    }

    function animateTimeBoost() {
        const timerSection = document.getElementById('timerSection');
        timerSection.classList.add('time-boost');

        setTimeout(() => {
            timerSection.classList.remove('time-boost');
        }, 1000 / hudConfig.animationSpeed);
    }

    // ============================================
    // CLEANUP
    // ============================================

    window.addEventListener('beforeunload', () => {
        if (timerAnimation) {
            cancelAnimationFrame(timerAnimation);
        }
        if (stateTimeout) {
            clearTimeout(stateTimeout);
        }
    });

    console.log('Quiz Show Overlay loaded successfully');
})();
