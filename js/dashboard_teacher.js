// Teacher Dashboard Logic

let currentUser = null;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profile = await getUserProfile(user.uid);
        //  console.log("Teacher Dashboard - Profile:", profile); // DEBUG LOG
        if (!profile || profile.role !== 'teacher') {
            window.location.href = 'index.html'; // Protect route
            return;
        }

        // Update UI
        // UI updates handled by components.js for header
        // document.getElementById('userName').innerText = profile.displayName;
        // document.getElementById('userAvatar').src = profile.photoURL;
        // document.getElementById('userAvatar').style.display = 'block';

        loadClasses();
        loadTeacherStats();
        loadTeacherHistory();
        loadTeacherLiveGames();
    } else {
        window.location.href = 'index.html';
    }
});

async function loadTeacherStats() {
    try {
        // reuse same logic: fetch results for current user (teacher)
        // reuse same logic: fetch results for current user (teacher)
        const allResults = await getStudentResults(currentUser.uid, 20); // Last 20 is enough for last 10 calc

        // Filter valid results
        const results = allResults.filter(r => (r.accuracy || 0) >= 90);

        if (results.length > 0) {
            // Calculate Last 10 for Header Stats
            const last10 = results.slice(0, 10);
            const wpmSum10 = last10.reduce((s, r) => s + (r.wpm || 0), 0);
            const accSum10 = last10.reduce((s, r) => s + (r.accuracy || 0), 0);

            const last10Wpm = Math.round(wpmSum10 / last10.length);
            const last10Acc = Math.round(accSum10 / last10.length);

            document.getElementById('headerWpm').innerText = last10Wpm;
            document.getElementById('headerAcc').innerText = last10Acc;
        } else {
            document.getElementById('headerWpm').innerText = '0';
            document.getElementById('headerAcc').innerText = '0';
        }
    } catch (e) {
        console.error("Error loading teacher stats", e);
    }
}

async function handleCreateClass() {
    const nameInput = document.getElementById('classNameInput');
    const name = nameInput.value.trim();

    if (!name) return alert("Por favor, introduce un nombre para la clase.");

    try {
        const newClass = await createClass(currentUser.uid, name);
        nameInput.value = '';
        loadClasses(); // Refresh list
        alert(`Clase creada con PIN: ${newClass.pin}`);
    } catch (error) {
        console.error("Error creating class:", error);
        alert("Error al crear la clase.");
    }
}

async function loadClasses() {
    const listContainer = document.getElementById('classesList');
    listContainer.innerHTML = '<div class="col-12 text-center text-dim py-5"><div class="spinner-border text-primary" role="status"></div></div>';

    try {
        const classes = await getTeacherClasses(currentUser.uid);

        listContainer.innerHTML = '';

        if (classes.length === 0) {
            listContainer.innerHTML = `
                <div class="col-12 text-center text-dim py-5">
                    <i class="bi bi-journal-x fs-1 mb-3 d-block"></i>
                    <p>No has creado ninguna clase todavía.</p>
                </div>`;
            return;
        }

        classes.forEach(cls => {
            const date = cls.createdAt ? cls.createdAt.toDate().toLocaleDateString() : 'Reciente';
            const card = `
                <div class="col-md-6 col-lg-4">
                    <div class="glass-panel p-4 h-100 position-relative">
                        <div class="d-flex justify-content-between align-items-start mb-3">
                            <h5 class="text-light fw-bold text-truncate">${cls.name}</h5>
                            <span class="badge bg-primary rounded-pill">${date}</span>
                        </div>
                        <div class="bg-dark bg-opacity-50 p-3 rounded-3 mb-3 text-center">
                            <span class="text-dim text-uppercase small ls-1">PIN DE CLASE</span>
                            <h2 class="text-white fw-bold mb-0 letter-spacing-2 select-all">${cls.pin}</h2>
                        </div>
                        <a href="dashboard_class_details.html?id=${cls.id}" class="btn btn-sm btn-outline-light w-100">
                            <i class="bi bi-eye me-2"></i>Ver Alumnos & Resultados
                        </a>
                    </div>
                </div>
            `;
            listContainer.insertAdjacentHTML('beforeend', card);
        });

    } catch (error) {
        console.error("Error loading classes:", error);
        listContainer.innerHTML = '<p class="text-danger text-center">Error al cargar las clases.</p>';
    }
}

