/**
 * Gemini Manager - Content Script
 * Runs on gemini.google.com and aistudio.google.com to extract conversation data
 */

(function () {
  'use strict';

  if (window.__GM_CONTENT_SCRIPT_LOADED__ && !window.__GM_ENABLE_TEST_HOOKS__) {
    return;
  }
  window.__GM_CONTENT_SCRIPT_LOADED__ = true;

  // ===== Site Detection =====
  const SITE = {
    GEMINI: 'gemini',
    AISTUDIO: 'aistudio',
    UNKNOWN: 'unknown'
  };

  function detectSite() {
    const host = window.location.hostname;
    if (host.includes('gemini.google.com')) return SITE.GEMINI;
    if (host.includes('aistudio.google.com')) return SITE.AISTUDIO;
    return SITE.UNKNOWN;
  }

  const currentSite = detectSite();

  // ===== DOM Selectors (based on Gemini's current structure) =====
  const SELECTORS = {
    sidebar: 'mat-sidenav',
    historyList: 'history-list',
    historyItem: 'history-item',
    conversationLink: 'a[href*="/app/"]',
    selectedItem: '.selected',
    conversationTitle: '.conversation-title',
    chatHistory: '#chat-history',
    conversationContainer: '#chat-history .conversation-container',
    userQuery: 'user-query',
    userTextLine: '.query-text-line',
    userParagraph: '.query-text p',
    userText: '.query-text',
    modelResponse: 'model-response',
    responseContainer: '.response-container-content',
    modelMarkdown: '.model-response-text .markdown',
    modelThoughts: 'model-thoughts',
    thoughtsBody: '.thoughts-body, .thoughts-content',
    topBarTitle: '.top-bar-actions .conversation-title',
    pageTitle: 'h1'
  };

  const FALLBACK_SELECTORS = {
    historyItem: ['history-item', '[data-test-id="history-item"]', '.history-item'],
    conversationTitle: ['.conversation-title', '.chat-title', '[data-test-id="conversation-title"]'],
    userQuery: ['user-query', '[data-test-id="user-query"]', '.user-query'],
    modelResponse: ['model-response', '[data-test-id="model-response"]', '.model-response'],
    modelMarkdown: ['.model-response-text .markdown', '.markdown', '[data-test-id="response-text"]']
  };

  function queryWithFallback(root, primary, fallbacks) {
    let el = root.querySelector(primary);
    if (el) return el;
    for (const fb of (fallbacks || [])) {
      el = root.querySelector(fb);
      if (el) return el;
    }
    return null;
  }

  function queryAllWithFallback(root, primary, fallbacks) {
    let els = root.querySelectorAll(primary);
    if (els && els.length > 0) return Array.from(els);
    for (const fb of (fallbacks || [])) {
      els = root.querySelectorAll(fb);
      if (els && els.length > 0) return Array.from(els);
    }
    return [];
  }

  // ===== Utility Functions =====

  function getNodeText(node) {
    if (!node) return '';
    return String(node.innerText || node.textContent || '').trim();
  }

  function normalizeText(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 100);
  }

  function formatDateTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  async function blobToDataUrl(blobUrl) {
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[Gemini Manager] Failed to convert blob URL:', blobUrl, e);
      return blobUrl;
    }
  }

  /**
   * Fetch an image URL using the page's cookies (runs in Gemini page context).
   * Uses credentials: 'include' only for Google auth URLs (lh3.googleusercontent.com);
   * uses 'omit' for other URLs to avoid CORS wildcard conflicts.
   */
  async function fetchImageInPage(imageUrl) {
    try {
      // Only include credentials for URLs that need Google auth cookies.
      // Other CDNs (e.g. gstatic.com) return Access-Control-Allow-Origin: *
      // which is incompatible with credentials: 'include'.
      const creds = needsPageContextFetch(imageUrl) ? 'include' : 'omit';
      const response = await fetch(imageUrl, { credentials: creds });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[Gemini Manager] Failed to fetch image in page context:', imageUrl, e);
      return null;
    }
  }

  /**
   * Check if a URL requires page-context fetching (i.e. Google auth cookies).
   */
  function needsPageContextFetch(url) {
    if (!url) return false;
    return /^https:\/\/lh3\.(googleusercontent|google|ggpht)\.com\//i.test(url);
  }

  async function convertBlobUrls(images) {
    if (!images || images.length === 0) return;
    for (const img of images) {
      if (img.src && img.src.startsWith('blob:')) {
        img.src = await blobToDataUrl(img.src);
      }
    }
  }

  /**
   * Convert Google-hosted image URLs to data URLs using page cookies.
   */
  async function convertAuthenticatedUrls(images) {
    if (!images || images.length === 0) return;
    for (const img of images) {
      if (img.src && needsPageContextFetch(img.src)) {
        const dataUrl = await fetchImageInPage(img.src);
        if (dataUrl) {
          img.originalSrc = img.src;
          img.src = dataUrl;
        }
      }
    }
  }

  /**
   * Replace URLs in markdown text that need authenticated fetching.
   */
  async function replaceAuthenticatedUrlsInText(text) {
    if (!text) return text;
    // Match lh3.googleusercontent.com (and related) URLs in the markdown
    const urlPattern = /https:\/\/lh3\.(googleusercontent|google|ggpht)\.com\/[^\s)"'>]+/gi;
    const matches = text.match(urlPattern);
    if (!matches) return text;

    const uniqueUrls = [...new Set(matches)];
    for (const url of uniqueUrls) {
      const dataUrl = await fetchImageInPage(url);
      if (dataUrl) {
        text = text.split(url).join(dataUrl);
      }
    }
    return text;
  }

  async function processConversationImages(conversation) {
    for (const turn of conversation.turns) {
      // Convert blob: URLs
      if (turn.userImages) await convertBlobUrls(turn.userImages);
      if (turn.images) await convertBlobUrls(turn.images);

      // Convert authenticated Google image URLs to data URLs
      if (turn.userImages) await convertAuthenticatedUrls(turn.userImages);
      if (turn.images) await convertAuthenticatedUrls(turn.images);

      // Also replace blob: and authenticated URLs in the markdown text
      if (turn.responseMarkdown) {
        const blobMatches = turn.responseMarkdown.match(/blob:[^\s)"'>]+/g);
        if (blobMatches) {
          for (const blobUrl of blobMatches) {
            const dataUrl = await blobToDataUrl(blobUrl);
            turn.responseMarkdown = turn.responseMarkdown.split(blobUrl).join(dataUrl);
          }
        }
        turn.responseMarkdown = await replaceAuthenticatedUrlsInText(turn.responseMarkdown);
      }
      if (turn.userTextHtml) {
        const blobMatches = turn.userTextHtml.match(/blob:[^\s)"'>]+/g);
        if (blobMatches) {
          for (const blobUrl of blobMatches) {
            const dataUrl = await blobToDataUrl(blobUrl);
            turn.userTextHtml = turn.userTextHtml.split(blobUrl).join(dataUrl);
          }
        }
        turn.userTextHtml = await replaceAuthenticatedUrlsInText(turn.userTextHtml);
      }
    }
  }

  async function fetchImagesAsBase64(images) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'fetchImagesAsBase64', images: images.map(img => img.src) },
        (response) => {
          if (response && response.success) {
            resolve(response.results.map((r, idx) => ({ ...r, index: idx })));
          } else {
            resolve(images.map((_, idx) => ({ success: false, index: idx, error: response?.error || 'Background fetch failed' })));
          }
        }
      );
    });
  }

  // ===== HTML to Markdown Converter =====

  /**
   * Convert HTML element to Markdown, preserving formatting
   */
  function htmlToMarkdown(element, options = {}) {
    if (!element) return '';

    const opts = {
      includeImages: true,
      includeMath: true,
      baseUrl: window.location.origin,
      ...options
    };

    // Clone to avoid modifying original DOM
    const clone = element.cloneNode(true);

    // Pre-process: clean up code block containers
    // Remove UI elements (copy buttons, headers with icons, etc.) from code block wrappers
    clone.querySelectorAll('[class*="code"], [class*="pre"]').forEach(el => {
      const pre = el.querySelector('pre');
      if (!pre) return;
      // Remove buttons, icons, SVGs from the wrapper
      el.querySelectorAll('button, svg, [class*="copy"], [class*="icon"]').forEach(ui => ui.remove());
    });

    // Process math elements first (data-math attributes)
    if (opts.includeMath) {
      clone.querySelectorAll('[data-math]').forEach(el => {
        const math = el.getAttribute('data-math');
        if (math) {
          el.textContent = `$${math}$`;
        }
      });
    }

    return convertNode(clone, opts, 0);
  }

  function convertNode(node, opts, depth) {
    if (!node) return '';

    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    // Element node
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes);

    switch (tag) {
      // Block elements
      case 'h1': return '# ' + convertChildren(children, opts, depth) + '\n\n';
      case 'h2': return '## ' + convertChildren(children, opts, depth) + '\n\n';
      case 'h3': return '### ' + convertChildren(children, opts, depth) + '\n\n';
      case 'h4': return '#### ' + convertChildren(children, opts, depth) + '\n\n';
      case 'h5': return '##### ' + convertChildren(children, opts, depth) + '\n\n';
      case 'h6': return '###### ' + convertChildren(children, opts, depth) + '\n\n';

      case 'p':
        const pContent = convertChildren(children, opts, depth).trim();
        return pContent ? pContent + '\n\n' : '';

      case 'br':
        return '\n';

      case 'hr':
        return '---\n\n';

      case 'blockquote':
        const bqContent = convertChildren(children, opts, depth).trim();
        return bqContent ? bqContent.split('\n').map(l => '> ' + l).join('\n') + '\n\n' : '';

      case 'pre': {
        // Code block: extract ONLY the code text, ignore any headers/buttons inside
        const codeEl = node.querySelector(':scope > code');
        if (codeEl) {
          let lang = extractCodeLanguage(codeEl);
          const code = getRawTextContent(codeEl).trimEnd();
          if (!lang) lang = detectLanguageFromContent(code);
          return '```' + lang + '\n' + code + '\n```\n\n';
        }
        // Check for code nested deeper
        const nestedCode = node.querySelector('code');
        if (nestedCode) {
          let lang = extractCodeLanguage(nestedCode);
          const code = getRawTextContent(nestedCode).trimEnd();
          if (!lang) lang = detectLanguageFromContent(code);
          return '```' + lang + '\n' + code + '\n```\n\n';
        }
        // Plain preformatted text
        const preText = getRawTextContent(node).trimEnd();
        return '```\n' + preText + '\n```\n\n';
      }

      case 'code': {
        // Inline code (only if not inside pre)
        if (node.closest('pre')) {
          return getRawTextContent(node);
        }
        const inlineCode = getRawTextContent(node).trim();
        if (!inlineCode) return '';
        return inlineCode.includes('`') ? '`` ' + inlineCode + ' ``' : '`' + inlineCode + '`';
      }

      // Lists
      case 'ul':
        return convertListItems(node, opts, depth, false);
      case 'ol':
        return convertListItems(node, opts, depth, true);
      case 'li': {
        const prefix = '  '.repeat(depth) + '- ';
        return prefix + convertChildren(children, opts, depth).trim() + '\n';
      }

      // Tables
      case 'table':
        return convertTable(node, opts);
      case 'thead':
      case 'tbody':
      case 'tfoot':
        return convertChildren(children, opts, depth);
      case 'tr': {
        const cells = Array.from(node.children).filter(c => ['td', 'th'].includes(c.tagName.toLowerCase()));
        const rowContent = cells.map(c => ' ' + convertChildren(c.childNodes, opts, depth).trim() + ' ').join('|');
        return '|' + rowContent + '|\n';
      }
      case 'td':
      case 'th':
        return convertChildren(children, opts, depth).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');

      // Inline formatting
      case 'strong':
      case 'b':
        const boldText = convertChildren(children, opts, depth).trim();
        return boldText ? '**' + boldText + '**' : '';

      case 'em':
      case 'i':
        const emText = convertChildren(children, opts, depth).trim();
        return emText ? '*' + emText + '*' : '';

      case 'del':
      case 's':
      case 'strike':
        const delText = convertChildren(children, opts, depth).trim();
        return delText ? '~~' + delText + '~~' : '';

      case 'a': {
        const href = node.getAttribute('href') || '';
        const linkText = convertChildren(children, opts, depth).trim();
        if (!href || href === linkText) return linkText;
        const fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? opts.baseUrl + href : href);
        // Wrap URL in <> if it contains special chars (Obsidian compatible)
        const safeUrl = /[()\s]/.test(fullUrl) ? '<' + fullUrl + '>' : fullUrl;
        return '[' + linkText + '](' + safeUrl + ')';
      }

      case 'img': {
        if (!opts.includeImages) return '';
        const src = node.getAttribute('src') || '';
        const alt = (node.getAttribute('alt') || '').replace(/[\[\]]/g, '');
        if (!src) return '';
        const fullSrc = src.startsWith('http') ? src : (src.startsWith('/') ? opts.baseUrl + src : src);
        // Obsidian: wrap long/complex URLs in <> for safety
        const safeUrl = '<' + fullSrc + '>';
        return '\n![' + alt + '](' + safeUrl + ')\n';
      }

      // Container elements
      case 'div': {
        // Detect code block wrappers: div that contains <pre> as child
        const preEl = node.querySelector(':scope > pre');
        if (!preEl) {
          // Also check for non-direct children
          const anyPre = node.querySelector('pre');
          if (anyPre && isLikelyCodeBlockWrapper(node)) {
            return convertNode(anyPre, opts, depth);
          }
        }
        if (preEl) {
          let lang = '';

          // Strategy 1: Check wrapper data attributes
          for (const attr of ['data-language', 'data-lang']) {
            const val = node.getAttribute(attr);
            if (val && isValidLanguage(val)) { lang = val.toLowerCase(); break; }
          }

          // Strategy 2: Look for header/label elements with various class patterns
          if (!lang) {
            const header = node.querySelector(
              ':scope > [class*="header"], :scope > [class*="label"], :scope > [class*="lang"]'
            );
            if (header) {
              lang = extractLanguageFromHeader(header);
            }
          }

          // Strategy 3: Search non-pre children for text matching a known language name
          if (!lang) {
            for (const child of node.children) {
              if (child.tagName.toLowerCase() === 'pre') continue;
              const text = getNodeText(child).trim().toLowerCase();
              if (!text) continue;
              if (KNOWN_LANGUAGES.has(text)) { lang = text; break; }
              const firstWord = text.split(/[\s/|(\-]/)[0];
              if (firstWord && KNOWN_LANGUAGES.has(firstWord)) { lang = firstWord; break; }
            }
          }

          // Strategy 4: Fall back to code element analysis
          const codeEl = preEl.querySelector('code');
          if (!lang && codeEl) lang = extractCodeLanguage(codeEl, lang);

          const code = codeEl ? getRawTextContent(codeEl).trimEnd() : getRawTextContent(preEl).trimEnd();

          // Strategy 5: Detect language from code content
          if (!lang) lang = detectLanguageFromContent(code);

          return '```' + lang + '\n' + code + '\n```\n\n';
        }
        return convertChildren(children, opts, depth);
      }

      case 'section':
      case 'article':
      case 'main':
      case 'header':
      case 'footer':
      case 'nav':
      case 'aside':
      case 'figure':
      case 'figcaption':
        return convertChildren(children, opts, depth);

      case 'span':
        return convertChildren(children, opts, depth);

      case 'math': {
        const mathText = getNodeText(node);
        return mathText ? '$' + mathText + '$' : '';
      }

      case 'sup':
        const supText = convertChildren(children, opts, depth).trim();
        return supText ? '^' + supText + '^' : '';

      case 'sub':
        const subText = convertChildren(children, opts, depth).trim();
        return subText ? '~' + subText + '~' : '';

      // Skip UI elements
      case 'button':
      case 'svg':
      case 'path':
      case 'rect':
      case 'circle':
      case 'polyline':
      case 'polygon':
      case 'line':
      case 'ellipse':
      case 'g':
        return '';

      default:
        return convertChildren(children, opts, depth);
    }
  }

  function convertChildren(children, opts, depth) {
    return children.map(c => convertNode(c, opts, depth)).join('');
  }

  function getRawTextContent(node) {
    if (!node) return '';
    return node.textContent || '';
  }

  function isLikelyCodeBlockWrapper(node) {
    const cls = (node.className || '').toLowerCase();
    return /code|pre|source|snippet/.test(cls);
  }

  // Common language names for validation
  const KNOWN_LANGUAGES = new Set([
    'bash', 'sh', 'shell', 'zsh',
    'python', 'py', 'python3',
    'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
    'java', 'kotlin', 'scala', 'groovy',
    'c', 'cpp', 'cxx', 'c++', 'csharp', 'cs', 'dotnet',
    'go', 'golang', 'rust', 'rs',
    'ruby', 'rb', 'perl', 'pl', 'php',
    'swift', 'objectivec', 'objc',
    'html', 'xml', 'svg', 'css', 'scss', 'sass', 'less',
    'sql', 'mysql', 'postgresql', 'sqlite',
    'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config',
    'markdown', 'md', 'tex', 'latex',
    'dockerfile', 'docker', 'nginx', 'apache',
    'powershell', 'ps1', 'cmd', 'batch',
    'r', 'matlab', 'octave',
    'lua', 'vim', 'elixir', 'erlang', 'haskell', 'hs',
    'clojure', 'lisp', 'scheme',
    'dart', 'flutter',
    'graphql', 'regex',
    'solidity', 'vyper'
  ]);

  // Words that look like language names but aren't (from Gemini's code block headers)
  const LANGUAGE_FALSE_POSITIVES = new Set([
    'formatted', 'format', 'output', 'result', 'code', 'text',
    'example', 'snippet', 'block', 'content', 'sample', 'response',
    'answer', 'copy', 'run', 'execute', 'command', 'line', 'plain',
    'snippet', 'source', 'console', 'terminal', 'script'
  ]);

  function isValidLanguage(lang) {
    if (!lang) return false;
    const lower = lang.toLowerCase().trim();
    if (LANGUAGE_FALSE_POSITIVES.has(lower)) return false;
    if (KNOWN_LANGUAGES.has(lower)) return true;
    return /^[a-z0-9+#]{1,15}$/.test(lower);
  }

  function detectLanguageFromContent(code) {
    if (!code || code.length < 2) return '';
    const trimmed = code.trim();
    const firstLine = trimmed.split('\n')[0].trim();

    // Shebang
    if (firstLine.startsWith('#!/bin/bash') || firstLine.startsWith('#!/bin/sh')) return 'bash';
    if (firstLine.startsWith('#!/usr/bin/env python')) return 'python';
    if (firstLine.startsWith('#!/usr/bin/env node')) return 'javascript';
    if (firstLine.startsWith('#!')) return 'bash';

    // Shell/bash patterns
    if (/^\$\s/.test(firstLine)) return 'bash';
    if (/^(sudo|apt|yum|brew|pip|npm|npx|cargo|git|docker|kubectl|systemctl)\s/.test(firstLine)) return 'bash';
    if (/^(cd|ls|mkdir|rm|cp|mv|chmod|chown|cat|echo|grep|sed|awk|find|curl|wget|tar|ssh|scp)\s/.test(firstLine)) return 'bash';
    if (/^(export|source|alias|unset)\s/.test(firstLine)) return 'bash';
    if (trimmed.includes(' && ') || trimmed.includes(' | ') || trimmed.includes(' > ')) return 'bash';

    // Python
    if (/^(import |from \w)/.test(firstLine)) return 'python';
    if (/^(def |class |if __name__|print\(|lambda |@)/.test(firstLine)) return 'python';
    if (trimmed.includes('self.') && !trimmed.includes('this.')) return 'python';

    // JavaScript/TypeScript
    if (/^(const |let |var |function |export |import )/.test(firstLine)) return 'javascript';
    if (/=>\s*[{(]/.test(firstLine) || trimmed.includes('console.log(')) return 'javascript';
    if (/:\s*(string|number|boolean|any|void)\b/.test(trimmed)) return 'typescript';

    // HTML
    if (/^<!DOCTYPE|^<html|^<div|^<head|^<body/i.test(firstLine)) return 'html';

    // CSS
    if (/^[\w.-]+\s*\{/.test(firstLine) || /^(body|div|\.|#|@media)/.test(firstLine)) return 'css';

    // JSON
    if (/^[\{\[]/.test(firstLine) && /^[\{\[]/.test(trimmed) && /[\}\]]$/.test(trimmed)) return 'json';

    // SQL
    if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(firstLine)) return 'sql';

    // Go
    if (/^(package |func |import \(|type \w+ struct)/.test(firstLine)) return 'go';

    // Rust
    if (/^(fn |let |pub |use |impl |mod )/.test(firstLine)) return 'rust';

    // Java/C#
    if (/^(public |private |protected |static )/.test(firstLine) && trimmed.includes('class ')) return 'java';
    if (/^using\s/.test(firstLine)) return 'csharp';

    // Ruby
    if (/^(require|puts|def |end$|class |module )/.test(firstLine)) return 'ruby';

    // YAML
    if (/^---\n/.test(trimmed) && /^\w+:/m.test(trimmed)) return 'yaml';

    return '';
  }

  function extractCodeLanguage(codeEl, headerHint) {
    // 0. Check data attributes on code element and parent pre
    const checkEls = [codeEl, codeEl.closest('pre')].filter(Boolean);
    for (const el of checkEls) {
      for (const attr of ['data-language', 'data-lang']) {
        const val = el.getAttribute(attr);
        if (val && isValidLanguage(val)) return val.toLowerCase();
      }
    }

    // 1. Try from code element class
    const className = codeEl.className || '';
    const match = className.match(/(?:language|lang)-([a-zA-Z0-9+#]+)/i);
    if (match && isValidLanguage(match[1])) return match[1].toLowerCase();

    // 2. Try other classes (but ignore generic names)
    const classes = className.split(/\s+/);
    for (const cls of classes) {
      const c = cls.trim().toLowerCase();
      if (c && isValidLanguage(c)) return c;
    }

    // 3. Try from header hint (passed from code block wrapper header)
    if (headerHint) {
      const headerMatch = headerHint.match(/^([A-Za-z0-9+#\-.]+)/);
      if (headerMatch && isValidLanguage(headerMatch[1])) {
        return headerMatch[1].toLowerCase();
      }
    }

    return '';
  }

  function extractLanguageFromHeader(headerEl) {
    if (!headerEl) return '';
    const text = getNodeText(headerEl);
    // Try to extract first word that looks like a language
    const match = text.match(/^([A-Za-z0-9+#\-.]+)/);
    if (match && isValidLanguage(match[1])) {
      return match[1].toLowerCase();
    }
    // Try splitting on common delimiters
    for (const word of text.split(/[\s/|(\-,:;]/)) {
      const w = word.trim().toLowerCase();
      if (w && KNOWN_LANGUAGES.has(w)) return w;
    }
    return '';
  }

  function convertListItems(listEl, opts, depth, isOrdered) {
    const items = Array.from(listEl.children).filter(c => c.tagName.toLowerCase() === 'li');
    let result = '';
    items.forEach((item, index) => {
      const prefix = isOrdered ? `${index + 1}. ` : '- ';
      const indent = '  '.repeat(depth);

      // Check for nested lists
      const nestedLists = item.querySelectorAll(':scope > ul, :scope > ol');
      let itemContent = '';

      // Process direct children, handling nested lists specially
      Array.from(item.childNodes).forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childTag = child.tagName.toLowerCase();
          if (childTag === 'ul' || childTag === 'ol') {
            itemContent += '\n' + convertListItems(child, opts, depth + 1, childTag === 'ol');
          } else {
            itemContent += convertNode(child, opts, depth);
          }
        } else {
          itemContent += convertNode(child, opts, depth);
        }
      });

      result += indent + prefix + itemContent.trim() + '\n';
    });
    return result + '\n';
  }

  function convertTable(tableEl, opts) {
    const rows = tableEl.querySelectorAll('tr');
    if (rows.length === 0) return '';

    let result = '';
    let hasHeader = false;

    // Check if first row contains th elements
    const firstRow = rows[0];
    const headerCells = firstRow.querySelectorAll('th');
    if (headerCells.length > 0) {
      hasHeader = true;
    }

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length === 0) return;

      const cellTexts = Array.from(cells).map(c => {
        const text = convertChildren(c.childNodes, opts, 0).trim()
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ');
        return ' ' + text + ' ';
      });

      result += '|' + cellTexts.join('|') + '|\n';

      // Add separator after header row
      if (hasHeader && rowIndex === 0) {
        const separators = Array.from(cells).map(() => ' --- ');
        result += '|' + separators.join('|') + '|\n';
      }
    });

    return result + '\n';
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function imageNameForIndex(index, prefix) {
    const p = prefix ? `${prefix}_` : '';
    return `${p}image_${String(index).padStart(2, '0')}.png`;
  }

  function imagePathForIndex(index, imageFolder, prefix) {
    const name = imageNameForIndex(index, prefix);
    return imageFolder ? `${imageFolder}/${name}` : name;
  }

  /**
   * Generate a short unique prefix for image filenames based on conversation title and timestamp.
   * This prevents filename collisions when exporting multiple conversations.
   */
  function generateImagePrefix(conversation) {
    const title = (conversation.title || 'untitled').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '').substring(0, 12);
    const ts = (conversation.timestamp || new Date().toISOString()).replace(/[^0-9]/g, '').substring(8, 14); // HHmmss
    return `${title}_${ts}`;
  }

  function replaceImageReferences(markdown, images, startIndex, imageFolder, prefix) {
    let nextIndex = startIndex;
    let result = markdown || '';
    const entries = [];
    const matchedSources = new Set();

    (images || []).forEach((img) => {
      nextIndex++;
      const imgName = imageNameForIndex(nextIndex, prefix);
      const imgPath = imagePathForIndex(nextIndex, imageFolder, prefix);
      const entry = { img, imgName, imgPath, index: nextIndex, matched: false };
      entries.push(entry);

      if (!img || !img.src) return;

      const src = String(img.src);
      const before = result;
      const anglePattern = new RegExp(`<${escapeRegExp(src)}>`, 'g');
      result = result.replace(anglePattern, imgPath);

      if (result === before) {
        const plainPattern = new RegExp(escapeRegExp(src), 'g');
        result = result.replace(plainPattern, imgPath);
      }

      if (result !== before) {
        entry.matched = true;
        matchedSources.add(src);
      }
    });

    return { markdown: result, entries, matchedSources, nextIndex };
  }

  function appendUnmatchedImages(lines, replacement) {
    let appended = false;
    replacement.entries.forEach(({ img, imgName, imgPath, matched }) => {
      if (matched || !img || !img.src) return;
      lines.push(`![${img.alt || imgName}](${imgPath})`);
      appended = true;
    });
    if (appended) lines.push('');
  }

  function embedImageDataUrls(markdown, base64Results) {
    let result = markdown || '';
    (base64Results || []).forEach((imgResult) => {
      if (!imgResult || !imgResult.success || !imgResult.dataUrl) return;
      const imgName = imageNameForIndex(imgResult.index + 1);
      const pattern = new RegExp(`(!\\[[^\\]]*\\]\\()${escapeRegExp(imgName)}(\\))`, 'g');
      result = result.replace(pattern, `$1${imgResult.dataUrl}$2`);
    });
    return result;
  }

  // ===== AI Studio Conversation Extraction =====

  /**
   * Extract conversation from AI Studio (aistudio.google.com).
   * AI Studio uses Angular components: ms-chat-turn, ms-text-chunk, etc.
   */
  function extractAIStudioConversation() {
    const doc = document;
    const chatTurns = doc.querySelectorAll('ms-chat-turn');

    const turns = [];
    const seenUserTexts = new Set();

    chatTurns.forEach((chatTurn, index) => {
      const turnContainer = chatTurn.querySelector('[data-turn-role]');
      if (!turnContainer) return;

      const role = turnContainer.getAttribute('data-turn-role');

      const turn = {
        index: index,
        type: 'unknown',
        userText: null,
        userTextHtml: null,
        thoughtText: null,
        responseText: null,
        responseHtml: null,
        responseMarkdown: null,
        images: [],
        userImages: []
      };

      if (role === 'User') {
        // Extract user text from ms-text-chunk
        const textChunk = chatTurn.querySelector('ms-text-chunk');
        const userText = textChunk ? normalizeText(getNodeText(textChunk)) : '';

        if (userText && !seenUserTexts.has(userText)) {
          seenUserTexts.add(userText);
          turn.userText = userText;
          turn.userTextHtml = userText;
        }

        // Extract user images — capture ALL img elements (including blob: URLs)
        const userImgs = chatTurn.querySelectorAll('img');
        userImgs.forEach(imgEl => {
          let src = imgEl.getAttribute('src') || '';
          // Skip SVGs and watermarks
          if (src.startsWith('data:image/svg') || src.includes('watermark')) return;
          if (src) {
            if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
              src = src.startsWith('/') ? window.location.origin + src : src;
            }
            turn.userImages.push({
              src: src,
              alt: imgEl.getAttribute('alt') || '',
              width: imgEl.getAttribute('width') || '',
              height: imgEl.getAttribute('height') || ''
            });
          }
        });

        // Extract file attachments (ms-file-chunk)
        const fileChunk = chatTurn.querySelector('ms-file-chunk');
        if (fileChunk) {
          const nameSpan = fileChunk.querySelector('span');
          const fileName = nameSpan ? nameSpan.innerText.trim() : 'attachment';
          if (!turn.userText) {
            turn.userText = `[附件: ${fileName}]`;
            turn.userTextHtml = `[附件: ${fileName}]`;
          } else {
            turn.userText += `\n[附件: ${fileName}]`;
            turn.userTextHtml += `\n[附件: ${fileName}]`;
          }
        }

        if (turn.userText) {
          turn.type = 'user';
          turns.push(turn);
        }

      } else if (role === 'Model') {
        // Extract reasoning/thinking (in expansion panel)
        const chevronButton = Array.from(chatTurn.querySelectorAll('span')).find(
          span => span.textContent.trim() === 'chevron_right'
        );
        if (chevronButton) {
          // Check if reasoning panel is already expanded
          const expansionPanel = chatTurn.querySelector('.mat-expansion-panel-body ms-text-chunk');
          if (expansionPanel) {
            const reasoningText = normalizeText(expansionPanel.textContent);
            if (reasoningText) {
              turn.thoughtText = reasoningText;
            }
          }
        }

        // Extract model response text — must EXCLUDE text inside expansion panels (thinking)
        // Find all ms-text-chunk elements that are NOT inside .mat-expansion-panel-body
        const allTextChunks = chatTurn.querySelectorAll('ms-text-chunk');
        let responseTextChunk = null;
        for (const chunk of allTextChunks) {
          if (!chunk.closest('.mat-expansion-panel-body') && !chunk.closest('mat-expansion-panel')) {
            responseTextChunk = chunk;
            break;
          }
        }

        if (responseTextChunk) {
          const responseText = normalizeText(getNodeText(responseTextChunk));
          if (responseText) {
            turn.responseText = responseText;
            // Try to convert HTML to markdown
            turn.responseMarkdown = htmlToMarkdown(responseTextChunk);
            turn.responseHtml = responseTextChunk.innerHTML;
          }

          // Extract images from model response, filtering out watermark/UI images
          const imgs = chatTurn.querySelectorAll('img');
          imgs.forEach(img => {
            let src = img.getAttribute('src') || '';
            // Skip watermark images, SVGs, and tiny icon images
            if (src.includes('watermark') || src.startsWith('data:image/svg')) return;
            if (src) {
              if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
                src = src.startsWith('/') ? window.location.origin + src : src;
              }
              turn.images.push({
                src: src,
                alt: img.getAttribute('alt') || '',
                width: img.getAttribute('width') || '',
                height: img.getAttribute('height') || ''
              });
            }
          });
        }

        if (turn.responseMarkdown || turn.responseText) {
          turn.type = turn.userText ? 'qa' : 'model';
          turns.push(turn);
        }
      }
    });

    return {
      title: getConversationTitle(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      turns: turns
    };
  }

  // ===== Gemini Conversation Extraction =====

  function extractCurrentConversation() {
    // Delegate to site-specific extractor
    if (currentSite === SITE.AISTUDIO) {
      return extractAIStudioConversation();
    }
    return extractGeminiConversation();
  }

  function extractGeminiConversation() {
    const doc = document;
    let containers = doc.querySelectorAll(SELECTORS.conversationContainer);

    // Fallback: try broader selectors
    if (containers.length === 0) {
      containers = doc.querySelectorAll('user-query');
      if (containers.length > 0) {
        const virtualContainers = [];
        containers.forEach((userEl) => {
          const container = document.createElement('div');
          container.appendChild(userEl.cloneNode(true));
          let nextEl = userEl.nextElementSibling;
          while (nextEl && !nextEl.matches('model-response')) {
            nextEl = nextEl.nextElementSibling;
          }
          if (nextEl) {
            container.appendChild(nextEl.cloneNode(true));
          }
          virtualContainers.push(container);
        });
        containers = virtualContainers;
      }
    }

    const turns = [];
    const seenUserTexts = new Set();

    containers.forEach((container, index) => {
      const turn = {
        index: index,
        type: 'unknown',
        userText: null,
        userTextHtml: null,
        thoughtText: null,
        responseText: null,
        responseHtml: null,
        responseMarkdown: null,
        images: []
      };

      // Extract user message
      let userTexts = [];
      const userQueryEl = queryWithFallback(container, SELECTORS.userQuery, FALLBACK_SELECTORS.userQuery);

      // Extract images from user message (uploaded attachments)
      turn.userImages = [];
      if (userQueryEl) {
        const collectImagesFromEl = (root) => {
          const imgs = root.querySelectorAll('img');
          imgs.forEach(img => {
            let src = img.getAttribute('src') ||
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-lazy-src') || '';
            if (src && !src.startsWith('data:image/svg')) {
              if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
                src = src.startsWith('/') ? window.location.origin + src : src;
              }
              turn.userImages.push({
                src: src,
                alt: img.getAttribute('alt') || '',
                width: img.getAttribute('width') || '',
                height: img.getAttribute('height') || ''
              });
            }
          });
          // Also check background-image
          root.querySelectorAll('[style*="background-image"]').forEach(el => {
            const style = el.getAttribute('style') || '';
            const urlMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
            if (urlMatch) {
              let src = urlMatch[1];
              if (src && !src.startsWith('data:image/svg')) {
                if (!src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
                  src = src.startsWith('/') ? window.location.origin + src : src;
                }
                if (!turn.userImages.find(i => i.src === src)) {
                  turn.userImages.push({ src, alt: '', width: '', height: '' });
                }
              }
            }
          });
        };
        collectImagesFromEl(userQueryEl);
      }

      if (userQueryEl) {
        const lines = userQueryEl.querySelectorAll(SELECTORS.userTextLine);
        if (lines.length > 0) {
          userTexts = Array.from(lines).map(el => normalizeText(getNodeText(el)));
        }
      }

      if (userTexts.length === 0 && userQueryEl) {
        const paragraphs = userQueryEl.querySelectorAll(SELECTORS.userParagraph);
        if (paragraphs.length > 0) {
          userTexts = Array.from(paragraphs).map(el => normalizeText(getNodeText(el)));
        }
      }

      if (userTexts.length === 0 && userQueryEl) {
        const textNode = userQueryEl.querySelector(SELECTORS.userText);
        if (textNode) {
          userTexts = [normalizeText(getNodeText(textNode))];
        }
      }

      if (userTexts.length === 0 && userQueryEl) {
        const text = normalizeText(getNodeText(userQueryEl));
        if (text) userTexts = [text];
      }

      userTexts = userTexts.filter(Boolean);
      if (userTexts.length > 0) {
        const combined = normalizeText(userTexts.join('\n'));
        if (!seenUserTexts.has(combined)) {
          seenUserTexts.add(combined);
          turn.userText = combined;
          if (userQueryEl) {
            turn.userTextHtml = htmlToMarkdown(userQueryEl);
          }
        }
      }

      // Extract model response with full HTML conversion
      const modelResponseEl = queryWithFallback(container, SELECTORS.modelResponse, FALLBACK_SELECTORS.modelResponse);
      const responseContainerEl = container.querySelector(SELECTORS.responseContainer);
      const modelRoot = responseContainerEl || modelResponseEl;

      if (modelRoot) {
        const markdownNode = queryWithFallback(modelRoot, SELECTORS.modelMarkdown, FALLBACK_SELECTORS.modelMarkdown);
        if (markdownNode) {
          // Store plain text as fallback
          turn.responseText = normalizeText(getNodeText(markdownNode));
          turn.responseHtml = markdownNode.innerHTML;
          // Convert HTML to rich Markdown
          turn.responseMarkdown = htmlToMarkdown(markdownNode);

          // Extract images - search in broader scope, check multiple src attributes
          const allImgs = modelRoot.querySelectorAll('img');
          turn.images = Array.from(allImgs).map(img => {
            let src = img.getAttribute('src') ||
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-lazy-src') || '';
            // Normalize to full URL (must match htmlToMarkdown behavior)
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
              src = src.startsWith('/') ? window.location.origin + src : src;
            }
            // Try srcset for higher resolution
            const srcset = img.getAttribute('srcset');
            if (srcset && !src) {
              let firstSrc = srcset.split(',')[0].trim().split(' ')[0];
              if (firstSrc) {
                if (!firstSrc.startsWith('http') && !firstSrc.startsWith('data:')) {
                  firstSrc = firstSrc.startsWith('/') ? window.location.origin + firstSrc : firstSrc;
                }
                src = firstSrc;
              }
            }
            return {
              src: src,
              alt: img.getAttribute('alt') || '',
              width: img.getAttribute('width') || '',
              height: img.getAttribute('height') || ''
            };
          }).filter(img => img.src && !img.src.startsWith('data:image/svg'));

          // Also look for images in background-image CSS
          const bgElements = modelRoot.querySelectorAll('[style*="background-image"]');
          bgElements.forEach(el => {
            const style = el.getAttribute('style') || '';
            const urlMatch = style.match(/background-image\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
            if (urlMatch) {
              let src = urlMatch[1];
              if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                src = src.startsWith('/') ? window.location.origin + src : src;
              }
              if (src && !turn.images.find(i => i.src === src)) {
                turn.images.push({ src, alt: '', width: '', height: '' });
              }
            }
          });

          // Also look for images in shadow DOM or custom elements
          const lazyImages = modelRoot.querySelectorAll('[data-src], [data-lazy-src]');
          lazyImages.forEach(img => {
            if (img.tagName.toLowerCase() !== 'img') {
              let src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
              if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                src = src.startsWith('/') ? window.location.origin + src : src;
              }
              if (src && !turn.images.find(i => i.src === src)) {
                turn.images.push({ src, alt: img.getAttribute('alt') || '', width: '', height: '' });
              }
            }
          });
        } else {
          const fallbackText = normalizeText(getNodeText(modelRoot));
          if (fallbackText) {
            turn.responseText = fallbackText;
            turn.responseMarkdown = fallbackText;
          }
        }

        // Extract thoughts
        const thoughts = modelRoot.querySelector(SELECTORS.modelThoughts);
        if (thoughts) {
          const body = thoughts.querySelector(SELECTORS.thoughtsBody);
          const thoughtText = normalizeText(getNodeText(body));
          if (thoughtText && !/显示思路|Show thoughts|Thinking process|展开思路/i.test(thoughtText)) {
            turn.thoughtText = thoughtText;
          }
        }
      }

      // Determine turn type
      if (turn.userText && turn.responseMarkdown) turn.type = 'qa';
      else if (turn.userText) turn.type = 'user';
      else if (turn.responseMarkdown) turn.type = 'model';

      if (turn.userText || turn.responseMarkdown) {
        turns.push(turn);
      }
    });

    return {
      title: getConversationTitle(),
      url: window.location.href,
      timestamp: new Date().toISOString(),
      turns: turns
    };
  }

  function getConversationTitle() {
    if (currentSite === SITE.AISTUDIO) {
      // AI Studio title selectors
      const titleEl = document.querySelector('.actions.pointer.mode-title');
      if (titleEl) return normalizeText(getNodeText(titleEl));

      // Fallback: page title
      if (document.title && document.title !== 'Google AI Studio') {
        return normalizeText(document.title);
      }

      // Fallback: first user message
      const firstUserTurn = document.querySelector('ms-chat-turn [data-turn-role="User"]');
      if (firstUserTurn) {
        const chatTurn = firstUserTurn.closest('ms-chat-turn');
        const textChunk = chatTurn ? chatTurn.querySelector('ms-text-chunk') : null;
        if (textChunk) {
          const text = normalizeText(getNodeText(textChunk));
          if (text) return text.substring(0, 50) + (text.length > 50 ? '...' : '');
        }
      }

      return 'AI Studio Conversation';
    }

    // Gemini title logic
    let titleEl = document.querySelector(SELECTORS.topBarTitle);
    if (titleEl) return normalizeText(getNodeText(titleEl));

    const h1 = document.querySelector(SELECTORS.pageTitle);
    if (h1) {
      const text = normalizeText(getNodeText(h1));
      if (text && text !== 'Gemini') return text;
    }

    if (document.title && document.title !== 'Gemini') {
      return normalizeText(document.title);
    }

    const userQueries = queryAllWithFallback(document, SELECTORS.userQuery, FALLBACK_SELECTORS.userQuery);
    if (userQueries.length > 0) {
      const firstUser = userQueries[0];
      const textNode = firstUser.querySelector(SELECTORS.userText) || firstUser;
      const text = normalizeText(getNodeText(textNode));
      if (text) {
        return text.substring(0, 50) + (text.length > 50 ? '...' : '');
      }
    }

    return 'Gemini Conversation';
  }

  // ===== AI Studio Conversation List =====

  function extractAIStudioConversationList() {
    // AI Studio doesn't have a sidebar conversation list like Gemini.
    // Return empty - the current conversation can still be exported.
    return [];
  }

  // ===== Conversation List Extraction =====

  function extractConversationList() {
    if (currentSite === SITE.AISTUDIO) {
      return extractAIStudioConversationList();
    }
    return extractGeminiConversationList();
  }

  function extractGeminiConversationList() {
    let items = document.querySelectorAll(SELECTORS.historyItem);

    if (items.length === 0) {
      for (const fb of FALLBACK_SELECTORS.historyItem) {
        items = document.querySelectorAll(fb);
        if (items.length > 0) break;
      }
    }

    if (items.length === 0) {
      const sidebar = document.querySelector('mat-sidenav') || document.querySelector('nav') || document.body;
      const links = sidebar.querySelectorAll('a[href*="/app/"]');
      const uniqueItems = [];
      links.forEach(link => {
        const container = link.closest('div, li, history-item, [role="listitem"]') || link.parentElement;
        if (container && !uniqueItems.includes(container)) {
          uniqueItems.push(container);
        }
      });
      items = uniqueItems;
    }

    const conversations = [];

    items.forEach((item, index) => {
      const link = item.querySelector('a') || item;
      const titleEl = queryWithFallback(item, SELECTORS.conversationTitle, FALLBACK_SELECTORS.conversationTitle);

      if (link && titleEl) {
        const href = link.getAttribute('href');
        const title = normalizeText(getNodeText(titleEl));
        const isSelected = item.classList.contains('selected') ||
                          item.closest('.selected') !== null ||
                          link.classList.contains('selected');

        if (title && href) {
          conversations.push({
            index: index,
            id: extractConversationId(href),
            title: title,
            href: href,
            url: href.startsWith('http') ? href : `https://gemini.google.com${href}`,
            isSelected: isSelected,
            timestamp: null
          });
        }
      }
    });

    return conversations;
  }

  function extractConversationId(href) {
    const match = href.match(/\/app\/(?:[a-z0-9]+\/)?([a-zA-Z0-9_-]+)/);
    return match ? match[1] : href;
  }

  // ===== Export Formats =====

  function toMarkdown(conversation, options = {}) {
    const opts = { includeImages: true, includeThoughts: true, imageFolder: 'images', ...options };
    const lines = [];
    const imgPrefix = generateImagePrefix(conversation);
    const isAIStudio = conversation.url && conversation.url.includes('aistudio.google.com');
    const modelName = isAIStudio ? 'Gemini (AI Studio)' : 'Gemini';
    lines.push(`# ${conversation.title}`);
    lines.push('');
    lines.push(`- **URL:** ${conversation.url}`);
    lines.push(`- **Date:** ${conversation.timestamp}`);
    lines.push(`- **Turns:** ${conversation.turns.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    let globalImgIdx = 0;

    conversation.turns.forEach((turn, i) => {
      if (turn.userText) {
        lines.push(`## User`);
        lines.push('');
        let userMd = turn.userTextHtml || turn.userText;
        let userImageReplacement = null;
        if (opts.includeImages && turn.userImages && turn.userImages.length > 0) {
          userImageReplacement = replaceImageReferences(userMd, turn.userImages, globalImgIdx, opts.imageFolder, imgPrefix);
          userMd = userImageReplacement.markdown;
          globalImgIdx = userImageReplacement.nextIndex;
        }
        lines.push(userMd);
        lines.push('');

        if (userImageReplacement) appendUnmatchedImages(lines, userImageReplacement);
      }

      if (opts.includeThoughts && turn.thoughtText) {
        lines.push(`> **Thinking Process**`);
        lines.push('>');
        lines.push(turn.thoughtText.split('\n').map(l => '> ' + l).join('\n'));
        lines.push('');
      }

      if (turn.responseMarkdown || turn.responseText) {
        lines.push(`## ${modelName}`);
        lines.push('');
        let responseMd = turn.responseMarkdown || turn.responseText;
        let responseImageReplacement = null;
        if (opts.includeImages && turn.images && turn.images.length > 0) {
          responseImageReplacement = replaceImageReferences(responseMd, turn.images, globalImgIdx, opts.imageFolder, imgPrefix);
          responseMd = responseImageReplacement.markdown;
          globalImgIdx = responseImageReplacement.nextIndex;
        }
        lines.push(responseMd);
        lines.push('');

        if (responseImageReplacement) appendUnmatchedImages(lines, responseImageReplacement);
      }

      if (i < conversation.turns.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });

    return { text: lines.join('\n'), imagePrefix: imgPrefix };
  }

  function toObsidianFormat(conversation, options = {}) {
    const opts = { includeImages: true, includeThoughts: true, imageFolder: 'images', ...options };
    const lines = [];
    const date = new Date(conversation.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const imgPrefix = generateImagePrefix(conversation);
    const isAIStudio = conversation.url && conversation.url.includes('aistudio.google.com');
    const source = isAIStudio ? 'ai-studio' : 'gemini';
    const modelName = isAIStudio ? 'Gemini (AI Studio)' : 'Gemini';

    lines.push('---');
    lines.push(`title: "${conversation.title.replace(/"/g, '\\"')}"`);
    lines.push(`source: "${conversation.url}"`);
    lines.push(`date: ${dateStr}`);
    lines.push(`tags: [${source}, ai-chat]`);
    lines.push('---');
    lines.push('');

    lines.push(`# ${conversation.title}`);
    lines.push('');

    // Global image counter to match downloadImages numbering
    let globalImgIdx = 0;

    conversation.turns.forEach((turn, i) => {
      if (turn.userText) {
        lines.push(`### 💬 User`);
        lines.push('');
        let userMd = turn.userTextHtml || turn.userText;
        let userImageReplacement = null;
        if (opts.includeImages && turn.userImages && turn.userImages.length > 0) {
          userImageReplacement = replaceImageReferences(userMd, turn.userImages, globalImgIdx, opts.imageFolder, imgPrefix);
          userMd = userImageReplacement.markdown;
          globalImgIdx = userImageReplacement.nextIndex;
        }
        lines.push(userMd);
        lines.push('');

        if (userImageReplacement) appendUnmatchedImages(lines, userImageReplacement);
      }

      if (opts.includeThoughts && turn.thoughtText) {
        lines.push(`> [!info] Thinking Process`);
        lines.push('>');
        lines.push(turn.thoughtText.split('\n').map(l => '> ' + l).join('\n'));
        lines.push('');
      }

      if (turn.responseMarkdown || turn.responseText) {
        let md = turn.responseMarkdown || turn.responseText;
        let responseImageReplacement = null;
        if (opts.includeImages && turn.images && turn.images.length > 0) {
          responseImageReplacement = replaceImageReferences(md, turn.images, globalImgIdx, opts.imageFolder, imgPrefix);
          md = responseImageReplacement.markdown;
          globalImgIdx = responseImageReplacement.nextIndex;
        }

        lines.push(`### 🤖 ${modelName}`);
        lines.push('');
        lines.push(md);
        lines.push('');

        if (responseImageReplacement) appendUnmatchedImages(lines, responseImageReplacement);
      }

      if (i < conversation.turns.length - 1) {
        lines.push('---');
        lines.push('');
      }
    });

    return { text: lines.join('\n'), imagePrefix: imgPrefix };
  }

  function toJSON(conversation) {
    return JSON.stringify(conversation, null, 2);
  }

  // ===== Message Handling =====

  function handleMessage(request, sender, sendResponse) {
    if (request.action === 'extractConversation') {
      try {
        const data = extractCurrentConversation();
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'extractConversationList') {
      try {
        const data = extractConversationList();
        sendResponse({ success: true, data: data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'exportMarkdown') {
      const conv = extractCurrentConversation();
      processConversationImages(conv).then(() => {
        try {
          const result = toMarkdown(conv, {
            includeImages: request.includeImages !== false,
            includeThoughts: request.includeThoughts !== false,
            imageFolder: request.imageFolder
          });
          const defaultName = `${formatDateTime(conv.timestamp)}_${sanitizeFilename(conv.title)}.md`;
          const allImages = [];
          conv.turns.forEach((turn, tidx) => {
            if (turn.userImages) turn.userImages.forEach((img) => allImages.push({ ...img, turnIndex: tidx, source: 'user' }));
            if (turn.images) turn.images.forEach((img) => allImages.push({ ...img, turnIndex: tidx, source: 'model' }));
          });
          sendResponse({ success: true, content: result.text, title: conv.title, defaultFilename: defaultName, images: allImages, imagePrefix: result.imagePrefix });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      });
      return true;
    }

    if (request.action === 'exportObsidian') {
      const conv = extractCurrentConversation();
      processConversationImages(conv).then(async () => {
        try {
          const result = toObsidianFormat(conv, {
            includeImages: request.includeImages !== false,
            includeThoughts: request.includeThoughts !== false,
            imageFolder: request.imageFolder
          });
          const defaultName = `${formatDateTime(conv.timestamp)}_${sanitizeFilename(conv.title)}.md`;
          const allImages = [];
          conv.turns.forEach((turn, tidx) => {
            if (turn.userImages) turn.userImages.forEach((img) => allImages.push({ ...img, turnIndex: tidx, source: 'user' }));
            if (turn.images) turn.images.forEach((img) => allImages.push({ ...img, turnIndex: tidx, source: 'model' }));
          });

          let finalMd = result.text;
          // Embed images as base64 when requested (for Obsidian URI mode)
          if (request.embedImages && allImages.length > 0) {
            const base64Results = await fetchImagesAsBase64(allImages);
            for (const imgResult of base64Results) {
              if (!imgResult.success) continue;
              finalMd = embedImageDataUrls(finalMd, [imgResult]);
            }
          }

          sendResponse({ success: true, content: finalMd, title: conv.title, defaultFilename: defaultName, images: allImages, imagePrefix: result.imagePrefix });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      });
      return true;
    }

    if (request.action === 'exportJSON') {
      try {
        const conv = extractCurrentConversation();
        const json = toJSON(conv);
        const defaultName = `${formatDateTime(conv.timestamp)}_${sanitizeFilename(conv.title)}.json`;
        sendResponse({ success: true, content: json, title: conv.title, defaultFilename: defaultName });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === 'navigateToConversation') {
      const { url } = request;
      if (url) {
        window.location.href = url;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No URL provided' });
      }
      return true;
    }

    if (request.action === 'ping') {
      sendResponse({ success: true, url: window.location.href });
      return true;
    }

    if (request.action === 'fetchImagesAsBase64') {
      const { images } = request;
      fetchImagesAsBase64(images).then(results => {
        sendResponse({ success: true, results });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    // Fetch images via page context (called by background/popup for authenticated URLs)
    if (request.action === 'fetchImageViaPage') {
      const { imageUrls } = request;
      (async () => {
        const results = [];
        for (const url of (imageUrls || [])) {
          if (!url) {
            results.push({ success: false, error: 'No URL' });
            continue;
          }
          try {
            const dataUrl = await fetchImageInPage(url);
            if (dataUrl) {
              results.push({ success: true, dataUrl });
            } else {
              results.push({ success: false, error: 'Failed to fetch' });
            }
          } catch (err) {
            results.push({ success: false, error: err.message });
          }
        }
        sendResponse({ success: true, results });
      })();
      return true;
    }

    return false;
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(handleMessage);

  if (window.__GM_ENABLE_TEST_HOOKS__) {
    window.__GM_TEST_HOOKS__ = {
      toMarkdown,
      toObsidianFormat,
      embedImageDataUrls,
      replaceImageReferences
    };
  }

  // ===== Floating Export Button =====

  function createFloatingButton() {
    const existing = document.querySelector('.gm-export-btn');
    if (existing) existing.remove();

    const btn = document.createElement('button');
    btn.className = 'gm-export-btn';
    btn.innerHTML = '📥';
    btn.title = 'Gemini Manager: 导出当前对话';
    btn.addEventListener('click', async () => {
      try {
        const conv = extractCurrentConversation();
        const result = toMarkdown(conv);
        const md = result.text;
        const blob = new Blob([md], { type: 'text/markdown' });
        const defaultName = `${formatDateTime(conv.timestamp)}_${sanitizeFilename(conv.title)}.md`;

        // Use Chrome downloads API for save dialog
        chrome.runtime.sendMessage({
          action: 'download',
          content: md,
          filename: defaultName,
          mimeType: 'text/markdown'
        }, (response) => {
          if (response && response.success) {
            showToast('导出成功', 'success');
          } else {
            // Fallback: direct download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName;
            a.click();
            URL.revokeObjectURL(url);
            showToast('已下载: ' + defaultName, 'success');
          }
        });
      } catch (err) {
        showToast('导出失败: ' + err.message, 'error');
      }
    });

    document.body.appendChild(btn);
  }

  function showToast(message, type) {
    const existing = document.querySelector('.gm-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `gm-toast gm-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ===== Route Change Detection =====

  let lastUrl = location.href;

  function detectRouteChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[Gemini Manager] Route changed to', lastUrl);
      setTimeout(() => {
        createFloatingButton();
      }, 1500);
    }
  }

  function startRouteWatcher() {
    const routeObserver = new MutationObserver(() => {
      detectRouteChange();
    });

    routeObserver.observe(document.querySelector('body'), {
      childList: true,
      subtree: true
    });

    window.addEventListener('popstate', detectRouteChange);
    window.addEventListener('hashchange', detectRouteChange);
    setInterval(detectRouteChange, 2000);
  }

  // ===== Initialization =====

  function init() {
    createFloatingButton();
    startRouteWatcher();

    chrome.runtime.sendMessage({
      action: 'contentScriptReady',
      url: window.location.href,
      timestamp: Date.now()
    }).catch(() => {});

    console.log('[Gemini Manager] Content script initialized on', window.location.href);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
