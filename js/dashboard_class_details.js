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
        } else {
            alert("Clase no especificada");
            window.location.href = 'dashboard_teacher.html';
        }

    } else {
        window.location.href = 'index.html';
    }
});

async function loadClassData() {
    try {
        const cls = await getClassData(currentClassId);
        if (cls) {
            document.getElementById('className').innerText = cls.name;
            document.getElementById('classPin').innerText = cls.pin;

            // Check Metadata for Classroom
            if (cls.classroomCourseId) {
                document.getElementById('classroomSection').style.display = 'flex';
                // Store courseId globally needed for assignments? 
                // Or just access via cls object if we need it. 
                // But currentClassId is global.
                // We'll attach it to the button data attribute or just retrieve it again.
                // Better: keep cls in scope or reload it in handlers.

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

            // Need courseId. 
            const cls = await getClassData(currentClassId);
            if (!cls || !cls.classroomCourseId) return alert("Esta clase no está vinculada a Classroom.");

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerText = "Creando...";

            try {
                await createClassroomAssignment(currentClassId, cls.classroomCourseId, title, count, wpm);
                alert("Tarea creada y publicada en Classroom.");
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('createAssignmentModal'));
                modal.hide();
                form.reset();
                loadClassroomAssignments(cls.classroomCourseId);
            } catch (error) {
                console.error("Assignment Error:", error);
                alert("Error al crear tarea: " + error.message);
            } finally {
                btn.disabled = false;
                btn.innerText = "Publicar Tarea";
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

        list.innerHTML = '';
        snap.forEach(doc => {
            const task = doc.data();
            const date = task.createdAt ? task.createdAt.toDate().toLocaleDateString() : '';

            const item = `
                <div class="list-group-item bg-dark border-secondary text-light d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1 text-success fw-bold">${task.title}</h6>
                        <small class="text-dim">Requisitos: ${task.exerciseCount} ejercicios • Objetivo: ${task.targetWpm} PPM</small>
                    </div>
                    <span class="badge bg-secondary text-light">${date}</span>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', item);
        });

    } catch (e) {
        console.error("Error loading assignments", e);
        list.innerHTML = '<div class="text-danger p-3">Error cargando tareas.</div>';
    }
}

async function handleSyncGrades() {
    const btn = document.querySelector('button[onclick="handleSyncGrades()"]');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sincronizando...';
    btn.disabled = true;

    try {
        const cls = await getClassData(currentClassId);
        if (!cls || !cls.classroomCourseId) throw new Error("Clase no vinculada.");

        const count = await syncClassroomGrades(currentClassId, cls.classroomCourseId);
        alert(`Sincronización completada. ${count} notas actualizadas en Classroom.`);

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
            stat.total = stat.results.length;
            if (stat.total > 0) {
                // Accuracy
                const accSum = stat.results.reduce((s, r) => s + (r.accuracy || 0), 0);
                stat.avgAcc = Math.round(accSum / stat.total);

                // Last 10 PPM
                const last10 = stat.results.slice(0, 10);
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
