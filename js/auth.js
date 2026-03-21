// ============================================
// FuelOdo - Authentication (Email + Google)
// ============================================

(function() {
  // Utils
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Check if already logged in → redirect
  auth.onAuthStateChanged(user => {
    if (user) {
      const isLoginPage = !window.location.pathname.includes('app.html');
      if (isLoginPage) {
        window.location.href = 'app.html';
      }
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    // ── Tab Switching ──
    const tabs = document.querySelectorAll('.auth-tab');
    const loginStep = document.getElementById('stepLogin');
    const registerStep = document.getElementById('stepRegister');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (tab.dataset.tab === 'login') {
          loginStep.classList.add('active');
          registerStep.classList.remove('active');
        } else {
          registerStep.classList.add('active');
          loginStep.classList.remove('active');
        }
      });
    });

    // ── Email/Password Login ──
    document.getElementById('loginBtn').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!email) { showToast('Please enter your email', 'error'); return; }
      if (!password) { showToast('Please enter your password', 'error'); return; }

      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Signing in...';

      try {
        await auth.signInWithEmailAndPassword(email, password);
        showToast('Login successful!', 'success');
        // onAuthStateChanged will redirect
      } catch (error) {
        console.error('Login error:', error);
        const msg = getAuthErrorMessage(error.code);
        showToast(msg, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sign In';
      }
    });

    // ── Email/Password Register ──
    document.getElementById('registerBtn').addEventListener('click', async () => {
      const name = document.getElementById('registerName').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;

      if (!name) { showToast('Please enter your name', 'error'); return; }
      if (!email) { showToast('Please enter your email', 'error'); return; }
      if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

      const btn = document.getElementById('registerBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Creating account...';

      try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;

        // Update display name
        await user.updateProfile({ displayName: name });

        // Save user profile to Firestore
        await db.collection('users').doc(user.uid).set({
          name: name,
          email: user.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('Account created!', 'success');
        // onAuthStateChanged will redirect
      } catch (error) {
        console.error('Register error:', error);
        const msg = getAuthErrorMessage(error.code);
        showToast(msg, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Create Account';
      }
    });

    // ── Google Sign-In ──
    document.getElementById('googleSignInBtn').addEventListener('click', async () => {
      const btn = document.getElementById('googleSignInBtn');
      btn.disabled = true;

      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Save/update user profile
        await db.collection('users').doc(user.uid).set({
          name: user.displayName || 'User',
          email: user.email,
          photoURL: user.photoURL || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('Welcome, ' + (user.displayName || 'User') + '!', 'success');
        // onAuthStateChanged will redirect
      } catch (error) {
        console.error('Google sign-in error:', error);
        if (error.code === 'auth/popup-closed-by-user') {
          showToast('Sign-in cancelled', 'warning');
        } else {
          showToast(`Google sign-in failed: ${error.message || error.code}`, 'error');
        }
      } finally {
        btn.disabled = false;
      }
    });

    // ── Forgot Password ──
    document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
      const email = document.getElementById('loginEmail').value.trim();
      if (!email) {
        showToast('Enter your email above first, then click Forgot password', 'warning');
        document.getElementById('loginEmail').focus();
        return;
      }

      try {
        await auth.sendPasswordResetEmail(email);
        showToast('Password reset email sent! Check your inbox.', 'success');
      } catch (error) {
        console.error('Reset error:', error);
        showToast(getAuthErrorMessage(error.code), 'error');
      }
    });

    // ── Enter key support ──
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
    document.getElementById('registerPassword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('registerBtn').click();
    });
  });

  // ── Friendly error messages ──
  function getAuthErrorMessage(code) {
    switch (code) {
      case 'auth/user-not-found': return 'No account found with this email. Register first!';
      case 'auth/wrong-password': return 'Incorrect password. Try again.';
      case 'auth/invalid-credential': return 'Invalid email or password. Check and try again.';
      case 'auth/email-already-in-use': return 'This email is already registered. Sign in instead!';
      case 'auth/weak-password': return 'Password is too weak. Use at least 6 characters.';
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/too-many-requests': return 'Too many attempts. Wait a moment and try again.';
      case 'auth/network-request-failed': return 'Network error. Check your connection.';
      default: return 'Authentication failed. Please try again.';
    }
  }
})();
