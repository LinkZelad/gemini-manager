/**
 * Gemini Manager - Internationalization (i18n)
 */

const LANGUAGES = {
  zh: {
    // Header
    'status.waiting': '等待中',
    'status.connected': '已连接',
    'status.not_supported': '不支持的页面',

    // Tabs
    'tab.current': '当前对话',
    'tab.list': '对话列表',
    'tab.settings': '设置',

    // Current Conversation
    'current.title': '标题:',
    'current.turns': '轮次:',
    'current.filename': '文件名',
    'current.filename_placeholder': '对话标题.md',
    'current.export_md': '导出 Markdown',
    'current.export_obsidian': '导出到 Obsidian',
    'current.export_json': '导出 JSON',
    'current.selective_export': '选择性导出',
    'current.archive': '归档当前对话',

    // Selective Export
    'selective.title': '选择要导出的轮次',
    'selective.select_all': '全选',
    'selective.select_none': '全不选',
    'selective.loading': '加载中...',
    'selective.loading_turns': '正在加载对话轮次...',
    'selective.loading_aistudio': '正在扫描 AI Studio 对话（可能需要一些时间）...',
    'selective.no_turns': '没有可选轮次',
    'selective.load_failed': '加载失败',
    'selective.selected_count': '已选 {checked}/{total} 轮',
    'selective.export_md': '导出选中(MD)',
    'selective.export_obsidian': '导出选中(OB)',
    'selective.role_user': '👤 用户',
    'selective.role_model': '🤖 模型',
    'selective.no_content': '(无内容)',

    // Conversation List
    'list.refresh': '刷新',
    'list.export_all': '导出全部',
    'list.search_placeholder': '搜索对话...',
    'list.filter_all': '全部',
    'list.filter_active': '未归档',
    'list.filter_archived': '已归档',
    'list.loading': '正在加载对话列表...',
    'list.empty': '没有找到对话',
    'list.turns_count': '{n} 轮',

    // Settings - Obsidian
    'settings.obsidian': 'Obsidian 设置',
    'settings.vault_name': 'Vault 名称',
    'settings.vault_placeholder': '我的知识库',
    'settings.download_subdir': '下载子目录 (可同步到 Vault)',
    'settings.download_subdir_placeholder': 'GeminiExports',
    'settings.folder_path': '文件夹路径',
    'settings.folder_placeholder': 'AI对话/Gemini',
    'settings.direct_write': '直接写入 Obsidian 目录',
    'settings.open_dir_settings': '打开目录设置',
    'settings.dir_not_selected': '未选择目录',
    'settings.selected_dir': '已选择: {name}',
    'settings.prefer_direct_write': '优先写入已选择目录',
    'settings.use_obsidian_uri': '使用 Obsidian URI 直接打开 (需安装 Obsidian)',
    'settings.auto_filename': '自动生成文件名 (日期+标题)',

    // Settings - Experimental
    'settings.experimental': '实验性功能',
    'settings.enable_folders': '开启侧栏文件夹分类 (Gemini 专用)',
    'settings.enable_folders_tip': '开启后会在 Gemini 左侧边栏注入文件夹分类界面。由于高度依赖网页 DOM 结构，可能会失效或导致页面卡顿。',

    // Settings - Export
    'settings.export': '导出设置',
    'settings.default_format': '默认导出格式',
    'settings.include_thoughts': '包含思考过程 (thoughts)',

    // Settings - Data
    'settings.data': '数据管理',
    'settings.clear_archived': '清空归档数据',
    'settings.export_storage': '导出所有数据',
    'settings.save': '保存设置',

    // Settings - Language
    'settings.language': '语言 / Language',
    'settings.lang_zh': '中文',
    'settings.lang_en': 'English',

    // Export feedback
    'export.success': '导出成功',
    'export.failed': '导出失败',
    'export.downloaded': '已下载',
    'export.saved': '设置已保存',
    'export.save_failed': '保存失败',
    'export.batch_progress': '正在导出 {current}/{total}...',
    'export.batch_done': '批量导出完成: {count} 个文件',
    'export.no_conversations': '没有可导出的对话',
    'export.confirm_clear': '确认清空所有归档数据？',
    'export.cleared': '归档数据已清空',
    'export.browser_not_support': '当前浏览器不支持直接写入目录',

    // Footer
    'footer.version': 'Gemini Manager v1.0'
  },

  en: {
    // Header
    'status.waiting': 'Waiting',
    'status.connected': 'Connected',
    'status.not_supported': 'Unsupported page',

    // Tabs
    'tab.current': 'Current',
    'tab.list': 'History',
    'tab.settings': 'Settings',

    // Current Conversation
    'current.title': 'Title:',
    'current.turns': 'Turns:',
    'current.filename': 'Filename',
    'current.filename_placeholder': 'conversation_title.md',
    'current.export_md': 'Export Markdown',
    'current.export_obsidian': 'Export to Obsidian',
    'current.export_json': 'Export JSON',
    'current.selective_export': 'Selective Export',
    'current.archive': 'Archive Conversation',

    // Selective Export
    'selective.title': 'Select turns to export',
    'selective.select_all': 'All',
    'selective.select_none': 'None',
    'selective.loading': 'Loading...',
    'selective.loading_turns': 'Loading conversation turns...',
    'selective.loading_aistudio': 'Scanning AI Studio conversation (may take a while)...',
    'selective.no_turns': 'No turns available',
    'selective.load_failed': 'Load failed',
    'selective.selected_count': 'Selected {checked}/{total} turns',
    'selective.export_md': 'Export (MD)',
    'selective.export_obsidian': 'Export (OB)',
    'selective.role_user': '👤 User',
    'selective.role_model': '🤖 Model',
    'selective.no_content': '(no content)',

    // Conversation List
    'list.refresh': 'Refresh',
    'list.export_all': 'Export All',
    'list.search_placeholder': 'Search conversations...',
    'list.filter_all': 'All',
    'list.filter_active': 'Active',
    'list.filter_archived': 'Archived',
    'list.loading': 'Loading conversations...',
    'list.empty': 'No conversations found',
    'list.turns_count': '{n} turns',

    // Settings - Obsidian
    'settings.obsidian': 'Obsidian Settings',
    'settings.vault_name': 'Vault Name',
    'settings.vault_placeholder': 'My Vault',
    'settings.download_subdir': 'Download Subdirectory (sync to Vault)',
    'settings.download_subdir_placeholder': 'GeminiExports',
    'settings.folder_path': 'Folder Path',
    'settings.folder_placeholder': 'AI Chats/Gemini',
    'settings.direct_write': 'Write directly to Obsidian directory',
    'settings.open_dir_settings': 'Open Directory Settings',
    'settings.dir_not_selected': 'No directory selected',
    'settings.selected_dir': 'Selected: {name}',
    'settings.prefer_direct_write': 'Prefer writing to selected directory',
    'settings.use_obsidian_uri': 'Use Obsidian URI to open (requires Obsidian)',
    'settings.auto_filename': 'Auto-generate filename (date+title)',

    // Settings - Experimental
    'settings.experimental': 'Experimental Features',
    'settings.enable_folders': 'Enable sidebar folder management (Gemini only)',
    'settings.enable_folders_tip': 'Injects a folder UI into the Gemini sidebar. May break if the page DOM changes.',

    // Settings - Export
    'settings.export': 'Export Settings',
    'settings.default_format': 'Default export format',
    'settings.include_thoughts': 'Include thinking process (thoughts)',

    // Settings - Data
    'settings.data': 'Data Management',
    'settings.clear_archived': 'Clear Archived Data',
    'settings.export_storage': 'Export All Data',
    'settings.save': 'Save Settings',

    // Settings - Language
    'settings.language': '语言 / Language',
    'settings.lang_zh': '中文',
    'settings.lang_en': 'English',

    // Export feedback
    'export.success': 'Export successful',
    'export.failed': 'Export failed',
    'export.downloaded': 'Downloaded',
    'export.saved': 'Settings saved',
    'export.save_failed': 'Save failed',
    'export.batch_progress': 'Exporting {current}/{total}...',
    'export.batch_done': 'Batch export complete: {count} files',
    'export.no_conversations': 'No conversations to export',
    'export.confirm_clear': 'Confirm clearing all archived data?',
    'export.cleared': 'Archived data cleared',
    'export.browser_not_support': 'Browser does not support directory writing',

    // Footer
    'footer.version': 'Gemini Manager v1.0'
  }
};

let currentLang = 'zh';

function t(key, params = {}) {
  const lang = LANGUAGES[currentLang] || LANGUAGES.zh;
  let text = lang[key] || LANGUAGES.zh[key] || key;
  Object.entries(params).forEach(([k, v]) => {
    text = text.replace(`{${k}}`, v);
  });
  return text;
}

function setLanguage(lang) {
  if (!LANGUAGES[lang]) return;
  currentLang = lang;
  applyI18n();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
}

// Export for use in popup.js
if (typeof window !== 'undefined') {
  window.GM_I18N = { t, setLanguage, applyI18n, LANGUAGES, getCurrentLang: () => currentLang, setCurrentLang: (l) => { currentLang = l; } };
}