async function loadTeacherHistory() {
    const tbody = document.getElementById('teacherHistoryTableBody');
    try {
        const results = await getStudentResults(currentUser.uid, 30);

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-dim">No tienes actividad reciente.</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        results.forEach(r => {
            const date = r.timestamp
                ? new Date(r.timestamp.seconds * 1000).toLocaleDateString() + ' ' +
                new Date(r.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'N/A';

            const textSummary = r.textSummary
                ? `<span class="text-light small">${r.textSummary}...</span>`
                : '<span class="text-dim">-</span>';

            const duration = r.duration
                ? `<span class="text-info">${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}</span>`
                : '<span class="text-dim">-</span>';

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-dim ps-4 text-nowrap">${date}</td>
                    <td class="bg-transparent border-secondary">${textSummary}</td>
                    <td class="bg-transparent border-secondary text-center">${duration}</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold">${r.wpm}</td>
                    <td class="bg-transparent border-secondary text-info text-center pe-4">${r.accuracy}%</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', tr);
        });

    } catch (e) {
        console.error("Error loading teacher history", e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Error al cargar historial.</td></tr>';
    }
}

async function loadTeacherLiveGames() {
    const tbody = document.getElementById('liveGamesTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando partidas...</td></tr>';

    try {
        const snapshot = await db.collection('live_sessions')
            .where('hostId', '==', currentUser.uid)
            .get();

        const sessions = snapshot.docs.map(doc => doc.data())
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        tbody.innerHTML = '';
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No has creado partidas en vivo.</td></tr>';
            return;
        }

        sessions.forEach(s => {
            const date = s.createdAt ? s.createdAt.toDate().toLocaleString() : 'Reciente';
            const statusClass = s.status === 'running' ? 'text-success' : 'text-secondary';
            const statusLabel = s.status === 'running' ? 'En Curso' : (s.status === 'finished' ? 'Finalizada' : 'Lobby');

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-light ps-4">${date}</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold font-monospace">${s.pin}</td>
                    <td class="bg-transparent border-secondary text-center ${statusClass}">${statusLabel}</td>
                    <td class="bg-transparent border-secondary text-end pe-4">
                        <button class="btn btn-sm btn-outline-info" onclick="viewGameResults('${s.pin}', '${date}')">
                            <i class="bi bi-list-ol me-1"></i>Ver Resultados
                        </button>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', tr);
        });

    } catch (e) {
        console.error("Error loading live games:", e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar partidas.</td></tr>';
    }
}

async function viewGameResults(pin, dateStr) {
    const modal = new bootstrap.Modal(document.getElementById('gameResultsModal'));
    document.getElementById('gameResultsDate').innerText = dateStr;
    document.getElementById('gameResultsPin').innerText = 'PIN: ' + pin;

    const tbody = document.getElementById('gameResultsBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando resultados...</td></tr>';

    modal.show();

    try {
        const snapshot = await db.collection('live_participants')
            .where('sessionId', '==', pin)
            .get();

        const participants = snapshot.docs.map(doc => doc.data());

        // Enrich with user profiles (fetch all needed)
        // Optimization: Use Promise.all
        const enriched = await Promise.all(participants.map(async p => {
            const userProfile = await getUserProfile(p.studentId);
            return { ...p, name: userProfile ? userProfile.displayName : 'Desconocido', avatar: userProfile ? userProfile.photoURL : '' };
        }));

        // Split valid and invalid
        const validParticipants = enriched.filter(p => (p.accuracy || 0) >= 90);
        const invalidParticipants = enriched.filter(p => (p.accuracy || 0) < 90);

        // Sort Both by WPM Desc
        validParticipants.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));
        invalidParticipants.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));

        // Podium Logic (Only Valid)
        const podiumDiv = document.getElementById('gameResultsPodium');
        if (validParticipants.length > 0) {
            podiumDiv.classList.remove('d-none');

            // Gold
            const gold = validParticipants[0];
            const goldEl = document.getElementById('resGoldAvatar').parentElement;
            if (gold) {
                document.getElementById('resGoldAvatar').src = gold.avatar || 'img/default-avatar.png';
                document.getElementById('resGoldName').innerText = gold.name;
                document.getElementById('resGoldWpm').innerText = (gold.wpm || 0) + ' PPM';
                goldEl.style.visibility = 'visible';
            } else {
                goldEl.style.visibility = 'hidden';
            }

            // Silver
            const silver = validParticipants[1];
            const silverEl = document.getElementById('resSilverAvatar').parentElement;
            if (silver) {
                document.getElementById('resSilverAvatar').src = silver.avatar || 'img/default-avatar.png';
                document.getElementById('resSilverName').innerText = silver.name;
                document.getElementById('resSilverWpm').innerText = (silver.wpm || 0) + ' PPM';
                silverEl.style.visibility = 'visible';
            } else {
                silverEl.style.visibility = 'hidden';
            }

            // Bronze
            const bronze = validParticipants[2];
            const bronzeEl = document.getElementById('resBronzeAvatar').parentElement;
            if (bronze) {
                document.getElementById('resBronzeAvatar').src = bronze.avatar || 'img/default-avatar.png';
                document.getElementById('resBronzeName').innerText = bronze.name;
                document.getElementById('resBronzeWpm').innerText = (bronze.wpm || 0) + ' PPM';
                bronzeEl.style.visibility = 'visible';
            } else {
                bronzeEl.style.visibility = 'hidden';
            }

        } else {
            podiumDiv.classList.add('d-none');
        }

        // Render Table (Valid + Invalid)
        tbody.innerHTML = '';
        if (validParticipants.length === 0 && invalidParticipants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No hay participantes.</td></tr>';
        } else {
            // 1. Render Valid
            validParticipants.forEach((p, index) => {
                let rankClass = 'text-dim';
                if (index === 0) rankClass = 'text-warning fw-bold';
                if (index === 1) rankClass = 'text-secondary fw-bold';
                if (index === 2) rankClass = 'text-danger fw-bold';

                const tr = `
                    <tr>
                        <td class="bg-transparent border-secondary text-center ${rankClass}">#${index + 1}</td>
                        <td class="bg-transparent border-secondary text-light">
                            <div class="d-flex align-items-center">
                                <img src="${p.avatar || 'img/default-avatar.png'}" class="rounded-circle me-2" style="width: 24px; height: 24px; object-fit: cover;">
                                ${p.name}
                            </div>
                        </td>
                        <td class="bg-transparent border-secondary text-primary text-center fw-bold">${p.wpm || 0}</td>
                        <td class="bg-transparent border-secondary text-info text-center">${p.accuracy || 0}%</td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });

            // 2. Render Invalid
            invalidParticipants.forEach((p) => {
                const tr = `
                    <tr>
                        <td class="bg-transparent border-secondary text-center text-danger fw-bold">DQ</td>
                        <td class="bg-transparent border-secondary text-dim opacity-75">
                            <div class="d-flex align-items-center">
                                <img src="${p.avatar || 'img/default-avatar.png'}" class="rounded-circle me-2 grayscale" style="width: 24px; height: 24px; object-fit: cover; filter: grayscale(100%);">
                                ${p.name}
                            </div>
                        </td>
                        <td class="bg-transparent border-secondary text-dim text-center opacity-75">${p.wpm || 0}</td>
                        <td class="bg-transparent border-secondary text-danger text-center fw-bold">${p.accuracy || 0}%</td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', tr);
            });
        }

    } catch (e) {
        console.error("Error loading game details:", e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar detalles.</td></tr>';
    }
}
