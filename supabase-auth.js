// Stop Being Alone - Supabase Auth Module
// Include after supabase-js CDN script

if (window._sbaAuthLoaded) { /* already loaded */ } else {
window._sbaAuthLoaded = true;
const SUPABASE_URL = 'https://krytrynpohddtofrvtnm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyeXRyeW5wb2hkZHRvZnJ2dG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDMxNzUsImV4cCI6MjA4ODYxOTE3NX0.jja3j_TJJsyTvO5eRjAlMxOUAexgp_ZFxVJFlkQvYFk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sbaSupabase = supabase;

// ============================================================
// AUTH STATE
// ============================================================

let currentUser = null;

async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    updateUIForUser(session.user);
  } else {
    updateUIForGuest();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      updateUIForUser(session.user);
      closeAuthModal();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      updateUIForGuest();
    }
  });
}

// ============================================================
// AUTH ACTIONS
// ============================================================

async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'https://stopbeingalone.com/account'
    }
  });
  if (error) throw error;
  return data;
}

async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://stopbeingalone.com/account'
    }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/';
}

async function resetPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://stopbeingalone.com/account?reset=true'
  });
  if (error) throw error;
  return data;
}

// ============================================================
// EMAIL CAPTURE (non-paying leads)
// ============================================================

async function captureEmail(email) {
  // Store in Supabase 'leads' table
  const { data, error } = await supabase
    .from('leads')
    .insert({ email: email, source: window.location.pathname, created_at: new Date().toISOString() });
  // Ignore duplicate email errors (23505)
  if (error && error.code !== '23505' && error.message.indexOf('duplicate') === -1 && error.message.indexOf('conflict') === -1) throw error;
  return data;
}

// ============================================================
// UI UPDATES
// ============================================================

function updateUIForUser(user) {
  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Account';
  
  // Desktop nav
  const navCta = document.getElementById('nav-cta-auth');
  if (navCta) {
    navCta.innerHTML = `
      <a href="/account" class="nav-account-link">${displayName}</a>
    `;
  }

  // Mobile nav
  const mobileCta = document.getElementById('mobile-cta-auth');
  if (mobileCta) {
    mobileCta.innerHTML = `
      <a href="/account" class="mobile-account-link">${displayName}</a>
    `;
  }

  // Hide email capture if logged in
  const emailCapture = document.getElementById('email-capture-section');
  if (emailCapture) emailCapture.style.display = 'none';
}

function updateUIForGuest() {
  const navCta = document.getElementById('nav-cta-auth');
  if (navCta) {
    navCta.innerHTML = `
      <a href="#" onclick="openAuthModal('login'); return false;" class="nav-btn-login">Log in</a>
      <a href="#" onclick="openAuthModal('signup'); return false;" class="nav-btn-signup">Sign up</a>
    `;
  }

  const mobileCta = document.getElementById('mobile-cta-auth');
  if (mobileCta) {
    mobileCta.innerHTML = `
      <a href="#" onclick="openAuthModal('login'); return false;" class="nav-btn-login">Log in</a>
      <a href="#" onclick="openAuthModal('signup'); return false;" class="nav-btn-signup">Sign up</a>
    `;
  }
}

// ============================================================
// AUTH MODAL
// ============================================================

