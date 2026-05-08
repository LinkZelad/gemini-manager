/**
 * Gemini Manager - Background Service Worker
 */

// ===== Context Menu =====

chrome.runtime.onInstalled.addListener(() => {
  if (typeof chrome.contextMenus === 'undefined') {
    console.warn('[Gemini Manager] contextMenus API not available');
    return;
  }

  chrome.contextMenus.create({
    id: 'gemini-manager-export-md',
    title: '导出为 Markdown',
    contexts: ['page'],
    documentUrlPatterns: ['https://gemini.google.com/*']
  });

  chrome.contextMenus.create({
    id: 'gemini-manager-export-obsidian',
    title: '导出到 Obsidian',
    contexts: ['page'],
    documentUrlPatterns: ['https://gemini.google.com/*']
  });

  console.log('[Gemini Manager] Extension installed, context menus created');
});

if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url.includes('gemini.google.com')) return;

    try {
      const settings = await getSettings();
      if (info.menuItemId === 'gemini-manager-export-md') {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'exportMarkdown',
          includeThoughts: settings.includeThoughts !== false
        });
        if (response.success) {
          const defaultFilename = response.defaultFilename || `${sanitizeFilename(response.title)}.md`;
          await downloadContent(response.content, defaultFilename, 'text/markdown');
        }
      } else if (info.menuItemId === 'gemini-manager-export-obsidian') {
        const embedImages = settings.obsidianUseUri;
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'exportObsidian',
          embedImages,
          imageFolder: '',
          includeThoughts: settings.includeThoughts !== false
        });
        if (response.success) {
          const folder = settings.obsidianFolder ? settings.obsidianFolder + '/' : '';
          const defaultFilename = response.defaultFilename || `${sanitizeFilename(response.title)}.md`;

          if (settings.obsidianUseUri) {
            await openObsidianUri(response, settings);
          } else {
            const downloadRoot = normalizeDownloadSubdir(settings.obsidianVaultPath);
            const downloadPath = joinDownloadPath(downloadRoot, folder, defaultFilename);
            if (response.images && response.images.length > 0) {
              await downloadImages(response.images, downloadPath);
            }
            await downloadContent(response.content, downloadPath, 'text/markdown');
          }
        }
      }
    } catch (err) {
      console.error('[Gemini Manager] Context menu action failed:', err);
    }
  });
}

// ===== Message Handling =====

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'contentScriptReady') {
    console.log('[Gemini Manager] Content script ready on', request.url);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'download') {
    downloadContent(request.content, request.filename, request.mimeType)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'fetchImagesAsBase64') {
    fetchImagesAsBase64(request.images)
      .then(results => sendResponse({ success: true, results }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

// ===== Keyboard Shortcuts =====

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('gemini.google.com')) return;

    const settings = await getSettings();
    if (command === 'export-markdown') {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'exportMarkdown',
        includeThoughts: settings.includeThoughts !== false
      });
      if (response.success) {
        const defaultFilename = response.defaultFilename || `${sanitizeFilename(response.title)}.md`;
        await downloadContent(response.content, defaultFilename, 'text/markdown');
      }
    } else if (command === 'export-obsidian') {
      const embedImages = settings.obsidianUseUri;
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'exportObsidian',
        embedImages,
        imageFolder: '',
        includeThoughts: settings.includeThoughts !== false
      });
      if (response.success) {
        const folder = settings.obsidianFolder ? settings.obsidianFolder + '/' : '';
        const defaultFilename = response.defaultFilename || `${sanitizeFilename(response.title)}.md`;

        if (settings.obsidianUseUri) {
          await openObsidianUri(response, settings);
        } else {
            const downloadRoot = normalizeDownloadSubdir(settings.obsidianVaultPath);
            const downloadPath = joinDownloadPath(downloadRoot, folder, defaultFilename);
            if (response.images && response.images.length > 0) {
              await downloadImages(response.images, downloadPath);
            }
            await downloadContent(response.content, downloadPath, 'text/markdown');
        }
      }
    }
  } catch (err) {
    console.error('[Gemini Manager] Keyboard shortcut failed:', err);
  }
});

