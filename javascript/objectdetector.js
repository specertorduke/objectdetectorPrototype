// ============================================
// INSIGHTFUL — Object Detector Engine
// Real OCR, cached model, accessibility-first
// ============================================

(function () {
    'use strict';

    // ---- Configuration ----
    const CONFIG = {
        SPEECH_RATE: 0.9,
        DOUBLE_TAP_TIMEOUT: 300,
        MIN_SWIPE_DISTANCE: 40,
        ACTION_COOLDOWN: 1200,
        CONFIDENCE_THRESHOLD: 0.6,
        TOAST_DURATION: 5000,
        LONG_PRESS_DURATION: 800,
    };

    // ---- State ----
    let mode = 'object-detection';
    let currentIndex = 0;
    let stream = null;
    let usingFrontCamera = false;
    let lastTapTime = 0;
    let isActionTriggered = false;
    let isObjectDetectionRunning = false;
    let isMenuOpen = false;
    let cachedModel = null;
    let touchstartX = 0;
    let touchendX = 0;
    let longPressTimer = null;

    // ---- DOM References ----
    const choices = document.querySelectorAll('.choice');
    const video = document.getElementById('camera-stream');
    const menuBtn = document.getElementById('menu-btn');
    const popupMenu = document.getElementById('popup-menu');
    const statusText = document.getElementById('status-text');
    const scanLine = document.getElementById('camera-scanning');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultToast = document.getElementById('result-toast');
    const resultToastText = document.getElementById('result-toast-text');
    const liveAnnouncer = document.getElementById('live-announcer');
    const liveResults = document.getElementById('live-results');

    // ---- Mode Descriptions (for long-press help) ----
    const MODE_INFO = {
        'object-detection': {
            name: 'Object Detection',
            description: 'Detects and names objects in front of the camera. Tap to scan, double-tap to flip camera.',
            icon: '🔍'
        },
        'text-reader': {
            name: 'Text Reader',
            description: 'Reads printed text from the camera view. Hold your device steady over text and tap to scan.',
            icon: '📖'
        },
        'color-detection': {
            name: 'Color Detection',
            description: 'Identifies the dominant color the camera sees. Point at any surface and tap to detect.',
            icon: '🎨'
        }
    };

    // ============================================
    // AUDIO CUE SYSTEM (Web Audio API — no files)
    // ============================================
    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playTone(frequency, duration, type = 'sine', volume = 0.15) {
        try {
            const ctx = getAudioCtx();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + duration);
        } catch (e) {
            // Audio not available — silent fallback
        }
    }

    function playModeSwitch() {
        playTone(600, 0.12, 'sine', 0.1);
        setTimeout(() => playTone(800, 0.12, 'sine', 0.1), 80);
    }

    function playScanStart() {
        playTone(400, 0.15, 'triangle', 0.1);
    }

    function playResultReady() {
        playTone(523, 0.1, 'sine', 0.12);
        setTimeout(() => playTone(659, 0.1, 'sine', 0.12), 100);
        setTimeout(() => playTone(784, 0.15, 'sine', 0.12), 200);
    }

    function playError() {
        playTone(300, 0.2, 'sawtooth', 0.08);
    }

    // ============================================
    // HAPTIC FEEDBACK
    // ============================================
    function vibrate(pattern) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    // ============================================
    // SPEECH SYNTHESIS
    // ============================================
    function speak(text, interrupt = true) {
        if (interrupt) {
            window.speechSynthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = CONFIG.SPEECH_RATE;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }

    function stopSpeech() {
        window.speechSynthesis.cancel();
    }

    // ---- ARIA Live Region Announcements ----
    function announceAssertive(text) {
        if (liveAnnouncer) {
            liveAnnouncer.textContent = '';
            setTimeout(() => { liveAnnouncer.textContent = text; }, 50);
        }
    }

    function announcePolite(text) {
        if (liveResults) {
            liveResults.textContent = '';
            setTimeout(() => { liveResults.textContent = text; }, 50);
        }
    }

    // ============================================
    // RESULT TOAST (Visual + Audible)
    // ============================================
    let toastTimeout = null;

    function showToast(text, icon) {
        if (!resultToast || !resultToastText) return;

        clearTimeout(toastTimeout);
        const toastIcon = resultToast.querySelector('.toast-icon');
        if (toastIcon) toastIcon.textContent = icon || '✨';
        resultToastText.textContent = text;
        resultToast.classList.add('visible');

        toastTimeout = setTimeout(() => {
            resultToast.classList.remove('visible');
        }, CONFIG.TOAST_DURATION);
    }

    function hideToast() {
        if (resultToast) resultToast.classList.remove('visible');
        clearTimeout(toastTimeout);
    }

    // ============================================
    // LOADING STATE
    // ============================================
    function showLoading() {
        if (scanLine) scanLine.classList.add('active');
        if (loadingIndicator) loadingIndicator.classList.add('active');
    }

    function hideLoading() {
        if (scanLine) scanLine.classList.remove('active');
        if (loadingIndicator) loadingIndicator.classList.remove('active');
    }

    // ============================================
    // CAMERA
    // ============================================
    function startCamera(facingMode) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode }
        })
            .then((mediaStream) => {
                stream = mediaStream;
                video.srcObject = mediaStream;
            })
            .catch((error) => {
                console.error('Camera error:', error);
                speak("Unable to access the camera. Please grant camera permission.");
                announceAssertive("Camera access denied. Please enable camera permissions.");
            });
    }

    function toggleCamera() {
        usingFrontCamera = !usingFrontCamera;
        const facingMode = usingFrontCamera ? 'user' : 'environment';
        startCamera(facingMode);
        speak(usingFrontCamera ? "Front camera" : "Back camera");
        vibrate(50);
    }

    // ============================================
    // MODEL CACHING (load once, reuse)
    // ============================================
    function loadModel() {
        if (cachedModel) return Promise.resolve(cachedModel);
        return cocoSsd.load().then(model => {
            cachedModel = model;
            return model;
        });
    }

    // Pre-load model on startup
    loadModel().then(() => {
        console.log('COCO-SSD model cached');
    }).catch(err => {
        console.error('Model load error:', err);
    });

    // ============================================
    // OBJECT DETECTION
    // ============================================
    function objectDetection() {
        if (mode !== 'object-detection' || isObjectDetectionRunning) return;
        isObjectDetectionRunning = true;

        showLoading();
        playScanStart();
        speak("Analyzing, please wait.", true);
        vibrate(100);

        loadModel().then(model => {
            return model.detect(video);
        }).then(predictions => {
            hideLoading();
            isObjectDetectionRunning = false;

            // Filter by confidence threshold
            const confident = predictions.filter(p => p.score >= CONFIG.CONFIDENCE_THRESHOLD);

            if (confident.length > 0) {
                // Announce ALL detected objects
                const names = confident.map(p => {
                    const pct = Math.round(p.score * 100);
                    return `${p.class} (${pct}% confidence)`;
                });

                let announcement;
                if (confident.length === 1) {
                    announcement = `I see ${names[0]}.`;
                } else {
                    const last = names.pop();
                    announcement = `I see ${names.join(', ')}, and ${last}.`;
                }

                playResultReady();
                vibrate([100, 80, 100]);
                speak(announcement);
                announcePolite(announcement);
                showToast(announcement, '🔍');
            } else {
                playError();
                vibrate(200);
                const msg = "No objects detected. Try pointing the camera at something.";
                speak(msg);
                announcePolite(msg);
                showToast(msg, '❌');
            }
        }).catch(err => {
            hideLoading();
            isObjectDetectionRunning = false;
            console.error('Detection error:', err);
            playError();
            const msg = "Error during detection. Please try again.";
            speak(msg);
            announcePolite(msg);
        });
    }

    // ============================================
    // TEXT READER (Real OCR via Tesseract.js v5)
    // ============================================
    function textReader() {
        if (mode !== 'text-reader') return;

        showLoading();
        playScanStart();
        speak("Scanning text, please hold steady.", true);
        vibrate(100);

        const canvas = document.getElementById('ocr-canvas') || document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Image preprocessing for better OCR
        preprocessForOCR(context, canvas.width, canvas.height);

        // Run Tesseract OCR
        Tesseract.recognize(canvas, 'eng', {
            logger: m => {
                if (m.status === 'recognizing text' && m.progress) {
                    // Could update progress here
                }
            }
        })
            .then(result => {
                hideLoading();

                const detectedText = result.data.text.trim();
                const cleanedText = cleanText(detectedText);

                if (cleanedText && cleanedText.length > 2) {
                    playResultReady();
                    vibrate([100, 80, 100]);
                    const msg = `Detected text: ${cleanedText}`;
                    speak(msg);
                    announcePolite(msg);
                    showToast(cleanedText, '📖');
                } else {
                    playError();
                    vibrate(200);
                    const msg = "No readable text found. Try holding the camera closer and keeping it steady.";
                    speak(msg);
                    announcePolite(msg);
                    showToast(msg, '❌');
                }
            })
            .catch(err => {
                hideLoading();
                console.error('OCR error:', err);
                playError();
                const msg = "Error reading text. Please try again.";
                speak(msg);
                announcePolite(msg);
            });
    }

    // ---- Image Preprocessing for Better OCR ----
    function preprocessForOCR(context, width, height) {
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            // Increase contrast
            const contrast = 1.5;
            const adjusted = ((gray - 128) * contrast) + 128;
            const clamped = Math.max(0, Math.min(255, adjusted));

            // Apply threshold for binarization
            const binary = clamped > 128 ? 255 : 0;

            data[i] = binary;
            data[i + 1] = binary;
            data[i + 2] = binary;
        }

        context.putImageData(imageData, 0, 0);
    }

    // ---- Clean Text ----
    function cleanText(text) {
        // Remove random symbols but keep common punctuation
        let cleaned = text.replace(/[^a-zA-Z0-9\s,.!?;:'"()\-\/]/g, '').trim();
        // Collapse multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ');
        // Must have at least a few real characters
        return cleaned.length > 2 ? cleaned : '';
    }

    // ============================================
    // COLOR DETECTION
    // ============================================
    function colorDetection() {
        if (mode !== 'color-detection') return;

        showLoading();
        playScanStart();
        speak("Detecting color.", true);
        vibrate(100);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Sample center region for more accurate results
        const centerX = Math.floor(canvas.width * 0.3);
        const centerY = Math.floor(canvas.height * 0.3);
        const sampleW = Math.floor(canvas.width * 0.4);
        const sampleH = Math.floor(canvas.height * 0.4);
        const imageData = context.getImageData(centerX, centerY, sampleW, sampleH);

        const colorName = detectDominantColor(imageData.data);

        hideLoading();
        playResultReady();
        vibrate([100, 80, 100]);
        const msg = `The dominant color is ${colorName}.`;
        speak(msg);
        announcePolite(msg);
        showToast(msg, '🎨');
    }

    // ---- Dominant Color ----
    function detectDominantColor(data) {
        let r = 0, g = 0, b = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        r = Math.floor(r / pixelCount);
        g = Math.floor(g / pixelCount);
        b = Math.floor(b / pixelCount);
        return rgbToColorName(r, g, b);
    }

    // ---- RGB to HSL ----
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    // ---- Descriptive Color Names ----
    function rgbToColorName(r, g, b) {
        const [h, s, l] = rgbToHsl(r, g, b);

        // Achromatic
        if (s < 10) {
            if (l > 92) return 'White';
            if (l > 75) return 'Light Gray';
            if (l > 55) return 'Gray';
            if (l > 30) return 'Dark Gray';
            if (l > 12) return 'Very Dark Gray';
            return 'Black';
        }

        // Low saturation grays
        if (s < 20 && l > 80) return 'Off-White';
        if (s < 25 && l < 20) return 'Near Black';
        if (s < 20 && l >= 20 && l <= 80) return 'Grayish';

        // Lightness modifier
        let lightMod = '';
        if (l > 75) lightMod = 'Light ';
        else if (l > 60) lightMod = 'Soft ';
        else if (l < 25) lightMod = 'Dark ';
        else if (l < 35) lightMod = 'Deep ';

        // Hue-based color
        let color;
        if (h < 10 || h >= 345) color = 'Red';
        else if (h < 25) color = 'Red-Orange';
        else if (h < 40) color = 'Orange';
        else if (h < 50) color = 'Amber';
        else if (h < 65) color = 'Yellow';
        else if (h < 80) color = 'Yellow-Green';
        else if (h < 160) color = 'Green';
        else if (h < 180) color = 'Teal';
        else if (h < 200) color = 'Cyan';
        else if (h < 240) color = 'Blue';
        else if (h < 260) color = 'Indigo';
        else if (h < 280) color = 'Violet';
        else if (h < 310) color = 'Purple';
        else if (h < 330) color = 'Magenta';
        else color = 'Pink';

        // Saturation modifier
        if (s < 40 && lightMod === '') lightMod = 'Muted ';

        return `${lightMod}${color}`.trim();
    }

    // ============================================
    // TAP / CLICK HANDLER
    // ============================================
    document.body.addEventListener('click', function (event) {
        if (isMenuOpen) return;
        if (event.target.closest('.popup-menu-wrapper')) return;
        if (event.target.closest('.choices-wrapper')) return;
        if (event.target.closest('.result-toast')) return;
        if (event.target.closest('.head .logo')) return;

        event.stopPropagation();

        const currentTime = Date.now();
        const tapDuration = currentTime - lastTapTime;

        if (tapDuration < CONFIG.DOUBLE_TAP_TIMEOUT && tapDuration > 0) {
            // Double-tap: toggle camera
            toggleCamera();
        } else {
            // Single tap: trigger action
            if (!isActionTriggered) {
                isActionTriggered = true;
                triggerAction();
                setTimeout(() => { isActionTriggered = false; }, CONFIG.ACTION_COOLDOWN);
            }
        }

        lastTapTime = currentTime;
    });

    function triggerAction() {
        stopSpeech();
        hideToast();

        if (mode === 'object-detection') {
            objectDetection();
        } else if (mode === 'text-reader') {
            textReader();
        } else if (mode === 'color-detection') {
            colorDetection();
        }
    }

    // ============================================
    // LONG PRESS — Hear Mode Description
    // ============================================
    document.body.addEventListener('pointerdown', function (event) {
        if (event.target.closest('.popup-menu-wrapper')) return;
        if (event.target.closest('.choices-wrapper')) return;

        longPressTimer = setTimeout(() => {
            const info = MODE_INFO[mode];
            if (info) {
                vibrate([50, 30, 50]);
                speak(`${info.name}. ${info.description}`);
                announceAssertive(`${info.name}. ${info.description}`);
            }
        }, CONFIG.LONG_PRESS_DURATION);
    });

    document.body.addEventListener('pointerup', function () {
        clearTimeout(longPressTimer);
    });

    document.body.addEventListener('pointercancel', function () {
        clearTimeout(longPressTimer);
    });

    // ============================================
    // SWIPE GESTURE HANDLER
    // ============================================
    document.addEventListener('touchstart', function (event) {
        touchstartX = event.changedTouches[0].screenX;
    }, { passive: true });

    document.addEventListener('touchend', function (event) {
        touchendX = event.changedTouches[0].screenX;
        if (Math.abs(touchendX - touchstartX) > CONFIG.MIN_SWIPE_DISTANCE) {
            handleSwipe();
        }
    }, { passive: true });

    function handleSwipe() {
        if (isMenuOpen) return;

        if (touchendX < touchstartX) {
            // Swipe left → next
            currentIndex = (currentIndex + 1) % choices.length;
        } else {
            // Swipe right → previous
            currentIndex = (currentIndex - 1 + choices.length) % choices.length;
        }

        switchToMode(currentIndex);
    }

    // ============================================
    // MODE SWITCHING
    // ============================================
    const MODE_MAP = ['object-detection', 'text-reader', 'color-detection'];

    function switchToMode(index) {
        currentIndex = index;
        mode = MODE_MAP[index];

        updateChoiceUI(index);
        updatePopupMenu();
        updateStatusBadge();
        updateAriaStates();

        stopSpeech();
        playModeSwitch();
        vibrate(50);

        const info = MODE_INFO[mode];
        speak(`${info.name} mode`);
        announceAssertive(`${info.name} mode selected`);
    }

    function updateChoiceUI(index) {
        choices.forEach((choice, i) => {
            choice.classList.remove('left', 'right', 'selected');

            if (i === index) {
                choice.classList.add('selected');
                choice.style.opacity = '1';
                choice.style.pointerEvents = 'auto';
            } else if (i < index) {
                choice.classList.add('left');
                choice.style.opacity = '0.35';
                choice.style.pointerEvents = 'auto';
            } else {
                choice.classList.add('right');
                choice.style.opacity = '0.35';
                choice.style.pointerEvents = 'auto';
            }
        });
    }

    function updateStatusBadge() {
        if (statusText) {
            statusText.textContent = MODE_INFO[mode].name;
        }
    }

    function updateAriaStates() {
        choices.forEach((choice, i) => {
            choice.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
            const label = `${MODE_INFO[MODE_MAP[i]].name} mode${i === currentIndex ? ' — currently selected' : ''}`;
            choice.setAttribute('aria-label', label);
        });
    }

    // ---- Choice Click Handlers ----
    choices.forEach((choice, index) => {
        choice.addEventListener('click', function (event) {
            event.stopPropagation();
            switchToMode(index);
        });
    });

    // ============================================
    // POPUP MENU
    // ============================================
    menuBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        const isHidden = popupMenu.classList.contains('hidden');
        popupMenu.classList.toggle('hidden');
        isMenuOpen = !popupMenu.classList.contains('hidden');
        menuBtn.setAttribute('aria-expanded', isMenuOpen ? 'true' : 'false');

        if (isMenuOpen) {
            speak("Menu opened. Choose a detection mode.");
            vibrate(30);
            // Focus first menu item
            const firstItem = popupMenu.querySelector('[role="menuitem"]');
            if (firstItem) firstItem.focus();
        } else {
            speak("Menu closed.");
        }
    });

    // Close menu on outside click
    document.addEventListener('click', function (event) {
        if (popupMenu && !popupMenu.contains(event.target) && !event.target.matches('#menu-btn') && !event.target.closest('#menu-btn')) {
            popupMenu.classList.add('hidden');
            isMenuOpen = false;
            menuBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Popup choice handlers
    document.querySelectorAll('.popup-choice').forEach((choice, index) => {
        choice.addEventListener('click', function (event) {
            event.stopPropagation();
            switchToMode(index);
            popupMenu.classList.add('hidden');
            isMenuOpen = false;
            menuBtn.setAttribute('aria-expanded', 'false');
        });

        // Keyboard support for menu items
        choice.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                choice.click();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                const next = choice.nextElementSibling;
                if (next && next.classList.contains('popup-choice')) next.focus();
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                const prev = choice.previousElementSibling;
                if (prev && prev.classList.contains('popup-choice')) prev.focus();
            } else if (event.key === 'Escape') {
                popupMenu.classList.add('hidden');
                isMenuOpen = false;
                menuBtn.setAttribute('aria-expanded', 'false');
                menuBtn.focus();
                speak("Menu closed.");
            }
        });
    });

    function updatePopupMenu() {
        document.querySelectorAll('.popup-choice').forEach(choice => {
            choice.classList.remove('active');
        });

        const activeId = {
            'object-detection': 'popup-object-detection',
            'text-reader': 'popup-text-reader',
            'color-detection': 'popup-color-detection'
        }[mode];

        const activeEl = document.getElementById(activeId);
        if (activeEl) activeEl.classList.add('active');
    }

    // ============================================
    // KEYBOARD NAVIGATION
    // ============================================
    document.addEventListener('keydown', function (event) {
        if (isMenuOpen) return;

        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                currentIndex = (currentIndex - 1 + choices.length) % choices.length;
                switchToMode(currentIndex);
                break;
            case 'ArrowRight':
                event.preventDefault();
                currentIndex = (currentIndex + 1) % choices.length;
                switchToMode(currentIndex);
                break;
            case 'Enter':
            case ' ':
                if (document.activeElement === document.body || document.activeElement.closest('.camera')) {
                    event.preventDefault();
                    if (!isActionTriggered) {
                        isActionTriggered = true;
                        triggerAction();
                        setTimeout(() => { isActionTriggered = false; }, CONFIG.ACTION_COOLDOWN);
                    }
                }
                break;
            case 'Escape':
                stopSpeech();
                hideToast();
                speak("Speech stopped.");
                break;
        }
    });

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        // Set initial UI
        updateChoiceUI(0);
        updatePopupMenu();
        updateStatusBadge();
        updateAriaStates();

        // Start camera
        startCamera('environment');

        // Welcome announcement (delayed to let page load)
        setTimeout(function () {
            speak("Object detection mode. Tap the screen to analyze what the camera sees. Swipe left or right to switch modes. Double-tap to flip the camera.");
            announceAssertive("Object detection mode ready. Tap to scan.");
        }, 1200);
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();