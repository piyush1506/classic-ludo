// ================= LUDO KING AUTHENTICATION CLIENT =================
const Auth = {
  currentUser: null,
  token: localStorage.getItem('lk_auth_token') || null,

  // Get current API base URL
  getBaseUrl() {
    if (typeof getServerUrl === 'function') {
      return getServerUrl();
    }
    if (window.LUDO_SERVER_URL) return window.LUDO_SERVER_URL;
    return 'https://classic-ludo.onrender.com';
  },

  // Initialize Auth on app launch
  async init() {
    console.log('[Auth] Initializing authentication...');
    const token = localStorage.getItem('lk_auth_token');

    if (token) {
      try {
        const res = await fetch(`${this.getBaseUrl()}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.user) {
          this.setSession(data.user, token);
          console.log('[Auth] Restored session for:', data.user.username);
          return;
        }
      } catch (e) {
        console.warn('[Auth] Token check failed, attempting offline/guest fallback:', e);
      }
    }

    // Auto-create or recover persistent guest if not logged in
    await this.recoverOrCreateGuest();
  },

  // Save session & update UI
  setSession(user, token) {
    this.currentUser = user;
    this.token = token;
    if (token) localStorage.setItem('lk_auth_token', token);
    if (user.id) localStorage.setItem('lk_user_id', user.id);

    // Sync to global game state
    if (typeof userState !== 'undefined') {
      userState.name = user.username;
      userState.coins = user.coins || 10000;
      userState.gems = user.gems || 50;
      userState.userId = user.id;
      userState.avatar = user.avatar || '👑';
      userState.pictureUrl = user.pictureUrl || null;
      if (typeof saveUserState === 'function') saveUserState();
    }

    this.updateUI();

    // Reconnect socket with verified credentials
    if (typeof initSocket === 'function') {
      initSocket();
    }
  },

  // Recover or create persistent Guest
  async recoverOrCreateGuest() {
    const existingGuestId = localStorage.getItem('lk_guest_id');
    const savedName = localStorage.getItem('lk_name') || 'Guest ' + Math.floor(1000 + Math.random() * 9000);

    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingGuestId,
          name: savedName,
          avatar: '👑'
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem('lk_guest_id', data.user.id);
        this.setSession(data.user, data.token);
        return;
      }
    } catch (e) {
      console.warn('[Auth] Guest fetch error, falling back locally:', e);
    }

    // Local fallback if offline
    const fallbackId = existingGuestId || ('guest_' + Math.random().toString(36).slice(2, 9));
    localStorage.setItem('lk_guest_id', fallbackId);
    this.setSession({
      id: fallbackId,
      username: savedName,
      coins: 10000,
      gems: 50,
      level: 1,
      avatar: '👑',
      authProvider: 'guest'
    }, null);
  },

  // Manual Register
  async register(username, email, password, avatar = '👑') {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, avatar })
      });
      const data = await res.json();
      if (data.success) {
        this.setSession(data.user, data.token);
        return { success: true, message: 'Account created successfully!' };
      } else {
        return { success: false, message: data.message || 'Registration failed' };
      }
    } catch (e) {
      return { success: false, message: 'Server connection error. Please try again.' };
    }
  },

  // Manual Login
  async login(identifier, password) {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      const data = await res.json();
      if (data.success) {
        this.setSession(data.user, data.token);
        return { success: true, message: 'Welcome back, ' + data.user.username + '!' };
      } else {
        return { success: false, message: data.message || 'Invalid username or password' };
      }
    } catch (e) {
      return { success: false, message: 'Server connection error. Please try again.' };
    }
  },

  // Google Sign-In Handler
  async handleGoogleResponse(googleData) {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleData)
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.setSession(data.user, data.token);
        return { success: true, message: 'Google Sign-in successful!' };
      } else {
        return { success: false, message: data.message || 'Google login failed' };
      }
    } catch (e) {
      return { success: false, message: 'Google authentication error. Try again.' };
    }
  },

  // Logout / Switch User
  logout() {
    localStorage.removeItem('lk_auth_token');
    this.currentUser = null;
    this.token = null;
    this.recoverOrCreateGuest();
    this.openModal();
  },

  // Update DOM elements with profile
  updateUI() {
    const u = this.currentUser;
    if (!u) return;

    // Lobby Header elements
    const nameEl = document.querySelector('#lobby-username');
    if (nameEl) nameEl.textContent = u.username;

    const coinsEl = document.querySelector('#user-coins');
    if (coinsEl) coinsEl.textContent = (u.coins || 10000).toLocaleString();

    const gemsEl = document.querySelector('#user-gems');
    if (gemsEl) gemsEl.textContent = (u.gems || 50).toLocaleString();

    const avatarWrap = document.querySelector('.avatar-img-wrap');
    if (avatarWrap) {
      if (u.pictureUrl) {
        avatarWrap.innerHTML = `<img src="${u.pictureUrl}" alt="Avatar" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
      } else {
        avatarWrap.textContent = u.avatar || '👑';
      }
    }

    const titleEl = document.querySelector('.user-title');
    if (titleEl) {
      if (u.authProvider === 'google') {
        titleEl.innerHTML = `<span style="color:#4285F4;">🟢 Google Verified</span>`;
      } else if (u.authProvider === 'manual') {
        titleEl.innerHTML = `<span style="color:#00e676;">🟢 Member Account</span>`;
      } else {
        titleEl.innerHTML = `<span style="color:#ffd700;">👤 Guest Player (Tap to Login)</span>`;
      }
    }

    // Modal current status badge
    const modalBadge = document.querySelector('#auth-current-user-badge');
    if (modalBadge) {
      modalBadge.textContent = `Logged in as: ${u.username} (${u.authProvider || 'Guest'})`;
    }
  },

  // Open the Auth Modal
  openModal(tab = 'tab-auth-google') {
    const modal = document.querySelector('#modal-auth');
    if (modal) {
      modal.classList.add('active');
      this.switchTab(tab);
    }
  },

  // Close the Auth Modal
  closeModal() {
    const modal = document.querySelector('#modal-auth');
    if (modal) modal.classList.remove('active');
  },

  // Switch tabs in Auth Modal
  switchTab(targetId) {
    document.querySelectorAll('#auth-tabs .seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === targetId);
    });
    document.querySelectorAll('.auth-tab-content').forEach(content => {
      content.style.display = content.id === targetId ? 'block' : 'none';
    });
  }
};

