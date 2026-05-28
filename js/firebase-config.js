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

// Initialize App Check with reCAPTCHA v3
if (typeof window !== "undefined" && firebase.appCheck) {
  try {
    const appCheck = firebase.appCheck();
    appCheck.activate(
      '6Ld0D9QsAAAAANfWDBPAYZdXqtd-1Bt4E6vPne1P', // reCAPTCHA v3 site key
      true // isTokenAutoRefreshEnabled
    );
    console.log("[AppCheck] Firebase App Check initialized successfully.");
  } catch (err) {
    console.error("[AppCheck] Firebase App Check initialization failed:", err);
  }
}

// Initialize Analytics & define global logging helper
let analytics = null;
if (typeof window !== "undefined" && firebase.analytics) {
  try {
    analytics = firebase.analytics();
    console.log("[Analytics] Firebase Analytics initialized successfully.");
  } catch (err) {
    console.error("[Analytics] Firebase Analytics initialization failed:", err);
  }
}

// Global helper for logging custom events
window.logAppEvent = function(eventName, params = {}) {
  // Always log to console for debugging
  console.log(`[Analytics] Event: ${eventName}`, params);
  
  if (analytics) {
    try {
      analytics.logEvent(eventName, params);
    } catch (err) {
      console.warn(`[Analytics] Failed to log event ${eventName}:`, err);
    }
  } else {
    console.warn(`[Analytics] Event ${eventName} skipped: Analytics not loaded or not in browser.`);
  }
};

// Log initial page view
window.logAppEvent('page_view', {
  page_title: document.title,
  page_location: window.location.href,
  page_path: window.location.pathname
});

// Helper to get current user's UID
function getCurrentUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

// Helper to get user's base document path
function userBasePath() {
  const uid = getCurrentUid();
  return uid ? `users/${uid}` : null;
}
