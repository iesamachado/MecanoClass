// Student Dashboard Logic

let currentUser = null;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profile = await getUserProfile(user.uid);
        if (!profile || profile.role !== 'student') {
            window.location.href = 'index.html'; // Protect route
            return;
        }

        // Update UI
        document.getElementById('userName').innerText = profile.displayName;
        document.getElementById('userAvatar').src = profile.photoURL;
        document.getElementById('userAvatar').style.display = 'block';

        // Big Header
        document.getElementById('welcomeText').innerText = `¡Hola, ${profile.displayName.split(' ')[0]}!`;
        document.getElementById('bigAvatar').src = profile.photoURL;

        loadStudentStats();
        loadDailyRanking();
        loadStudentClasses();

    } else {
        window.location.href = 'index.html';
    }
});

async function handleJoinClass() {
    const pinInput = document.getElementById('classPinInput');
    const pin = pinInput.value.trim();

    if (!pin || pin.length !== 6) return alert("Introduce un PIN válido de 6 dígitos.");

    try {
        const classData = await joinClass(currentUser.uid, pin);
        alert(`¡Te has unido a: ${classData.name}!`);
        pinInput.value = '';
        loadStudentClasses(); // Refresh list
    } catch (error) {
        console.error("Error joining class:", error);
        alert(error.message);
    }
}

async function loadStudentStats() {
    try {
        // Fetch last 50 results for average
        const results = await getStudentResults(currentUser.uid, 50);

        // 1. Calculate General Averages (based on what we fetched, usually last 50 is treated as "recent average")
        if (results.length > 0) {
            const totalWpm = results.reduce((sum, r) => sum + (r.wpm || 0), 0);
            const totalAcc = results.reduce((sum, r) => sum + (r.accuracy || 0), 0);

            const avgWpm = Math.round(totalWpm / results.length);
            const avgAcc = Math.round(totalAcc / results.length);

            document.getElementById('avgWpm').innerText = avgWpm;
            document.getElementById('avgAcc').innerText = avgAcc + '%';

            // 2. Calculate Last 10 for Header Stats
            const last10 = results.slice(0, 10);
            const wpmSum10 = last10.reduce((s, r) => s + (r.wpm || 0), 0);
            const accSum10 = last10.reduce((s, r) => s + (r.accuracy || 0), 0);

            const last10Wpm = Math.round(wpmSum10 / last10.length);
            const last10Acc = Math.round(accSum10 / last10.length);

            document.getElementById('headerWpm').innerText = last10Wpm;
            document.getElementById('headerAcc').innerText = last10Acc;

        } else {
            document.getElementById('avgWpm').innerText = '0';
            document.getElementById('avgAcc').innerText = '0%';
            document.getElementById('headerWpm').innerText = '0';
            document.getElementById('headerAcc').innerText = '0';
        }
    } catch (e) {
        console.error("Error loading stats", e);
    }
}

async function loadDailyRanking() {
    const tbody = document.getElementById('dailyRankingBody');
    try {
        const topScores = await getDailyTopScores(5);

        if (topScores.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Sin actividad hoy. ¡Sé el primero!</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        for (let i = 0; i < topScores.length; i++) {
            const score = topScores[i];
            let name = "Anónimo";

            // Try to get profile
            try {
                const profile = await getUserProfile(score.studentId);
                if (profile) {
                    name = profile.displayName;
                }
            } catch (e) { console.warn("Error fetching profile", e); }

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-dim text-center fw-bold">#${i + 1}</td>
                    <td class="bg-transparent border-secondary text-light">${name}</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold">${score.wpm}</td>
                    <td class="bg-transparent border-secondary text-info text-center">${score.accuracy}%</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', tr);
        }

    } catch (e) {
        console.error("Error loading daily ranking", e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar ranking.</td></tr>';
    }
}

async function loadStudentClasses() {
    const container = document.getElementById('myClassesList');
    // container.innerHTML = '...'; // Keep loading state if managed

    try {
        // Query classes where members array contains currentUser.uid
        // Note: db.js handles auth, but here we run a query.
        // If this query is frequent, index might be needed.
        const snapshot = await db.collection('classes')
            .where('members', 'array-contains', currentUser.uid)
            .get();

        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = '<div class="col-12 text-center text-dim py-3">No te has unido a ninguna clase aún.</div>';
            return;
        }

        const classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        classes.forEach(cls => {
            const card = `
                <div class="col-md-6 col-lg-4">
                    <div class="card bg-dark border-secondary h-100">
                        <div class="card-body">
                            <h5 class="card-title text-light mb-1">${cls.name}</h5>
                            <p class="card-text text-dim small mb-3">Profesor ID: ...${cls.teacherId.slice(-4)}</p> 
                            <div class="d-grid">
                                <a href="practice.html?classId=${cls.id}" class="btn btn-premium btn-sm">
                                    <i class="bi bi-play-fill me-1"></i>Practicar
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', card);
        });

    } catch (error) {
        console.error("Error loading student classes:", error);
        container.innerHTML = '<div class="col-12 text-center text-danger">Error al cargar clases.</div>';
    }
}

