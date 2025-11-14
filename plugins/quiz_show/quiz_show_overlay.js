// Quiz Show Overlay - Client Side JavaScript with State Machine
(function() {
    'use strict';

    // Socket.IO connection
    const socket = io();

    // State Machine States
    const States = {
        IDLE: 'idle',
        QUESTION_INTRO: 'question_intro',
        RUNNING: 'running',
        TIME_UP: 'time_up',
        REVEAL_CORRECT: 'reveal_correct',
        WAIT_NEXT: 'wait_next'
    };

    // Current state
    let currentState = States.IDLE;
    let stateTimeout = null;

    // Game data
    let gameData = {
        question: null,
        answers: [],
        correctIndex: null,
        timeRemaining: 0,
        totalTime: 30,
        hiddenAnswers: [],
        revealedWrongAnswer: null
    };

    // Timer animation
    let timerAnimation = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        initializeSocketListeners();
        preloadAnimations();
        console.log('Quiz Show Overlay initialized');
    });

    // Socket.IO Listeners
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
    }

    // Preload animations and resources
    function preloadAnimations() {
        // Force GPU acceleration
        const overlay = document.getElementById('overlay-container');
        overlay.style.transform = 'translateZ(0)';
    }

    // State Machine Transition
    function transitionToState(newState) {
        console.log(`State transition: ${currentState} -> ${newState}`);

        // Clear any pending state timeouts
        if (stateTimeout) {
            clearTimeout(stateTimeout);
            stateTimeout = null;
        }

        // Exit current state
        exitState(currentState);

        // Update state
        currentState = newState;

        // Enter new state
        enterState(newState);
    }

    function exitState(state) {
        switch (state) {
            case States.IDLE:
                break;
            case States.QUESTION_INTRO:
                break;
            case States.RUNNING:
                if (timerAnimation) {
                    cancelAnimationFrame(timerAnimation);
                    timerAnimation = null;
                }
                break;
            case States.TIME_UP:
                break;
            case States.REVEAL_CORRECT:
                break;
            case States.WAIT_NEXT:
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
                // Auto-transition to RUNNING after animation
                stateTimeout = setTimeout(() => {
                    transitionToState(States.RUNNING);
                }, 1500);
                break;

            case States.RUNNING:
                startTimer();
                break;

            case States.TIME_UP:
                stopTimer();
                animateTimeUp();
                // Auto-transition to REVEAL_CORRECT after animation
                stateTimeout = setTimeout(() => {
                    transitionToState(States.REVEAL_CORRECT);
                }, 1000);
                break;

            case States.REVEAL_CORRECT:
                revealCorrectAnswer();
                // Auto-transition to WAIT_NEXT after delay
                stateTimeout = setTimeout(() => {
                    transitionToState(States.WAIT_NEXT);
                }, 3000);
                break;

            case States.WAIT_NEXT:
                // Wait for next question
                break;
        }
    }

    // Socket Event Handlers
    function handleStateUpdate(state) {
        console.log('State update received:', state);

        if (state.isRunning && state.currentQuestion) {
            // Update game data
            gameData = {
                question: state.currentQuestion.question,
                answers: state.currentQuestion.answers,
                correctIndex: null, // Don't reveal yet
                timeRemaining: state.timeRemaining,
                totalTime: state.totalTime,
                hiddenAnswers: state.hiddenAnswers || [],
                revealedWrongAnswer: state.revealedWrongAnswer
            };

            // Display question and answers
            displayQuestion(gameData.question);
            displayAnswers(gameData.answers);

            // Apply joker effects
            if (gameData.hiddenAnswers.length > 0) {
                hideAnswers(gameData.hiddenAnswers);
            }
            if (gameData.revealedWrongAnswer !== null) {
                markWrongAnswer(gameData.revealedWrongAnswer);
            }

            // Transition to intro if not already running
            if (currentState === States.IDLE || currentState === States.WAIT_NEXT) {
                transitionToState(States.QUESTION_INTRO);
            }
        }
    }

    function handleTimeUpdate(data) {
        gameData.timeRemaining = data.timeRemaining;
        gameData.totalTime = data.totalTime;

        updateTimerDisplay(data.timeRemaining, data.totalTime);

        // Check if time is up
        if (data.timeRemaining === 0 && currentState === States.RUNNING) {
            transitionToState(States.TIME_UP);
        }
    }

    function handleRoundEnded(data) {
        console.log('Round ended:', data);

        // Store correct answer
        gameData.correctIndex = data.correctAnswer.index;

        // Transition to time up if not already there
        if (currentState === States.RUNNING) {
            transitionToState(States.TIME_UP);
        }
    }

    function handleJokerActivated(joker) {
        console.log('Joker activated:', joker);

        // Show joker notification
        showJokerNotification(joker);

        // Apply joker effects
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

    // Display Functions
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

        // Adjust font size based on text length
        const length = questionText.length;
        if (length > 150) {
            questionElement.style.fontSize = '1.5rem';
        } else if (length > 100) {
            questionElement.style.fontSize = '1.8rem';
        } else {
            questionElement.style.fontSize = '2.2rem';
        }
    }

    function displayAnswers(answers) {
        answers.forEach((answer, index) => {
            const element = document.getElementById(`answer${String.fromCharCode(65 + index)}`);
            if (element) {
                element.textContent = answer;

                // Adjust font size based on text length
                const length = answer.length;
                if (length > 50) {
                    element.style.fontSize = '0.9rem';
                } else if (length > 30) {
                    element.style.fontSize = '1rem';
                } else {
                    element.style.fontSize = '1.1rem';
                }
            }
        });

        // Reset all answer cards
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            card.classList.remove('hidden-answer', 'wrong-hint', 'correct-answer', 'locked');
        });
    }

    // Timer Functions
    function startTimer() {
        const timerValue = document.getElementById('timerValue');
        const timerProgress = document.getElementById('timerProgress');

        const animate = () => {
            if (currentState !== States.RUNNING) return;

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
        const timerValue = document.getElementById('timerValue');
        const timerProgress = document.getElementById('timerProgress');

        timerValue.textContent = seconds;

        // Calculate circle progress (circumference = 2 * PI * r = 534)
        const circumference = 2 * Math.PI * 85;
        const percentage = seconds / total;
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

    // Animation Functions
    function animateQuestionIntro() {
        const questionSection = document.getElementById('questionSection');
        const answersSection = document.getElementById('answersSection');
        const timerSection = document.getElementById('timerSection');

        questionSection.classList.add('animate-intro');
        answersSection.classList.add('animate-intro');
        timerSection.classList.add('animate-intro');

        setTimeout(() => {
            questionSection.classList.remove('animate-intro');
            answersSection.classList.remove('animate-intro');
            timerSection.classList.remove('animate-intro');
        }, 1500);
    }

    function animateTimeUp() {
        // Flash effect
        const overlay = document.getElementById('overlay-container');
        overlay.classList.add('time-up-flash');

        setTimeout(() => {
            overlay.classList.remove('time-up-flash');
        }, 500);

        // Lock all answers
        const cards = document.querySelectorAll('.answer-card');
        cards.forEach(card => {
            card.classList.add('locked');
        });
    }

    function revealCorrectAnswer() {
        if (gameData.correctIndex === null) return;

        const cards = document.querySelectorAll('.answer-card');
        const correctCard = cards[gameData.correctIndex];

        if (correctCard) {
            correctCard.classList.add('correct-answer');

            // Show "Correct!" overlay
            const correctReveal = document.getElementById('correctReveal');
            correctReveal.classList.remove('hidden');
            correctReveal.classList.add('animate-reveal');

            setTimeout(() => {
                correctReveal.classList.add('hidden');
                correctReveal.classList.remove('animate-reveal');
            }, 2000);
        }
    }

    // Joker Functions
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
        }, 3000);
    }

    function animateHideAnswers(indices) {
        const cards = document.querySelectorAll('.answer-card');

        indices.forEach((index, i) => {
            if (cards[index]) {
                setTimeout(() => {
                    cards[index].classList.add('hidden-answer');
                }, i * 200);
            }
        });
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

            // Animate golden line effect
            setTimeout(() => {
                cards[index].classList.add('reveal-line');
            }, 100);
        }
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
        }, 1000);
    }

    // Cleanup on unload
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
