/**
 * Gemini Manager - Popup Script
 */

// ===== State =====
let currentTab = null;
let isGeminiPage = false;
let conversationList = [];
let archivedIds = new Set();
let exportDirectoryHandle = null;
let settings = {
  obsidianVault: '',
  obsidianVaultPath: '',
  obsidianFolder: 'AI对话/Gemini',
  obsidianUseUri: false,
  useDirectObsidianWrite: false,
  obsidianAutoFilename: true,
  defaultFormat: 'markdown',
  includeThoughts: true,
  useSaveDialog: true,  // 默认弹出保存对话框
  language: 'zh'
};

// ===== DOM Elements =====
const els = {
  statusBadge: document.getElementById('status-badge'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  convTitle: document.getElementById('conv-title'),
  convTurns: document.getElementById('conv-turns'),
  filenameInput: document.getElementById('filename-input'),
  btnExportMd: document.getElementById('btn-export-md'),
  btnExportObsidian: document.getElementById('btn-export-obsidian'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnArchiveCurrent: document.getElementById('btn-archive-current'),
  btnRefreshList: document.getElementById('btn-refresh-list'),
  btnExportAll: document.getElementById('btn-export-all'),
  conversationList: document.getElementById('conversation-list'),
  filterInput: document.getElementById('filter-input'),
  filterStatus: document.getElementById('filter-status'),
  exportStatus: document.getElementById('export-status'),
  exportProgress: document.getElementById('export-progress'),
  // Settings
  obsidianVault: document.getElementById('obsidian-vault'),
  obsidianVaultPath: document.getElementById('obsidian-vault-path'),
  obsidianFolder: document.getElementById('obsidian-folder'),
  obsidianUseUri: document.getElementById('obsidian-use-uri'),
  useDirectObsidianWrite: document.getElementById('use-direct-obsidian-write'),
  btnSelectExportDir: document.getElementById('btn-select-export-dir'),
  exportDirStatus: document.getElementById('export-dir-status'),
  obsidianAutoFilename: document.getElementById('obsidian-auto-filename'),
  exportFormat: document.getElementById('export-format'),
  includeThoughts: document.getElementById('include-thoughts'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnClearArchived: document.getElementById('btn-clear-archived'),
  btnExportStorage: document.getElementById('btn-export-storage'),
  enableFolderManagement: document.getElementById('enable-folder-management'),
  languageSelect: document.getElementById('language-select'),
  // Selective export
  btnToggleSelective: document.getElementById('btn-toggle-selective'),
  turnSelectorPanel: document.getElementById('turn-selector-panel'),
  turnSelectorList: document.getElementById('turn-selector-list'),
  btnSelectAll: document.getElementById('btn-select-all'),
  btnSelectNone: document.getElementById('btn-select-none'),
  turnSelectCount: document.getElementById('turn-select-count'),
  btnSelectiveExportMd: document.getElementById('btn-selective-export-md'),
  btnSelectiveExportObsidian: document.getElementById('btn-selective-export-obsidian')
};

// ===== Initialization =====

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadExportDirectoryHandle();
  await findGeminiTab();
  await loadArchivedData();
  setupEventListeners();
  setupTabs();

  if (isGeminiPage) {
    const siteName = currentTab.url.includes('aistudio.google.com') ? 'AI Studio' : 'Gemini';
    els.statusBadge.textContent = `${window.GM_I18N.t('status.connected')} (${siteName})`;
    els.statusBadge.classList.add('online');
    await refreshCurrentConversation();
    await refreshConversationList();
  } else {
    els.statusBadge.textContent = window.GM_I18N.t('status.not_supported');
    els.statusBadge.classList.add('offline');
    els.convTitle.textContent = window.GM_I18N.t('status.not_supported');
    els.conversationList.innerHTML = `<div class="empty-state">${window.GM_I18N.t('status.not_supported')}</div>`;
  }
});

// ===== Settings =====

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('gm_settings');
    if (result.gm_settings) {
      settings = { ...settings, ...result.gm_settings };
    }
    applySettingsToUI();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function applySettingsToUI() {
  els.obsidianVault.value = settings.obsidianVault || '';
  els.obsidianVaultPath.value = settings.obsidianVaultPath || '';
  els.obsidianFolder.value = settings.obsidianFolder || 'AI对话/Gemini';
  els.obsidianUseUri.checked = settings.obsidianUseUri || false;
  els.useDirectObsidianWrite.checked = settings.useDirectObsidianWrite || false;
  els.obsidianAutoFilename.checked = settings.obsidianAutoFilename !== false;
  els.exportFormat.value = settings.defaultFormat || 'markdown';
  els.includeThoughts.checked = settings.includeThoughts !== false;
  if (els.enableFolderManagement) {
    els.enableFolderManagement.checked = settings.enableFolderManagement || false;
  }
  if (els.languageSelect) {
    els.languageSelect.value = settings.language || 'zh';
    window.GM_I18N.setCurrentLang(settings.language || 'zh');
    window.GM_I18N.applyI18n();
  }
  syncExportModeControls();
}

function syncExportModeControls() {
  const direct = els.useDirectObsidianWrite.checked;
  els.obsidianUseUri.disabled = direct;
  if (direct) {
    els.obsidianUseUri.checked = false;
  } else {
    els.obsidianUseUri.checked = settings.obsidianUseUri || false;
  }
}

function setExportFeedback(message, progress = null) {
  if (els.exportStatus) {
    els.exportStatus.hidden = !message;
    els.exportStatus.textContent = message || '';
  }
  if (els.exportProgress) {
    if (typeof progress === 'number') {
      els.exportProgress.hidden = false;
      els.exportProgress.value = Math.max(0, Math.min(100, progress));
    } else {
      els.exportProgress.hidden = true;
    }
  }
}

function setExportBusy(isBusy) {
  [els.btnExportMd, els.btnExportObsidian, els.btnExportJson, els.btnExportAll, els.btnArchiveCurrent,
  els.btnSelectiveExportMd, els.btnSelectiveExportObsidian, els.btnToggleSelective].forEach((btn) => {
    if (btn) btn.disabled = isBusy;
  });
}

async function saveSettings() {
  settings = {
    obsidianVault: els.obsidianVault.value.trim(),
    obsidianVaultPath: els.obsidianVaultPath.value.trim(),
    obsidianFolder: els.obsidianFolder.value.trim(),
    obsidianUseUri: els.useDirectObsidianWrite.checked ? false : els.obsidianUseUri.checked,
    useDirectObsidianWrite: els.useDirectObsidianWrite.checked,
    obsidianAutoFilename: els.obsidianAutoFilename.checked,
    defaultFormat: els.exportFormat.value,
    includeThoughts: els.includeThoughts.checked,
    useSaveDialog: settings.useSaveDialog !== false,
    enableFolderManagement: els.enableFolderManagement ? els.enableFolderManagement.checked : false,
    language: els.languageSelect ? els.languageSelect.value : 'zh'
  };

  try {
    await chrome.storage.sync.set({ gm_settings: settings });
    // Apply language immediately
    if (window.GM_I18N) {
      window.GM_I18N.setLanguage(settings.language);
    }
    showToast(window.GM_I18N ? window.GM_I18N.t('export.saved') : '设置已保存', 'success');
  } catch (err) {
    showToast((window.GM_I18N ? window.GM_I18N.t('export.save_failed') : '保存失败') + ': ' + err.message, 'error');
  }
}

// ===== Direct Directory Access =====

const FS_DB_NAME = 'gemini_manager_fs';
const FS_STORE_NAME = 'handles';
const FS_EXPORT_DIR_KEY = 'obsidian_export_directory';
const DIRECT_IMAGE_FOLDER = 'Images';

function updateExportDirStatus() {
  if (!els.exportDirStatus) return;
  if (!('showDirectoryPicker' in window)) {
    els.exportDirStatus.textContent = '当前浏览器不支持直接写入目录';
    return;
  }
  els.exportDirStatus.textContent = exportDirectoryHandle
    ? `已选择: ${exportDirectoryHandle.name}`
    : '未选择目录';
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
  if (!('showDirectoryPicker' in window)) {
    updateExportDirStatus();
    return;
  }

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
  updateExportDirStatus();
}

async function verifyDirectoryPermission(handle, readWrite = true) {
  if (!handle) return false;
  const options = readWrite ? { mode: 'readwrite' } : {};
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

async function openDirectorySetupPage() {
  try {
    if (chrome.runtime && chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage();
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
    }
  } catch (err) {
    showToast('打开设置页失败: ' + err.message, 'error');
  }
}

// ===== Archived Data =====

async function loadArchivedData() {
  try {
    const result = await chrome.storage.local.get('gm_archived');
    if (result.gm_archived) {
      archivedIds = new Set(result.gm_archived);
    }
  } catch (err) {
    console.error('Failed to load archived data:', err);
  }
}

async function saveArchivedData() {
  try {
    await chrome.storage.local.set({ gm_archived: Array.from(archivedIds) });
  } catch (err) {
    console.error('Failed to save archived data:', err);
  }
}

async function archiveConversation(id) {
  archivedIds.add(id);
  await saveArchivedData();
  renderConversationList();
  showToast('已归档', 'success');
}

async function unarchiveConversation(id) {
  archivedIds.delete(id);
  await saveArchivedData();
  renderConversationList();
  showToast('已取消归档', 'success');
}

// ===== Tab Management =====

async function findGeminiTab() {
  try {
    // Search for Gemini tabs first, then AI Studio
    const supportedPatterns = [
      'https://gemini.google.com/*',
      'https://aistudio.google.com/*'
    ];
    for (const pattern of supportedPatterns) {
      const tabs = await chrome.tabs.query({ url: pattern });
      if (tabs.length > 0) {
        currentTab = tabs[0];
        isGeminiPage = true;
        return;
      }
    }

    // Check active tab as fallback
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url && (
      activeTab.url.includes('gemini.google.com') ||
      activeTab.url.includes('aistudio.google.com')
    )) {
      currentTab = activeTab;
      isGeminiPage = true;
    }
  } catch (err) {
    console.error('Failed to find supported tab:', err);
  }
}

// ===== Content Script Communication =====

async function sendToContent(action, data = {}) {
  if (!currentTab) {
    throw new Error('未找到 Gemini 页面');
  }

  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, { action, ...data });
    if (!response || !response.success) {
      throw new Error(response?.error || '未知错误');
    }
    return response;
  } catch (err) {
    if (err.message.includes('Receiving end does not exist')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['src/content/content.js']
        });
        const response = await chrome.tabs.sendMessage(currentTab.id, { action, ...data });
        if (!response || !response.success) {
          throw new Error(response?.error || '未知错误');
        }
        return response;
      } catch (injectErr) {
        throw new Error('无法注入内容脚本，请刷新页面后重试');
      }
    }
    throw err;
  }
}

