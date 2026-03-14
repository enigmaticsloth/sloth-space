// ═══════════════════════════════════════════
// Sloth Space — shared/storage.js
// Workspace file storage, cloud sync, CRUD
// ═══════════════════════════════════════════

export const WS_STORAGE_KEY = 'sloth_workspace_files';

// Auth state hook — set via setGetAuthState() in auth.js
let _getAuthState = () => ({ supabaseClient: null, currentUser: null });
export function setGetAuthState(fn) { _getAuthState = fn; }

export function wsId() {
  return 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

export function wsLoad() {
  try {
    return JSON.parse(localStorage.getItem(WS_STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

export function wsSave(files) {
  try {
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(files));
  } catch (e) {
    console.warn('Workspace save failed:', e);
  }
  // Auto-sync to cloud (debounced)
  clearTimeout(wsSave._timer);
  wsSave._timer = setTimeout(syncWorkspaceToCloud, 2000);
}

// ── Workspace Cloud Sync (Supabase Storage) ──
export async function syncWorkspaceToCloud() {
  const { supabaseClient, currentUser } = _getAuthState();
  if (!supabaseClient || !currentUser) return;
  try {
    const files = wsLoad();
    const blob = new Blob([JSON.stringify(files)], { type: 'application/json' });
    const path = currentUser.id + '/workspace.json';
    await supabaseClient.storage.from('decks').upload(path, blob, { upsert: true });
  } catch (e) {
    console.warn('Workspace cloud sync failed:', e);
  }
}

export async function syncWorkspaceFromCloud() {
  const { supabaseClient, currentUser } = _getAuthState();
  if (!supabaseClient || !currentUser) return;
  try {
    const path = currentUser.id + '/workspace.json';
    const { data, error } = await supabaseClient.storage.from('decks').download(path);
    if (error || !data) return; // no cloud workspace yet
    const text = await data.text();
    const cloudFiles = JSON.parse(text);
    if (!Array.isArray(cloudFiles) || cloudFiles.length === 0) return;
    // Merge: cloud files + local files, deduplicate by id, prefer newer
    // But never restore files that were explicitly deleted locally
    const deletedIds = new Set(JSON.parse(localStorage.getItem('sloth_ws_deleted') || '[]'));
    const localFiles = wsLoad();
    const merged = new Map();
    for (const f of localFiles) merged.set(f.id, f);
    for (const f of cloudFiles) {
      if (deletedIds.has(f.id)) continue; // skip deleted files
      const existing = merged.get(f.id);
      if (!existing || new Date(f.updated) > new Date(existing.updated)) {
        merged.set(f.id, f);
      }
    }
    const result = [...merged.values()];
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(result)); // save without triggering re-upload
  } catch (e) {
    console.warn('Workspace cloud restore failed:', e);
  }
}

export function wsGetFile(id) {
  return wsLoad().find(f => f.id === id) || null;
}

export function wsCreateDoc(title, text) {
  const files = wsLoad();
  const blocks = text.split(/\n\n+/).filter(Boolean).map((t, i) => ({
    id: 'blk_' + Date.now() + '_' + i,
    type: /^#{1,3}\s/.test(t) ? 'heading' : 'paragraph',
    text: t.replace(/^#{1,3}\s/, '')
  }));
  const doc = {
    id: wsId(),
    type: 'doc',
    title: title || 'Untitled Doc',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    content: { blocks }
  };
  files.push(doc);
  wsSave(files);
  return doc;
}

export function wsCreateSheet(title, csvOrText) {
  const files = wsLoad();
  // Parse simple CSV / tab-separated / line-separated table
  const lines = csvOrText.trim().split('\n').map(l => l.split(/[,\t]/).map(c => c.trim()));
  const columns = lines[0] || [];
  const rows = lines.slice(1);
  const sheet = {
    id: wsId(),
    type: 'sheet',
    title: title || 'Untitled Sheet',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    content: { columns, rows }
  };
  files.push(sheet);
  wsSave(files);
  return sheet;
}

export function wsDeleteFile(id) {
  const files = wsLoad().filter(f => f.id !== id);
  wsSave(files);
  // Track deleted IDs so cloud sync never restores them
  try {
    const deleted = JSON.parse(localStorage.getItem('sloth_ws_deleted') || '[]');
    if (!deleted.includes(id)) {
      deleted.push(id);
      localStorage.setItem('sloth_ws_deleted', JSON.stringify(deleted));
    }
  } catch (e) {}
  // Force immediate cloud sync so deleted state is persisted before any refresh
  clearTimeout(wsSave._timer);
  syncWorkspaceToCloud();
}

export function wsUpdateFile(id, updates) {
  const files = wsLoad();
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return null;
  Object.assign(files[idx], updates, { updated: new Date().toISOString() });
  wsSave(files);
  return files[idx];
}

// Get all workspace files (docs + sheets) — slides are separate (currentDeck / saves)
export function wsListFiles(typeFilter) {
  const files = wsLoad();
  if (typeFilter) return files.filter(f => f.type === typeFilter);
  return files;
}

// Serialize a workspace file to plain text for LLM context injection
export function wsFileToContext(file) {
  if (!file) return '';
  if (file.type === 'doc') {
    return `[WORKSPACE DOC: "${file.title}" (id: ${file.id})]\n` +
      (file.content.blocks || []).map(b => b.type === 'heading' ? `## ${b.text}` : b.text).join('\n\n');
  }
  if (file.type === 'sheet') {
    const c = file.content;
    let table = c.columns.join('\t') + '\n';
    table += (c.rows || []).map(r => r.join('\t')).join('\n');
    return `[WORKSPACE SHEET: "${file.title}" (id: ${file.id})]\n${table}`;
  }
  if (file.type === 'slides') {
    return `[WORKSPACE SLIDES: "${file.title}" (id: ${file.id})]\n${JSON.stringify(file.content)}`;
  }
  return '';
}

// Detect workspace file references in user message
// Patterns: "用[文件名/doc名]", "從[sheet名]抓", "reference [title]", "@doc名", etc.
export function wsDetectReferences(text) {
  const files = wsLoad();
  if (files.length === 0) return [];
  const matched = [];
  for (const f of files) {
    const t = f.title.toLowerCase();
    const words = t.split(/\s+/);
    // Direct title match (case-insensitive)
    if (text.toLowerCase().includes(t)) {
      matched.push(f);
      continue;
    }
    // @mention style: @filename
    if (text.toLowerCase().includes('@' + t.replace(/\s/g, ''))) {
      matched.push(f);
      continue;
    }
    // Partial match: if all significant words of title appear in text
    if (words.length >= 2 && words.every(w => w.length > 1 && text.toLowerCase().includes(w))) {
      matched.push(f);
      continue;
    }
  }
  return matched;
}
