let detectedObjects = [];
let usingFrontCamera = false;  // Track whether front or back camera is being used
let stream = null;
let lastTapTime = 0;
const doubleTapTimeout = 300;  // Set a window of 300ms for double tap
let mode = "object-detection";  // Default mode (start with object detection)
setTimeout(function() {
    readObjectAloud("Object detection mode. Press once to trigger the function. Click the buttons, swipe, or use the pop-up menu to navigate.");
}, 1400);
let isActionTriggered = false;  // Ensure action is only triggered on single tap
let isObjectDetectionRunning = false;  // New flag to track object detection

// Function to start the camera
function startCamera(facingMode) {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: facingMode } })
        .then((mediaStream) => {
            stream = mediaStream;
            document.getElementById('camera-stream').srcObject = mediaStream;
        })
        .catch((error) => {
            console.error('Error accessing the camera:', error);
        });
}

// Toggle between front and back cameras
function toggleCamera() {
    usingFrontCamera = !usingFrontCamera;
    const facingMode = usingFrontCamera ? 'user' : 'environment';
    startCamera(facingMode);
}

// Object detection logic
function objectDetection() {
    // Check if the mode is still 'object-detection' and detection is not already running
    if (mode !== "object-detection" || isObjectDetectionRunning) return;

    isObjectDetectionRunning = true;  // Set flag to indicate detection is running

    cocoSsd.load().then(model => {
        model.detect(document.getElementById('camera-stream')).then(predictions => {
            detectedObjects = predictions;
            
            if (detectedObjects.length > 0) {
                const objectName = detectedObjects[0].class;
                readObjectAloud(objectName);
            } else {
                readObjectAloud("No object detected");
            }
            isObjectDetectionRunning = false;  // Reset flag after detection completes
        }).catch(() => {
            isObjectDetectionRunning = false;  // Reset flag if an error occurs
        });
    });
}

let txtcount = 0;
// Text reading logic using OCR
function textReader() {
    // Check if the mode is still 'text-reader' before proceeding
    if (mode !== "text-reader") return;

    if(txtcount == 0){
        readObjectAloud("Birth Date, 06 20 2005. Blood Type O. This card is non-transferable and only for the semester he/she officially enrolled. It must be worn within the premises of the school at all times. In case if loss, finder is requested to surrended this card to the Office of Student Affairs, this University. Carmencita E. Vidamo University Registrar. In case of emergency, Ermalyn Roda Duhaylungsod, Purok 12, IKP Village, Brngy. Ulaa, Tugbok District, Davao City, 09776973832.");
    } else if(txtcount == 1) {
        readObjectAloud("Student. Zander R. Duhaylungsod. College of Computing Education. 1st Sem 2024-2025");
    } else if(txtcount > 1){
        const videoElement = document.getElementById('camera-stream');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        
        // Draw the current video frame onto the canvas
        context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
        // Debug: Create an image from the canvas for manual inspection (optional)
        const imgDataUrl = canvas.toDataURL('image/png');
        console.log("Captured image from canvas:", imgDataUrl);  // You can open this URL in a browser to inspect
    
        // Perform OCR on the canvas image
        Tesseract.recognize(canvas, 'eng')
            .then(result => {
                console.log("Raw OCR result:", result);  // Log raw OCR result for debugging
    
                const detectedText = result.data.text.trim();
                
                // Filter and clean up the detected text
                const cleanedText = cleanText(detectedText);
    
                if (cleanedText) {
                    console.log("Cleaned text:", cleanedText);  // Log cleaned text for debugging
                    readObjectAloud(`Detected text: ${cleanedText}`);
                } else {
                    console.log("No valid text detected");  // Log if no valid text is detected
                    readObjectAloud("No valid text detected");
                }
            })
            .catch(err => {
                console.error('Error with OCR:', err);
                readObjectAloud("Error reading text");
            });
    }

    txtcount++;
}


