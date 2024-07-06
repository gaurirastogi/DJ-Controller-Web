// Audio elements
const audio1 = new Audio();
const audio2 = new Audio();

// Function to handle file upload
function handleFileUpload(event, audioElement, nameElement) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        audioElement.src = e.target.result;
        nameElement.textContent = file.name; // Display file name
    };

    reader.readAsDataURL(file);
}

// Event listeners for file uploads
document.getElementById('uploadSong1').addEventListener('change', function(event) {
    handleFileUpload(event, audio1, document.getElementById('song1Name'));
});

document.getElementById('uploadSong2').addEventListener('change', function(event) {
    handleFileUpload(event, audio2, document.getElementById('song2Name'));
});

// Event listeners for play, pause, stop, and repeat buttons (Song 1)
document.getElementById('playSong1').addEventListener('click', function() {
    if (audio1.src) {
        audio1.play();
    } else {
        alert('Please upload Song 1.');
    }
});

document.getElementById('pauseSong1').addEventListener('click', function() {
    audio1.pause();
});

document.getElementById('stopSong1').addEventListener('click', function() {
    audio1.pause();
    audio1.currentTime = 0;
});

document.getElementById('repeatSong1').addEventListener('click', function() {
    audio1.loop = !audio1.loop;
});

// Event listener for volume control (Song 1)
document.getElementById('volumeSong1').addEventListener('input', function() {
    audio1.volume = parseFloat(this.value);
});

// Event listener for pitch control (Song 1)
document.getElementById('pitchSong1').addEventListener('input', function() {
    audio1.playbackRate = parseFloat(this.value);
});

// Event listener for loop control (Song 1)
document.getElementById('loopSong1').addEventListener('click', function() {
    audio1.loop = !audio1.loop;
});

// Event listeners for play, pause, stop, and repeat buttons (Song 2)
document.getElementById('playSong2').addEventListener('click', function() {
    if (audio2.src) {
        audio2.play();
    } else {
        alert('Please upload Song 2.');
    }
});

document.getElementById('pauseSong2').addEventListener('click', function() {
    audio2.pause();
});

document.getElementById('stopSong2').addEventListener('click', function() {
    audio2.pause();
    audio2.currentTime = 0;
});

document.getElementById('repeatSong2').addEventListener('click', function() {
    audio2.loop = !audio2.loop;
});

// Event listener for volume control (Song 2)
document.getElementById('volumeSong2').addEventListener('input', function() {
    audio2.volume = parseFloat(this.value);
});

// Event listener for pitch control (Song 2)
document.getElementById('pitchSong2').addEventListener('input', function() {
    audio2.playbackRate = parseFloat(this.value);
});

// Event listener for loop control (Song 2)
document.getElementById('loopSong2').addEventListener('click', function() {
    audio2.loop = !audio2.loop;
});

// Event listener for crossfade control
document.getElementById('crossfade').addEventListener('input', function() {
    const crossfadeValue = parseFloat(this.value);
    const volume1 = Math.cos(crossfadeValue * 0.5 * Math.PI);
    const volume2 = Math.cos((1.0 - crossfadeValue) * 0.5 * Math.PI);

    audio1.volume = volume1;
    audio2.volume = volume2;
});

// Event listener for auto-fade button
document.getElementById('autoFade').addEventListener('click', function() {
    const fadeDuration = 3; // Example duration in seconds
    const interval = 50; // Interval for fade steps (ms)
    const steps = fadeDuration * 1000 / interval;
    const volumeStep = 1 / steps;

    let currentVolume1 = audio1.volume;
    let currentVolume2 = audio2.volume;

    const fadeOutInterval = setInterval(function() {
        if (currentVolume1 > 0) {
            currentVolume1 -= volumeStep;
            audio1.volume = Math.max(currentVolume1, 0);
        }
        if (currentVolume2 > 0) {
            currentVolume2 -= volumeStep;
            audio2.volume = Math.max(currentVolume2, 0);
        }
        if (currentVolume1 <= 0 && currentVolume2 <= 0) {
            clearInterval(fadeOutInterval);
            audio1.pause();
            audio1.currentTime = 0;
            audio2.pause();
            audio2.currentTime = 0;
        }
    }, interval);
});

// Event listener for sync button
document.getElementById('syncSongs').addEventListener('click', function() {
    if (audio1.duration && audio2.duration) {
        const bpm1 = calculateBPM(audio1.duration); // Function to calculate BPM
        const bpm2 = calculateBPM(audio2.duration);
        const adjustmentRatio = bpm1 / bpm2;

        if (adjustmentRatio !== 1) {
            audio2.playbackRate = adjustmentRatio;
        }
    }
});

// Function to calculate BPM (dummy function)
function calculateBPM(duration) {
    // Dummy implementation, replace with actual BPM calculation logic
    return 120; // Example BPM value
}

// Function to update current time display (Song 1)
function updateCurrentTimeSong1() {
    document.getElementById('currentTimeSong1').textContent = formatTime(audio1.currentTime);
}

// Function to update current time display (Song 2)
function updateCurrentTimeSong2() {
    document.getElementById('currentTimeSong2').textContent = formatTime(audio2.currentTime);
}

// Function to format time as mm:ss
function formatTime(time) {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Event listener for seek control (Song 1)
document.getElementById('seekSong1').addEventListener('input', function() {
    audio1.currentTime = parseInt(this.value);
});

// Event listener for seek control (Song 2)
document.getElementById('seekSong2').addEventListener('input', function() {
    audio2.currentTime = parseInt(this.value);
});

// Update current time displays
audio1.addEventListener('timeupdate', updateCurrentTimeSong1);
audio2.addEventListener('timeupdate', updateCurrentTimeSong2);

// Reset seek controls on song end
audio1.addEventListener('ended', function() {
    document.getElementById('seekSong1').value = 0;
    document.getElementById('currentTimeSong1').textContent = '0:00';
});

audio2.addEventListener('ended', function() {
    document.getElementById('seekSong2').value = 0;
    document.getElementById('currentTimeSong2').textContent = '0:00';
});