// ===== Tab Change Detection =====

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('gemini.google.com') && changeInfo.status === 'complete') {
    console.log('[Gemini Manager] Gemini page loaded:', tab.url);
  }
});

// ===== Utility Functions =====

async function getSettings() {
  const result = await chrome.storage.sync.get('gm_settings');
  return result.gm_settings || {
    obsidianVault: '',
    obsidianVaultPath: '',
    obsidianFolder: 'AI对话/Gemini',
    obsidianUseUri: false,
    obsidianAutoFilename: true,
    includeThoughts: true
  };
}

async function openObsidianUri(response, settings) {
  const vault = settings.obsidianVault ? `&vault=${encodeURIComponent(settings.obsidianVault)}` : '';
  const folder = settings.obsidianFolder ? `${settings.obsidianFolder}/` : '';
  const filename = response.defaultFilename
    ? response.defaultFilename.replace('.md', '')
    : sanitizeFilename(response.title);

  const uri = `obsidian://new?file=${encodeURIComponent(folder + filename)}${vault}&content=${encodeURIComponent(response.content)}`;

  await chrome.tabs.create({ url: uri });
}

function normalizeDownloadSubdir(rawPath) {
  const raw = String(rawPath || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('Chrome extensions cannot write directly to an absolute Vault path. Use Obsidian URI mode or a Downloads subfolder synced into the Vault.');
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

async function downloadImages(images, mdFilename) {
  // Download images to the same directory as the markdown file
  let imagesDir = mdFilename.includes('/') ? mdFilename.substring(0, mdFilename.lastIndexOf('/')) : '';

  // For authenticated URLs (lh3.googleusercontent.com), fetch via content script first
  const needsAuth = (url) => /^https:\/\/lh3\.(googleusercontent|google|ggpht)\.com\//i.test(url);

  // Get the active Gemini tab to delegate authenticated fetches
  let geminiTabId = null;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
    if (tabs.length > 0) geminiTabId = tabs[0].id;
  } catch (e) {
    console.warn('[Gemini Manager] Could not find Gemini tab for image fetch:', e);
  }

  const downloadPromises = images.map(async (img, idx) => {
    try {
      const imgName = `image_${String(idx + 1).padStart(2, '0')}.png`;
      const imgPath = imagesDir ? `${imagesDir}/${imgName}` : imgName;
      let downloadUrl = img.src;

      // If it's an authenticated Google URL, fetch via content script first
      if (needsAuth(img.src) && geminiTabId) {
        try {
          const response = await chrome.tabs.sendMessage(geminiTabId, {
            action: 'fetchImageViaPage',
            imageUrls: [img.src]
          });
          if (response && response.success && response.results && response.results[0] && response.results[0].success) {
            downloadUrl = response.results[0].dataUrl;
          }
        } catch (fetchErr) {
          console.warn('[Gemini Manager] Content script fetch failed, trying direct:', fetchErr);
        }
      }

      await chrome.downloads.download({
        url: downloadUrl,
        filename: imgPath,
        saveAs: false
      });
    } catch (err) {
      console.warn('[Gemini Manager] Failed to download image:', img.src, err);
    }
  });

  await Promise.all(downloadPromises);
}

function downloadContent(content, filename, mimeType) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 100);
}

async function fetchImagesAsBase64(imageUrls) {
  const results = [];
  for (let idx = 0; idx < imageUrls.length; idx++) {
    const url = imageUrls[idx];
    if (!url) {
      results.push({ success: false, error: 'No URL' });
      continue;
    }
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      results.push({ success: true, dataUrl });
    } catch (err) {
      console.warn('[Gemini Manager] Background: Failed to fetch image:', url, err);
      results.push({ success: false, error: err.message });
    }
  }
  return results;
}

// ===== Keep Alive =====

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

console.log('[Gemini Manager] Background service worker started');
