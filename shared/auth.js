// ═══════════════════════════════════════════
// Sloth Space — shared/auth.js
// Authentication with Supabase, config cloud sync
// ═══════════════════════════════════════════

import {
  llmConfig,
  loadConfig,
  saveConfig,
  isConfigured,
  clearLocalConfig,
  LLM_DEFAULTS,
  CONFIG_KEY
} from './llm.js';

import {
  syncWorkspaceFromCloud
} from './storage.js';

// ── Supabase Config ──
export const SUPABASE_URL = 'https://kfqmaztaxghbruhifeve.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmcW1henRheGdoYnJ1aGlmZXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjU0NjIsImV4cCI6MjA4OTAwMTQ2Mn0.eLDC7aUsQymXr8rz4HS_B_AKrpRpo9iQak-TQOeTBrk';

// ── State ──
export let supabaseClient = null;
export let currentUser = null;
let _authSyncDone = false;

// ── Hooks for UI integration (set via setter functions) ──
let _onEnterSlides = null;
let _onAddMessage = null;
let _onRenderApp = null;
export function setOnEnterSlides(fn){ _onEnterSlides = fn; }
export function setOnAddMessage(fn){ _onAddMessage = fn; }
export function setOnRenderApp(fn){ _onRenderApp = fn; }

// ── Initialize Supabase Auth ──
export function initAuth() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Check for existing session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthUser(session.user);
      }
    });
    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        setAuthUser(session.user);
      } else {
        clearAuthUser();
      }
    });
  } catch (e) {
    console.warn('Auth init failed:', e);
  }
}

// ── Set current authenticated user ──
export function setAuthUser(user) {
  currentUser = user;
  const bar = document.getElementById('authBar');
  const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  const email = user.email || '';
  const initial = name.charAt(0).toUpperCase();
  const providerDef = LLM_DEFAULTS[llmConfig.provider] || LLM_DEFAULTS.groq;
  bar.innerHTML = `
    <span class="auth-name">${name}</span>
    <div class="user-menu-wrap">
      <div class="auth-avatar" onclick="toggleUserMenu(event)" title="Account menu">${initial}</div>
      <div class="user-menu" id="userMenu">
        <div class="um-header">
          <div class="um-name">${name}</div>
          <div class="um-email">${email}</div>
        </div>
        <div class="um-provider">
          <div class="um-provider-dot" style="background:${providerDef.color}"></div>
          <span class="um-provider-name">${providerDef.label || llmConfig.provider}</span>
          <span class="um-provider-change" onclick="openSettings();closeUserMenu();">Change</span>
        </div>
        <div class="um-item" onclick="openSettings();closeUserMenu();">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-3.3-6.7-1.4 1.4M5.7 18.3l-1.4 1.4m0-13.4 1.4 1.4m12.6 12.6 1.4 1.4"/></svg>
          Settings &amp; API
        </div>
        <div class="um-item" onclick="showWelcome();closeUserMenu();">
          <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Home
        </div>
        <div class="um-divider"></div>
        <div class="um-item danger" onclick="doLogout();closeUserMenu();">
          <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </div>
      </div>
    </div>
  `;
  // Update welcome page auth section if visible
  const wStatus = document.getElementById('welcomeAuthStatus');
  const wLoggedIn = document.getElementById('welcomeAuthLoggedIn');
  const wName = document.getElementById('welcomeAuthName');
  if (wStatus && wLoggedIn) {
    wStatus.style.display = 'none';
    wLoggedIn.style.display = 'block';
    if (wName) wName.textContent = name;
    const soRow = document.getElementById('welcomeSignOutRow');
    if (soRow) soRow.style.display = 'block';
  }
  // Auto-fill welcome name field
  const nameInput = document.getElementById('welcomeDisplayName');
  if (nameInput && !nameInput.value) nameInput.value = name;
  // Always restore LLM config from cloud on login (cloud takes priority)
  // This ensures API keys sync across devices — but only show message once
  if (!_authSyncDone) {
    _authSyncDone = true;
    const restored = restoreConfigFromCloud(user);
    // Set display name from GitHub if not already set from cloud
    if (!llmConfig.displayName) {
      llmConfig.displayName = name;
      saveConfig();
    }
    if (restored && isConfigured()) {
      if (_onEnterSlides) _onEnterSlides();
      if (_onAddMessage) _onAddMessage('☁️ Settings synced from cloud.', 'system');
    }
    // Also sync workspace files from cloud
    syncWorkspaceFromCloud();
  }
}

// ── Clear current user ──
export function clearAuthUser() {
  currentUser = null;
  _authSyncDone = false;
  const bar = document.getElementById('authBar');
  bar.innerHTML = '<button class="auth-login-btn" onclick="doLogin()" id="authLoginBtn">Sign In</button>';
}

// ── OAuth Login (GitHub) ──
export async function doLogin() {
  if (!supabaseClient) {
    // Auth not configured, open settings instead
    if (window.openSettings) window.openSettings();
    return;
  }
  try {
    // Build redirect URL — must be http(s), not file://
    let redirect = window.location.href.split('#')[0].split('?')[0];
    if (redirect.startsWith('file:')) {
      if (_onAddMessage) _onAddMessage('OAuth login requires http/https. Deploy to GitHub Pages or run a local server first.', 'system');
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: redirect }
    });
    if (error && _onAddMessage) _onAddMessage('Login error: ' + error.message, 'system');
  } catch (e) {
    if (_onAddMessage) _onAddMessage('Login error: ' + e.message, 'system');
  }
}

// ── Logout ──
export async function doLogout() {
  if (!supabaseClient) return;
  if (!confirm('Sign out?')) return;
  await supabaseClient.auth.signOut();
  clearAuthUser();
  clearLocalConfig();
  if (_onAddMessage) _onAddMessage('Signed out.', 'system');
  showWelcome();
}

