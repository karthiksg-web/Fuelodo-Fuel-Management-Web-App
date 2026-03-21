// ============================================
// FuelOdo - Firebase Configuration
// ============================================
// INSTRUCTIONS: Replace the config below with your
// Firebase project's configuration from the Firebase Console.
// Go to: Firebase Console → Project Settings → Your Apps → Config

const firebaseConfig = {
  apiKey: "AIzaSyDADymYNw7riggIoyL2ljr99XOlzDj3UVw",
  authDomain: "fuelodo.firebaseapp.com",
  projectId: "fuelodo",
  storageBucket: "fuelodo.firebasestorage.app",
  messagingSenderId: "453359115282",
  appId: "1:453359115282:web:8bd126875931d0a7c30ccb",
  measurementId: "G-7GVZ52K6TF"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Helper to get current user's UID
function getCurrentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

// Helper to get user's base document path
function userBasePath() {
  const uid = getCurrentUid();
  return uid ? `users/${uid}` : null;
}
