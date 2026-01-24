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

        // Check for PIN in URL
        const urlParams = new URLSearchParams(window.location.search);
        const pinParam = urlParams.get('pin');
        if (pinParam) {
            document.getElementById('gamePinInput').value = pinParam;
            // Optional: Auto-join? checking if user wants that. 
            // Better to let them click join to confirm account.
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
                updateParticipantProgress(currentPin, currentUser.uid, wpm, progress, accuracy, 'playing');
            }
        },
        onComplete: async (stats) => {
            // Check Disqualification
            const isDisqualified = stats.accuracy < 90;
            const finalStatus = isDisqualified ? 'disqualified' : 'finished';

            // Final update (Force)
            await updateParticipantProgress(currentPin, currentUser.uid, stats.wpm, 100, stats.accuracy, finalStatus);

            if (isDisqualified) {
                // Show Disqualified Screen
                const overlay = document.getElementById('resultOverlay');
                overlay.classList.remove('d-none');
                overlay.classList.add('d-flex');

                // Customize for disqualification
                overlay.innerHTML = `
                    <div class="text-center">
                        <h1 class="text-danger fw-bold mb-3">❌ Descalificado</h1>
                        <h3 class="text-light mb-2">Precisión Insuficiente: ${stats.accuracy}%</h3>
                        <p class="text-dim mb-4">Necesitas al menos 90% para clasificar.</p>
                        <a href="dashboard_student.html" class="btn btn-outline-light">Salir</a>
                    </div>
                `;
            } else {
                // Save Result to history
                // We assume live games are always "valid" if not disqualified, even if mode needs refinement
                await saveResult(currentUser.uid, stats.wpm, stats.accuracy, 'live', null);

                document.getElementById('resultOverlay').classList.remove('d-none');
                document.getElementById('resultOverlay').classList.add('d-flex');
            }
        }
    });

    engine.start();
}