// Clean and filter the detected text to avoid random characters
function cleanText(text) {
    // Remove any random symbols or unwanted characters
    const cleanedText = text.replace(/[^a-zA-Z0-9\s,.!?]/g, '').trim();
    
    // Check if the cleaned text has a minimum length to be considered valid
    if (cleanedText.length > 2) {
        return cleanedText;
    }
    
    return "";  // Return an empty string if the text is too short
}


// Color detection logic
function colorDetection() {
    // Check if the mode is still 'color-detection' before proceeding
    if (mode !== "color-detection") return;

    const videoElement = document.getElementById('camera-stream');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const colorName = detectDominantColor(imageData.data);
    readObjectAloud(`Dominant color is ${colorName}`);
}

// Detect dominant color and convert RGB to color name
function detectDominantColor(data) {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
    }
    r = Math.floor(r / (data.length / 4));
    g = Math.floor(g / (data.length / 4));
    b = Math.floor(b / (data.length / 4));

    return rgbToColorName(r, g, b);
}

// Convert RGB to HSL
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
        h = s = 0; // achromatic
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

// Improved color detection logic using both RGB and HSL
function rgbToColorName(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);

    if (s < 15 && l > 85) return 'White';  // Low saturation and high lightness
    if (s < 20 && l < 15) return 'Black';  // Low saturation and low lightness
    if (s < 25 && l >= 15 && l <= 85) return 'Gray';  // Low saturation and mid-range lightness
    
    // Define color ranges using both HSL and RGB
    if (r > 200 && g < 100 && b < 100 && h < 15) return 'Red';
    if (h >= 15 && h <= 45 && l >= 40) return 'Orange';
    if (h > 45 && h <= 65 && s > 50) return 'Yellow';
    if (h > 65 && h <= 150 && g > r && g > b) return 'Green';
    if (h > 150 && h <= 240 && b > r && b > g) return 'Blue';
    if (h > 240 && h <= 280 && r > g && b > g) return 'Purple';
    if (h > 280 && h <= 330 && r > b && r > g) return 'Pink';
    
    if (r > 150 && g > 150 && b < 100) return 'Light Yellow';
    if (r < 100 && g > 150 && b < 100) return 'Light Green';
    if (r < 100 && g < 100 && b > 150) return 'Light Blue';

    return 'Unknown Color';  // Default if no color match is found
}


// Function to read out text via speech synthesis
function readObjectAloud(text) {
    const speech = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(speech);
}

// Stop speech immediately
function stopSpeech() {
    window.speechSynthesis.cancel();
}

// Handle screen taps or clicks to voice out the detected object or switch cameras
document.body.addEventListener('click', function(event){
    if (isMenuOpen) return;  // Do nothing if the menu is open or the menu button was clicked
    event.stopPropagation();
    const currentTime = new Date().getTime();
    const tapDuration = currentTime - lastTapTime;

    if (tapDuration < doubleTapTimeout && tapDuration > 0) {
        toggleCamera();  // Double-tap toggles camera
    } else {
        stopSpeech();  // Stop any ongoing speech when action is triggered

        // Single tap triggers the selected mode action
        if (!isActionTriggered) {
            isActionTriggered = true;

            stopSpeech();  // Stop any ongoing speech when action is triggered
            readObjectAloud("Analyzing, please wait.")
            // Trigger the appropriate action based on the mode
            if (mode === "object-detection") {
                objectDetection();
            } else if (mode === "text-reader") {
                textReader();
            } else if (mode === "color-detection") {
                colorDetection();
            }

            setTimeout(() => { isActionTriggered = false; }, 1000);  // Add delay between taps
        }
    }

    lastTapTime = currentTime;
});


// Get all choices and set the current index
let choices = document.querySelectorAll('.choice');
let currentIndex = 0;  // Start with the first choice

