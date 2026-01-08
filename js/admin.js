// Admin Panel Logic

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const profile = await getUserProfile(user.uid);
        //  console.log("Admin Check - Profile:", profile);
        if (!profile || (!profile.isAdmin && profile.role !== 'admin')) {
            console.warn("Access Denied: Not an admin", profile);
            document.body.innerHTML = `
                <div class="d-flex align-items-center justify-content-center vh-100 bg-dark text-light">
                    <div class="text-center p-5 border border-danger rounded-3" style="background: rgba(220, 53, 69, 0.1);">
                        <h1 class="text-danger mb-3"><i class="bi bi-shield-lock-fill"></i> Acceso Denegado</h1>
                        <p class="mb-4">No tienes permisos de administrador para ver esta página.</p>
                        <a href="index.html" class="btn btn-primary">Volver al Inicio</a>
                    </div>
                </div>
            `;
            return;
        }

        // Init Admin
        loadSiteSettings();
        loadAllUsers();

    } else {
        window.location.href = 'index.html';
    }
});

// --- Settings ---

async function loadSiteSettings() {
    try {
        const settings = await getSiteSettings();
        document.getElementById('siteUrlInput').value = settings.siteUrl || window.location.origin;
    } catch (e) {
        console.error("Error loading settings", e);
    }
}

