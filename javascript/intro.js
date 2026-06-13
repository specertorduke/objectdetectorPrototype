// ============================================
// INSIGHTFUL — Intro / Splash Screen
// Accessible welcome with auto-announce
// ============================================

(function () {
    'use strict';

    const SPEECH_RATE = 0.9;
    const WELCOME_MESSAGE = "Welcome to Insightful! Your AI-powered assistant for seeing the world. Tap anywhere to start.";
    const TRANSITION_DELAY = 600;

    let hasInteracted = false;

    // ---- Speech ----
    function speak(text) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = SPEECH_RATE;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }

    function announceToLiveRegion(text) {
        const region = document.getElementById('live-announcer');
        if (region) {
            region.textContent = '';
            setTimeout(() => { region.textContent = text; }, 50);
        }
    }

    // ---- Haptic ----
    function vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    // ---- Navigation ----
    function navigateToDetector() {
        speak("Loading camera. Please wait.");
        announceToLiveRegion("Loading the detector. Please wait.");
        vibrate([100, 50, 100]);

        const overlay = document.getElementById('overlay');
        if (overlay) {
            overlay.classList.add('expand');
        }

        setTimeout(function () {
            window.location.href = 'objectdetector.html';
        }, TRANSITION_DELAY);
    }

    // ---- Event Handlers ----
    function handleInteraction(event) {
        // Prevent default on links
        if (event.target.closest('a')) {
            event.preventDefault();
        }

        if (!hasInteracted) {
            // First interaction: announce welcome
            hasInteracted = true;
            vibrate(100);
            speak(WELCOME_MESSAGE);
            announceToLiveRegion(WELCOME_MESSAGE);
        } else {
            // Second interaction: navigate
            navigateToDetector();
        }
    }

    // Click / tap
    document.addEventListener('click', handleInteraction);

    // Keyboard: Enter or Space on the start button
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
            const focused = document.activeElement;
            if (focused && (focused.id === 'start-btn' || focused.tagName === 'BODY')) {
                event.preventDefault();
                handleInteraction(event);
            }
        }
    });

    // ---- Auto-Announce on Load ----
    // Blind users need to hear something immediately
    window.addEventListener('load', function () {
        // Short delay to let page fully render and speech engine initialize
        setTimeout(function () {
            announceToLiveRegion("Insightful app loaded. Tap anywhere to hear instructions.");
        }, 500);
    });

})();