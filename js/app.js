// ============================================
// FuelOdo - App Shell & SPA Router
// ============================================

// Global toast util
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Global state
const AppState = {
  user: null,
  businessMode: false,
  vehicles: [],
  allFuelLogs: [],     // all logs across all vehicles
  selectedVehicleId: 'all',
  listeners: []        // Firestore listeners for cleanup
};

(function() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  const appLayout = document.getElementById('appLayout');

  // ── Auth Guard ──
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    AppState.user = user;

    // Load user profile
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      const name = userData.name || 'User';

      document.getElementById('headerUserName').textContent = name;
      updateUserAvatarUI(name, user.photoURL);

      // Load business mode
      AppState.businessMode = userData.businessMode === true;
      document.body.classList.toggle('business-mode-active', AppState.businessMode);

    } catch (e) {
      console.error('Failed to load user profile:', e);
    }

    // Show app
    loadingOverlay.style.display = 'none';
    appLayout.style.display = 'flex';

    // Initialize modules
    initRouter();
    initSidebar();
    initProfile();
    initEditProfile();
    initMobileMoreDrawer();
    loadVehicles();

    // Notifications system
    if (typeof NotificationSystem !== 'undefined') {
      NotificationSystem.init();
      NotificationSystem.requestPushPermission();
    }
  });

  // ── SPA Router ──
  function initRouter() {
    const pages = {
      dashboard: document.getElementById('pageDashboard'),
      vehicles: document.getElementById('pageVehicles'),
      fuel: document.getElementById('pageFuel'),
      records: document.getElementById('pageRecords'),
      alerts: document.getElementById('pageAlerts'),
      reports: document.getElementById('pageReports'),
      reminders: document.getElementById('pageReminders')
    };

    function navigate() {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      
      const moreDrawer = document.getElementById('moreDrawer');
      if (hash === 'more') {
        if (moreDrawer) moreDrawer.classList.add('open');
        document.querySelectorAll('.nav-link[data-page], .mobile-nav-btn[data-page]').forEach(link => {
          link.classList.toggle('active', link.dataset.page === 'more');
        });
        return; // Keep current page content
      } else {
        if (moreDrawer) moreDrawer.classList.remove('open');
      }

      // Hide all
      Object.values(pages).forEach(p => {
        if (p) p.classList.remove('active');
      });
      
      // Show target
      const target = pages[hash];
      if (target) {
        target.classList.add('active');
        // Re-trigger animation
        target.style.animation = 'none';
        target.offsetHeight; // force reflow
        target.style.animation = '';
      }

      // Update nav links
      document.querySelectorAll('.nav-link[data-page], .mobile-nav-btn[data-page]').forEach(link => {
        link.classList.toggle('active', link.dataset.page === hash);
      });

      // Page-specific init
      if (hash === 'dashboard') {
        if (typeof initDashboard === 'function') initDashboard();
      } else if (hash === 'vehicles') {
        if (typeof renderVehicles === 'function') renderVehicles();
      } else if (hash === 'records') {
        if (typeof loadRecords === 'function') loadRecords();
      } else if (hash === 'alerts') {
        if (typeof loadAlerts === 'function') loadAlerts();
      } else if (hash === 'reports') {
        if (typeof loadMonthlySummary === 'function') loadMonthlySummary();
      } else if (hash === 'reminders') {
        if (typeof loadReminders === 'function') loadReminders();
      }

      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('active');
    }

    window.addEventListener('hashchange', navigate);
    navigate();
  }

  // ── Mobile More Drawer ──
  function initMobileMoreDrawer() {
    const moreDrawer = document.getElementById('moreDrawer');
    const closeBtn = document.getElementById('closeMoreDrawer');
    const logoutBtn = document.getElementById('mobileLogoutBtn');

    if (!moreDrawer) return;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Go back to previous hash or dashboard
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.hash = 'dashboard';
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        AppState.listeners.forEach(unsub => unsub());
        if (typeof auth !== 'undefined') await auth.signOut();
        window.location.href = 'index.html';
      });
    }
  }

  // ── Sidebar & Menu ──
  function initSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });

    // Logout (Sidebar)
    document.getElementById('logoutBtn').addEventListener('click', async (e) => {
      e.preventDefault();
      // Clean up listeners
      AppState.listeners.forEach(unsub => unsub());
      await auth.signOut();
      window.location.href = 'index.html';
    });
  }

  // ── User Profile Dropdown ──
  function initProfile() {
    const avatarBtn = document.getElementById('userAvatar');
    const dropdown = document.getElementById('profileDropdown');
    const nameEl = document.getElementById('dropdownName');
    const emailEl = document.getElementById('dropdownEmail');
    const avatarEl = document.getElementById('dropdownAvatar');
    const logoutBtn = document.getElementById('dropdownLogoutBtn');

    if (!avatarBtn || !dropdown) return;

    // Toggle dropdown
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible && AppState.user) {
        // Populate static data
        const name = AppState.user.displayName || 'User';
        nameEl.textContent = name;
        emailEl.textContent = AppState.user.email || '';

        // Populate dynamic stats
        document.getElementById('dropdownVehiclesCount').textContent = AppState.vehicles.length;
        document.getElementById('dropdownFillupsCount').textContent = AppState.allFuelLogs.length;

        // Toggle business mode check
        const bizToggle = document.getElementById('businessModeToggle');
        if (bizToggle) bizToggle.checked = AppState.businessMode === true;
      }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !avatarBtn.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // Business mode toggle
    const bizToggle = document.getElementById('businessModeToggle');
    if (bizToggle) {
      bizToggle.addEventListener('change', async (e) => {
        const isBiz = e.target.checked;
        AppState.businessMode = isBiz;
        try {
          await db.collection('users').doc(AppState.user.uid).set({ businessMode: isBiz }, { merge: true });
          document.body.classList.toggle('business-mode-active', isBiz);
          const hash = window.location.hash.replace('#', '') || 'dashboard';
          if (hash === 'dashboard' && typeof initDashboard === 'function') initDashboard();
          showToast(`Business Mode ${isBiz ? 'Enabled' : 'Disabled'}`, 'success');
        } catch (err) {
          console.error(err);
          e.target.checked = !isBiz; // revert
        }
      });
    }

    // Logout (Dropdown)
    logoutBtn.addEventListener('click', async () => {
      AppState.listeners.forEach(unsub => unsub());
      await auth.signOut();
      window.location.href = 'index.html';
    });

    // Delete Account
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', async () => {
        if (!confirm('Are you absolutely sure you want to delete your account? All your vehicles, logs, and data will be permanently wiped. This cannot be undone.')) {
          return;
        }

        const user = auth.currentUser;
        if (!user) return;

        try {
          deleteAccountBtn.innerHTML = '<span class="spinner"></span> Deleting...';
          deleteAccountBtn.disabled = true;

          // 1. Unsubscribe listeners
          AppState.listeners.forEach(unsub => unsub());

          // 2. Delete main User doc
          try {
            await db.collection('users').doc(user.uid).delete();
          } catch(e) {
            console.warn('Could not delete user document:', e);
          }
          
          // 3. Delete from Firebase Auth
          await user.delete();

          if (typeof window.logAppEvent === 'function') {
            window.logAppEvent('user_deleted');
          }
          window.location.href = 'index.html';
        } catch (error) {
          console.error('Delete account error:', error);
          if (error.code === 'auth/requires-recent-login') {
            alert('For security reasons, please log out and log back in before deleting your account.');
            await auth.signOut();
            window.location.href = 'index.html';
          } else {
            alert(`Failed to delete account: ${error.message}`);
          }
        } finally {
          deleteAccountBtn.innerHTML = '<span style="font-size:1.2rem;">🗑️</span> Delete Account';
          deleteAccountBtn.disabled = false;
        }
      });
    }
  }

  // ── Edit Profile Modal ──
  function initEditProfile() {
    const modal = document.getElementById('profileModal');
    const form = document.getElementById('profileForm');
    const editBtn = document.getElementById('editProfileBtn');
    
    if (!modal || !form || !editBtn) return;

    document.getElementById('profileModalClose').addEventListener('click', () => modal.classList.remove('active'));
    document.getElementById('profileCancelBtn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    editBtn.addEventListener('click', () => {
      document.getElementById('profileDropdown').style.display = 'none';
      document.getElementById('profileName').value = AppState.user.displayName || '';
      document.getElementById('profilePicUrl').value = AppState.user.photoURL || '';
      updateModalAvatarPreview();
      modal.classList.add('active');
    });

    document.getElementById('profilePicUrl').addEventListener('input', updateModalAvatarPreview);
    document.getElementById('profileName').addEventListener('input', updateModalAvatarPreview);

    function updateModalAvatarPreview() {
      const url = document.getElementById('profilePicUrl').value.trim();
      const preview = document.getElementById('modalAvatarPreview');
      const name = document.getElementById('profileName').value.trim() || 'U';
      if (url) {
        preview.style.backgroundImage = `url('${url}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = '';
      } else {
        preview.style.backgroundImage = 'none';
        preview.textContent = name.charAt(0).toUpperCase();
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('profileName').value.trim();
      const photoURL = document.getElementById('profilePicUrl').value.trim();
      
      const btn = form.querySelector('button[type="submit"]');
      const oldText = btn.textContent;
      btn.textContent = 'Saving...';
      btn.disabled = true;

      try {
        await AppState.user.updateProfile({ displayName: name, photoURL: photoURL });
        await db.collection('users').doc(AppState.user.uid).set({ name: name, photoUrl: photoURL }, { merge: true });
        
        document.getElementById('headerUserName').textContent = name;
        updateUserAvatarUI(name, photoURL);
        
        modal.classList.remove('active');
        showToast('Profile updated!', 'success');
      } catch (err) {
        console.error('Update profile error:', err);
        showToast(`Failed to update profile: ${err.message}`, 'error');
      } finally {
        btn.textContent = oldText;
        btn.disabled = false;
      }
    });
  }

  function updateUserAvatarUI(name, photoURL) {
    const avatars = [document.getElementById('userAvatar'), document.getElementById('dropdownAvatar')];
    avatars.forEach(el => {
      if (!el) return;
      if (photoURL) {
        el.style.backgroundImage = `url('${photoURL}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.style.backgroundImage = 'none';
        el.textContent = (name || 'U').charAt(0).toUpperCase();
      }
    });
  }

  // ── Load Vehicles (realtime) ──
  function loadVehicles() {
    const uid = getCurrentUid();
    if (!uid) return;

    const unsub = db.collection('users').doc(uid).collection('vehicles')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snapshot => {
        AppState.vehicles = [];
        snapshot.forEach(doc => {
          AppState.vehicles.push({ id: doc.id, ...doc.data() });
        });

        // Update all vehicle selectors
        updateVehicleSelectors();
        // Render vehicles page
        if (typeof renderVehicles === 'function') renderVehicles();
        // Render reminders (ensure names show up)
        if (typeof loadReminders === 'function') loadReminders();
        // Load all fuel logs
        loadAllFuelLogs();
      }, err => {
        console.error('Vehicles listener error:', err);
      });

    AppState.listeners.push(unsub);
  }

  // ── Load All Fuel Logs ──
  window.loadAllFuelLogs = function() {
    const uid = getCurrentUid();
    if (!uid) return;

    // Unsubscribe previous fuel log listeners
    AppState.listeners = AppState.listeners.filter(fn => {
      if (fn._isFuelListener) { fn(); return false; }
      return true;
    });

    AppState.allFuelLogs = [];
    let pending = AppState.vehicles.length;

    if (pending === 0) {
      onAllLogsLoaded();
      return;
    }

    AppState.vehicles.forEach(vehicle => {
      const unsub = db.collection('users').doc(uid)
        .collection('vehicles').doc(vehicle.id)
        .collection('fuelLogs').orderBy('date', 'asc')
        .onSnapshot(snap => {
          // Remove old logs for this vehicle
          AppState.allFuelLogs = AppState.allFuelLogs.filter(l => l.vehicleId !== vehicle.id);
          
          snap.forEach(doc => {
            AppState.allFuelLogs.push({
              id: doc.id,
              vehicleId: vehicle.id,
              vehicleName: vehicle.name,
              fuelType: vehicle.fuelType,
              ...doc.data()
            });
          });

          // Sort by date securely (fallback to odometer or createdAt for same-day entries)
          AppState.allFuelLogs.sort((a, b) => {
            const da = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
            const db2 = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
            if (da === db2) {
              if (a.odometer && b.odometer) return a.odometer - b.odometer;
              const ca = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const cb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return ca - cb;
            }
            return da - db2;
          });

          pending--;
          if (pending <= 0) {
            onAllLogsLoaded();
          }
        }, err => console.error('Fuel log listener error:', err));

      unsub._isFuelListener = true;
      AppState.listeners.push(unsub);
    });
  };

  function onAllLogsLoaded() {
    // Refresh whichever page is active
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    if (hash === 'dashboard' && typeof initDashboard === 'function') initDashboard();
    if (hash === 'vehicles' && typeof renderVehicles === 'function') renderVehicles();
    if (hash === 'records' && typeof loadRecords === 'function') loadRecords();
    if (hash === 'alerts' && typeof loadAlerts === 'function') loadAlerts();
    if (hash === 'reports' && typeof loadMonthlySummary === 'function') loadMonthlySummary();
    if (hash === 'reminders' && typeof loadReminders === 'function') loadReminders();
  }

  // ── Update Vehicle Selectors ──
  function updateVehicleSelectors() {
    const selectors = [
      document.getElementById('globalVehicleSelect'),
      document.getElementById('fuelVehicleSelect'),
      document.getElementById('recordsVehicleFilter'),
      document.getElementById('reminderVehicleSelect')
    ];

    selectors.forEach(sel => {
      if (!sel) return;
      const currentVal = sel.value;
      const isGlobalOrFilter = sel.id === 'globalVehicleSelect' || sel.id === 'recordsVehicleFilter';
      
      sel.innerHTML = '';
      
      if (isGlobalOrFilter) {
        sel.innerHTML = '<option value="all">All Vehicles</option>';
      } else {
        sel.innerHTML = '<option value="">Select a vehicle</option>';
      }

      AppState.vehicles.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.name} (${v.number})`;
        sel.appendChild(opt);
      });

      // Restore selection
      if (currentVal && sel.querySelector(`option[value="${currentVal}"]`)) {
        sel.value = currentVal;
      }
    });

    // Global vehicle filter change
    const globalSel = document.getElementById('globalVehicleSelect');
    globalSel.onchange = () => {
      AppState.selectedVehicleId = globalSel.value;
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      if (hash === 'dashboard' && typeof initDashboard === 'function') initDashboard();
    };
  }

  // ── Global: get filtered logs ──
  window.getFilteredLogs = function(vehicleId) {
    const vid = vehicleId || AppState.selectedVehicleId;
    if (vid === 'all') return [...AppState.allFuelLogs];
    return AppState.allFuelLogs.filter(l => l.vehicleId === vid);
  };

  // ── Helpers ──
  window.formatCurrency = function(n) {
    return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  window.formatDate = function(d) {
    if (!d) return '—';
    const date = d.toDate ? d.toDate() : new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  window.formatNumber = function(n, decimals = 1) {
    return Number(n || 0).toFixed(decimals);
  };
})();