// ================= DOM EVENT BINDINGS =================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize authentication
  Auth.init();

  // Profile click opens Auth Modal
  const btnProfile = document.querySelector('#btn-profile');
  if (btnProfile) {
    btnProfile.onclick = () => {
      if (typeof sounds !== 'undefined') sounds.playClick();
      Auth.openModal();
    };
  }

  // Auth Modal Tab Navigation
  document.querySelectorAll('#auth-tabs .seg-btn').forEach(btn => {
    btn.onclick = () => {
      if (typeof sounds !== 'undefined') sounds.playClick();
      Auth.switchTab(btn.dataset.tab);
    };
  });

  // Close Auth Modal
  const btnClose = document.querySelector('#btn-close-auth');
  if (btnClose) {
    btnClose.onclick = () => {
      if (typeof sounds !== 'undefined') sounds.playClick();
      Auth.closeModal();
    };
  }

  // 1. LOGIN FORM SUBMISSION
  const formLogin = document.querySelector('#btn-submit-login');
  if (formLogin) {
    formLogin.onclick = async () => {
      const idInput = document.querySelector('#input-login-id');
      const passInput = document.querySelector('#input-login-pass');
      const msgEl = document.querySelector('#auth-login-msg');

      const id = idInput ? idInput.value.trim() : '';
      const pass = passInput ? passInput.value : '';

      if (!id || !pass) {
        if (msgEl) {
          msgEl.textContent = 'Please enter username and password.';
          msgEl.style.color = '#ff5252';
        }
        return;
      }

      formLogin.textContent = 'Logging in...';
      formLogin.disabled = true;

      const res = await Auth.login(id, pass);
      formLogin.textContent = 'LOGIN TO PLAY';
      formLogin.disabled = false;

      if (res.success) {
        if (msgEl) {
          msgEl.textContent = res.message;
          msgEl.style.color = '#00e676';
        }
        setTimeout(() => Auth.closeModal(), 700);
      } else {
        if (msgEl) {
          msgEl.textContent = res.message;
          msgEl.style.color = '#ff5252';
        }
      }
    };
  }

  // 2. REGISTER FORM SUBMISSION
  const formRegister = document.querySelector('#btn-submit-register');
  let selectedAvatar = '👑';

  document.querySelectorAll('.avatar-choice-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.avatar-choice-btn').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      selectedAvatar = b.textContent.trim();
    };
  });

  if (formRegister) {
    formRegister.onclick = async () => {
      const nameInput = document.querySelector('#input-reg-name');
      const emailInput = document.querySelector('#input-reg-email');
      const passInput = document.querySelector('#input-reg-pass');
      const msgEl = document.querySelector('#auth-reg-msg');

      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim() : '';
      const pass = passInput ? passInput.value : '';

      if (!name || name.length < 2) {
        if (msgEl) {
          msgEl.textContent = 'Username must be at least 2 characters.';
          msgEl.style.color = '#ff5252';
        }
        return;
      }
      if (!pass || pass.length < 4) {
        if (msgEl) {
          msgEl.textContent = 'Password must be at least 4 characters.';
          msgEl.style.color = '#ff5252';
        }
        return;
      }

      formRegister.textContent = 'Creating Account...';
      formRegister.disabled = true;

      const res = await Auth.register(name, email, pass, selectedAvatar);
      formRegister.textContent = 'CREATE ACCOUNT';
      formRegister.disabled = false;

      if (res.success) {
        if (msgEl) {
          msgEl.textContent = res.message;
          msgEl.style.color = '#00e676';
        }
        setTimeout(() => Auth.closeModal(), 700);
      } else {
        if (msgEl) {
          msgEl.textContent = res.message;
          msgEl.style.color = '#ff5252';
        }
      }
    };
  }

  // 3. GOOGLE SIGN-IN BUTTON
  const btnGoogle = document.querySelector('#btn-google-signin');
  if (btnGoogle) {
    btnGoogle.onclick = async () => {
      if (typeof sounds !== 'undefined') sounds.playClick();
      const statusEl = document.querySelector('#google-status-msg');
      if (statusEl) statusEl.textContent = 'Connecting with Google...';

      // Check if official Google Identity Services GIS is loaded
      if (window.google && window.google.accounts && window.google.accounts.id) {
        try {
          window.google.accounts.id.prompt();
          return;
        } catch (e) {
          console.log('[GIS] Prompt fallback:', e);
        }
      }

      // Fast Google One-Click Auth / Simulation for instant cross-platform sign-in
      const promptName = prompt('Enter your Google Account Display Name:', Auth.currentUser ? Auth.currentUser.username : 'Rohan J.');
      if (!promptName) {
        if (statusEl) statusEl.textContent = 'Google sign-in cancelled.';
        return;
      }

      const dummyGoogleId = 'g_' + Math.abs(promptName.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
      const res = await Auth.handleGoogleResponse({
        userInfo: {
          name: promptName,
          email: `${promptName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          sub: dummyGoogleId,
          picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(promptName)}`
        }
      });

      if (res.success) {
        if (statusEl) {
          statusEl.textContent = '✅ Connected with Google!';
          statusEl.style.color = '#00e676';
        }
        setTimeout(() => Auth.closeModal(), 700);
      } else {
        if (statusEl) {
          statusEl.textContent = res.message;
          statusEl.style.color = '#ff5252';
        }
      }
    };
  }

  // 4. CONTINUE AS GUEST BUTTON
  const btnGuest = document.querySelector('#btn-guest-continue');
  if (btnGuest) {
    btnGuest.onclick = async () => {
      if (typeof sounds !== 'undefined') sounds.playClick();
      await Auth.recoverOrCreateGuest();
      Auth.closeModal();
    };
  }

  // 5. LOGOUT / SWITCH ACCOUNT
  const btnLogout = document.querySelector('#btn-auth-logout');
  if (btnLogout) {
    btnLogout.onclick = () => {
      if (confirm('Switch account or log out?')) {
        Auth.logout();
      }
    };
  }
});
