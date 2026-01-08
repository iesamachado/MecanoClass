// Class Details Logic

let currentUser = null;
let currentClassId = null;

// Get Class ID from URL
const urlParams = new URLSearchParams(window.location.search);
currentClassId = urlParams.get('id');

auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const profile = await getUserProfile(user.uid);
        if (!profile || profile.role !== 'teacher') {
            window.location.href = 'index.html';
            return;
        }

        if (currentClassId) {
            loadClassData();
            loadAnalyticsAndActivity();
            loadTextManagement();
            loadClassData();
            loadAnalyticsAndActivity();
            loadTextManagement();
            loadLocalAssignments();
            loadTeacherStats(); // Load header stats
        } else {
            alert("Clase no especificada");
            window.location.href = 'dashboard_teacher.html';
        }

    } else {
        window.location.href = 'index.html';
    }
});

async function loadTeacherStats() {
    try {
        const allResults = await getStudentResults(currentUser.uid, 20);

        // Filter valid results
        const results = allResults.filter(r => (r.accuracy || 0) >= 90);

        if (results.length > 0) {
            const last10 = results.slice(0, 10);
            const wpmSum10 = last10.reduce((s, r) => s + (r.wpm || 0), 0);
            const accSum10 = last10.reduce((s, r) => s + (r.accuracy || 0), 0);

            const last10Wpm = Math.round(wpmSum10 / last10.length);
            const last10Acc = Math.round(accSum10 / last10.length);

            const headerWpm = document.getElementById('headerWpm');
            const headerAcc = document.getElementById('headerAcc');

            if (headerWpm) headerWpm.innerText = last10Wpm;
            if (headerAcc) headerAcc.innerText = last10Acc;
        } else {
            const headerWpm = document.getElementById('headerWpm');
            const headerAcc = document.getElementById('headerAcc');

            if (headerWpm) headerWpm.innerText = '0';
            if (headerAcc) headerAcc.innerText = '0';
        }
    } catch (e) {
        console.error("Error loading teacher stats", e);
    }
}

async function loadClassData() {
    try {
        const cls = await getClassData(currentClassId);
        if (cls) {
            document.getElementById('className').innerText = cls.name;
            document.getElementById('classPin').innerText = cls.pin;

            // Check Metadata for Classroom
            if (cls.classroomCourseId) {
                document.getElementById('classroomSection').style.display = 'flex';

                // Show sync students button
                const syncBtn = document.getElementById('syncStudentsBtn');
                if (syncBtn) syncBtn.style.display = 'inline-block';

                // Initialize Assignments List
                loadClassroomAssignments(cls.classroomCourseId);
            }
        } else {
            alert("Clase no encontrada");
            window.location.href = 'dashboard_teacher.html';
        }
    } catch (error) {
        console.error("Error loading class:", error);
    }
}

// Global scope listener setup (should be in init or called once)
// Since loadClassData is called after Auth, we can setup listeners here or outside.
// Let's setup outside but use safe checks.

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('assignmentForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('assignTitle').value;
            const count = document.getElementById('assignCount').value;
            const wpm = document.getElementById('assignWpm').value;
            const dueDate = document.getElementById('assignDueDate').value;

            // Need courseId. 
            const cls = await getClassData(currentClassId);
            if (!cls || !cls.classroomCourseId) return alert("Esta clase no está vinculada a Classroom.");


            const btn = e.submitter || form.querySelector('button[type="submit"]');
            if (!btn) {
                console.error("Submit button not found");
                console.log("Form:", form);
                console.log("Event:", e);
                return;
            }

            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Creando...";

            try {
                await createClassroomAssignment(currentClassId, cls.classroomCourseId, title, count, wpm, dueDate);
                alert("Tarea creada y publicada en Classroom.");
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createAssignmentModal'));
                if (modal) modal.hide();
                form.reset();
                loadClassroomAssignments(cls.classroomCourseId);
            } catch (error) {
                console.error("Assignment Error:", error);
                alert("Error al crear tarea: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }

    // Local assignment form listener
    const localForm = document.getElementById('localAssignmentForm');
    if (localForm) {
        localForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('localAssignTitle').value;
            const count = document.getElementById('localAssignCount').value;
            const wpm = document.getElementById('localAssignWpm').value;

            const btn = e.submitter || localForm.querySelector('button[type="submit"]');
            if (!btn) return;

            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "Creando...";

            try {
                await createLocalAssignment(currentClassId, title, count, wpm);
                alert("Tarea local creada correctamente.");
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createLocalAssignmentModal'));
                if (modal) modal.hide();
                localForm.reset();
                loadLocalAssignments();
            } catch (error) {
                console.error("Local Assignment Error:", error);
                alert("Error al crear tarea: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = originalText;
            }
        });
    }
});

