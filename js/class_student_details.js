
// Student Details Logic

let currentClassId = null;
let currentStudentId = null;
let currentUser = null;

const urlParams = new URLSearchParams(window.location.search);
currentClassId = urlParams.get('classId');
currentStudentId = urlParams.get('studentId');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profile = await getUserProfile(user.uid);
        if (!profile || profile.role !== 'teacher') {
            console.warn("Redirección preventiva: Perfil no es docente o no existe.");
            // window.location.href = 'index.html';
            // return;
        }

        if (currentClassId && currentStudentId) {
            setupBackLink();
            loadStudentData();
        } else {
            console.error("Parámetros faltantes: classId o studentId");
            // alert("Parámetros faltantes.");
            // window.location.href = 'dashboard_teacher.html';
        }
    } else {
        console.warn("Redirección preventiva: Usuario no autenticado.");
        // window.location.href = 'index.html';
    }
});

function setupBackLink() {
    const link = document.getElementById('backLink');
    link.href = `dashboard_class_details.html?id=${currentClassId}`;
}

async function loadStudentData() {
    try {
        // 1. Load Profile
        const studentProfile = await getUserProfile(currentStudentId);
        if (studentProfile) {
            document.getElementById('studentName').innerText = studentProfile.displayName;
            document.getElementById('studentEmail').innerText = studentProfile.email;
            document.getElementById('studentAvatar').src = studentProfile.studentAvatar || studentProfile.photoURL; // Use updated avatar if available? Generally photoURL.
        }

        // 2. Load Results & History (Class context)
        const allResults = await loadStudentHistoryInClass(); // Returns enriched results

        // 3. Load Assignments (Calculated)
        await loadStudentAssignments(allResults);

        // 4. Load Live Games
        await loadStudentLiveGames();

    } catch (error) {
        console.error("Error loading student data:", error);
    }
}

async function loadStudentHistoryInClass() {
    const historyBody = document.getElementById('historyBody');
    historyBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando...</td></tr>';

    try {
        // Fetch results for this student in this class
        const snapshot = await db.collection('results')
            .where('studentId', '==', currentStudentId)
            .where('classId', '==', currentClassId)
            .get();

        const results = snapshot.docs.map(doc => doc.data())
            .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        // Stats Calculation
        if (results.length > 0) {
            // Filter invalid for stats? Usually we keep all for history, filter for "Avg".
            const validResults = results.filter(r => (r.accuracy || 0) >= 90);

            if (validResults.length > 0) {
                const wpmSum = validResults.reduce((sum, r) => sum + (r.wpm || 0), 0);
                const accSum = validResults.reduce((sum, r) => sum + (r.accuracy || 0), 0);

                document.getElementById('headerAvgWpm').innerText = Math.round(wpmSum / validResults.length);
                document.getElementById('headerAvgAcc').innerText = Math.round(accSum / validResults.length);
            } else {
                document.getElementById('headerAvgWpm').innerText = '0';
                document.getElementById('headerAvgAcc').innerText = '0';
            }
        } else {
            document.getElementById('headerAvgWpm').innerText = '0';
            document.getElementById('headerAvgAcc').innerText = '0';
        }

        // Render History Table
        historyBody.innerHTML = '';
        if (results.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No hay actividad en esta clase.</td></tr>';
        } else {
            results.slice(0, 100).forEach(r => { // Limit to 100 display
                const date = r.timestamp ? r.timestamp.toDate().toLocaleString() : 'N/A';
                const modeLabel = r.mode === 'practice' ? '<span class="badge bg-secondary">Práctica</span>' :
                    r.mode === 'custom' ? '<span class="badge bg-info text-dark">Personalizado</span>' :
                        '<span class="badge bg-secondary">' + r.mode + '</span>';

                const tr = `
                    <tr>
                        <td class="bg-transparent border-secondary text-dim ps-3">${date}</td>
                        <td class="bg-transparent border-secondary text-primary text-center fw-bold">${r.wpm}</td>
                        <td class="bg-transparent border-secondary text-info text-center">${r.accuracy}%</td>
                        <td class="bg-transparent border-secondary text-end pe-3">${modeLabel}</td>
                    </tr>
                `;
                historyBody.insertAdjacentHTML('beforeend', tr);
            });
        }

        return results; // Return for assignment calculation

    } catch (e) {
        console.error("History Error:", e);
        historyBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar historial.</td></tr>';
        return [];
    }
}