document.getElementById('siteSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const siteUrl = document.getElementById('siteUrlInput').value.trim();
    if (!siteUrl) return;

    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = "Guardando...";
    btn.disabled = true;

    try {
        await updateSiteSettings({ siteUrl });
        alert("Configuración guardada correctamente.");
    } catch (error) {
        console.error("Error saving settings", error);
        alert("Error al guardar: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// --- Users List ---

let allUsersCache = [];

async function loadAllUsers() {
    const teacherBody = document.getElementById('teachersTableBody');
    const studentBody = document.getElementById('studentsTableBody');

    teacherBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando docentes...</td></tr>';
    studentBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">Cargando alumnos...</td></tr>';

    try {
        const users = await getAllUsers();
        allUsersCache = users;
        renderUsers(users);
    } catch (error) {
        console.error("Error loading users", error);
        teacherBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar usuarios.</td></tr>';
        studentBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-danger">Error al cargar usuarios.</td></tr>';
    }
}

async function renderUsers(users) {
    const teacherBody = document.getElementById('teachersTableBody');
    const studentBody = document.getElementById('studentsTableBody');

    teacherBody.innerHTML = '';
    studentBody.innerHTML = '';

    const searchTerm = document.getElementById('searchUser').value.toLowerCase();

    const filteredUsers = users.filter(u =>
        (u.displayName || '').toLowerCase().includes(searchTerm) ||
        (u.email || '').toLowerCase().includes(searchTerm)
    );

    // Sort: Teachers first, then alphabetical? No, keep split logic.
    // We render Teachers into one tab, Students into another.

    // Teachers: role='teacher' OR (role='admin' legacy) OR (isAdmin=true AND role!='student')?
    const teachers = filteredUsers.filter(u => u.role === 'teacher' || u.role === 'admin' || (u.isAdmin && u.role !== 'student'));
    const students = filteredUsers.filter(u => u.role === 'student');

    // --- Teachers Render ---
    if (teachers.length === 0) {
        teacherBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No se encontraron docentes.</td></tr>';
    } else {
        // Fetch class counts for all teachers? Doing this inside the loop might be slow (N+1).
        // For prototype, we can fetch on demand or lazy load? 
        // Better: let's fetch essential counts or just show Action "Ver Clases".
        // Requirement said: "Al lado de los docentes, quiero que pueda ver el numero de clases."
        // We will fetch classes for each teacher. This is heavy but requested. Use Promise.all.

        const teacherRows = await Promise.all(teachers.map(async (t) => {
            const classes = await getTeacherClassesAdmin(t.uid);
            return {
                user: t,
                classCount: classes.length
            };
        }));

        teacherRows.forEach(({ user, classCount }) => {
            const row = `
                <tr>
                    <td class="bg-transparent border-secondary ps-3">
                        <div class="d-flex align-items-center">
                            <img src="${user.photoURL}" class="rounded-circle me-2" width="32" height="32" onerror="this.src='https://via.placeholder.com/32'">
                            <div>
                                <div class="text-light fw-bold">${user.displayName}</div>
                                <span class="badge bg-secondary text-dim bg-opacity-10 border border-secondary border-opacity-25 user-select-all">${user.uid}</span>
                            </div>
                        </div>
                    </td>
                    <td class="bg-transparent border-secondary text-dim user-select-all">${user.email}</td>
                    <td class="bg-transparent border-secondary text-light text-center fw-bold">${classCount}</td>
                    <td class="bg-transparent border-secondary text-end pe-3">
                        <button class="btn btn-sm btn-outline-info" onclick="viewTeacherClasses('${user.uid}', '${user.displayName}')">
                            <i class="bi bi-eye me-1"></i>Ver Clases
                        </button>
                    </td>
                </tr>
            `;
            teacherBody.insertAdjacentHTML('beforeend', row);
        });
    }

    // --- Students Render ---
    if (students.length === 0) {
        studentBody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-dim">No se encontraron alumnos.</td></tr>';
    } else {
        // Requirement for students: "clases unidas"? Not explicitly asked for count but user list is informative.
        // Let's just list them. Calculating joined classes is heavier (scanning all classes members).
        // We will leave the "Clases Unidas" column empty or put "-" for now, unless we want to do a reverse query on 'classes' where members array-contains student.
        // Let's do the query, 50 limit.

        // Optimisation: For students, maybe just show list. Calculating counts for ALL is too much reads.
        // Let's just show "-" for count unless explicitly requested dynamic for all.
        // Actually, user said "Estos listados, quiero que sean meramente informativos".

        students.forEach(s => {
            const row = `
                <tr>
                    <td class="bg-transparent border-secondary ps-3">
                        <div class="d-flex align-items-center">
                            <img src="${s.photoURL}" class="rounded-circle me-2" width="32" height="32" onerror="this.src='https://via.placeholder.com/32'">
                            <div class="text-light fw-bold">${s.displayName}</div>
                        </div>
                    </td>
                    <td class="bg-transparent border-secondary text-dim user-select-all">${s.email}</td>
                    <td class="bg-transparent border-secondary text-dim text-center">-</td> 
                    <td class="bg-transparent border-secondary text-end pe-3">
                        <!-- Actions? Maybe edit/delete later -->
                    </td>
                </tr>
            `;
            studentBody.insertAdjacentHTML('beforeend', row);
        });
    }
}

// Search Listener
document.getElementById('searchUser').addEventListener('input', () => {
    // Debounce?
    renderUsers(allUsersCache);
});


// --- Drill Down Logic ---

async function viewTeacherClasses(teacherId, teacherName) {
    const modalEl = document.getElementById('teacherClassesModal');
    const modal = new bootstrap.Modal(modalEl);
    const list = document.getElementById('teacherClassesList');
    document.getElementById('teacherClassesTitle').innerText = `Clases de ${teacherName}`;

    list.innerHTML = '<div class="text-center p-4 text-dim">Cargando clases...</div>';
    modal.show();

    try {
        const classes = await getTeacherClassesAdmin(teacherId);

        list.innerHTML = '';
        if (classes.length === 0) {
            list.innerHTML = '<div class="text-center p-4 text-dim">Este docente no tiene clases.</div>';
            return;
        }

        classes.forEach(c => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action bg-transparent border-secondary text-light d-flex justify-content-between align-items-center p-3';
            item.innerHTML = `
                <div>
                    <h6 class="mb-1 fw-bold text-info">${c.name}</h6>
                    <small class="text-dim">PIN: <span class="text-white">${c.pin}</span> &bull; ${c.members ? c.members.length : 0} Alumnos</small>
                </div>
                <i class="bi bi-chevron-right text-dim"></i>
             `;
            item.onclick = () => viewClassStudents(c.id, c.name, teacherId, teacherName);
            list.appendChild(item);
        });

    } catch (error) {
        console.error("Error loading classes", error);
        list.innerHTML = '<div class="text-center p-4 text-danger">Error al cargar clases.</div>';
    }
}

async function viewClassStudents(classId, className, teacherId, teacherName) {
    // Hide teacher modal, show student modal? Or stack?
    // Bootstrap supports stacked modals but sometimes glitchy. 
    // Recommended: Hide first, show second. Back button provided in UI.

    // First setup the student modal content
    const list = document.getElementById('classStudentsTableBody');
    document.getElementById('classStudentsTitle').innerText = `Alumnos de ${className}`;

    // Configure Back Button
    const backBtn = document.querySelector('#classStudentsModal .btn-outline-secondary');
    backBtn.onclick = (e) => {
        // prevent default dismissal if handled manually? 
        // Data attributes handle logic: data-bs-dismiss="modal" data-bs-toggle="modal" data-bs-target="#teacherClassesModal"
        // This should automagically verify correct re-opening.
        // We just need to make sure the previous modal state is valid (it reloads though? No, viewTeacherClasses reloads).
        // We can just rely on data attributes, no specific JS logic needed here except ensuring logic flows.
    };

    list.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-dim">Cargando alumnos...</td></tr>';

    const studentsModal = new bootstrap.Modal(document.getElementById('classStudentsModal'));
    const teacherModalEl = document.getElementById('teacherClassesModal');
    const teacherModal = bootstrap.Modal.getInstance(teacherModalEl);

    teacherModal.hide();
    studentsModal.show();

    try {
        const members = await getClassMembers(classId); // db.js function

        list.innerHTML = '';
        if (members.length === 0) {
            list.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-dim">Esta clase no tiene alumnos.</td></tr>';
            return;
        }

        members.forEach(m => {
            const row = `
                <tr>
                    <td class="bg-transparent border-secondary ps-4">
                        <div class="d-flex align-items-center">
                            <img src="${m.photoURL}" class="rounded-circle me-2" width="32" height="32" onerror="this.src='https://via.placeholder.com/32'">
                            <div class="text-light">${m.displayName}</div>
                        </div>
                    </td>
                    <td class="bg-transparent border-secondary text-dim">${m.email}</td>
                </tr>
            `;
            list.insertAdjacentHTML('beforeend', row);
        });

    } catch (error) {
        console.error("Error loading students", error);
        list.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-danger">Error al cargar alumnos.</td></tr>';
    }
}