async function loadClassroomAssignments(courseId) {
    const list = document.getElementById('classroomAssignmentsList');
    list.innerHTML = '<div class="text-center p-3 text-dim">Cargando tareas...</div>';

    try {
        const snap = await db.collection('classes').doc(currentClassId).collection('assignments').orderBy('createdAt', 'desc').get();

        if (snap.empty) {
            list.innerHTML = '<div class="text-center p-3 text-dim">No hay tareas activas.</div>';
            return;
        }

        // Get class members
        const members = await getClassMembers(currentClassId);

        list.innerHTML = '';

        for (const doc of snap.docs) {
            const task = doc.data();
            const date = task.createdAt ? task.createdAt.toDate().toLocaleDateString() : '';
            const assignmentId = doc.id;
            const courseWorkId = task.classroomCourseWorkId;

            // Calculate grades for each student
            const studentGrades = [];

            for (const member of members) {
                // Get student's results for this class
                const results = await db.collection('results')
                    .where('studentId', '==', member.uid)
                    .where('classId', '==', currentClassId)
                    .get();

                const resultsList = results.docs
                    .map(d => d.data())
                    .filter(r => r.timestamp && (r.accuracy || 0) >= 90) // Filter low accuracy
                    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

                const exerciseCount = resultsList.length;
                const requiredCount = task.exerciseCount || 1;
                const targetWpm = task.targetWpm || 0;
                const relevantResults = resultsList.slice(0, requiredCount);

                let grade = 0;
                let status = 'Pendiente';
                let statusClass = 'text-warning';

                if (exerciseCount >= requiredCount) {
                    const avgWpm = relevantResults.reduce((sum, r) => sum + (r.wpm || 0), 0) / relevantResults.length;
                    const avgAcc = relevantResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / relevantResults.length;

                    const wpmRatio = Math.min(avgWpm / targetWpm, 1);
                    const accRatio = avgAcc / 100;
                    grade = Math.round((wpmRatio * 0.6 + accRatio * 0.4) * 10);

                    status = 'Completada';
                    statusClass = grade >= 5 ? 'text-success' : 'text-danger';
                }

                studentGrades.push({
                    name: member.displayName,
                    avatar: member.photoURL,
                    progress: `${exerciseCount}/${requiredCount}`,
                    grade,
                    status,
                    statusClass
                });
            }

            // Count completed
            const completedCount = studentGrades.filter(s => s.status === 'Completada').length;
            const avgGrade = studentGrades.length > 0
                ? (studentGrades.reduce((sum, s) => sum + s.grade, 0) / studentGrades.length).toFixed(1)
                : 0;

            // Build student rows
            let studentsHTML = '';
            if (studentGrades.length === 0) {
                studentsHTML = '<tr><td colspan="4" class="text-center py-2 text-dim small">No hay estudiantes en esta clase</td></tr>';
            } else {
                studentGrades.forEach(s => {
                    studentsHTML += `
                        <tr>
                            <td class="bg-transparent border-secondary py-2">
                                <div class="d-flex align-items-center gap-2">
                                    <img src="${s.avatar}" class="rounded-circle" width="24" height="24">
                                    <small class="text-light">${s.name}</small>
                                </div>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="text-info">${s.progress}</small>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="${s.statusClass} fw-bold">${s.grade}/10</small>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="${s.statusClass}">${s.status}</small>
                            </td>
                        </tr>
                    `;
                });
            }

            const item = `
                <div class="card bg-dark border-secondary mb-3">
                    <div class="card-header bg-transparent border-secondary">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-3">
                                <input type="checkbox" class="form-check-input sync-assignment-checkbox" 
                                       data-assignment-id="${assignmentId}" 
                                       data-coursework-id="${courseWorkId}"
                                       style="font-size: 1.2em; cursor: pointer;">
                                <div>
                                    <h6 class="mb-1 text-success fw-bold">${task.title}</h6>
                                    <small class="text-dim">Requisitos: ${task.exerciseCount} ejercicios • Objetivo: ${task.targetWpm} PPM • Creada: ${date}</small>
                                </div>
                            </div>
                            <div class="text-end">
                                <small class="text-dim d-block">Completadas: ${completedCount}/${studentGrades.length}</small>
                                <small class="text-primary fw-bold">Media: ${avgGrade}/10</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-dark table-sm mb-0">
                                <thead>
                                    <tr>
                                        <th class="bg-transparent border-secondary text-dim small">Estudiante</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Progreso</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Nota</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${studentsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', item);
        }

    } catch (e) {
        console.error("Error loading assignments", e);
        list.innerHTML = '<div class="text-danger p-3">Error cargando tareas.</div>';
    }
}

async function handleSyncGrades() {
    // Get selected assignments
    const selectedCheckboxes = document.querySelectorAll('.sync-assignment-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        alert("Por favor, selecciona al menos una tarea para sincronizar.");
        return;
    }

    const selectedAssignments = Array.from(selectedCheckboxes).map(cb => ({
        assignmentId: cb.dataset.assignmentId,
        courseWorkId: cb.dataset.courseworkId
    }));

    const btn = document.querySelector('button[onclick="handleSyncGrades()"]');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sincronizando...';
    btn.disabled = true;

    try {
        const cls = await getClassData(currentClassId);
        if (!cls || !cls.classroomCourseId) throw new Error("Clase no vinculada.");

        const count = await syncClassroomGrades(currentClassId, cls.classroomCourseId, selectedAssignments);
        alert(`Sincronización completada. ${count} notas actualizadas en Classroom.`);

        // Uncheck all checkboxes after successful sync
        selectedCheckboxes.forEach(cb => cb.checked = false);

    } catch (error) {
        console.error("Sync Error:", error);
        alert("Error al sincronizar: " + error.message);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function loadAnalyticsAndActivity() {
    const analyticsBody = document.getElementById('analyticsTableBody');
    const recentBody = document.getElementById('resultsTableBody');

    try {
        const [membersFn, allResults] = await Promise.all([
            getClassMembers(currentClassId),
            getAllClassResults(currentClassId)
        ]);

        const memberMap = {};
        const studentStats = {};

        // Init stats for all members (even those with 0 results)
        membersFn.forEach(m => {
            memberMap[m.uid] = m;
            studentStats[m.uid] = {
                student: m,
                results: [],
                total: 0,
                avgAcc: 0,
                last10MeanWpm: 0
            };
        });

        // Distribute results 
        // Note: allResults is sorted by Date Descending
        allResults.forEach(res => {
            if (!studentStats[res.studentId]) {
                // Handling unknown students (deleted?)
                studentStats[res.studentId] = {
                    student: { displayName: 'Desconocido', photoURL: '' },
                    results: [],
                    total: 0,
                    avgAcc: 0,
                    last10MeanWpm: 0
                };
            }
            studentStats[res.studentId].results.push(res);
        });

        // Calculate aggregates
        const rankingData = Object.values(studentStats);
        rankingData.forEach(stat => {
            // Apply filtering for calculations ONLY
            const validResults = stat.results.filter(r => (r.accuracy || 0) >= 90);

            stat.total = stat.results.length; // Total attempts (keep all?) User said "discard for average". 
            // Activity count usually means "how much they practiced", so maybe keep total.
            // But "Average Accuracy" implies calculating only on valid ones? 
            // "descartar los ejercicios con precisión por debajo del 90%" usually refers to the metric calc.
            // Let's use validResults for Acc and WPM calc.

            if (validResults.length > 0) {
                // Accuracy
                const accSum = validResults.reduce((s, r) => s + (r.accuracy || 0), 0);
                stat.avgAcc = Math.round(accSum / validResults.length);

                // Last 10 PPM
                const last10 = validResults.slice(0, 10);
                const wpmSum = last10.reduce((s, r) => s + (r.wpm || 0), 0);
                stat.last10MeanWpm = Math.round(wpmSum / last10.length);
            }
        });

        // Sort Ranking by Last 10 PPM
        rankingData.sort((a, b) => b.last10MeanWpm - a.last10MeanWpm);

        // Render Analytics Table
        analyticsBody.innerHTML = '';
        if (rankingData.length === 0) {
            analyticsBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-dim">No hay alumnos en la clase.</td></tr>';
        } else {
            rankingData.forEach((stat, index) => {
                const tr = `
                <tr>
                    <td class="bg-transparent border-secondary text-dim ps-4 fw-bold">#${index + 1}</td>
                    <td class="bg-transparent border-secondary text-light">
                        <div class="d-flex align-items-center">
                            <img src="${stat.student.photoURL}" class="rounded-circle me-2" style="width: 32px; height: 32px;">
                            ${stat.student.displayName}
                        </div>
                    </td>
                    <td class="bg-transparent border-secondary text-light text-center">${stat.total}</td>
                    <td class="bg-transparent border-secondary text-info text-center">${stat.avgAcc}%</td>
                    <td class="bg-transparent border-secondary text-primary text-center fw-bold fs-5">${stat.last10MeanWpm}</td>
                </tr>
                `;
                analyticsBody.insertAdjacentHTML('beforeend', tr);
            });
        }

        // Render Recent Activity (Top 50)
        recentBody.innerHTML = '';
        if (allResults.length === 0) {
            recentBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No hay actividad reciente.</td></tr>';
        } else {
            // Take first 50
            const recent = allResults.slice(0, 50);
            recent.forEach(res => {
                const student = memberMap[res.studentId] || { displayName: 'Desconocido', photoURL: '' };
                const date = res.timestamp ? res.timestamp.toDate().toLocaleString() : 'Reciente';

                const row = `
                    <tr>
                        <td class="bg-transparent border-secondary text-light ps-4">
                            <div class="d-flex align-items-center">
                                <img src="${student.photoURL}" class="rounded-circle me-2" style="width: 24px;">
                                ${student.displayName}
                            </div>
                        </td>
                        <td class="bg-transparent border-secondary text-light text-center fw-bold">${res.wpm}</td>
                        <td class="bg-transparent border-secondary text-info text-center">${res.accuracy}%</td>
                        <td class="bg-transparent border-secondary text-dim text-end pe-4 small">${date}</td>
                    </tr>
                `;
                recentBody.insertAdjacentHTML('beforeend', row);
            });
        }

    } catch (error) {
        console.error("Error calculating analytics:", error);
        analyticsBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar estadísticas.</td></tr>';
    }
}

// --- Text Management Logic ---

async function loadTextManagement() {
    await Promise.all([
        renderGlobalTexts(),
        renderCustomTexts()
    ]);

    // Setup Form Listener
    document.getElementById('addCustomTextForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const textStr = document.getElementById('customTextContent').value.trim();
        const difficulty = document.getElementById('customTextDiff').value;
        const category = document.getElementById('customTextCat').value;

        if (!textStr) return;

        const newText = {
            id: 'custom_' + Date.now(), // Generate a simple ID
            text: textStr,
            difficulty,
            category,
            isCustom: true
        };

        try {
            await addClassCustomText(currentClassId, newText);
            document.getElementById('customTextContent').value = '';
            renderCustomTexts(); // Refresh
        } catch (error) {
            console.error("Error adding custom text:", error);
            alert("Error al añadir texto");
        }
    });
}

async function renderGlobalTexts() {
    const listContainer = document.getElementById('globalTextsList');
    listContainer.innerHTML = '<div class="p-3 text-center text-dim bg-transparent">Cargando...</div>';

    try {
        const [globalTexts, clsData] = await Promise.all([
            getAllGlobalTexts(),
            getClassData(currentClassId)
        ]);

        const disabledSet = new Set(clsData.disabledGlobalTexts || []);

        listContainer.innerHTML = '';
        globalTexts.forEach(text => {
            const isChecked = !disabledSet.has(text.id);
            const item = document.createElement('div');
            item.className = 'list-group-item bg-transparent border-secondary text-light d-flex align-items-center gap-3';
            item.innerHTML = `
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="global_${text.id}" ${isChecked ? 'checked' : ''}>
                </div>
                <div class="flex-grow-1">
                    <p class="mb-1 text-truncate" style="max-width: 300px;">${text.text}</p>
                    <small class="text-dim badge border border-secondary">${text.category}</small>
                    <small class="text-dim badge border border-secondary">${text.difficulty}</small>
                </div>
            `;

            // Listener
            item.querySelector('input').addEventListener('change', async (e) => {
                const active = e.target.checked;
                // If active (checked), we REMOVE from disabled list. If inactive (unchecked), we UPDATE to disabled list.
                // Logic: isDisabled = !active
                try {
                    await toggleClassGlobalText(currentClassId, text.id, !active);
                } catch (err) {
                    console.error("Error toggling text:", err);
                    e.target.checked = !active; // Revert on error
                }
            });

            listContainer.appendChild(item);
        });

    } catch (error) {
        console.error("Error rendering global texts:", error);
        listContainer.innerHTML = '<div class="p-3 text-center text-danger">Error al cargar textos.</div>';
    }
}

async function renderCustomTexts() {
    const listContainer = document.getElementById('customTextsList');
    // listContainer.innerHTML = '<div class="p-3 text-center text-dim">Cargando...</div>';

    try {
        const clsData = await getClassData(currentClassId);
        const customTexts = clsData.customTexts || [];

        listContainer.innerHTML = '';

        if (customTexts.length === 0) {
            listContainer.innerHTML = '<div class="p-3 text-center text-dim">No hay textos personalizados.</div>';
            return;
        }

        customTexts.forEach(text => {
            const item = document.createElement('div');
            item.className = 'list-group-item bg-transparent border-secondary text-light d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div class="overflow-hidden me-2">
                    <p class="mb-1 text-truncate">${text.text}</p>
                    <small class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25">${text.category}</small>
                </div>
                <button class="btn btn-outline-danger btn-sm rounded-circle"><i class="bi bi-trash"></i></button>
            `;

            // Delete Listener
            item.querySelector('button').addEventListener('click', async () => {
                if (confirm("¿Eliminar este texto?")) {
                    try {
                        await removeClassCustomText(currentClassId, text);
                        renderCustomTexts();
                    } catch (err) {
                        console.error("Error removing custom text:", err);
                    }
                }
            });

            listContainer.appendChild(item);
        });

    } catch (error) {
        console.error("Error rendering custom texts:", error);
    }
}

