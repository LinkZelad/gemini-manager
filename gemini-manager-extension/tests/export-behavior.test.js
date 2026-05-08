const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function loadContentHooks() {
  const source = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
  const sandbox = {
    console,
    setTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    FileReader: function FileReader() {},
    Blob: function Blob() {},
    fetch: async () => ({ blob: async () => ({}) }),
    location: { href: 'https://gemini.google.com/app/test' },
    window: {
      __GM_ENABLE_TEST_HOOKS__: true,
      location: { origin: 'https://gemini.google.com' },
      addEventListener: () => {}
    },
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      querySelector: () => null,
      createElement: () => ({})
    },
    chrome: {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: () => ({ catch: () => {} })
      }
    },
    MutationObserver: function MutationObserver() {
      this.observe = () => {};
    }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'content.js' });
  return sandbox.window.__GM_TEST_HOOKS__;
}

function loadPopupHooks(options = {}) {
  const source = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
  const elements = new Map();
  const calls = [];
  const getElement = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        checked: false,
        dataset: {},
        textContent: '',
        innerHTML: '',
        classList: { add: () => {}, remove: () => {} },
        addEventListener: () => {}
      });
    }
    return elements.get(id);
  };
  const sandbox = {
    console,
    setTimeout,
    Blob,
    URL,
    fetch: options.fetch || (async (url, fetchOptions) => {
      calls.push(['fetch', url, fetchOptions || null]);
      if (String(url).startsWith('data:')) {
        return { ok: true, blob: async () => ({ url }) };
      }
      throw new Error('remote fetch should not be called from popup');
    }),
    window: { __GM_ENABLE_TEST_HOOKS__: true, close: () => {} },
    document: {
      addEventListener: () => {},
      getElementById: getElement,
      querySelectorAll: () => [],
      createElement: () => ({ className: '', textContent: '', style: {}, remove: () => {} }),
      body: { appendChild: () => {} }
    },
    chrome: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: { get: async () => ({}), set: async () => {}, remove: async () => {} }
      },
      runtime: {
        openOptionsPage: () => calls.push(['openOptionsPage']),
        sendMessage: async (payload) => {
          calls.push(['sendMessage', payload]);
          return {
            success: true,
            results: [{ success: true, dataUrl: 'data:image/png;base64,AAA' }]
          };
        }
      },
      tabs: {},
      scripting: {},
      downloads: { download: () => {}, onChanged: { addListener: () => {}, removeListener: () => {} } }
    },
    indexedDB: {
      open: () => ({})
    },
    confirm: () => true
  };
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'popup.js' });
  return { hooks: sandbox.window.__GM_TEST_HOOKS__, elements, calls };
}

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result
        .then(() => console.log(`ok - ${name}`))
        .catch((err) => {
          console.error(`not ok - ${name}`);
          console.error(err.stack || err.message);
          process.exitCode = 1;
        });
      return;
    }
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

test('Obsidian base64 embedding replaces image references that have alt text', () => {
  const hooks = loadContentHooks();
  assert.ok(hooks, 'content test hooks should be exposed');
  const input = '![image_01.png](image_01.png)\n![diagram](image_02.png)';
  const output = hooks.embedImageDataUrls(input, [
    { success: true, index: 0, dataUrl: 'data:image/png;base64,AAA' },
    { success: true, index: 1, dataUrl: 'data:image/png;base64,BBB' }
  ]);
  assert.equal(output, '![image_01.png](data:image/png;base64,AAA)\n![diagram](data:image/png;base64,BBB)');
});

test('download export uses local image references instead of leaving remote duplicates', () => {
  const hooks = loadContentHooks();
  assert.ok(hooks, 'content test hooks should be exposed');
  const conversation = {
    title: 'With image',
    url: 'https://gemini.google.com/app/abc',
    timestamp: '2026-05-08T00:00:00.000Z',
    turns: [{
      userText: 'prompt',
      responseMarkdown: 'Here is it:\n![remote](<https://lh3.googleusercontent.com/a.png>)',
      images: [{ src: 'https://lh3.googleusercontent.com/a.png', alt: 'remote' }]
    }]
  };
  const md = hooks.toObsidianFormat(conversation, { imageFolder: '' });
  assert.ok(md.includes('![remote](image_01.png)'), md);
  assert.ok(!md.includes('lh3.googleusercontent.com'), md);
});

