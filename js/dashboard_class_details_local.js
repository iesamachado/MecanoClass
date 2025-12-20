
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
                    .filter(r => r.timestamp)
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