function openAuthModal(mode = 'signup') {
  let modal = document.getElementById('auth-modal');
  if (!modal) {
    createAuthModal();
    modal = document.getElementById('auth-modal');
  }
  setAuthMode(mode);
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function setAuthMode(mode) {
  const title = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchText = document.getElementById('auth-switch-text');
  const forgotLink = document.getElementById('auth-forgot-link');
  const errorMsg = document.getElementById('auth-error');
  const successMsg = document.getElementById('auth-success');

  if (errorMsg) errorMsg.style.display = 'none';
  if (successMsg) successMsg.style.display = 'none';

  if (mode === 'signup') {
    title.textContent = 'Start your journey';
    subtitle.textContent = 'Create your account to begin.';
    submitBtn.textContent = 'Create account';
    submitBtn.setAttribute('data-mode', 'signup');
    switchText.innerHTML = 'Already have an account? <a href="#" onclick="setAuthMode(\'login\'); return false;">Log in</a>';
    if (forgotLink) forgotLink.style.display = 'none';
  } else if (mode === 'login') {
    title.textContent = 'Welcome back';
    subtitle.textContent = 'Log in to your account.';
    submitBtn.textContent = 'Log in';
    submitBtn.setAttribute('data-mode', 'login');
    switchText.innerHTML = 'No account yet? <a href="#" onclick="setAuthMode(\'signup\'); return false;">Sign up</a>';
    if (forgotLink) forgotLink.style.display = 'block';
  } else if (mode === 'forgot') {
    title.textContent = 'Reset your password';
    subtitle.textContent = 'We\'ll send you a reset link.';
    submitBtn.textContent = 'Send reset link';
    submitBtn.setAttribute('data-mode', 'forgot');
    switchText.innerHTML = '<a href="#" onclick="setAuthMode(\'login\'); return false;">Back to login</a>';
    if (forgotLink) forgotLink.style.display = 'none';
  }
}

function createAuthModal() {
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'auth-modal-overlay';
  modal.innerHTML = `
    <div class="auth-modal-card">
      <button class="auth-modal-close" onclick="closeAuthModal()" aria-label="Close">&times;</button>
      
      <h2 id="auth-modal-title" class="auth-modal-title">Start your journey</h2>
      <p id="auth-modal-subtitle" class="auth-modal-subtitle">Create your account to begin.</p>

      <button class="auth-google-btn" onclick="handleGoogleAuth()">
        <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
        Continue with Google
      </button>

      <div class="auth-divider">
        <span>or</span>
      </div>

      <div class="auth-form">
        <div id="auth-error" class="auth-message auth-error" style="display:none;"></div>
        <div id="auth-success" class="auth-message auth-success" style="display:none;"></div>
        
        <input type="email" id="auth-email" class="auth-input" placeholder="Email address" autocomplete="email" />
        <input type="password" id="auth-password" class="auth-input" placeholder="Password" autocomplete="current-password" />
        
        <a href="#" id="auth-forgot-link" class="auth-forgot" onclick="setAuthMode('forgot'); return false;" style="display:none;">Forgot password?</a>
        
        <button id="auth-submit-btn" class="auth-submit-btn" data-mode="signup" onclick="handleEmailAuth()">Create account</button>
      </div>

      <p id="auth-switch-text" class="auth-switch">Already have an account? <a href="#" onclick="setAuthMode('login'); return false;">Log in</a></p>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAuthModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuthModal();
  });
}

// ============================================================
// AUTH HANDLERS
// ============================================================

async function handleEmailAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const mode = document.getElementById('auth-submit-btn').getAttribute('data-mode');
  const errorMsg = document.getElementById('auth-error');
  const successMsg = document.getElementById('auth-success');

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!email) {
    showAuthError('Please enter your email address.');
    return;
  }

  if (mode !== 'forgot' && !password) {
    showAuthError('Please enter a password.');
    return;
  }

  if (mode !== 'forgot' && password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  try {
    if (mode === 'signup') {
      await signUpWithEmail(email, password);
      showAuthSuccess('Check your email to confirm your account.');
    } else if (mode === 'login') {
      await signInWithEmail(email, password);
      // onAuthStateChange handles the rest
    } else if (mode === 'forgot') {
      await resetPassword(email);
      showAuthSuccess('Reset link sent. Check your email.');
    }
  } catch (err) {
    showAuthError(err.message);
  }
}

async function handleGoogleAuth() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showAuthError(err.message);
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

// ============================================================
// EMAIL CAPTURE HANDLER
// ============================================================

async function handleEmailCapture(e) {
  e.preventDefault();
  const input = document.getElementById('capture-email-input');
  const btn = document.getElementById('capture-email-btn');
  const msg = document.getElementById('capture-email-msg');
  const email = input.value.trim();

  if (!email || !email.includes('@')) {
    msg.textContent = 'Please enter a valid email.';
    msg.className = 'capture-msg capture-error';
    msg.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await captureEmail(email);
    msg.textContent = 'You\'re in. We\'ll be in touch.';
    msg.className = 'capture-msg capture-success';
    msg.style.display = 'block';
    input.value = '';
  } catch (err) {
    msg.textContent = 'Something went wrong. Try again.';
    msg.className = 'capture-msg capture-error';
    msg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Stay in the loop';
  }
}

// ============================================================
// INIT ON LOAD
// ============================================================

// Expose functions globally
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.setAuthMode = setAuthMode;
window.handleEmailAuth = handleEmailAuth;
window.handleGoogleAuth = handleGoogleAuth;
window.handleEmailCapture = handleEmailCapture;
window.signOut = signOut;

document.addEventListener('DOMContentLoaded', initAuth);

// ============================================================
// SCROLL CAPTURE BANNER
// ============================================================

function initScrollBanner() {
  // Don't show if logged in
  if (currentUser) return;
  // Don't show if already dismissed this session
  if (sessionStorage.getItem('sba_banner_dismissed')) return;
  // Don't show if already subscribed
  if (sessionStorage.getItem('sba_banner_subscribed')) return;
  // Don't show on account page
  if (window.location.pathname.startsWith('/account')) return;

  var triggered = false;

  function onScroll() {
    if (triggered) return;
    var scrollPct = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
    if (scrollPct > 0.55) {
      triggered = true;
      window.removeEventListener('scroll', onScroll);
      showBanner();
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

function showBanner() {
  var banner = document.createElement('div');
  banner.id = 'scroll-capture-banner';
  banner.innerHTML = '<div class="scb-inner">' +
    '<p class="scb-text">Weekly insights on loneliness research and practical steps that work.</p>' +
    '<div class="scb-form">' +
    '<input type="email" id="scb-email" class="scb-input" placeholder="Your email address">' +
    '<button id="scb-btn" class="scb-btn" onclick="handleBannerSubmit()">Subscribe</button>' +
    '</div>' +
    '<button class="scb-close" onclick="dismissBanner()" aria-label="Close">&times;</button>' +
    '</div>';

  var style = document.createElement('style');
  style.textContent = '#scroll-capture-banner{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(120%);z-index:9000;animation:scbSlideUp .5s cubic-bezier(0.16,1,0.3,1) forwards .1s;width:92%;max-width:720px;}' +
    '@keyframes scbSlideUp{to{transform:translateX(-50%) translateY(0)}}' +
    '@keyframes scbSlideDown{to{transform:translateX(-50%) translateY(120%)}}' +
    '.scb-inner{padding:20px 28px;display:flex;align-items:center;gap:20px;background:#FFFFFF;border:1px solid #E5DDD4;border-radius:16px;box-shadow:0 8px 32px rgba(58,58,58,0.12),0 2px 8px rgba(58,58,58,0.06);}' +
    '.scb-text{font-family:DM Sans,sans-serif;font-size:14px;color:#3A3A3A;flex:1;line-height:1.5;}' +
    '.scb-form{display:flex;gap:8px;flex-shrink:0;}' +
    '.scb-input{padding:10px 14px;background:#F5F0E9;border:1px solid transparent;border-radius:8px;font-family:DM Sans,sans-serif;font-size:14px;color:#3A3A3A;outline:none;width:200px;transition:border-color .2s;}' +
    '.scb-input::placeholder{color:#3A3A3A;opacity:.4;}' +
    '.scb-input:focus{border-color:#4CAF9F;background:#fff;}' +
    '.scb-btn{padding:10px 18px;background:#4CAF9F;color:#fff;border:none;border-radius:8px;font-family:DM Sans,sans-serif;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .2s;}' +
    '.scb-btn:hover{background:#3d9488;}' +
    '.scb-close{position:absolute;top:50%;right:16px;transform:translateY(-50%);background:none;border:none;font-size:20px;color:#3A3A3A;opacity:.4;cursor:pointer;transition:opacity .2s;line-height:1;}' +
    '.scb-close:hover{opacity:1;}' +
    '.scb-inner{position:relative;}' +
    '.scb-success{font-family:DM Sans,sans-serif;font-size:14px;color:#1E8449;padding:4px 0;}' +
    '@media(max-width:600px){.scb-inner{flex-direction:column;align-items:stretch;gap:10px;padding:16px 20px 20px;}.scb-text{font-size:13px;}.scb-form{width:100%;}.scb-input{flex:1;width:auto;}.scb-close{top:12px;right:12px;transform:none;}}';

  document.head.appendChild(style);
  document.body.appendChild(banner);
}

function dismissBanner() {
  var banner = document.getElementById('scroll-capture-banner');
  if (banner) {
    banner.style.animation = 'scbSlideDown .3s ease forwards';
    setTimeout(function() { banner.remove(); }, 300);
  }
  sessionStorage.setItem('sba_banner_dismissed', '1');
}

async function handleBannerSubmit() {
  var input = document.getElementById('scb-email');
  var btn = document.getElementById('scb-btn');
  var email = input.value.trim();

  if (!email || email.indexOf('@') === -1) {
    input.style.borderColor = '#C0392B';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await captureEmail(email);
    var form = document.querySelector('.scb-form');
    var text = document.querySelector('.scb-text');
    form.innerHTML = '';
    text.innerHTML = '<span class="scb-success">You are in. We will be in touch.</span>';
    sessionStorage.setItem('sba_banner_subscribed', '1');
    setTimeout(dismissBanner, 2500);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Subscribe';
    input.style.borderColor = '#C0392B';
  }
}

window.handleBannerSubmit = handleBannerSubmit;
window.dismissBanner = dismissBanner;

// Init banner after auth check
var _origInitAuth = initAuth;
initAuth = async function() {
  await _origInitAuth();
  setTimeout(initScrollBanner, 500);
};


}