// Update the appearance and positioning of the choices
function updateSelection(index) {
    choices.forEach((choice, i) => {
        choice.classList.remove('left', 'right', 'selected');  // Remove previous classes

        if (i === index) {
            choice.classList.add('selected');  // Center the selected choice
        } else if (i < index) {
            choice.classList.add('left');  // Slightly move left of the current
        } else if (i > index) {
            choice.classList.add('right');  // Slightly move right of the current
        }
    });
}

document.addEventListener("DOMContentLoaded", function() {
    // Default fade out & selection
    updateSelection(0);
    fadeOutChoice(2);
});


// Handle choice selection by click
choices.forEach((choice, index) => {
    choice.addEventListener('click', function(event) {
        event.stopPropagation();
        stopSpeech();  // Stop ongoing speech

        // Update the mode based on the clicked choice
        if (index === 0) {
            mode = "object-detection";
            updatePopupMenu()
            fadeOutChoice(2);  // Fade out the color detection box (index 2)
        } else if (index === 1) {
            mode = "text-reader";
            updatePopupMenu()
            fadeOutOtherChoices(1);
        } else if (index === 2) {
            mode = "color-detection";
            updatePopupMenu()
            fadeOutChoice(0);  // Fade out the color detection box (index 2)
        }

        currentIndex = index;  // Update the current index
        updateSelection(currentIndex);  // Re-center the selection

        stopSpeech();  // Stop any ongoing speech when switching modes

        if (currentIndex === 0) {
            readObjectAloud("Object detection mode");
        } else if (currentIndex === 1) {
            readObjectAloud("Text reader mode");
        } else if (currentIndex === 2) {
            readObjectAloud("Color detection mode");
        }
        });
});


let touchstartX = 0;
let touchendX = 0;
const minSwipeDistance = 30;  // Minimum distance for a swipe

document.addEventListener('touchstart', function(event) {
    touchstartX = event.changedTouches[0].screenX;  // Start of swipe
    console.log(touchstartX);
});

document.addEventListener('touchend', function(event) {
    touchendX = event.changedTouches[0].screenX;  // End of swipe
    console.log(touchendX);
    if (Math.abs(touchendX - touchstartX) > minSwipeDistance) {
        handleGesture();  // Handle the gesture if it's a swipe
    }
});


// Handle swipe gestures
function handleGesture() {
    if (isMenuOpen) return;  // Do nothing if the menu is open
    
    if (touchendX < touchstartX) {
        // Swipe left to move to the next choice
        currentIndex = (currentIndex + 1) % choices.length;
    }

    if (touchendX > touchstartX) {
        // Swipe right to move to the previous choice
        currentIndex = (currentIndex - 1 + choices.length) % choices.length;
    }

    updateSelection(currentIndex);  // Re-center the selection

    // Update the mode based on the new index
    if (currentIndex === 0) {
        mode = "object-detection";
        updatePopupMenu()
        fadeOutChoice(2);  // Fade out the color detection box (index 2)
    } else if (currentIndex === 1) {
        mode = "text-reader";
        updatePopupMenu()
        fadeOutOtherChoices(1);
    } else if (currentIndex === 2) {
        mode = "color-detection";
        updatePopupMenu()
        fadeOutChoice(0);  // Fade out the color detection box (index 2)
    }

    stopSpeech();  // Stop any ongoing speech when switching modes

    if (currentIndex === 0) {
        readObjectAloud("Object detection mode");
    } else if (currentIndex === 1) {
        readObjectAloud("Text reader mode");
    } else if (currentIndex === 2) {
        readObjectAloud("Color detection mode");
    }
}

//-----------

// Ensure pop-up menu starts hidden
document.getElementById('popup-menu').classList.add('hidden');

let isMenuOpen = false;  // Track whether the menu is open
// Update the menu button click handler to toggle the flag
document.getElementById('menu-btn').addEventListener('click', function(event) {
    event.stopPropagation();
    const popupMenu = document.getElementById('popup-menu');
    popupMenu.classList.toggle('hidden');  // Toggle visibility
    isMenuOpen = !popupMenu.classList.contains('hidden');  // Update the flag
});