// ── Logout from welcome screen ──
export async function doWelcomeSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  clearAuthUser();
  clearLocalConfig();
  // Reset welcome auth section
  const wStatus = document.getElementById('welcomeAuthStatus');
  const wLoggedIn = document.getElementById('welcomeAuthLoggedIn');
  if (wStatus) wStatus.style.display = 'flex';
  if (wLoggedIn) wLoggedIn.style.display = 'none';
  const soRow = document.getElementById('welcomeSignOutRow');
  if (soRow) soRow.style.display = 'none';
  // Reset connect button
  const btn = document.getElementById('wbConnectBtn');
  if (btn) {
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4m-7-11H1m22 0h-4m-2.3-6.7-2.8 2.8m-5.8 5.8-2.8 2.8m0-11.4 2.8 2.8m5.8 5.8 2.8 2.8"/><circle cx="12" cy="12" r="3"/></svg> Connect your LLM to get started';
    btn.style.opacity = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    btn.classList.remove('connected');
    btn._providerConfirmed = false;
  }
  // Clear welcome config fields
  const k = document.getElementById('welcomeApiKey');
  if (k) k.value = '';
  const n = document.getElementById('welcomeDisplayName');
  if (n) n.value = '';
}

// ── Show Welcome Screen ──
export function showWelcome() {
  const overlay = document.getElementById('welcomeOverlay');
  overlay.classList.remove('hidden');
  sessionStorage.removeItem('sloth_active');
  // On mobile: reset to splash view (demo first)
  const box = document.getElementById('welcomeBox');
  if (box) box.classList.remove('mobile-form-active');
  // Make sure config panel is hidden
  const configPanel = document.getElementById('wbConfigPanel');
  if (configPanel) configPanel.classList.remove('active');
  // If already configured, pre-fill and show Connected state
  if (isConfigured()) {
    const welcomeProvider = llmConfig.provider;
    // Pre-fill the config panel fields (in case user clicks to re-configure)
    const grid = document.getElementById('welcomeProviderGrid');
    grid.innerHTML = Object.entries(LLM_DEFAULTS).map(([key, def]) =>
      `<div class="wb-pgrid-item${key === welcomeProvider ? ' active' : ''}" data-provider="${key}" onclick="setWelcomeProvider('${key}')">
        <div class="wpg-dot" style="background:${def.color}"></div>
        <div class="wpg-name">${def.label}</div>
        <div class="wpg-desc">${def.desc}</div>
      </div>`
    ).join('');
    // Fill saved values after setWelcomeProvider clears them
    const CLOUD_PROVIDERS = ['groq', 'openai', 'claude', 'grok'];
    const isCloud = CLOUD_PROVIDERS.includes(llmConfig.provider);
    if (isCloud) {
      document.getElementById('welcomeApiKey').value = llmConfig.apiKey || '';
    } else if (llmConfig.provider === 'ollama') {
      document.getElementById('welcomeOllamaUrl').value = llmConfig.url || 'http://localhost:11434';
      document.getElementById('welcomeOllamaModel').value = llmConfig.model || 'llama3.1:8b';
    } else if (llmConfig.provider === 'custom') {
      document.getElementById('welcomeCustomUrl').value = llmConfig.url || '';
      document.getElementById('welcomeCustomKey').value = llmConfig.apiKey || '';
      document.getElementById('welcomeCustomModel').value = llmConfig.model || '';
      document.getElementById('welcomeCustomRouter').value = llmConfig.router || '';
    }
    document.getElementById('welcomeDisplayName').value = llmConfig.displayName || '';
    // Show Connected on button
    const btn = document.getElementById('wbConnectBtn');
    const def = LLM_DEFAULTS[llmConfig.provider] || {};
    btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${def.color || '#8B9E8B'};margin-right:6px;"></span> Connected to ${def.label || llmConfig.provider}`;
    btn.style.color = '#fff';
    btn.style.borderColor = def.color || '#8B9E8B';
    btn.classList.add('connected');
    btn._providerConfirmed = true;
  }
}

// ── Toggle User Menu ──
export function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.toggle('show');
}

// ── Close User Menu ──
export function closeUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.remove('show');
}

// Close user menu on click outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.user-menu-wrap')) closeUserMenu();
});

// ── Restore LLM Config from Cloud ──
export function restoreConfigFromCloud(user) {
  const cfg = user.user_metadata?.sloth_config;
  if (!cfg || !cfg.provider) return false;
  llmConfig.provider = cfg.provider;
  llmConfig.url = cfg.url || '';
  llmConfig.model = cfg.model || '';
  llmConfig.router = cfg.router || '';
  llmConfig.apiKey = cfg.apiKey ? atob(cfg.apiKey) : '';
  llmConfig.displayName = cfg.displayName || '';
  saveConfig(); // persist to localStorage too
  return true;
}

// ── Sync LLM Config to Cloud ──
export async function syncConfigToCloud() {
  if (!supabaseClient || !currentUser) return;
  try {
    const payload = {
      provider: llmConfig.provider,
      url: llmConfig.url,
      model: llmConfig.model,
      router: llmConfig.router,
      apiKey: llmConfig.apiKey ? btoa(llmConfig.apiKey) : '', // light obfuscation
      displayName: llmConfig.displayName
    };
    await supabaseClient.auth.updateUser({ data: { sloth_config: payload } });
  } catch (e) {
    console.warn('Config sync failed:', e);
  }
}

// Register storage.js auth state getter
import { setGetAuthState } from './storage.js';
setGetAuthState(() => ({ supabaseClient, currentUser }));
