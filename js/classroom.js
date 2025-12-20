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
    const originalText = btn.innerText;
    btn.innerText = "Importando...";
    btn.disabled = true;

    try {
        const token = await getClassroomToken();
        let importedCount = 0;

        for (const course of selected) {
            // 1. Create class in Firestore
            const classData = await createClass(currentUser.uid, course.name, { classroomCourseId: course.id });
            const classId = classData.id;

            // 2. Import students from roster
            btn.innerText = `Importando estudiantes de ${course.name}...`;
            try {
                await importClassroomStudents(token, course.id, classId);
            } catch (err) {
                console.warn(`Error importing students for ${course.name}:`, err);
                // Continue even if student import fails
            }

            importedCount++;
        }

        const modalEl = document.getElementById('classroomModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        modalInstance.hide();

        alert(`¡${importedCount} clases importadas correctamente!`);
        loadClasses();

    } catch (error) {
        console.error("Import Error:", error);
        alert("Error al importar clases: " + error.message);
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function importClassroomStudents(token, courseId, classId) {
    // Fetch students from Classroom roster
    const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error("Error fetching students:", err);
        throw new Error("No se pudieron cargar los estudiantes del curso");
    }

    const data = await response.json();
    const students = data.students || [];

    if (students.length === 0) {
        console.log("No students found in course", courseId);
        return;
    }

    // For each student, try to find matching Firebase user by email and add to class
    let addedCount = 0;
    for (const student of students) {
        const email = student.profile?.emailAddress;
        if (!email) continue;

        try {
            // Query Firebase users by email
            const userSnapshot = await db.collection('users')
                .where('email', '==', email)
                .limit(1)
                .get();

            if (!userSnapshot.empty) {
                const userDoc = userSnapshot.docs[0];
                const userId = userDoc.id;

                // Add student to class members using joinClass logic
                // Check if already a member
                const memberCheck = await db.collection('classes')
                    .doc(classId)
                    .get();

                const classData = memberCheck.data();
                if (classData && classData.members && classData.members.includes(userId)) {
                    console.log(`Student ${email} already in class`);
                    continue;
                }

                // Add to members array
                await db.collection('classes').doc(classId).update({
                    members: firebase.firestore.FieldValue.arrayUnion(userId)
                });

                addedCount++;
                console.log(`Added student ${email} to class`);
            } else {
                console.log(`No Firebase user found for email: ${email}`);
            }
        } catch (err) {
            console.error(`Error adding student ${email}:`, err);
        }
    }

    console.log(`Imported ${addedCount} students to class ${classId}`);
    return addedCount;
}

// --- Assignments & Grading ---

async function createClassroomAssignment(classId, courseId, title, exerciseCount, targetWpm, dueDate) {
    const token = await getClassroomToken();

    // Get the practice URL for this class
    const practiceUrl = `${window.location.origin}/practice.html?classId=${classId}`;

    // Parse due date to Google Classroom format
    let dueDateObj = null;
    if (dueDate) {
        const date = new Date(dueDate);
        dueDateObj = {
            dueDate: {
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                day: date.getDate()
            },
            dueTime: {
                hours: date.getHours(),
                minutes: date.getMinutes()
            }
        };
    }

    // 1. Create CourseWork in Classroom
    const courseworkBody = {
        title: `MecanoClass: ${title}`,
        description: `Completar ${exerciseCount} ejercicios de mecanografía.\n\n` +
            `📊 Criterios de evaluación:\n` +
            `• Objetivo de velocidad: ${targetWpm} PPM\n` +
            `• La nota se calcula: 60% velocidad + 40% precisión\n` +
            `• Escala: 0-10 puntos\n\n` +
            `🔗 Enlace a la práctica:\n${practiceUrl}\n\n` +
            `💡 Consejo: Completa al menos ${exerciseCount} ejercicios para obtener tu calificación.`,
        workType: 'ASSIGNMENT',
        state: 'PUBLISHED',
        maxPoints: 10,
        ...dueDateObj
    };

    const response = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseworkBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Classroom API Error:", errorData);
        throw new Error("Error creating assignment in Classroom");
    }

    const coursework = await response.json();

    // 2. Save Assignment Metadata in DB
    await db.collection('classes').doc(classId).collection('assignments').add({
        classroomCourseWorkId: coursework.id,
        title: title,
        exerciseCount: parseInt(exerciseCount),
        targetWpm: parseInt(targetWpm),
        dueDate: dueDate || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return coursework;
}

async function syncClassroomGrades(classId, courseId, selectedAssignments = null) {
    const token = await getClassroomToken();

    // 1. Fetch Assignments from DB
    const assignmentsSnap = await db.collection('classes').doc(classId).collection('assignments').get();
    console.log(`Found ${assignmentsSnap.size} assignments`);
    if (assignmentsSnap.empty) return 0;

    // Filter to only selected assignments if provided
    let assignmentsToSync = assignmentsSnap.docs;
    if (selectedAssignments && selectedAssignments.length > 0) {
        const selectedIds = new Set(selectedAssignments.map(a => a.assignmentId));
        assignmentsToSync = assignmentsSnap.docs.filter(doc => selectedIds.has(doc.id));
        console.log(`Filtering to ${assignmentsToSync.length} selected assignments`);
    }

    // 2. Fetch Class Members (to map email -> studentId if needed, or rely on member map)
    const members = await getClassMembers(classId);
    console.log(`Found ${members.length} class members:`, members.map(m => ({ name: m.displayName, email: m.email })));

    // We need to match Classroom User ID or Email to Firebase UID.
    // Let's fetch Rosters to get Classroom Profiles (Email -> userId)

    const rosterRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/students`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const rosterData = await rosterRes.json();
    const roster = rosterData.students || [];
    console.log(`Found ${roster.length} students in Classroom roster`);

    // Map Email -> ClassroomUserId
    const emailToClassroomId = {};
    roster.forEach(s => {
        // profile.emailAddress might be present if specific scopes are set
        if (s.profile && s.profile.emailAddress) {
            emailToClassroomId[s.profile.emailAddress.toLowerCase()] = s.userId;
        }
    });
    console.log('Email to Classroom ID mapping:', emailToClassroomId);

    let syncCount = 0;

    // For each assignment
    for (const doc of assignmentsToSync) {
        const task = doc.data();
        const courseWorkId = task.classroomCourseWorkId;
        const targetWpm = task.targetWpm || 40;
        const reqCount = task.exerciseCount || 5;
        console.log(`Processing assignment: ${task.title}, courseWorkId: ${courseWorkId}`);

        // Iterate over our students
        for (const member of members) {
            console.log(`  Checking member: ${member.displayName}, email: ${member.email}`);
            if (!member.email) {
                console.log(`  ❌ Skipping ${member.displayName} - no email`);
                continue;
            }
            const classroomUserId = emailToClassroomId[member.email.toLowerCase()];
            if (!classroomUserId) {
                console.log(`  ❌ Skipping ${member.displayName} - email ${member.email} not found in Classroom roster`);
                continue; // Not found in Classroom roster
            }
            console.log(`  ✅ Matched ${member.displayName} - Classroom ID: ${classroomUserId}`);

            // Calculate Grade from our DB
            // Count ALL results from this class (not just after task creation)
            const resultsRef = db.collection('results');
            const resSnap = await resultsRef
                .where('studentId', '==', member.uid)
                .where('classId', '==', classId)
                .get();

            let validResults = resSnap.docs.map(d => d.data()).filter(r => r.timestamp);
            console.log(`    Found ${validResults.length} total results for this class (need ${reqCount})`);

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
                console.log(`    Calculated grade: ${gradeToSend}/10 (avgWpm: ${avgWpm.toFixed(1)}, avgAcc: ${avgAcc.toFixed(1)}%)`);

                // PUSH to Classroom
                try {
                    // 1. Find submission ID
                    const subRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions?userId=${classroomUserId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const subData = await subRes.json();
                    console.log(`    Submission response:`, subData);

                    if (subData.studentSubmissions && subData.studentSubmissions.length > 0) {
                        const submission = subData.studentSubmissions[0];
                        console.log(`    Found submission ID: ${submission.id}, state: ${submission.state}`);

                        // Patch Grade
                        const patchBody = {
                            draftGrade: gradeToSend,
                            assignedGrade: gradeToSend
                        };
                        const updateMask = 'draftGrade,assignedGrade';

                        const gradeRes = await fetch(`https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${submission.id}?updateMask=${updateMask}`, {
                            method: 'PATCH',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(patchBody)
                        });

                        if (gradeRes.ok) {
                            console.log(`    ✅ Successfully updated grade to ${gradeToSend}/10`);
                            syncCount++;
                        } else {
                            const errorData = await gradeRes.json();
                            console.error(`    ❌ Failed to update grade:`, errorData);
                        }
                    } else {
                        console.log(`    ❌ No submission found for this student`);
                    }
                } catch (err) {
                    console.error("Error synching student:", member.email, err);
                }
            } else {
                console.log(`    ⚠️ Not enough results (${validResults.length}/${reqCount})`);
            }
        }
    }

    return syncCount;
}