async function loadStudentAssignments(allClassResults) {
    const listBody = document.getElementById('assignmentsBody');
    listBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando tareas...</td></tr>';

    try {
        // Fetch ALL assignments for the class (Local & Classroom)

        // 1. Get Class Doc (contains Local Assignments Array & Classroom ID)
        const classDoc = await db.collection('classes').doc(currentClassId).get();
        if (!classDoc.exists) {
            listBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Clase no encontrada.</td></tr>';
            return;
        }
        const classData = classDoc.data();

        // Local Assignments (Array)
        const localTasks = (classData.localAssignments || []).map(t => ({ ...t, type: 'local' }));

        // 2. Classroom (Subcollection)
        let classroomTasks = [];
        if (classData.classroomCourseId) {
            const crSnapshot = await db.collection('classes').doc(currentClassId).collection('assignments').get();
            classroomTasks = crSnapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'classroom' }));
        }

        const allTasks = [...localTasks, ...classroomTasks].sort((a, b) => {
            // Handle Timestamp objects vs Date objects vs ISO strings
            const timeA = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (new Date(a.createdAt).getTime() || 0);
            const timeB = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (new Date(b.createdAt).getTime() || 0);
            return timeB - timeA;
        });

        listBody.innerHTML = '';

        if (allTasks.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No hay tareas asignadas.</td></tr>';
            return;
        }

        // Calculate grades
        allTasks.forEach(task => {
            // Filter results for this task requirements
            // Generally we take the MOST RECENT N results in the class context? 
            // Or results AFTER the assignment was created? 
            // Logic in dashboard_class_details_local.js was simply "take top N valid results sorted by date". 
            // It didn't date-gate them. Let's replicate that for consistency.

            const validResults = allClassResults.filter(r => (r.accuracy || 0) >= 90);
            const neededCount = task.exerciseCount || 1;
            const relevant = validResults.slice(0, neededCount);
            const count = relevant.length;

            let grade = 0;
            let status = 'Pendiente';
            let statusClass = 'text-warning';

            if (count >= neededCount) {
                const avgWpm = relevant.reduce((s, r) => s + (r.wpm || 0), 0) / count;
                const avgAcc = relevant.reduce((s, r) => s + (r.accuracy || 0), 0) / count;
                const targetWpm = task.targetWpm || 1;

                const wpmRatio = Math.min(avgWpm / targetWpm, 1);
                const accRatio = avgAcc / 100;
                grade = Math.round((wpmRatio * 0.6 + accRatio * 0.4) * 10);

                status = 'Completada';
                statusClass = grade >= 5 ? 'text-success' : 'text-danger';
            }

            const icon = task.type === 'classroom' ? '<i class="bi bi-google text-success me-2"></i>' : '<i class="bi bi-file-earmark-text text-info me-2"></i>';

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-light ps-3">
                        <div class="d-flex align-items-center">
                            ${icon}
                            <div>
                                <div class="fw-bold">${task.title}</div>
                                <small class="text-dim" style="font-size: 0.75rem;">Obj: ${task.targetWpm} PPM • ${task.exerciseCount} Ej.</small>
                            </div>
                        </div>
                    </td>
                    <td class="bg-transparent border-secondary text-center text-dim pt-3">${count}/${neededCount}</td>
                    <td class="bg-transparent border-secondary text-center fw-bold ${statusClass} pt-3">${grade}/10</td>
                    <td class="bg-transparent border-secondary text-center pt-3"><span class="badge bg-transparent border border-secondary ${statusClass}">${status}</span></td>
                </tr>
            `;
            listBody.insertAdjacentHTML('beforeend', tr);
        });

    } catch (e) {
        console.error("Assignments Error:", e);
        listBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar tareas.</td></tr>';
    }
}

async function loadStudentLiveGames() {
    const tableBody = document.getElementById('liveGamesBody');
    tableBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-dim">Cargando partidas...</td></tr>';

    try {
        // Query participations for this student
        const partsSnap = await db.collection('live_participants')
            .where('studentId', '==', currentStudentId)
            // .orderBy('joinedAt', 'desc') // Requires index?
            .get();

        let participations = partsSnap.docs.map(d => d.data());

        // Manual sort if index is missing
        participations.sort((a, b) => (b.joinedAt?.seconds || 0) - (a.joinedAt?.seconds || 0));
        participations = participations.slice(0, 20); // Limit to 20

        tableBody.innerHTML = '';
        if (participations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-dim">No ha participado en partidas.</td></tr>';
            return;
        }

        // For each, we want the Date (from session?), Position, and WPM
        // We need to fetch the session doc to get the Date.
        // We need to fetch sibling participants to get Rank.

        for (const p of participations) {
            // Get Session Info
            const sessionDoc = await db.collection('live_sessions').doc(p.sessionId).get();
            let dateStr = 'Desconocida';
            if (sessionDoc.exists) {
                const sData = sessionDoc.data();
                dateStr = sData.createdAt ? sData.createdAt.toDate().toLocaleDateString() : 'N/A';
            }

            // Calculate Rank
            // Fetch all participants for this session sorted by WPM
            // Optimization: If the session is old, maybe we can't efficiently query 100+ players.
            // Assumption: Class games are small (<30).
            const sessionPartsSnap = await db.collection('live_participants').where('sessionId', '==', p.sessionId).get();
            const sessionParts = sessionPartsSnap.docs.map(d => d.data());

            // Filter valid participants (Accuracy >= 90)
            const validSessionParts = sessionParts.filter(sp => (sp.accuracy || 0) >= 90);

            // Sort by WPM Desc
            validSessionParts.sort((a, b) => (b.wpm || 0) - (a.wpm || 0));

            const rankIndex = validSessionParts.findIndex(sp => sp.studentId === currentStudentId);
            const rank = rankIndex + 1; // 0 if not found (because rankIndex is -1) -> actually -1 + 1 = 0.
            const total = validSessionParts.length;

            let rankClass = 'text-light';
            let rankDisplay = '-';

            if (rank > 0) {
                rankDisplay = `${rank} / ${total}`;
                if (rank === 1) rankClass = 'text-warning fw-bold'; // Gold
                if (rank === 2) rankClass = 'text-secondary fw-bold'; // Silver
                if (rank === 3) rankClass = 'text-danger fw-bold'; // Bronze (color-wise)
            } else {
                rankDisplay = `- / ${total}`;
                rankClass = 'text-dim';
            }

            const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-dim ps-3">${dateStr}</td>
                    <td class="bg-transparent border-secondary text-center ${rankClass}">${rankDisplay}</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold">${p.wpm || 0}</td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', tr);
        }

    } catch (e) {
        console.error("Live Games Error:", e);
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error al cargar partidas.</td></tr>';
    }
}
