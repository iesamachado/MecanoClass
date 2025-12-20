// Local Assignments Management (no Classroom sync)

async function createLocalAssignment(classId, title, exerciseCount, targetWpm) {
    const assignment = {
        id: 'local_' + Date.now(),
        title,
        exerciseCount: parseInt(exerciseCount),
        targetWpm: parseInt(targetWpm),
        createdAt: new Date(),
        isLocal: true
    };

    const classRef = db.collection('classes').doc(classId);
    await classRef.update({
        localAssignments: firebase.firestore.FieldValue.arrayUnion(assignment)
    });

    return assignment;
}

async function deleteLocalAssignment(classId, assignmentId) {
    // Get current class data
    const classDoc = await db.collection('classes').doc(classId).get();
    const classData = classDoc.data();
    const localAssignments = classData.localAssignments || [];

    // Filter out the assignment to delete
    const updated = localAssignments.filter(a => a.id !== assignmentId);

    // Update
    await db.collection('classes').doc(classId).update({
        localAssignments: updated
    });
}

async function getLocalAssignments(classId) {
    const classDoc = await db.collection('classes').doc(classId).get();
    if (!classDoc.exists) return [];

    const classData = classDoc.data();
    return classData.localAssignments || [];
}
