// MecaClass Firebase Configuration
// IMPORTANT: Replace the measurement ID and other keys with your own unique Firebase project values.
// You can find these in the Firebase Console: Project Settings > General > Your Apps > SDK Setup/Configuration

const firebaseConfig = {
    apiKey: "AIzaSyAugMXdwLyKSdK0ZcHMur5vQlrPM_Flnls",
    authDomain: "mecaclass-82c6c.firebaseapp.com",
    projectId: "mecaclass-82c6c",
    storageBucket: "mecaclass-82c6c.firebasestorage.app",
    messagingSenderId: "103046722794",
    appId: "1:103046722794:web:91eb06b05d9677cdf59393",
    measurementId: "G-R6VQH15TES"
};

// Initialize Firebase
// We assume firebase libraries are loaded via CDN in index.html
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();
