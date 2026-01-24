// Live Host Logic

let gamePin = null;
let participants = [];
// const gameText = "La velocidad es importante pero la precision es fundamental para ganar esta carrera.";
let gameText = "Texto de carrera cargando...";

auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Init Game
        initGame(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

async function initGame(hostId) {
    try {
        // Select random text from library if available
        if (typeof initialTexts !== 'undefined' && initialTexts.length > 0) {
            const randomIdx = Math.floor(Math.random() * initialTexts.length);
            gameText = initialTexts[randomIdx].text;
            // Optional: Store title/category for display?
            // console.log("Selected Text:", initialTexts[randomIdx].category);
        } else {
            gameText = "La velocidad es importante pero la precision es fundamental para ganar esta carrera.";
        }

        gamePin = await createLiveSession(hostId, gameText);
        document.getElementById('gamePin').innerText = gamePin;

        // Listen for players
        listenToParticipants(gamePin, updateLobby);

    } catch (error) {
        console.error("Error creating game:", error);
        alert("Error al crear la partida.");
    }
}

function updateLobby(updatedParticipants) {
    participants = updatedParticipants;

    // Update Lobby UI
    const grid = document.getElementById('playersGrid');
    // Simple diffing: clear and rebuild for now
    grid.innerHTML = '';

    participants.forEach(async p => { // Async map issue? No, we just trigger fetches
        // Fetch user data for avatars if not in participant object?
        // Participant object only has IDs. We need to fetch profiles.
        // Optimization: Cache profiles.

        let profile = await getUserProfile(p.studentId);
        if (!profile) profile = { displayName: 'Player', photoURL: '' }; // Fallback

        const el = `
            <div class="text-center fade-in">
                <img src="${profile.photoURL}" class="rounded-circle border border-2 border-white mb-2" style="width: 60px; height: 60px;">
                <p class="text-white small mb-0">${profile.displayName}</p>
            </div>
        `;
        grid.insertAdjacentHTML('beforeend', el);
    });

    // Update Race UI if game running
    updateRaceTracks(participants);
}

function startGame() {
    if (participants.length === 0) return alert("Espera a que se unan jugadores.");

    startLiveSession(gamePin);

    // Switch Views
    document.getElementById('lobbyView').classList.add('d-none');
    document.getElementById('raceView').classList.remove('d-none');
    document.getElementById('raceView').classList.add('d-block');

    // Initialize Race Tracks
    initRaceTracks();
}

let playerProfilesCache = {};

const LANE_HEIGHT = 60;
const LANE_GAP = 16;

async function initRaceTracks() {
    const tracksContainer = document.getElementById('raceTracks');
    tracksContainer.innerHTML = '';

    // Set container height based on participants
    const totalHeight = participants.length * (LANE_HEIGHT + LANE_GAP);
    tracksContainer.style.height = `${totalHeight}px`;

    participants.forEach(async (p, index) => {
        let profile = playerProfilesCache[p.studentId];
        if (!profile) {
            profile = await getUserProfile(p.studentId);
            playerProfilesCache[p.studentId] = profile;
        }

        const initialTop = index * (LANE_HEIGHT + LANE_GAP);

        const trackHtml = `
            <div class="racer-lane" id="lane-${p.studentId}" style="top: ${initialTop}px;">
                <div class="racer-name text-truncate" style="max-width: 100px;">${profile.displayName}</div>
                <div class="racer-track"></div>
                <img src="${profile.photoURL}" class="racer-avatar" style="left: 0%;">
            </div>
        `;
        tracksContainer.insertAdjacentHTML('beforeend', trackHtml);
    });
}

function updateRaceTracks(currentParticipants) {
    // Determine winners
    const finished = currentParticipants.filter(p => p.progress >= 100);
    if (finished.length > 0) {
        // Sort by completion time if available, or just loosely by arrival of update (imperfect)
        // For accurate ranking, we should store 'finishedAt' in participant doc.
        // Assuming database handles updates fast enough for visual demo.
    }

    // Sort participants for visualization
    // 1. Qualified vs Disqualified
    // 2. Progress Desc
    // 3. WPM Desc (Tie breaker)
    const sortedParticipants = [...currentParticipants].sort((a, b) => {
        const aDisq = a.status === 'disqualified';
        const bDisq = b.status === 'disqualified';

        if (aDisq && !bDisq) return 1; // a goes to bottom
        if (!aDisq && bDisq) return -1; // b goes to bottom

        // Both qualified or both disqualified: Sort by Progress
        if (b.progress !== a.progress) {
            return b.progress - a.progress;
        }

        // Tie breaker: WPM
        return (b.wpm || 0) - (a.wpm || 0);
    });

    // Update positions
    sortedParticipants.forEach((p, index) => {
        const lane = document.getElementById(`lane-${p.studentId}`);
        if (lane) {
            // Update Avatar Position (Movement)
            const avatar = lane.querySelector('.racer-avatar');
            avatar.style.left = `calc(${p.progress}% - 25px)`;

            // Update Lane Vertical Position (Ranking)
            const newTop = index * (LANE_HEIGHT + LANE_GAP);
            lane.style.top = `${newTop}px`;

            // Visual feedback for disqualification
            if (p.status === 'disqualified') {
                avatar.style.border = '2px solid red';
                avatar.style.opacity = '0.7';
                lane.style.background = 'rgba(248, 113, 113, 0.1)';
            }
        }
    });

    // Check for game End (all finished or close enough)
    // We consider 'disqualified' players as finished for the purpose of ending the game logic
    if (currentParticipants.length > 0 && currentParticipants.every(p => p.progress >= 100)) {
        showPodium(currentParticipants);
    }
}

function showPodium(finalParticipants) {
    // Filter out disqualified players
    const qualifiedParticipants = finalParticipants.filter(p => p.status !== 'disqualified');

    // Sort logic here (needs finishedAt ideally)
    // loose sort by WPM for now as proxy?
    qualifiedParticipants.sort((a, b) => b.wpm - a.wpm);

    const [first, second, third] = qualifiedParticipants;

    if (first) setPodiumData('gold', first);
    if (second) setPodiumData('silver', second);
    if (third) setPodiumData('bronze', third);

    document.getElementById('raceView').classList.add('d-none');
    document.getElementById('raceView').classList.remove('d-block');
    document.getElementById('podiumView').classList.remove('d-none');
    document.getElementById('podiumView').classList.add('d-flex');
}

async function setPodiumData(type, participant) {
    let profile = playerProfilesCache[participant.studentId];
    if (!profile) profile = await getUserProfile(participant.studentId);

    document.getElementById(`${type}Avatar`).src = profile.photoURL;
}

function exitGame() {
    if (confirm("¿Estás seguro de cerrar la partida?")) {
        // endLiveSession(gamePin);
        window.location.href = 'dashboard_teacher.html';
    }
}

function joinAsPlayer() {
    if (!gamePin) return alert("Espera a que se genere el PIN.");
    window.open(`live_player.html?pin=${gamePin}`, '_blank');
}