test('direct Obsidian export can reference images in an Images subfolder', () => {
  const hooks = loadContentHooks();
  assert.ok(hooks, 'content test hooks should be exposed');
  const conversation = {
    title: 'With image',
    url: 'https://gemini.google.com/app/abc',
    timestamp: '2026-05-08T00:00:00.000Z',
    turns: [{
      userText: 'prompt',
      responseMarkdown: 'Here is it:\n![remote](<https://lh3.googleusercontent.com/a.png>)',
      images: [{ src: 'https://lh3.googleusercontent.com/a.png', alt: 'remote' }]
    }]
  };
  const md = hooks.toObsidianFormat(conversation, { imageFolder: 'Images' });
  assert.ok(md.includes('![remote](Images/image_01.png)'), md);
});

test('Obsidian export respects includeThoughts=false', () => {
  const hooks = loadContentHooks();
  assert.ok(hooks, 'content test hooks should be exposed');
  const conversation = {
    title: 'No thoughts',
    url: 'https://gemini.google.com/app/abc',
    timestamp: '2026-05-08T00:00:00.000Z',
    turns: [{
      userText: 'prompt',
      thoughtText: 'internal chain',
      responseMarkdown: 'answer'
    }]
  };
  const md = hooks.toObsidianFormat(conversation, { includeThoughts: false });
  assert.ok(!md.includes('internal chain'), md);
  assert.ok(!md.includes('Thinking Process'), md);
});

test('batch export ignores manually entered single-conversation filename', () => {
  const { hooks, elements } = loadPopupHooks();
  assert.ok(hooks, 'popup test hooks should be exposed');
  elements.get('filename-input').value = 'current-conversation.md';
  assert.equal(
    hooks.getExportFilename('next-conversation.md', '.md', { preferInput: false }),
    'next-conversation.md'
  );
});

test('folder path is split safely for direct Obsidian directory writes', () => {
  const { hooks } = loadPopupHooks();
  assert.ok(hooks, 'popup test hooks should be exposed');
  assert.deepEqual(hooks.getSafePathParts('AI对话/Gemini'), ['AI对话', 'Gemini']);
  assert.deepEqual(hooks.getSafePathParts('/AI对话//Gemini/'), ['AI对话', 'Gemini']);
  assert.throws(() => hooks.getSafePathParts('../Vault'), /不能包含/);
});

test('popup opens the persistent options page for directory selection', async () => {
  const { hooks, calls } = loadPopupHooks();
  assert.ok(hooks, 'popup test hooks should be exposed');
  await hooks.openDirectorySetupPage();
  assert.deepEqual(calls, [['openOptionsPage']]);
});

test('direct directory export takes precedence over Obsidian URI mode', () => {
  const { hooks } = loadPopupHooks();
  assert.ok(hooks, 'popup test hooks should be exposed');
  assert.equal(
    hooks.shouldUseDirectWrite({ useDirectObsidianWrite: true, obsidianUseUri: true }, {}),
    true
  );
  assert.equal(
    hooks.shouldEmbedImagesForObsidian({ useDirectObsidianWrite: true, obsidianUseUri: true }, {}),
    false
  );
});

test('image fetch uses background fetch for remote images', async () => {
  const { hooks, calls } = loadPopupHooks();
  assert.ok(hooks, 'popup test hooks should be exposed');
  await hooks.imageToBlob({ src: 'https://lh3.googleusercontent.com/test.png' });
  const fetchCall = calls.find((entry) => entry[0] === 'fetch' && entry[1] === 'https://lh3.googleusercontent.com/test.png');
  assert.equal(fetchCall, undefined);
  const sendMessageCall = calls.find((entry) => entry[0] === 'sendMessage');
  assert.ok(sendMessageCall, 'background fetch should be used');
  assert.deepEqual(sendMessageCall[1], {
    action: 'fetchImagesAsBase64',
    images: ['https://lh3.googleusercontent.com/test.png']
  });
});