// ===== Conversation Operations =====

async function refreshCurrentConversation() {
  try {
    const response = await sendToContent('extractConversation');
    const data = response.data;
    els.convTitle.textContent = data.title || '未命名对话';
    els.convTurns.textContent = `${data.turns.length} 轮`;

    // Set default filename
    const defaultName = `${sanitizeFilename(data.title)}.md`;
    if (els.filenameInput) {
      els.filenameInput.value = defaultName;
      els.filenameInput.dataset.default = defaultName;
    }
  } catch (err) {
    console.error('Failed to extract conversation:', err);
    els.convTitle.textContent = '提取失败';
    els.convTurns.textContent = '-';
  }
}

function formatDateTime(isoString) {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function refreshConversationList() {
  els.conversationList.innerHTML = '<div class="empty-state">正在加载...</div>';
  try {
    const response = await sendToContent('extractConversationList');
    conversationList = response.data || [];
    renderConversationList();
  } catch (err) {
    console.error('Failed to extract conversation list:', err);
    els.conversationList.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
  }
}

function renderConversationList() {
  const filter = els.filterInput.value.toLowerCase();
  const statusFilter = els.filterStatus.value;

  let filtered = conversationList;

  if (filter) {
    filtered = filtered.filter(c => c.title.toLowerCase().includes(filter));
  }

  if (statusFilter === 'active') {
    filtered = filtered.filter(c => !archivedIds.has(c.id));
  } else if (statusFilter === 'archived') {
    filtered = filtered.filter(c => archivedIds.has(c.id));
  }

  if (filtered.length === 0) {
    els.conversationList.innerHTML = '<div class="empty-state">没有找到对话</div>';
    return;
  }

  els.conversationList.innerHTML = filtered.map(conv => {
    const isArchived = archivedIds.has(conv.id);
    return `
      <div class="conv-item ${conv.isSelected ? 'selected' : ''} ${isArchived ? 'archived' : ''}"
           data-id="${escapeHtml(conv.id)}"
           data-url="${escapeHtml(conv.url)}">
        <span class="conv-icon">${isArchived ? '📦' : '💬'}</span>
        <div class="conv-content">
          <div class="conv-title">${escapeHtml(conv.title)}</div>
          <div class="conv-meta">${conv.isSelected ? '当前对话' : ''}</div>
        </div>
        <div class="conv-actions">
          <button class="conv-btn conv-btn-archive" title="${isArchived ? '取消归档' : '归档'}"
                  data-action="archive" data-id="${escapeHtml(conv.id)}">
            ${isArchived ? '📂' : '📦'}
          </button>
          <button class="conv-btn conv-btn-open" title="打开"
                  data-action="open" data-url="${escapeHtml(conv.url)}">
            🔗
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ===== Export Functions =====

function getExportFilename(defaultName, ext, options = {}) {
  const opts = { preferInput: true, ...options };
  const input = els.filenameInput;
  if (opts.preferInput && input && input.value.trim()) {
    let name = input.value.trim();
    // Ensure correct extension
    if (!name.toLowerCase().endsWith(ext.toLowerCase())) {
      name += ext;
    }
    return name;
  }
  return defaultName;
}

function getUserFilename(defaultName, ext) {
  return getExportFilename(defaultName, ext, { preferInput: true });
}

function normalizeDownloadSubdir(rawPath) {
  const raw = String(rawPath || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('Chrome 扩展不能直接写入 Vault 绝对路径。请启用 Obsidian URI，或把下载目录中的导出文件夹同步/软链接到 Vault。');
  }

  return normalized.replace(/^\/+|\/+$/g, '');
}

function joinDownloadPath(...parts) {
  return parts
    .filter(Boolean)
    .map(part => String(part).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function shouldUseDirectWrite(currentSettings = settings, directoryHandle = exportDirectoryHandle) {
  return Boolean(currentSettings.useDirectObsidianWrite && directoryHandle);
}

function shouldEmbedImagesForObsidian(currentSettings = settings, directoryHandle = exportDirectoryHandle) {
  return Boolean(currentSettings.obsidianUseUri && !shouldUseDirectWrite(currentSettings, directoryHandle));
}

function getSafePathParts(pathValue) {
  return String(pathValue || '')
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      if (part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part)) {
        throw new Error('文件夹路径不能包含 .、.. 或非法文件名字符');
      }
      return part;
    });
}

async function getOrCreateDirectory(rootHandle, pathParts) {
  let dir = rootHandle;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function writeTextFileToDirectory(dirHandle, filename, content, mimeType) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([content], { type: mimeType }));
  await writable.close();
}

async function imageToBlob(img) {
  if (!img || !img.src) {
    throw new Error('图片地址为空');
  }

  const src = img.src;
  if (src.startsWith('data:')) {
    return await (await fetch(src)).blob();
  }

  const response = await chrome.runtime.sendMessage({
    action: 'fetchImagesAsBase64',
    images: [src]
  });
  const item = response && response.success && response.results && response.results[0];
  if (!item || !item.success || !item.dataUrl) {
    throw new Error(item?.error || '图片下载失败');
  }
  return await (await fetch(item.dataUrl)).blob();
}

async function writeImagesToDirectory(dirHandle, images, imagePrefix) {
  const failures = [];
  for (let idx = 0; idx < (images || []).length; idx++) {
    const img = images[idx];
    const prefix = imagePrefix ? `${imagePrefix}_` : '';
    const imgName = `${prefix}image_${String(idx + 1).padStart(2, '0')}.png`;
    try {
      const blob = await imageToBlob(img);
      const fileHandle = await dirHandle.getFileHandle(imgName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      console.warn('Failed to write image:', img?.src, err);
      failures.push(imgName);
    }
  }
  return failures;
}

async function writeObsidianExportToDirectory(response, filename) {
  if (!settings.useDirectObsidianWrite || settings.obsidianUseUri || !exportDirectoryHandle) {
    return false;
  }

  const granted = await verifyDirectoryPermission(exportDirectoryHandle, true);
  if (!granted) {
    exportDirectoryHandle = null;
    updateExportDirStatus();
    throw new Error('Obsidian 目录写入权限已失效，请重新选择目录');
  }

  const targetDir = await getOrCreateDirectory(exportDirectoryHandle, getSafePathParts(settings.obsidianFolder));
  const imageDir = await getOrCreateDirectory(targetDir, response.images && response.images.length > 0 ? [DIRECT_IMAGE_FOLDER] : []);
  const imageFailures = await writeImagesToDirectory(imageDir, response.images || [], response.imagePrefix);
  await writeTextFileToDirectory(targetDir, filename, response.content, 'text/markdown');
  if (imageFailures.length > 0) {
    showToast(`笔记已写入，${imageFailures.length} 张图片失败`, 'error');
  } else {
    showToast(`已写入 Obsidian 目录: ${filename}`, 'success');
  }
  return true;
}

async function exportMarkdown() {
  setExportBusy(true);
  const isAIStudio = currentTab && currentTab.url && currentTab.url.includes('aistudio.google.com');
  setExportFeedback(isAIStudio ? '正在提取 AI Studio 对话（需要较长时间）...' : '正在导出 Markdown...', 10);
  try {
    const directWrite = shouldUseDirectWrite();

    // Pre-verify file system permission BEFORE the long extraction,
    // while user activation (click gesture) is still valid.
    let directWritePermissionOk = false;
    if (directWrite) {
      try {
        directWritePermissionOk = await verifyDirectoryPermission(exportDirectoryHandle, true);
      } catch (e) {
        console.warn('[Gemini Manager] Pre-verify permission failed:', e);
      }
    }

    const response = await sendToContent('exportMarkdown', {
      imageFolder: (directWrite && directWritePermissionOk) ? DIRECT_IMAGE_FOLDER : '',
      includeThoughts: settings.includeThoughts !== false
    });
    setExportFeedback('正在准备图片与笔记...', 40);
    const filename = getUserFilename(response.defaultFilename, '.md');

    if (directWrite && directWritePermissionOk) {
      const wroteDirectly = await writeObsidianExportToDirectory(response, filename);
      if (wroteDirectly) {
        setExportFeedback(`已完成: ${filename}`, 100);
        return;
      }
    }

    // Download images first
    if (response.images && response.images.length > 0) {
      setExportFeedback('正在下载图片...', 65);
      await downloadImages(response.images, filename, response.imagePrefix);
    }

    setExportFeedback('正在保存 Markdown...', 85);
    const blob = new Blob([response.content], { type: 'text/markdown' });
    await downloadFile(blob, filename);
    showToast(`已下载: ${filename}`, 'success');
    setExportFeedback(`已完成: ${filename}`, 100);
  } catch (err) {
    setExportFeedback('导出失败');
    showToast('导出失败: ' + err.message, 'error');
  } finally {
    setExportBusy(false);
    setTimeout(() => setExportFeedback('', null), 1200);
  }
}

async function exportObsidian() {
  setExportBusy(true);
  const isAIStudio = currentTab && currentTab.url && currentTab.url.includes('aistudio.google.com');
  setExportFeedback(isAIStudio ? '正在提取 AI Studio 对话（需要较长时间）...' : '正在导出到 Obsidian...', 10);
  try {
    console.log('[Gemini Manager] exportObsidian: obsidianUseUri =', settings.obsidianUseUri);
    // URI mode embeds images as base64; direct-write mode writes image files instead.
    const directWrite = shouldUseDirectWrite();
    const embedImages = shouldEmbedImagesForObsidian();

    // Pre-verify file system permission BEFORE the long extraction,
    // while user activation (click gesture) is still valid.
    let directWritePermissionOk = false;
    if (directWrite) {
      try {
        directWritePermissionOk = await verifyDirectoryPermission(exportDirectoryHandle, true);
      } catch (e) {
        console.warn('[Gemini Manager] Pre-verify permission failed:', e);
      }
    }

    const response = await sendToContent('exportObsidian', {
      imageFolder: (directWrite && directWritePermissionOk) ? DIRECT_IMAGE_FOLDER : '',
      embedImages,
      includeThoughts: settings.includeThoughts !== false
    });
    setExportFeedback('正在生成笔记内容...', 35);
    const filename = getUserFilename(response.defaultFilename, '.md');
    const content = response.content;
    const folder = settings.obsidianFolder ? settings.obsidianFolder + '/' : '';

    if (directWrite && directWritePermissionOk) {
      const wroteDirectly = await writeObsidianExportToDirectory(response, filename);
      if (wroteDirectly) {
        setExportFeedback(`已完成: ${filename}`, 100);
        return;
      }
    }

    if (settings.obsidianUseUri) {
      setExportFeedback('正在打开 Obsidian...', 80);
      const vault = settings.obsidianVault ? `&vault=${encodeURIComponent(settings.obsidianVault)}` : '';
      const baseName = filename.replace('.md', '');

      const uri = `obsidian://new?file=${encodeURIComponent(folder + baseName)}${vault}&content=${encodeURIComponent(content)}`;
      await chrome.tabs.update(currentTab.id, { url: uri });
      showToast('已打开 Obsidian', 'success');
      setExportFeedback('已打开 Obsidian', 100);
    } else {
      // Download images to Obsidian vault directory if vault path is set
      const downloadRoot = normalizeDownloadSubdir(settings.obsidianVaultPath);
      if (response.images && response.images.length > 0) {
        setExportFeedback('正在下载图片...', 65);
        await downloadImages(response.images, joinDownloadPath(downloadRoot, folder, filename), response.imagePrefix);
      }

      setExportFeedback('正在保存 Markdown...', 85);
      const blob = new Blob([content], { type: 'text/markdown' });
      const downloadPath = joinDownloadPath(downloadRoot, folder, filename);
      await downloadFile(blob, downloadPath);
      showToast(`已下载: ${downloadPath}`, 'success');
      setExportFeedback(`已完成: ${downloadPath}`, 100);
    }
  } catch (err) {
    setExportFeedback('导出失败');
    showToast('导出失败: ' + err.message, 'error');
  } finally {
    setExportBusy(false);
    setTimeout(() => setExportFeedback('', null), 1200);
  }
}

async function exportJSON() {
  setExportBusy(true);
  setExportFeedback('正在导出 JSON...', 20);
  try {
    const response = await sendToContent('exportJSON');
    const filename = getUserFilename(response.defaultFilename, '.json');

    setExportFeedback('正在保存 JSON...', 80);
    const blob = new Blob([response.content], { type: 'application/json' });
    await downloadFile(blob, filename);
    showToast(`已下载: ${filename}`, 'success');
    setExportFeedback(`已完成: ${filename}`, 100);
  } catch (err) {
    setExportFeedback('导出失败');
    showToast('导出失败: ' + err.message, 'error');
  } finally {
    setExportBusy(false);
    setTimeout(() => setExportFeedback('', null), 1200);
  }
}

async function downloadImages(images, mdFilename, imagePrefix) {
  // Download images to the same directory as the markdown file
  let imagesDir = mdFilename.includes('/') ? mdFilename.substring(0, mdFilename.lastIndexOf('/')) : '';

  // For authenticated URLs (lh3.googleusercontent.com), fetch via content script first
  const needsAuth = (url) => /^https:\/\/lh3\.(googleusercontent|google|ggpht)\.com\//i.test(url);

  const downloadPromises = images.map(async (img, idx) => {
    try {
      const prefix = imagePrefix ? `${imagePrefix}_` : '';
      const imgName = `${prefix}image_${String(idx + 1).padStart(2, '0')}.png`;
      const imgPath = imagesDir ? `${imagesDir}/${imgName}` : imgName;
      let downloadUrl = img.src;

      // If it's an authenticated Google URL, fetch via content script first
      if (needsAuth(img.src) && currentTab) {
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, {
            action: 'fetchImageViaPage',
            imageUrls: [img.src]
          });
          if (response && response.success && response.results && response.results[0] && response.results[0].success) {
            downloadUrl = response.results[0].dataUrl;
          }
        } catch (fetchErr) {
          console.warn('Content script fetch failed, trying direct:', fetchErr);
        }
      }

      await chrome.downloads.download({
        url: downloadUrl,
        filename: imgPath,
        saveAs: false
      });
    } catch (err) {
      console.warn('Failed to download image:', img.src, err);
    }
  });

  await Promise.all(downloadPromises);
}

