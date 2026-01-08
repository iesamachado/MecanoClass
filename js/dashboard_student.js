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
        // Header UI handled by components.js
        // document.getElementById('userName').innerText = profile.displayName;
        // document.getElementById('userAvatar').src = profile.photoURL;
        // document.getElementById('userAvatar').style.display = 'block';

        // Big Header
        document.getElementById('welcomeText').innerText = `¡Hola, ${profile.displayName.split(' ')[0]}!`;
        document.getElementById('bigAvatar').src = profile.photoURL;

        loadStudentStats();
        loadDailyRanking();
        loadStudentClasses();
        loadStudentHistory();
        loadStudentAssignments();

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
        const allResults = await getStudentResults(currentUser.uid, 50);

        // Filter valid results (accuracy >= 90%)
        const results = allResults.filter(r => (r.accuracy || 0) >= 90);

        // 1. Calculate General Averages using AppUI
        const stats = AppUI.calculateAverages(results);

        document.getElementById('avgWpm').innerText = stats.wpm;
        document.getElementById('avgAcc').innerText = stats.accuracy + '%';

        // Header stats are now handled by AppUI.fetchAndRenderStats() automatically on load/auth
        // No need to duplicate update logic here.

    } catch (e) {
        console.error("Error loading stats", e);
        document.getElementById('avgWpm').innerText = '--';
        document.getElementById('avgAcc').innerText = '--%';
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


async function loadStudentHistory() {
    const tbody = document.getElementById('historyTableBody');
    try {
        // reuse getStudentResults, maybe increase limit
        const results = await getStudentResults(currentUser.uid, 20);

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No tienes actividad reciente.</td></tr>';
            return;
        }

        tbody.innerHTML = '';

        results.forEach(r => {
            const date = r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleDateString() + ' ' + new Date(r.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
            const modeLabel = r.classId ? '<span class="badge bg-primary">Clase</span>' : '<span class="badge bg-secondary">Práctica</span>';

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-dim ps-4 text-nowrap">${date}</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold">${r.wpm}</td>
                    <td class="bg-transparent border-secondary text-info text-center">${r.accuracy}%</td>
                    <td class="bg-transparent border-secondary text-end pe-4">${modeLabel}</td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', tr);
        });

    } catch (e) {
        console.error("Error loading history", e);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar historial.</td></tr>';
    }
}

async function loadStudentAssignments() {
    const container = document.getElementById('myAssignmentsList');

    try {
        // Get all classes the student is in
        const snapshot = await db.collection('classes')
            .where('members', 'array-contains', currentUser.uid)
            .get();

        let allAssignments = [];

        // For each class, get its assignments
        for (const classDoc of snapshot.docs) {
            const classData = classDoc.data();
            const classId = classDoc.id;

            // Get Classroom assignments (if class is linked to Classroom)
            if (classData.classroomCourseId) {
                const assignmentsSnap = await db.collection('classes')
                    .doc(classId)
                    .collection('assignments')
                    .orderBy('createdAt', 'desc')
                    .get();

                for (const assignDoc of assignmentsSnap.docs) {
                    const assignment = assignDoc.data();

                    // Get student's results for this class
                    const results = await db.collection('results')
                        .where('studentId', '==', currentUser.uid)
                        .where('classId', '==', classId)
                        .get();

                    const resultsList = results.docs
                        .map(doc => doc.data())
                        .filter(r => r.timestamp)
                        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

                    // Calculate grade based on assignment requirements
                    const exerciseCount = resultsList.length;
                    const requiredCount = assignment.exerciseCount || 1;
                    const targetWpm = assignment.targetWpm || 0;

                    // Get last N results matching the requirement
                    const relevantResults = resultsList.slice(0, requiredCount);

                    let grade = 0;
                    let status = 'Pendiente';
                    let statusClass = 'bg-warning';

                    if (exerciseCount >= requiredCount) {
                        // Calculate average WPM and accuracy from relevant results
                        const avgWpm = relevantResults.reduce((sum, r) => sum + (r.wpm || 0), 0) / relevantResults.length;
                        const avgAcc = relevantResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / relevantResults.length;

                        // Grade calculation (same as syncClassroomGrades)
                        const wpmRatio = Math.min(avgWpm / targetWpm, 1);
                        const accRatio = avgAcc / 100;
                        grade = Math.round((wpmRatio * 0.6 + accRatio * 0.4) * 10);

                        status = 'Completada';
                        statusClass = grade >= 5 ? 'bg-success' : 'bg-danger';
                    }

                    allAssignments.push({
                        assignment,
                        classId,
                        className: classData.name,
                        progress: `${exerciseCount}/${requiredCount}`,
                        grade,
                        status,
                        statusClass,
                        type: 'classroom'
                    });
                }
            }     // Get Local assignments
            const localAssignments = classData.localAssignments || [];
            for (const assignment of localAssignments) {
                // Get student's results for this class
                const results = await db.collection('results')
                    .where('studentId', '==', currentUser.uid)
                    .where('classId', '==', classId)
                    .get();

                const resultsList = results.docs
                    .map(doc => doc.data())
                    .filter(r => r.timestamp)
                    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

                const exerciseCount = resultsList.length;
                const requiredCount = assignment.exerciseCount || 1;
                const targetWpm = assignment.targetWpm || 0;
                const relevantResults = resultsList.slice(0, requiredCount);

                let grade = 0;
                let status = 'Pendiente';
                let statusClass = 'bg-warning';

                if (exerciseCount >= requiredCount) {
                    const avgWpm = relevantResults.reduce((sum, r) => sum + (r.wpm || 0), 0) / relevantResults.length;
                    const avgAcc = relevantResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / relevantResults.length;

                    const wpmRatio = Math.min(avgWpm / targetWpm, 1);
                    const accRatio = avgAcc / 100;
                    grade = Math.round((wpmRatio * 0.6 + accRatio * 0.4) * 10);

                    status = 'Completada';
                    statusClass = grade >= 5 ? 'bg-success' : 'bg-danger';
                }

                allAssignments.push({
                    assignment,
                    classId,
                    className: classData.name,
                    progress: `${exerciseCount}/${requiredCount}`,
                    grade,
                    status,
                    statusClass,
                    type: 'local'
                });
            }
        }

        if (allAssignments.length === 0) {
            container.innerHTML = '<div class="text-center py-4 text-dim">No tienes tareas asignadas.</div>';
            return;
        }

        // Render assignments
        container.innerHTML = '';
        allAssignments.forEach(item => {
            const card = `
                <div class="card bg-dark border-secondary mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <h5 class="card-title text-light mb-1">${item.assignment.title}</h5>
                                <p class="card-text text-dim small mb-2">
                                    <i class="bi bi-book me-2"></i>${item.className}
                                </p>
                            </div>
                            <span class="badge ${item.statusClass}">${item.status}</span>
                        </div>
                        <div class="row g-3 mt-2">
                            <div class="col-md-3">
                                <small class="text-dim d-block">Progreso</small>
                                <strong class="text-info">${item.progress} ejercicios</strong>
                            </div>
                            <div class="col-md-3">
                                <small class="text-dim d-block">Objetivo PPM</small>
                                <strong class="text-primary">${item.assignment.targetWpm} PPM</strong>
                            </div>
                            <div class="col-md-3">
                                <small class="text-dim d-block">Nota Calculada</small>
                                <strong class="text-${item.grade >= 5 ? 'success' : 'danger'} fs-5">${item.grade}/10</strong>
                            </div>
                            <div class="col-md-3">
                                <small class="text-dim d-block mb-2">Acción</small>
                                <a href="practice.html?classId=${item.classId}" class="btn btn-sm btn-premium w-100">
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
        console.error("Error loading assignments:", error);
        container.innerHTML = '<div class="text-center py-4 text-danger">Error al cargar tareas.</div>';
    }
}
