// Google Classroom Integration

// Scopes required
const CLASSROOM_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students', // To manage assignments and grades
    'https://www.googleapis.com/auth/classroom.rosters.readonly',    // To map students
    'https://www.googleapis.com/auth/classroom.profile.emails'       // To match by email
];

let cachedToken = null;

async function getClassroomToken() {
    if (cachedToken) return cachedToken;
    const provider = new firebase.auth.GoogleAuthProvider();
    CLASSROOM_SCOPES.forEach(scope => provider.addScope(scope));
    const result = await auth.signInWithPopup(provider);
    cachedToken = result.credential.accessToken;
    return cachedToken;
}

// --- Import Flow ---

async function startClassroomImport() {
    try {
        const accessToken = await getClassroomToken();

        // Show loading
        const modalBody = document.getElementById('classroomModalBody');
        modalBody.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-dim">Cargando cursos de Classroom...</p></div>';

        // Show Modal
        const modal = new bootstrap.Modal(document.getElementById('classroomModal'));
        modal.show();

        // Fetch Courses
        const courses = await fetchClassroomCourses(accessToken);
        renderClassroomCourses(courses, modal);

    } catch (error) {
        console.error("Classroom Auth Error:", error);
        alert("Error de autenticación con Google Classroom: " + error.message);
    }
}

async function fetchClassroomCourses(token) {
    const response = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("API Error Response:", err);
        const msg = (err.error && err.error.message) ? err.error.message : "Error desconocido de Classroom API";
        const status = (err.error && err.error.status) ? err.error.status : response.status;
        throw new Error(`Google API Error (${status}): ${msg}`);
    }

    const data = await response.json();
    return data.courses || [];
}

function renderClassroomCourses(courses, modalInstance) {
    const modalBody = document.getElementById('classroomModalBody');
    if (courses.length === 0) {
        modalBody.innerHTML = '<div class="text-center py-4 text-dim">No se encontraron cursos activos.</div>';
        return;
    }

    let html = '<div class="list-group">';
    courses.forEach(course => {
        html += `
            <label class="list-group-item bg-dark border-secondary text-light d-flex align-items-center gap-3">
                <input class="form-check-input flex-shrink-0" type="checkbox" value="${course.id}" data-name="${course.name}" style="font-size: 1.3em;">
                <div>
                    <h6 class="mb-0 fw-bold">${course.name}</h6>
                    <small class="text-dim">${course.section || ''}</small>
                </div>
            </label>
        `;
    });
    html += '</div>';

    html += `
        <div class="mt-4 d-grid">
            <button class="btn btn-premium" onclick="processClassroomImport()">
                Importar Seleccionados
            </button>
        </div>
    `;
    modalBody.innerHTML = html;
}

async function processClassroomImport() {
    const checkboxes = document.querySelectorAll('#classroomModalBody input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => ({
        id: cb.value,
        name: cb.dataset.name
    }));

    if (selected.length === 0) return alert("Selecciona al menos un curso.");

    const btn = document.querySelector('#classroomModalBody button.btn-premium');
    btn.innerText = "Importando...";
    btn.disabled = true;

    try {
        let importedCount = 0;
        for (const course of selected) {
            // Updated to store Classroom Course ID
            await createClass(currentUser.uid, course.name, { classroomCourseId: course.id });
            importedCount++;
        }

        const modalEl = document.getElementById('classroomModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        modalInstance.hide();

        alert(`¡${importedCount} clases importadas correctamente!`);
        loadClasses();

    } catch (error) {
        console.error("Import Error:", error);
        alert("Error al importar clases.");
        btn.innerText = "Error";
        btn.disabled = false;
    }
}

// --- Assignments & Grading ---