async function exportAllConversations() {
  if (!conversationList || conversationList.length === 0) {
    showToast('没有可导出的对话', 'error');
    return;
  }

  // Only export non-archived conversations
  const toExport = conversationList.filter(c => !archivedIds.has(c.id));
  if (toExport.length === 0) {
    showToast('没有未归档的对话可导出', 'error');
    return;
  }

  if (!confirm(`确定要导出 ${toExport.length} 个对话吗？\n\n这将逐个打开对话页面并导出为 Markdown 文件。`)) return;

  let successCount = 0;
  let failCount = 0;
  const savedTabId = currentTab?.id;
  setExportBusy(true);

  for (let i = 0; i < toExport.length; i++) {
    const conv = toExport[i];
    setExportFeedback(`正在导出 (${i + 1}/${toExport.length}): ${conv.title}`, Math.floor((i / toExport.length) * 100));

    try {
      // Navigate to the conversation
      await chrome.tabs.update(savedTabId, { url: conv.url });
      // Wait for page to finish loading
      await waitForTabLoad(savedTabId);
      // Give content script time to initialize
      await new Promise(r => setTimeout(r, 1500));

      // Refresh currentTab reference (tab id stays the same after update)
      currentTab = await chrome.tabs.get(savedTabId);

      const directWrite = shouldUseDirectWrite();
      const response = await sendToContent('exportMarkdown', {
        imageFolder: directWrite ? DIRECT_IMAGE_FOLDER : '',
        includeThoughts: settings.includeThoughts !== false
      });
      const filename = getExportFilename(response.defaultFilename, '.md', { preferInput: false });
      if (directWrite) {
        await writeObsidianExportToDirectory(response, filename);
        successCount++;
        continue;
      }
      const blob = new Blob([response.content], { type: 'text/markdown' });
      await downloadFile(blob, filename);
      successCount++;
    } catch (err) {
      console.warn(`Failed to export: ${conv.title}`, err);
      failCount++;
    }
  }

  showToast(`批量导出完成: 成功 ${successCount}, 失败 ${failCount}`, successCount > 0 ? 'success' : 'error');
  setExportFeedback(`批量导出完成: 成功 ${successCount}, 失败 ${failCount}`, 100);
  setTimeout(() => setExportFeedback('', null), 1600);
  setExportBusy(false);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout safety
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

async function archiveCurrentConversation() {
  try {
    const response = await sendToContent('extractConversation');
    const data = response.data;
    const convId = extractIdFromUrl(data.url);

    if (convId) {
      await archiveConversation(convId);
    } else {
      showToast('无法获取对话 ID', 'error');
    }
  } catch (err) {
    showToast('归档失败: ' + err.message, 'error');
  }
}

// ===== Data Management =====

async function clearArchivedData() {
  if (!confirm('确定要清空所有归档数据吗？此操作不可撤销。')) return;

  try {
    archivedIds.clear();
    await chrome.storage.local.remove('gm_archived');
    renderConversationList();
    showToast('归档数据已清空', 'success');
  } catch (err) {
    showToast('清空失败: ' + err.message, 'error');
  }
}

async function exportAllData() {
  try {
    const allData = await chrome.storage.local.get();
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const defaultName = `gemini_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
    await downloadFile(blob, defaultName);
    showToast('数据已导出', 'success');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
}

// ===== Utility Functions =====

function downloadFile(blob, filename) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(url);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Revoke object URL after download completes or fails
      const listener = (delta) => {
        if (delta.id !== downloadId) return;
        if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
          chrome.downloads.onChanged.removeListener(listener);
          URL.revokeObjectURL(url);
        }
      };
      chrome.downloads.onChanged.addListener(listener);
      resolve(downloadId);
    });
  });
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 100);
}

function extractIdFromUrl(url) {
  const match = url.match(/\/app\/(?:[a-z0-9]+\/)?([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
// ===== Selective Export =====

let selectiveTurnPreviews = []; // cached turn previews from content script

async function toggleSelectiveExport() {
  const panel = els.turnSelectorPanel;
  const btn = els.btnToggleSelective;

  if (!panel.hidden) {
    // Close panel
    panel.hidden = true;
    btn.classList.remove('active');
    selectiveTurnPreviews = [];
    return;
  }

  // Open panel and fetch turn previews
  btn.classList.add('active');
  panel.hidden = false;
  const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
  els.turnSelectorList.innerHTML = `<div class="empty-state">${_t('selective.loading_turns')}</div>`;

  try {
    const isAIStudio = currentTab && currentTab.url && currentTab.url.includes('aistudio.google.com');
    if (isAIStudio) {
      els.turnSelectorList.innerHTML = `<div class="empty-state">${_t('selective.loading_aistudio')}</div>`;
    }
    const response = await sendToContent('extractTurnPreviews');
    selectiveTurnPreviews = response.data.turns || [];
    renderTurnSelector();
  } catch (err) {
    els.turnSelectorList.innerHTML = `<div class="empty-state">${_t('selective.load_failed')}: ${err.message}</div>`;
  }
}

function renderTurnSelector() {
  const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;

  if (!selectiveTurnPreviews.length) {
    els.turnSelectorList.innerHTML = `<div class="empty-state">${_t('selective.no_turns')}</div>`;
    updateTurnSelectCount();
    return;
  }

  els.turnSelectorList.innerHTML = selectiveTurnPreviews.map((turn, idx) => {
    const roleClass = turn.role === 'user' ? 'user' : 'model';
    const roleLabel = turn.role === 'user' ? _t('selective.role_user') : _t('selective.role_model');
    const previewText = escapeHtml(turn.preview || _t('selective.no_content'));
    const imgBadge = turn.hasImages ? ' 🖼️' : '';
    return `
      <label class="turn-item" data-index="${turn.index}">
        <input type="checkbox" checked data-turn-index="${turn.index}">
        <div class="turn-item-content">
          <span class="turn-item-role ${roleClass}">${roleLabel}${imgBadge}</span>
          <div class="turn-item-preview">${previewText}</div>
        </div>
      </label>
    `;
  }).join('');

  // Add change listeners to checkboxes
  els.turnSelectorList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateTurnSelectCount);
  });

  updateTurnSelectCount();
}

function selectAllTurns(selectAll) {
  els.turnSelectorList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.checked = selectAll;
  });
  updateTurnSelectCount();
}

function updateTurnSelectCount() {
  const _t = window.GM_I18N ? window.GM_I18N.t : (k) => k;
  const checkboxes = els.turnSelectorList.querySelectorAll('input[type="checkbox"]');
  const checked = els.turnSelectorList.querySelectorAll('input[type="checkbox"]:checked');
  els.turnSelectCount.textContent = _t('selective.selected_count', { checked: checked.length, total: checkboxes.length });

  // Disable export buttons if nothing selected
  const hasSelection = checked.length > 0;
  els.btnSelectiveExportMd.disabled = !hasSelection;
  els.btnSelectiveExportObsidian.disabled = !hasSelection;
}

function getSelectedTurnIndices() {
  const indices = [];
  els.turnSelectorList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    indices.push(parseInt(cb.dataset.turnIndex, 10));
  });
  return indices;
}

async function selectiveExport(format) {
  const selectedIndices = getSelectedTurnIndices();
  if (selectedIndices.length === 0) {
    showToast('请至少选择一个轮次', 'error');
    return;
  }

  setExportBusy(true);
  const isAIStudio = currentTab && currentTab.url && currentTab.url.includes('aistudio.google.com');
  setExportFeedback(isAIStudio ? '正在提取选中轮次（AI Studio 需要较长时间）...' : `正在导出选中的 ${selectedIndices.length} 个轮次...`, 10);

  try {
    const directWrite = shouldUseDirectWrite();

    // Pre-verify permission while user activation is still valid
    let directWritePermissionOk = false;
    if (directWrite) {
      try {
        directWritePermissionOk = await verifyDirectoryPermission(exportDirectoryHandle, true);
      } catch (e) {
        console.warn('[Gemini Manager] Pre-verify permission failed:', e);
      }
    }

    const action = format === 'obsidian' ? 'exportObsidian' : 'exportMarkdown';
    const embedImages = format === 'obsidian' ? shouldEmbedImagesForObsidian() : false;

    const response = await sendToContent(action, {
      imageFolder: (directWrite && directWritePermissionOk) ? DIRECT_IMAGE_FOLDER : '',
      includeThoughts: settings.includeThoughts !== false,
      embedImages,
      selectedTurnIndices: selectedIndices
    });

    setExportFeedback('正在准备导出...', 40);
    const filename = getUserFilename(response.defaultFilename, '.md');

    if (directWrite && directWritePermissionOk) {
      const wroteDirectly = await writeObsidianExportToDirectory(response, filename);
      if (wroteDirectly) {
        setExportFeedback(`已完成: ${filename}`, 100);
        return;
      }
    }

    if (format === 'obsidian' && settings.obsidianUseUri) {
      setExportFeedback('正在打开 Obsidian...', 80);
      const vault = settings.obsidianVault ? `&vault=${encodeURIComponent(settings.obsidianVault)}` : '';
      const folder = settings.obsidianFolder ? settings.obsidianFolder + '/' : '';
      const baseName = filename.replace('.md', '');
      const uri = `obsidian://new?file=${encodeURIComponent(folder + baseName)}${vault}&content=${encodeURIComponent(response.content)}`;
      await chrome.tabs.update(currentTab.id, { url: uri });
      showToast('已打开 Obsidian', 'success');
      setExportFeedback('已打开 Obsidian', 100);
    } else {
      // Download images if present
      if (response.images && response.images.length > 0) {
        setExportFeedback('正在下载图片...', 65);
        const downloadRoot = format === 'obsidian' ? normalizeDownloadSubdir(settings.obsidianVaultPath) : '';
        const folder = format === 'obsidian' ? (settings.obsidianFolder ? settings.obsidianFolder + '/' : '') : '';
        await downloadImages(response.images, joinDownloadPath(downloadRoot, folder, filename), response.imagePrefix);
      }

      setExportFeedback('正在保存...', 85);
      const blob = new Blob([response.content], { type: 'text/markdown' });
      const downloadRoot = format === 'obsidian' ? normalizeDownloadSubdir(settings.obsidianVaultPath) : '';
      const folder = format === 'obsidian' ? (settings.obsidianFolder ? settings.obsidianFolder + '/' : '') : '';
      const downloadPath = joinDownloadPath(downloadRoot, folder, filename);
      await downloadFile(blob, downloadPath);
      showToast(`已下载: ${downloadPath}`, 'success');
      setExportFeedback(`已完成: ${downloadPath}`, 100);
    }
  } catch (err) {
    setExportFeedback('导出失败');
    showToast('导出失败: ' + err.message, 'error');
  } finally {
    setExportBusy(false);
    setTimeout(() => setExportFeedback('', null), 1200);
  }
}