async function syncClassroomStudents() {
    const btn = document.getElementById('syncStudentsBtn');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Sincronizando...';
    btn.disabled = true;

    try {
        // Get class data to retrieve classroomCourseId
        const cls = await getClassData(currentClassId);

        if (!cls || !cls.classroomCourseId) {
            alert("Esta clase no está vinculada con Google Classroom.");
            return;
        }

        // Get Classroom token
        const token = await getClassroomToken();

        // Import/sync students
        const addedCount = await importClassroomStudents(token, cls.classroomCourseId, currentClassId);

        // Small delay to ensure Firestore writes complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Reload members list
        await loadAnalyticsAndActivity();

        if (addedCount > 0) {
            alert(`✅ Sincronización completada.\n\n${addedCount} estudiante(s) añadido(s) a la clase.\n\nLa lista de estudiantes se ha actualizado.`);
        } else {
            alert(`ℹ️ Sincronización completada.\n\nNo se encontraron nuevos estudiantes para añadir.\n\nPosibles razones:\n• Los estudiantes ya están en la clase\n• Los estudiantes aún no se han registrado en MecanoClass\n• Los emails no coinciden`);
        }

    } catch (error) {
        console.error("Error syncing students:", error);
        alert("❌ Error al sincronizar estudiantes:\n\n" + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Load local assignments
async function loadLocalAssignments() {
    const list = document.getElementById('localAssignmentsList');
    list.innerHTML = '<div class="text-center p-3 text-dim">Cargando tareas...</div>';

    try {
        const localAssignments = await getLocalAssignments(currentClassId);

        if (localAssignments.length === 0) {
            list.innerHTML = '<div class="text-center p-3 text-dim">No hay tareas locales. Crea una para empezar.</div>';
            return;
        }

        // Get class members
        const members = await getClassMembers(currentClassId);

        list.innerHTML = '';

        for (const task of localAssignments) {
            const date = task.createdAt ? task.createdAt.toDate().toLocaleDateString() : '';
            const assignmentId = task.id;

            // Calculate grades for each student
            const studentGrades = [];

            for (const member of members) {
                // Get student's results for this class
                const results = await db.collection('results')
                    .where('studentId', '==', member.uid)
                    .where('classId', '==', currentClassId)
                    .get();

                const resultsList = results.docs
                    .map(d => d.data())
                    .filter(r => r.timestamp && (r.accuracy || 0) >= 90) // Filter low accuracy
                    .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

                const exerciseCount = resultsList.length;
                const requiredCount = task.exerciseCount || 1;
                const targetWpm = task.targetWpm || 0;
                const relevantResults = resultsList.slice(0, requiredCount);

                let grade = 0;
                let status = 'Pendiente';
                let statusClass = 'text-warning';

                if (exerciseCount >= requiredCount) {
                    const avgWpm = relevantResults.reduce((sum, r) => sum + (r.wpm || 0), 0) / relevantResults.length;
                    const avgAcc = relevantResults.reduce((sum, r) => sum + (r.accuracy || 0), 0) / relevantResults.length;

                    const wpmRatio = Math.min(avgWpm / targetWpm, 1);
                    const accRatio = avgAcc / 100;
                    grade = Math.round((wpmRatio * 0.6 + accRatio * 0.4) * 10);

                    status = 'Completada';
                    statusClass = grade >= 5 ? 'text-success' : 'text-danger';
                }

                studentGrades.push({
                    name: member.displayName,
                    avatar: member.photoURL,
                    progress: `${exerciseCount}/${requiredCount}`,
                    grade,
                    status,
                    statusClass
                });
            }

            // Count completed
            const completedCount = studentGrades.filter(s => s.status === 'Completada').length;
            const avgGrade = studentGrades.length > 0
                ? (studentGrades.reduce((sum, s) => sum + s.grade, 0) / studentGrades.length).toFixed(1)
                : 0;

            // Build student rows
            let studentsHTML = '';
            if (studentGrades.length === 0) {
                studentsHTML = '<tr><td colspan="4" class="text-center py-2 text-dim small">No hay estudiantes en esta clase</td></tr>';
            } else {
                studentGrades.forEach(s => {
                    studentsHTML += `
                        <tr>
                            <td class="bg-transparent border-secondary py-2">
                                <div class="d-flex align-items-center gap-2">
                                    <img src="${s.avatar}" class="rounded-circle" width="24" height="24">
                                    <small class="text-light">${s.name}</small>
                                </div>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="text-info">${s.progress}</small>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="${s.statusClass} fw-bold">${s.grade}/10</small>
                            </td>
                            <td class="bg-transparent border-secondary text-center py-2">
                                <small class="${s.statusClass}">${s.status}</small>
                            </td>
                        </tr>
                    `;
                });
            }

            const item = `
                <div class="card bg-dark border-secondary mb-3">
                    <div class="card-header bg-transparent border-secondary">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center gap-3">
                                <button class="btn btn-sm btn-danger" onclick="deleteAssignment('${assignmentId}')" 
                                        title="Eliminar tarea">
                                    <i class="bi bi-trash"></i>
                                </button>
                                <div>
                                    <h6 class="mb-1 text-info fw-bold">${task.title}</h6>
                                    <small class="text-dim">Requisitos: ${task.exerciseCount} ejercicios • Objetivo: ${task.targetWpm} PPM • Creada: ${date}</small>
                                </div>
                            </div>
                            <div class="text-end">
                                <small class="text-dim d-block">Completadas: ${completedCount}/${studentGrades.length}</small>
                                <small class="text-primary fw-bold">Media: ${avgGrade}/10</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-dark table-sm mb-0">
                                <thead>
                                    <tr>
                                        <th class="bg-transparent border-secondary text-dim small">Estudiante</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Progreso</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Nota</th>
                                        <th class="bg-transparent border-secondary text-dim small text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${studentsHTML}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', item);
        }

    } catch (e) {
        console.error("Error loading local assignments", e);
        list.innerHTML = '<div class="text-danger p-3">Error cargando tareas.</div>';
    }
}

async function deleteAssignment(assignmentId) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta tarea? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        await deleteLocalAssignment(currentClassId, assignmentId);
        loadLocalAssignments();
        alert('Tarea eliminada correctamente.');
    } catch (error) {
        console.error('Error deleting assignment:', error);
        alert('Error al eliminar la tarea: ' + error.message);
    }
}