async function createClassroomAssignment(classId, courseId, title, exerciseCount, targetWpm) {
    const token = await getClassroomToken();

    // 1. Create CourseWork in Classroom
    const courseworkBody = {
        title: `MecanoClass: ${title}`,
        description: `Completar ${exerciseCount} ejercicios de mecanografía. Se evaluará precisión y velocidad (Objetivo: ${targetWpm} PPM).`,
        workType: 'ASSIGNMENT',
        state: 'PUBLISHED',
        maxPoints: 10,
    };

    const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseworkBody)
    });

    if (!response.ok) throw new Error("Error creating assignment in Classroom");

    const coursework = await response.json();

    // 2. Save Assignment Metadata in DB
    await db.collection('classes').doc(classId).collection('assignments').add({
        classroomCourseWorkId: coursework.id,
        title: title,
        exerciseCount: parseInt(exerciseCount),
        targetWpm: parseInt(targetWpm),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return coursework;
}

async function syncClassroomGrades(classId, courseId) {
    const token = await getClassroomToken();

    // 1. Fetch Assignments from DB
    const assignmentsSnap = await db.collection('classes').doc(classId).collection('assignments').get();
    if (assignmentsSnap.empty) return 0;

    // 2. Fetch Class Members (to map email -> studentId if needed, or rely on member map)
    const members = await getClassMembers(classId); // member objects have uid and email?

    // We need to match Classroom User ID or Email to Firebase UID.
    // Let's fetch Rosters to get Classroom Profiles (Email -> userId)

    const rosterRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const rosterData = await rosterRes.json();
    const roster = rosterData.students || [];

    // Map Email -> ClassroomUserId
    const emailToClassroomId = {};
    roster.forEach(s => {
        // profile.emailAddress might be present if specific scopes are set
        if (s.profile && s.profile.emailAddress) {
            emailToClassroomId[s.profile.emailAddress.toLowerCase()] = s.userId;
        }
    });

    let syncCount = 0;

    // For each assignment
    for (const doc of assignmentsSnap.docs) {
        const task = doc.data();
        const courseWorkId = task.classroomCourseWorkId;
        const targetWpm = task.targetWpm || 40;
        const reqCount = task.exerciseCount || 5;

        // Iterate over our students
        for (const member of members) {
            if (!member.email) continue;
            const classroomUserId = emailToClassroomId[member.email.toLowerCase()];
            if (!classroomUserId) continue; // Not found in Classroom roster

            // Calculate Grade from our DB
            // We need results AFTER task.createdAt
            const resultsRef = db.collection('results');
            const resSnap = await resultsRef
                .where('studentId', '==', member.uid)
                .where('classId', '==', classId)
                .where('timestamp', '>=', task.createdAt)
                .get();

            let validResults = resSnap.docs.map(d => d.data());

            if (validResults.length >= reqCount) {
                // Let's take the LATEST 'reqCount' results to be fair to improvement.

                // Sort by date desc (newest first)
                validResults.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
                const bestResults = validResults.slice(0, reqCount);

                const avgWpm = bestResults.reduce((s, r) => s + r.wpm, 0) / bestResults.length;
                const avgAcc = bestResults.reduce((s, r) => s + r.accuracy, 0) / bestResults.length;

                // Formula (0-10)
                // WPM part (5 pts): capped at targetWpm
                const wpmScore = Math.min(5, (avgWpm / targetWpm) * 5);
                // Acc part (5 pts)
                const accScore = (avgAcc / 100) * 5;

                const finalGrade = Math.round((wpmScore + accScore) * 10); // Classroom maxPoints=10. Integer? No, float is allowed in API but 'draftGrade' is separate. 
                // Wait, draftGrade is Double. 

                const gradeToSend = Math.round((wpmScore + accScore) * 10) / 10; // 1 decimal if needed, but usually whole numbers. Let's do 1 decimal.

                // PUSH to Classroom
                try {
                    // 1. Find submission ID
                    const subRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=${classroomUserId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const subData = await subRes.json();
                    if (subData.studentSubmissions && subData.studentSubmissions.length > 0) {
                        const submission = subData.studentSubmissions[0];

                        // Patch Grade
                        const patchBody = {
                            draftGrade: gradeToSend,
                            assignedGrade: gradeToSend
                        };
                        const updateMask = 'draftGrade,assignedGrade';

                        await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submission.id}?updateMask=${updateMask}`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(patchBody)
                        });

                        syncCount++;
                    }
                } catch (err) {
                    console.error("Error synching student:", member.email, err);
                }
            }
        }
    }
    return syncCount;
}
