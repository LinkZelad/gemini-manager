const FS_DB_NAME = 'gemini_manager_fs';
const FS_STORE_NAME = 'handles';
const FS_EXPORT_DIR_KEY = 'obsidian_export_directory';

const els = {
  folder: document.getElementById('obsidian-folder'),
  btnSelectDir: document.getElementById('btn-select-dir'),
  btnSaveFolder: document.getElementById('btn-save-folder'),
  status: document.getElementById('status')
};

let settings = {
  obsidianFolder: 'AI对话/Gemini',
  useDirectObsidianWrite: false
};
let exportDirectoryHandle = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  if (window.GM_I18N) {
    window.GM_I18N.setLanguage(settings.language || 'zh');
    window.GM_I18N.applyI18n();
  }
  await loadExportDirectoryHandle();
  renderStatus();

  els.btnSelectDir.addEventListener('click', selectExportDirectory);
  els.btnSaveFolder.addEventListener('click', saveFolderPath);
});

async function loadSettings() {
  const result = await chrome.storage.sync.get('gm_settings');
  if (result.gm_settings) {
    settings = { ...settings, ...result.gm_settings };
  }
  els.folder.value = settings.obsidianFolder || '';
}

async function saveSettings() {
  await chrome.storage.sync.set({ gm_settings: settings });
}

function setStatus(message, type = '') {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function renderStatus() {
  const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
  
  if (!('showDirectoryPicker' in window)) {
    setStatus(_t('options.browser_unsupported'), 'error');
    return;
  }

  if (exportDirectoryHandle) {
    setStatus(_t('options.dir_selected', { name: exportDirectoryHandle.name }), 'success');
  } else {
    setStatus(_t('options.dir_not_selected'));
  }
}

function openFsDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(FS_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveExportDirectoryHandle(handle) {
  const db = await openFsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FS_STORE_NAME, 'readwrite');
    tx.objectStore(FS_STORE_NAME).put(handle, FS_EXPORT_DIR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadExportDirectoryHandle() {
  if (!('showDirectoryPicker' in window)) return;

  try {
    const db = await openFsDb();
    exportDirectoryHandle = await new Promise((resolve, reject) => {
      const tx = db.transaction(FS_STORE_NAME, 'readonly');
      const request = tx.objectStore(FS_STORE_NAME).get(FS_EXPORT_DIR_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to load export directory handle:', err);
    exportDirectoryHandle = null;
  }
}

async function verifyDirectoryPermission(handle) {
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

async function selectExportDirectory() {
  if (!('showDirectoryPicker' in window)) {
    renderStatus();
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const granted = await verifyDirectoryPermission(handle);
    if (!granted) {
      const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
      setStatus(_t('options.error', { msg: 'Permission denied' }), 'error');
      return;
    }

    exportDirectoryHandle = handle;
    settings.useDirectObsidianWrite = true;
    settings.obsidianFolder = els.folder.value.trim();
    await saveExportDirectoryHandle(handle);
    await saveSettings();
    renderStatus();
  } catch (err) {
    if (err.name !== 'AbortError') {
      const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
      setStatus(_t('options.error', { msg: err.message }), 'error');
    }
  }
}

async function saveFolderPath() {
  settings.obsidianFolder = els.folder.value.trim();
  await saveSettings();
  const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
  setStatus(_t('options.saved'), 'success');
  setTimeout(() => {
    window.close();
  }, 500);
}
