// Live Player Logic

let currentUser = null;
let currentPin = null;
let engine = null;
let profile = null;

// Throttling updates
let lastUpdate = 0;
const UPDATE_INTERVAL = 2000; // 2 seconds

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        profile = await getUserProfile(user.uid);
        if (!profile) {
            // Edge case: User deleted or error?
            alert("Error de perfil. Relogueando...");
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

async function joinGame() {
    const pinInput = document.getElementById('gamePinInput');
    const pin = pinInput.value.trim();

    if (!pin) return alert("Introduce el PIN");

    try {
        currentPin = pin;
        const sessionData = await joinLiveSession(pin, currentUser.uid);

        // Show Waiting Screen
        document.getElementById('joinScreen').classList.add('d-none');
        document.getElementById('waitingScreen').classList.remove('d-none');
        document.getElementById('waitingScreen').classList.add('d-flex');

        // Listen for Start
        listenToSession(pin, handleSessionUpdate);

    } catch (error) {
        console.error("Error joining game:", error);
        alert(error.message);
    }
}

function handleSessionUpdate(sessionData) {
    if (sessionData.status === 'running') {
        // Start Game
        startGame(sessionData.text);
    } else if (sessionData.status === 'finished') {
        // Force end if not finished?
        // engine.stop();
    }
}

function startGame(text) {
    document.getElementById('waitingScreen').classList.remove('d-flex');
    document.getElementById('waitingScreen').classList.add('d-none');

    document.getElementById('gameScreen').classList.remove('d-none');
    document.getElementById('gameScreen').classList.add('d-flex');

    document.getElementById('hiddenInput').focus();

    engine = new TypingEngine(text, {
        onUpdate: (wpm, accuracy) => {
            // Update UI
            document.getElementById('wpmDisplay').innerText = wpm;

            // Calculate Progress (approx based on index vs length)
            const progress = Math.min(100, Math.round((engine.currentIndex / engine.fullText.length) * 100));
            document.getElementById('progressDisplay').innerText = progress + '%';

            // Send to DB throttled
            const now = Date.now();
            if (now - lastUpdate > UPDATE_INTERVAL) {
                lastUpdate = now;
                updateParticipantProgress(currentPin, currentUser.uid, wpm, progress);
            }
        },
        onComplete: async (stats) => {
            // Final update (Force)
            await updateParticipantProgress(currentPin, currentUser.uid, stats.wpm, 100);

            // Save Result to history too?
            await saveResult(currentUser.uid, stats.wpm, stats.accuracy, 'live', null); // null classId for now

            document.getElementById('resultOverlay').classList.remove('d-none');
            document.getElementById('resultOverlay').classList.add('d-flex');
        }
    });

    engine.start();
}