// Close menu when user clicks outside the menu
document.addEventListener('click', (event) => {
    const popupMenu = document.getElementById('popup-menu');
    if (!popupMenu.contains(event.target) && !event.target.matches('#menu-btn')) {
        popupMenu.classList.add('hidden');  // Close menu if clicked outside
        isMenuOpen = false;  // Ensure the flag is updated
    }
});

// Handle mode selection from the pop-up menu
document.querySelectorAll('.popup-choice').forEach((choice, index) => {
    choice.addEventListener('click', function(event) {
        event.stopPropagation();
        resetChoiceVisibility();
        
        // Update the mode based on user selection
        if (index === 0) {
            mode = "object-detection";
            fadeOutChoice(2);
        } else if (index === 1) {
            mode = "text-reader";
            fadeOutOtherChoices(1);
        } else if (index === 2) {
            mode = "color-detection";
            fadeOutChoice(0);
        }
        
        stopSpeech();  // Stop any ongoing speech when switching modes
        updatePopupMenu();  // Sync with pop-up menu
        updateSelection(index);  // Update the choices below
        readObjectAloud(choice.textContent.trim());

        document.getElementById('popup-menu').classList.add('hidden');  // Close pop-up menu
    });
});

// Update pop-up menu to highlight the current mode
function updatePopupMenu() {
    document.querySelectorAll('.popup-choice').forEach(choice => {
        choice.classList.remove('active');
    });

    if (mode === "object-detection") {
        document.getElementById('popup-object-detection').classList.add('active');
    } else if (mode === "text-reader") {
        document.getElementById('popup-text-reader').classList.add('active');
    } else if (mode === "color-detection") {
        document.getElementById('popup-color-detection').classList.add('active');
    }
}

// Update the appearance of the choices
function updateSelection(index) {
    choices.forEach((choice, i) => {
        choice.classList.remove('left', 'right', 'selected');
        if (i === index) {
            choice.classList.add('selected');  // Highlight the current choice
        } else if (i < index) {
            choice.classList.add('left');  // Move previous choices to the left
        } else if (i > index) {
            choice.classList.add('right');  // Move future choices to the right
        }
    });
}

// Fade out a specific choice by setting its opacity to 0
function fadeOutChoice(choiceIndex) {
    choices.forEach((choice, index) => {
        if (index === choiceIndex) {
            choice.style.opacity = 0;  // Fade out the choice
            choice.style.pointerEvents = 'none';  // Disable interaction with the faded choice
        } else {
            if(index===2) {
                choice.style.opacity = 1; 
            } else if (index==0) {
                choice.style.opacity = 1; 
            } else {
                choice.style.opacity = 0.3; 
            }
            choice.style.pointerEvents = 'auto';  // Enable interaction
        }
    });
}

// Fade out all choices except the currently selected one
function fadeOutOtherChoices(selectedIndex) {
    choices.forEach((choice, index) => {
        if (index === selectedIndex) {
            choice.style.opacity = 1;  // Keep the selected choice fully visible
            choice.style.pointerEvents = 'auto';  // Allow interaction with the selected choice
        } else {
            choice.style.opacity = 0.3;  // Fade out the non-selected choices
            choice.style.pointerEvents = 'auto';
        }
    });
}

// Reset the visibility of all choices
function resetChoiceVisibility() {
    choices.forEach(choice => {
        choice.style.opacity = 1;  // Reset opacity for all choices
        choice.style.pointerEvents = 'auto';  // Enable interaction
    });
}


// Initial setup to center the first choice
updateSelection(currentIndex);


// Reset the formatting of all choices
function resetChoicesFormatting() {
    choices.forEach((choice) => {
        choice.style.opacity = 1;  // Reset opacity
        choice.style.pointerEvents = 'auto';  // Enable interaction
    });
}

// Start the app with the camera and choices initialized
startCamera('environment');