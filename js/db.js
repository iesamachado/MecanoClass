// Database Logic
// Handles Firestore interactions

const dbCollection = {
    USERS: 'users',
    CLASSES: 'classes',
    CLASS_MEMBERS: 'class_members',
    RESULTS: 'results',
    PRACTICE_TEXTS: 'practice_texts'
};

function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Creates a new class
 * @param {string} teacherId - UID of the teacher
 * @param {string} name - Class Name
 */
async function createClass(teacherId, name, metadata = {}) {
    const pin = generatePin();
    const classRef = db.collection(dbCollection.CLASSES).doc();

    await classRef.set({
        id: classRef.id,
        teacherId: teacherId,
        name: name,
        pin: pin,
        ...metadata, // Store extra fields (e.g. classroomCourseId)
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: classRef.id, pin: pin, name: name, ...metadata };
}

/**
 * Helper to join a class
 * @param {string} studentId 
 * @param {string} pin 
 */
async function joinClass(studentId, pin) {
    // Find class by PIN
    const snapshot = await db.collection(dbCollection.CLASSES).where('pin', '==', pin).get();

    if (snapshot.empty) {
        throw new Error("Class not found with this PIN.");
    }

    const classDoc = snapshot.docs[0];
    const classData = classDoc.data();

    // Add to class_members subcollection (or separate collection to avoid doc size limits)
    // Using a separate collection 'class_members' with a composite ID is cleaner
    const membershipId = `${classDoc.id}_${studentId}`;
    await db.collection(dbCollection.CLASS_MEMBERS).doc(membershipId).set({
        classId: classDoc.id,
        studentId: studentId,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return classData;
}

async function getTeacherClasses(teacherId) {
    const snapshot = await db.collection(dbCollection.CLASSES)
        .where('teacherId', '==', teacherId)
        .get();

    // Sort client-side to avoid complex index requirements (createdAt desc)
    const classes = snapshot.docs.map(doc => doc.data());
    classes.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return classes;
}


/**
 * Creates 'users' document if it doesn't exist
 * @param {object} user - Firebase User object
 * @param {string} role - 'teacher' | 'student'
 */
async function createUserProfile(user, role) {
    const userRef = db.collection(dbCollection.USERS).doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
        // Generate random avatar for new users
        const seed = user.uid; // or Math.random()
        const photoURL = `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4`;

        await userRef.set({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: photoURL, // Override Google photo with DiceBear
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { role: role };
    } else {
        return doc.data();
    }
}

async function getUserProfile(uid) {
    const doc = await db.collection(dbCollection.USERS).doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function updateUserProfile(uid, displayName, photoURL) {
    await db.collection(dbCollection.USERS).doc(uid).update({
        displayName: displayName,
        photoURL: photoURL,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

// --- Analytics & Results ---

async function getClassData(classId) {
    const doc = await db.collection(dbCollection.CLASSES).doc(classId).get();
    return doc.exists ? doc.data() : null;
}

async function getClassMembers(classId) {
    const snapshot = await db.collection(dbCollection.CLASS_MEMBERS).where('classId', '==', classId).get();
    const members = [];

    // In production we'd use Promise.all but for simplicity/rate limits loop is okay or optimized batch fetch
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const userProfile = await getUserProfile(data.studentId);
        if (userProfile) {
            members.push({ ...userProfile, joinedAt: data.joinedAt });
        }
    }
    return members;
}

/**
 * Saves a practice or game result
 * @param {string} studentId - User ID
 * @param {number} wpm - Words per minute
 * @param {number} accuracy - Accuracy percentage
 * @param {string} mode - 'practice' or other mode
 * @param {string|null} classId - Class ID if applicable
 * @param {string|null} textSummary - First 50 chars of practiced text (optional)
 * @param {number|null} duration - Practice duration in seconds (optional)
 */
async function saveResult(studentId, wpm, accuracy, mode = 'practice', classId = null, textSummary = null, duration = null) {
    const data = {
        studentId,
        wpm,
        accuracy,
        mode,
        classId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (textSummary) data.textSummary = textSummary;
    if (duration) data.duration = duration;

    await db.collection(dbCollection.RESULTS).add(data);
}

async function getStudentResults(studentId, limit = 10) {
    const snapshot = await db.collection(dbCollection.RESULTS)
        .where('studentId', '==', studentId)
        .get();

    // Client side sort & limit
    let results = snapshot.docs.map(doc => doc.data());
    results.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    return results.slice(0, limit);
}

async function getClassResults(classId, limit = 50) {
    const snapshot = await db.collection(dbCollection.RESULTS)
        .where('classId', '==', classId)
        .get();

    let results = snapshot.docs.map(doc => doc.data());
    results.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    return results.slice(0, limit);
}

// --- Practice Texts ---

async function getRandomPracticeText() {
    const textCollection = db.collection(dbCollection.PRACTICE_TEXTS);

    // Check if empty/needs seeding - naive implementation for <100 docs
    const allSnapshot = await textCollection.get();

    if (allSnapshot.empty) {
        if (typeof initialTexts !== 'undefined') {
            await seedPracticeTexts(initialTexts);
            // Re-fetch after seeding
            const newSnapshot = await textCollection.get();
            const docs = newSnapshot.docs;
            const randomDoc = docs[Math.floor(Math.random() * docs.length)];
            return randomDoc.data().text;
        } else {
            return "Texto de ejemplo por defecto. Error al cargar librería de textos.";
        }
    }

    const docs = allSnapshot.docs;
    const randomDoc = docs[Math.floor(Math.random() * docs.length)];
    return randomDoc.data().text;
}

async function seedPracticeTexts(texts) {
    const batch = db.batch();
    const textCollection = db.collection(dbCollection.PRACTICE_TEXTS);

    texts.forEach(item => {
        const docRef = textCollection.doc();
        batch.set(docRef, item);
    });

    await batch.commit();
    console.log("Seeded practice texts.");
}

// --- Analytics Helpers ---

async function getDailyTopScores(limit = 5) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = firebase.firestore.Timestamp.fromDate(today);

    // Query results from today
    // To avoid composite index issues (timestamp + wpm), we fetch all from today and sort client-side.
    // Ideally we would want to filter by mode='practice' too if we distinguish.

    // Note: If usage is high, this client-side sort on "all of today's results" might be heavy.
    // But for a classroom app it's fine.

    const snapshot = await db.collection(dbCollection.RESULTS)
        .where('timestamp', '>=', todayTimestamp)
        .get();

    let results = snapshot.docs.map(doc => doc.data());

    // Enrich with user data (we need display names)
    // We'll fetching user profiles for the top candidates

    // Sort by WPM desc
    results.sort((a, b) => b.wpm - a.wpm);

    // Take top N distinct users? Or just top scores? 
    // Usually "Best exercise of the day" implies top scores.
    // Let's unique by studentId if we want "Best of each user", but "Ranking" usually allows multiple entries?
    // User asked "ranking del dia del mejor ejercicio" -> "ranking of the best exercise". 
    // Usually means top N scores. But if one user has top 10 spots it's boring. 
    // Let's show top score per user for variety, or just top.
    // "ranking del dia del mejor ejercicio" sounds like "top scores".

    return results.slice(0, limit);
}

async function getAllClassResults(classId) {
    const snapshot = await db.collection(dbCollection.RESULTS)
        .where('classId', '==', classId)
        .get();

    let results = snapshot.docs.map(doc => doc.data());
    results.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    return results;
}

// --- Live Sessions ---

// dbCollection updates need to be manual or assume they exist
dbCollection.LIVE_SESSIONS = 'live_sessions';
dbCollection.LIVE_PARTICIPANTS = 'live_participants';

async function createLiveSession(hostId, text) {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    // Ensure uniqueness check in prod

    await db.collection(dbCollection.LIVE_SESSIONS).doc(pin).set({
        hostId,
        pin,
        text,
        status: 'lobby', // lobby, running, finished
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return pin;
}

async function joinLiveSession(pin, studentId) {
    const sessionRef = db.collection(dbCollection.LIVE_SESSIONS).doc(pin);
    const doc = await sessionRef.get();

    if (!doc.exists) throw new Error("Partida no encontrada.");
    if (doc.data().status !== 'lobby') throw new Error("La partida ya ha comenzado o finalizado.");

    await db.collection(dbCollection.LIVE_PARTICIPANTS).doc(`${pin}_${studentId}`).set({
        sessionId: pin,
        studentId,
        wpm: 0,
        progress: 0,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    return doc.data(); // Return session info (e.g., text won't be sent yet generally but here yes)
}

function listenToSession(pin, onChange) {
    return db.collection(dbCollection.LIVE_SESSIONS).doc(pin)
        .onSnapshot(doc => {
            if (doc.exists) onChange(doc.data());
        });
}

function listenToParticipants(pin, onChange) {
    return db.collection(dbCollection.LIVE_PARTICIPANTS)
        .where('sessionId', '==', pin)
        .onSnapshot(snapshot => {
            const participants = snapshot.docs.map(d => d.data());
            onChange(participants);
        });
}

async function startLiveSession(pin) {
    await db.collection(dbCollection.LIVE_SESSIONS).doc(pin).update({
        status: 'running',
        startTime: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function updateParticipantProgress(pin, studentId, wpm, progress) {
    await db.collection(dbCollection.LIVE_PARTICIPANTS).doc(`${pin}_${studentId}`).update({
        wpm,
        progress
    });
}

// --- Class Text Management ---

async function addClassCustomText(classId, textData) {
    const classRef = db.collection(dbCollection.CLASSES).doc(classId);
    return classRef.update({
        customTexts: firebase.firestore.FieldValue.arrayUnion(textData)
    });
}

async function removeClassCustomText(classId, textData) {
    const classRef = db.collection(dbCollection.CLASSES).doc(classId);
    return classRef.update({
        customTexts: firebase.firestore.FieldValue.arrayRemove(textData)
    });
}

async function toggleClassGlobalText(classId, textId, isDisabled) {
    const classRef = db.collection(dbCollection.CLASSES).doc(classId);
    if (isDisabled) {
        return classRef.update({
            disabledGlobalTexts: firebase.firestore.FieldValue.arrayUnion(textId)
        });
    } else {
        return classRef.update({
            disabledGlobalTexts: firebase.firestore.FieldValue.arrayRemove(textId)
        });
    }
}

async function getAllGlobalTexts() {
    const snapshot = await db.collection(dbCollection.PRACTICE_TEXTS).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPracticeTextForClass(classId) {
    try {
        // 1. Fetch Class Config
        const classDoc = await db.collection(dbCollection.CLASSES).doc(classId).get();
        if (!classDoc.exists) throw new Error("Class not found");
        const classData = classDoc.data();

        const customTexts = classData.customTexts || [];
        const disabledIDs = new Set(classData.disabledGlobalTexts || []);

        // 2. Fetch All Global Texts (To filter)
        // Optimization: In a real app, maybe cached or paginated. 
        // Here, 80 texts is small enough to fetch.
        const globalSnapshot = await db.collection(dbCollection.PRACTICE_TEXTS).get();
        const globalTexts = globalSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(t => !disabledIDs.has(t.id));

        // 3. Merge Pool
        const pool = [...customTexts, ...globalTexts];

        if (pool.length === 0) return null;

        // 4. Random Pick
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex];

    } catch (error) {
        console.error("Error fetching class practice text:", error);
        return null; // Handle fallback in UI
    }
}
