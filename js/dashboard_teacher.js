// Teacher Dashboard Logic

let currentUser = null;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profile = await getUserProfile(user.uid);
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
    } else {
        window.location.href = 'index.html';
    }
});

async function loadTeacherStats() {
    try {
        // reuse same logic: fetch results for current user (teacher)
        const results = await getStudentResults(currentUser.uid, 20); // Last 20 is enough for last 10 calc

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
