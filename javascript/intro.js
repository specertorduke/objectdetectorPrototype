let firstClick = true;

document.addEventListener('click', function() {
    if (firstClick) {
        stopSpeech();
        readObjectAloud("Welcome to INSIGHTFUL! Press anywhere to start the app.");
        firstClick = false;  // After the first click, set this to false
    } else {
        var overlay = document.getElementById('overlay');
        overlay.classList.add('expand');
        setTimeout(function() {
            window.location.href = 'objectdetector.html';
        }, 500);  // Match this duration with the CSS transition duration
    }
}, { once: false });  // Ensure this can run multiple times


// Function to read out text via speech synthesis
function readObjectAloud(text) {
    const speech = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(speech);
}

function stopSpeech() {
    window.speechSynthesis.cancel();
}