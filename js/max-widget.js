// ============================================
// MAX WIDGET - Floating Chat Companion
// Stop Being Alone
// ============================================
// Include on all pages: <script src="/js/max-widget.js" defer></script>
// Requires: Supabase JS loaded globally (window.supabase)

(function() {
  'use strict';

  const API_URL = '/.netlify/functions/max-chat';
  const WIDGET_ID = 'max-widget';

  // Onboarding options
  const ONBOARDING_OPTIONS = {
    situation: [
      'I moved to a new city and don\'t know anyone',
      'My friends drifted away over time',
      'I went through a breakup or divorce',
      'I work from home and rarely see people',
      'I\'m retired and my social circle has shrunk',
      'I struggle with social anxiety',
      'I just feel disconnected even around people',
    ],
    goals: [
      'More friends to hang out with',
      'Deeper, more meaningful relationships',
      'Just getting out of the house more',
      'Finding a community or group I belong to',
      'Feeling more comfortable in social situations',
      'Building a romantic relationship',
      'Reconnecting with old friends or family',
    ],
    obstacles: [
      'Social anxiety or shyness',
      'Not enough time',
      'Don\'t know where to start',
      'Don\'t know where to meet people',
      'Low energy or motivation',
      'Fear of rejection',
      'Trust issues',
    ],
    hobbies: [
      'Sports / fitness',
      'Creative stuff (art, music, writing)',
      'Gaming (video games, board games)',
      'Outdoor activities (hiking, biking)',
      'Food & cooking',
      'Books & learning',
      'Volunteering',
      'Nightlife & social events',
      'Tech & entrepreneurship',
    ],
  };

  // State
  let isOpen = false;
  let isLoading = false;
  let messages = [];
  let onboardingStep = null;
  let selectedOptions = [];
  let userProfile = null;

  // ── Inject CSS ──
  function injectStyles() {
    if (document.getElementById('max-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'max-widget-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif&display=swap');

      #max-widget-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #4CAF9F;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(76, 175, 159, 0.35);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        animation: maxPulse 3s ease-in-out infinite;
      }
      #max-widget-bubble:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 28px rgba(76, 175, 159, 0.5);
      }
      #max-widget-bubble svg {
        width: 26px;
        height: 26px;
        fill: white;
      }
      #max-widget-bubble .max-unread {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 14px;
        height: 14px;
        background: #E74C3C;
        border-radius: 50%;
        border: 2px solid white;
        display: none;
      }

      @keyframes maxPulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(76, 175, 159, 0.35); }
        50% { box-shadow: 0 4px 30px rgba(76, 175, 159, 0.55); }
      }

      #max-widget-panel {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 380px;
        height: 520px;
        background: #F5F0E9;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.15);
        z-index: 99998;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: 'DM Sans', sans-serif;
        color: #3A3A3A;
      }
      #max-widget-panel.open {
        display: flex;
        animation: maxSlideUp 0.3s ease;
      }

      @keyframes maxSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Header */
      .max-header {
        padding: 16px 20px;
        background: white;
        border-bottom: 1px solid #E8E3DC;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .max-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .max-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #4CAF9F;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
      }
      .max-header-info h4 {
        margin: 0;
        font-family: 'Instrument Serif', serif;
        font-size: 16px;
        font-weight: 400;
        color: #3A3A3A;
      }
      .max-header-info span {
        font-size: 11px;
        color: #999;
      }
      .max-close {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        color: #999;
        font-size: 18px;
        line-height: 1;
      }
      .max-close:hover { color: #3A3A3A; }
      .max-expand {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        color: #999;
        text-decoration: none;
        transition: color 0.15s;
      }
      .max-expand:hover { color: #4CAF9F; }

      /* Messages area */
      .max-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .max-messages::-webkit-scrollbar { width: 4px; }
      .max-messages::-webkit-scrollbar-thumb { background: #ccc; border-radius: 2px; }

      .max-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.5;
        animation: maxFadeIn 0.3s ease;
      }
      @keyframes maxFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .max-msg.assistant {
        background: #D5F0E5;
        color: #2D2D2D;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .max-msg.user {
        background: #2D2D2D;
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }

      /* Typing indicator */
      .max-typing {
        align-self: flex-start;
        display: flex;
        gap: 4px;
        padding: 12px 16px;
        background: white;
        border-radius: 14px;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .max-typing span {
        width: 6px;
        height: 6px;
        background: #ccc;
        border-radius: 50%;
        animation: maxBounce 1.4s ease-in-out infinite;
      }
      .max-typing span:nth-child(2) { animation-delay: 0.2s; }
      .max-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes maxBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      /* Onboarding chips */
      .max-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px 0;
        align-self: flex-start;
        max-width: 100%;
      }
      .max-chip {
        padding: 8px 14px;
        border-radius: 20px;
        border: 1.5px solid #E8E3DC;
        background: white;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
        color: #3A3A3A;
        font-family: 'DM Sans', sans-serif;
      }
      .max-chip:hover {
        border-color: #4CAF9F;
        background: #E8F5F1;
      }
      .max-chip.selected {
        background: #4CAF9F;
        color: white;
        border-color: #4CAF9F;
      }
      .max-chip-other {
        width: 100%;
        margin-top: 4px;
      }
      .max-chip-other input {
        width: 100%;
        padding: 8px 14px;
        border-radius: 20px;
        border: 1.5px solid #E8E3DC;
        background: white;
        font-size: 13px;
        font-family: 'DM Sans', sans-serif;
        outline: none;
        color: #3A3A3A;
      }
      .max-chip-other input:focus { border-color: #4CAF9F; }
      .max-chip-continue {
        width: 100%;
        margin-top: 8px;
        padding: 10px;
        border-radius: 10px;
        background: #4CAF9F;
        color: white;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        transition: background 0.15s;
        display: none;
      }
      .max-chip-continue.visible { display: block; }
      .max-chip-continue:hover { background: #3d9a8c; }

      /* Input area */
      .max-input-area {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #E8E3DC;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-shrink: 0;
      }
      .max-input {
        flex: 1;
        padding: 10px 14px;
        border-radius: 20px;
        border: 1.5px solid #E8E3DC;
        font-size: 14px;
        font-family: 'DM Sans', sans-serif;
        outline: none;
        color: #3A3A3A;
        background: #F5F0E9;
      }
      .max-input:focus { border-color: #4CAF9F; }
      .max-input::placeholder { color: #BBB; }
      .max-send {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #4CAF9F;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .max-send:hover { background: #3d9a8c; }
      .max-send:disabled { background: #ccc; cursor: not-allowed; }
      .max-send svg { width: 16px; height: 16px; fill: white; }

      /* Quota bar */
      .max-quota {
        padding: 6px 16px;
        background: #FEF5E7;
        font-size: 11px;
        color: #E67E22;
        text-align: center;
        display: none;
      }
      .max-quota.visible { display: block; }
      .max-quota a { color: #4CAF9F; text-decoration: underline; }

      /* Login prompt */
      .max-login {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        text-align: center;
        gap: 16px;
      }
      .max-login h3 {
        font-family: 'Instrument Serif', serif;
        font-size: 22px;
        font-weight: 400;
        margin: 0;
      }
      .max-login p {
        font-size: 14px;
        color: #888;
        margin: 0;
        line-height: 1.5;
      }
      .max-login-btn {
        padding: 12px 28px;
        border-radius: 8px;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        transition: all 0.15s;
      }
      .max-login-btn.primary {
        background: #4CAF9F;
        color: white;
      }
      .max-login-btn.primary:hover { background: #3d9a8c; }
      .max-login-btn.secondary {
        background: transparent;
        color: #4CAF9F;
        border: 1.5px solid #4CAF9F;
      }

      /* Mobile */
      @media (max-width: 480px) {
        #max-widget-panel {
          bottom: 0;
          right: 0;
          left: 0;
          width: 100%;
          height: 100%;
          height: 100dvh;
          border-radius: 0;
          padding-bottom: env(safe-area-inset-bottom);
        }
        #max-widget-bubble { bottom: 16px; right: 16px; }
        .max-login {
          padding: 24px 20px;
          justify-content: center;
          min-height: 100%;
        }
        .max-login h3 { font-size: 20px; }
        .max-login-btn { width: 100%; padding: 14px; }
        .max-header { padding: 12px 16px; }
        .max-messages { padding: 12px; }
        .max-input-area { padding: 10px 12px; padding-bottom: calc(10px + env(safe-area-inset-bottom)); }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Create DOM ──
  function createWidget() {
    // Floating button
    const bubble = document.createElement('button');
    bubble.id = 'max-widget-bubble';
    bubble.setAttribute('aria-label', 'Talk to Max');
    bubble.title = 'Talk to Max';
    bubble.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
      <div class="max-unread"></div>
    `;
    bubble.addEventListener('click', toggleWidget);

    // Chat panel
    const panel = document.createElement('div');
    panel.id = 'max-widget-panel';
    panel.innerHTML = `
      <div class="max-header">
        <div class="max-header-left">
          <div class="max-avatar">M</div>
          <div class="max-header-info">
            <h4>Max</h4>
            <span>Your companion</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <a href="/chat/" class="max-expand" aria-label="Open full chat" title="Open full chat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </a>
          <button class="max-close" aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="max-quota"></div>
      <div class="max-messages"></div>
      <div class="max-input-area">
        <input class="max-input" type="text" placeholder="Type a message..." autocomplete="off">
        <button class="max-send" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    // Events
    panel.querySelector('.max-close').addEventListener('click', toggleWidget);
    panel.querySelector('.max-send').addEventListener('click', sendMessage);
    panel.querySelector('.max-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // ── Toggle ──
  function toggleWidget() {
    isOpen = !isOpen;
    const panel = document.getElementById('max-widget-panel');
    const bubble = document.getElementById('max-widget-bubble');

    if (isOpen) {
      panel.classList.add('open');
      bubble.style.display = 'none';
      initChat();
    } else {
      panel.classList.remove('open');
      bubble.style.display = 'flex';
    }
  }

  // ── Init Chat ──
  async function initChat() {
    const messagesEl = document.querySelector('.max-messages');
    const inputArea = document.querySelector('.max-input-area');

    // Check auth
    if (!window.sbaSupabase) {
      showLoginPrompt();
      return;
    }

    const { data: { session } } = await window.sbaSupabase.auth.getSession();
    if (!session) {
      showLoginPrompt();
      return;
    }

    // Show chat
    inputArea.style.display = 'flex';

    // If first time, trigger onboarding
    if (messages.length === 0) {
      showTyping();
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: null }),
        });
        const data = await res.json();
        hideTyping();
        if (data.response) {
          addMessage('assistant', data.response);
        }
        if (data.chips) {
          renderChips(data.chips.step, data.chips.options);
        }
      } catch (err) {
        hideTyping();
        addMessage('assistant', 'Hey, I\'m Max. Having a small technical hiccup, try again in a moment.');
      }
    }
  }

  // ── Login Prompt ──
  function showLoginPrompt() {
    const messagesEl = document.querySelector('.max-messages');
    const inputArea = document.querySelector('.max-input-area');
    inputArea.style.display = 'none';

    messagesEl.innerHTML = `
      <div class="max-login">
        <div class="max-avatar" style="width:48px;height:48px;font-size:20px;">M</div>
        <h3>Meet Max</h3>
        <p>Your personal companion to help you build real connections. Sign up to start chatting.</p>
        <button class="max-login-btn primary" onclick="if(window.openAuthModal){openAuthModal('signup')}else{window.location.href='/'}">Sign up free</button>
        <button class="max-login-btn secondary" onclick="if(window.openAuthModal){openAuthModal('login')}else{window.location.href='/'}">Log in</button>
      </div>
    `;
  }

  // ── Send Message ──
  async function sendMessage() {
    if (isLoading) return;

    const input = document.querySelector('.max-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    removeChips();
    addMessage('user', text);

    isLoading = true;
    document.querySelector('.max-send').disabled = true;
    showTyping();

    try {
      const { data: { session } } = await window.sbaSupabase.auth.getSession();
      if (!session) {
        hideTyping();
        addMessage('assistant', 'Looks like your session expired. Please refresh the page and log in again.');
        return;
      }

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: text }),
      });

      const data = await res.json();
      hideTyping();

      if (data.quota_exceeded) {
        // Show upgrade popup
        const panel = document.getElementById('max-widget-panel');
        const overlay = document.createElement('div');
        overlay.id = 'maxQuotaOverlay';
        overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10;display:flex;align-items:center;justify-content:center;border-radius:16px;';
        overlay.innerHTML = `
          <div style="background:white;border-radius:16px;padding:32px;margin:16px;text-align:center;max-width:300px;">
            <div style="width:48px;height:48px;border-radius:50%;background:#D5F0E5;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:20px;">M</div>
            <h3 style="font-family:Instrument Serif,serif;font-size:20px;font-weight:400;margin:0 0 8px;">You've reached your free limit</h3>
            <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 20px;">Upgrade to keep talking with Max.</p>
            <a href="/#pricing" style="display:block;padding:12px;background:#4CAF9F;color:white;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px;margin-bottom:10px;">See plans</a>
            <button onclick="document.getElementById('maxQuotaOverlay').remove()" style="background:none;border:none;color:#888;cursor:pointer;font-size:13px;">Maybe later</button>
          </div>`;
        panel.appendChild(overlay);
      } else {
        if (data.response) {
          addMessage('assistant', data.response);
        }
        if (data.chips) {
          renderChips(data.chips.step, data.chips.options);
        }
      }

    } catch (err) {
      hideTyping();
      addMessage('assistant', 'Sorry, something went wrong. Try again in a moment.');
    } finally {
      isLoading = false;
      document.querySelector('.max-send').disabled = false;
    }
  }

  // ── Send Onboarding Data ──
  async function sendOnboardingResponse(step, data) {
    isLoading = true;
    showTyping();

    try {
      const { data: { session } } = await window.sbaSupabase.auth.getSession();
      const payload = {
        message: typeof data === 'string' ? data : data.join(', '),
        onboarding_data: {},
      };

      if (step === 'first_name') payload.onboarding_data.first_name = data;
      else if (step === 'city') payload.onboarding_data.city = data;
      else if (step === 'situation') payload.onboarding_data.situation = data;
      else if (step === 'goals') payload.onboarding_data.goals = data;
      else if (step === 'obstacles') payload.onboarding_data.obstacles = data;
      else if (step === 'hobbies') {
        payload.onboarding_data.hobbies = data;
        payload.onboarding_data.complete = true;
      }

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      hideTyping();

      if (result.response) {
        addMessage('assistant', result.response);
      }
      if (result.chips) {
        renderChips(result.chips.step, result.chips.options);
      }

    } catch (err) {
      hideTyping();
      addMessage('assistant', 'Small hiccup. Try again.');
    } finally {
      isLoading = false;
    }
  }

  // ── Remove existing chips ──
  function removeChips() {
    const existing = document.querySelectorAll('.max-chips');
    existing.forEach(el => el.remove());
  }

  // ── Render Chips ──
  function renderChips(step, options) {
    removeChips();
    const messagesEl = document.querySelector('.max-messages');
    selectedOptions = [];

    const container = document.createElement('div');
    container.className = 'max-chips';

    options.forEach(opt => {
      const chip = document.createElement('button');
      chip.className = 'max-chip';
      chip.textContent = opt;
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        if (chip.classList.contains('selected')) {
          selectedOptions.push(opt);
        } else {
          selectedOptions = selectedOptions.filter(o => o !== opt);
        }
        const cb = container.querySelector('.max-chip-continue');
        if (cb) cb.classList.toggle('visible', selectedOptions.length > 0 || otherInput.value.trim().length > 0);
      });
      container.appendChild(chip);
    });

    // Other field
    const otherDiv = document.createElement('div');
    otherDiv.className = 'max-chip-other';
    const otherInput = document.createElement('input');
    otherInput.type = 'text';
    otherInput.placeholder = 'Something else? Type here';
    otherInput.addEventListener('input', () => {
      const cb = container.querySelector('.max-chip-continue');
      if (cb) cb.classList.toggle('visible', selectedOptions.length > 0 || otherInput.value.trim().length > 0);
    });
    otherInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); continueBtn.click(); }
    });
    otherDiv.appendChild(otherInput);
    container.appendChild(otherDiv);

    // Continue button
    const continueBtn = document.createElement('button');
    continueBtn.className = 'max-chip-continue';
    continueBtn.textContent = 'Continue';
    continueBtn.addEventListener('click', () => {
      const otherVal = otherInput.value.trim();
      if (otherVal) selectedOptions.push(otherVal);
      if (selectedOptions.length === 0) return;

      addMessage('user', selectedOptions.join(', '));
      container.remove();
      sendOnboardingResponse(step, selectedOptions);
    });
    container.appendChild(continueBtn);

    messagesEl.appendChild(container);
    scrollToBottom();
  }

  // ── Message Helpers ──
  function addMessage(role, text) {
    messages.push({ role, text });
    const messagesEl = document.querySelector('.max-messages');
    const msg = document.createElement('div');
    msg.className = `max-msg ${role}`;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function showTyping() {
    const messagesEl = document.querySelector('.max-messages');
    const typing = document.createElement('div');
    typing.className = 'max-typing';
    typing.id = 'max-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById('max-typing');
    if (el) el.remove();
  }

  function showQuota(used, limit) {
    const quota = document.querySelector('.max-quota');
    quota.innerHTML = `${used}/${limit} free messages this week. <a href="/#pricing">Upgrade</a> for unlimited.`;
    quota.classList.add('visible');
  }

  function scrollToBottom() {
    const messagesEl = document.querySelector('.max-messages');
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 50);
  }

  // ── Initialize ──
  function init() {
    // Don't load on /chat/ page (full experience there)
    if (window.location.pathname.startsWith('/chat')) return;

    injectStyles();
    createWidget();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external use
  window.MaxWidget = {
    open: () => { if (!isOpen) toggleWidget(); },
    close: () => { if (isOpen) toggleWidget(); },
    renderChips,
    sendOnboardingResponse,
  };

})();