// ===== Event Listeners =====

function setupEventListeners() {
  els.btnExportMd.addEventListener('click', exportMarkdown);
  els.btnExportObsidian.addEventListener('click', exportObsidian);
  els.btnExportJson.addEventListener('click', exportJSON);
  els.btnArchiveCurrent.addEventListener('click', archiveCurrentConversation);
  els.btnRefreshList.addEventListener('click', refreshConversationList);
  els.btnExportAll.addEventListener('click', exportAllConversations);
  els.btnSaveSettings.addEventListener('click', saveSettings);
  els.btnSelectExportDir.addEventListener('click', openDirectorySetupPage);
  els.btnClearArchived.addEventListener('click', clearArchivedData);
  els.btnExportStorage.addEventListener('click', exportAllData);

  els.filterInput.addEventListener('input', renderConversationList);
  els.filterStatus.addEventListener('change', renderConversationList);
  els.useDirectObsidianWrite.addEventListener('change', syncExportModeControls);

  // Selective export
  els.btnToggleSelective.addEventListener('click', toggleSelectiveExport);
  els.btnSelectAll.addEventListener('click', () => selectAllTurns(true));
  els.btnSelectNone.addEventListener('click', () => selectAllTurns(false));
  els.btnSelectiveExportMd.addEventListener('click', () => selectiveExport('markdown'));
  els.btnSelectiveExportObsidian.addEventListener('click', () => selectiveExport('obsidian'));

  // Event delegation for conversation list items (avoids inline onclick CSP issues)
  els.conversationList.addEventListener('click', (e) => {
    const btn = e.target.closest('.conv-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'archive') {
      const id = btn.dataset.id;
      if (id) toggleArchive(id);
    } else if (action === 'open') {
      const url = btn.dataset.url;
      if (url) openConversation(url);
    }
  });
}

function setupTabs() {
  els.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      els.tabBtns.forEach(b => b.classList.remove('active'));
      els.tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.add('active');
    });
  });
}

// ===== Conversation List Actions =====

async function toggleArchive(id) {
  if (archivedIds.has(id)) {
    await unarchiveConversation(id);
  } else {
    await archiveConversation(id);
  }
}

async function openConversation(url) {
  try {
    if (currentTab) {
      await chrome.tabs.update(currentTab.id, { url });
    } else {
      await chrome.tabs.create({ url });
    }
    window.close();
  } catch (err) {
    showToast('打开失败: ' + err.message, 'error');
  }
}

if (window.__GM_ENABLE_TEST_HOOKS__) {
  window.__GM_TEST_HOOKS__ = {
    getExportFilename,
    normalizeDownloadSubdir,
    joinDownloadPath,
    getSafePathParts,
    openDirectorySetupPage,
    shouldUseDirectWrite,
    shouldEmbedImagesForObsidian,
    imageToBlob
  };
}
