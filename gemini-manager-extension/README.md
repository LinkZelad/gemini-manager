# Gemini Manager

一个 Chrome/Edge 浏览器扩展，用于管理、归档和导出 Google Gemini 和 Google AI Studio 的对话记录（支持导出至 Obsidian、Markdown 或 JSON 格式）。

## 功能特性

- **双平台支持**: 完美支持普通版 [Gemini (gemini.google.com)](https://gemini.google.com) 和专业版 [Google AI Studio (aistudio.google.com)](https://aistudio.google.com)。
- **选择性导出**: 可自由勾选想要导出的对话轮次（Turn），过滤无用对话，支持全选/全不选。
- **对话管理**: 查看侧边栏中的所有对话列表，支持搜索和筛选。
- **批量导出**: 一键将所有未归档的历史对话批量导出。
- **归档功能**: 标记重要对话为“已归档”（📦），方便分类管理，且在批量导出时可自动过滤掉不需要的归档或未归档对话。
- **多种导出格式**:
  - Markdown (`.md`) - 通用格式，包括 AI Studio 中的“思考过程”（Think Process）也可选导出。
  - Obsidian 格式 - 包含专属 YAML frontmatter，适配 Obsidian 的使用习惯。
  - JSON (`.json`) - 结构化数据，方便程序员二次处理。
- **强大图片保存能力**: 自动解析并下载对话中模型生成的图片及用户上传的图片。
- **三种 Obsidian 集成方式**:
  1. **直写目录 (推荐)**: 利用浏览器原生的文件系统 API (File System Access API)，直接写入你选择的本地文件夹及图片子文件夹，体验最流畅。
  2. **Obsidian URI**: 通过 URL Scheme 唤起 Obsidian 创建笔记，图片自动转为 Base64 嵌入。
  3. **传统下载**: 下载到系统的 Downloads 文件夹内指定子目录。

## 安装方法

### 开发者模式手动安装（推荐）

1. 下载并解压本扩展的 `.zip` 文件。
2. 打开 Chrome 或 Edge 浏览器，输入 `chrome://extensions/`（或 `edge://extensions/`）进入扩展管理页面。
3. 打开右上角的**开发者模式**开关。
4. 点击**加载已解压的扩展程序**。
5. 选择解压后的扩展根目录文件夹（包含 `manifest.json` 的文件夹）。
6. 建议将扩展图标固定到浏览器工具栏。

## 使用方法

### 基本使用

1. 打开 [gemini.google.com](https://gemini.google.com) 或 [aistudio.google.com](https://aistudio.google.com) 并在对话页面。
2. 点击浏览器右上角的 **Gemini Manager** 扩展图标。
3. 在弹出的面板中进行操作：
   - **当前对话**：可进行「导出全部」、「选择性导出」、「导出为 JSON」等。
   - **对话列表**：浏览侧栏历史对话，可搜索、归档或执行「导出全部会话」。
   - **设置**：配置 Obsidian 导出的各种偏好。

### 选择性导出

1. 在“当前对话”页面，点击右下角的 **☑️ 选择性导出**。
2. 面板会展开当前对话的所有轮次预览。
3. 勾选你需要的轮次（支持快速全选/全不选）。
4. 点击面板下方的导出按钮即可仅导出所选内容。

### 导出到 Obsidian

#### 方法 1: 直接写入目录（推荐，体验最佳）

1. 在扩展弹窗**设置**中点击 **"打开目录设置"**。
2. 点击 **"选择 Obsidian 目录"**，在弹出的系统对话框中选中你的 Obsidian Vault 目录（或任何你想要存放 Markdown 的固定目录），并授权浏览器允许写入。
3. 回到扩展弹窗，勾选 **"优先写入已选择目录"**。
4. 在 **"文件夹路径"** 中填写保存对话的子目录，例如 `AI对话/Gemini`。
5. 导出时，扩展会直接把 `.md` 写入该目录，如果对话有图片，图片会自动存入同目录下的 `Images/` 子目录。

#### 方法 2: 使用 Obsidian URI

1. 确保已安装 Obsidian 桌面应用。
2. 在扩展设置中取消勾选 "优先写入已选择目录"，然后勾选 **"使用 Obsidian URI 直接打开"**。
3. 填写你的 **Vault 名称**。
4. 导出时，将自动唤起本地 Obsidian 应用并创建笔记。图片会以内嵌 `data:image/...` (Base64) 形式写入 Markdown。

#### 方法 3: 传统浏览器下载

1. 取消勾选 "使用 Obsidian URI" 和 "优先写入已选择目录"。
2. 导出的 Markdown 会默认使用浏览器的下载功能下载到 `Downloads` 文件夹内。

### AI Studio 支持说明

AI Studio 与普通 Gemini 在底层架构上有巨大差异，本扩展做了深度适配：
- 支持获取非常长的上下文对话。
- 自动处理 AI Studio 中会过期的临时图片（Blob URL），确保导出时图片有效。
- 可选是否导出模型的“思考过程”(Think Process)。

## 技术架构

```
gemini-manager-extension/
├── manifest.json              # 扩展清单 (Manifest V3)
├── src/
│   ├── background/
│   │   └── background.js      # Service Worker
│   ├── content/
│   │   ├── content.js         # 内容脚本 - 核心的 DOM 解析、抽取与转换
│   │   └── content.css        # 内容脚本样式
│   ├── popup/
│   │   ├── popup.html         # 弹窗 UI 面板
│   │   ├── popup.css          # 弹窗样式 (含选择性导出面板等)
│   │   └── popup.js           # 弹窗逻辑与状态管理
│   ├── pages/
│   │   └── setup.html / .js   # 独立的目录授权页面
│   └── icons/                 # 扩展图标
└── README.md
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 读取当前页面的对话内容 |
| `storage` | 保存归档状态和扩展设置 |
| `downloads` | 下载 Markdown/JSON 文件及图片 |
| `scripting` | 在页面注入提取脚本 |
| `tabs` | 切换/打开对话标签页 |
| `host_permissions` | 仅在 `gemini.google.com` 和 `aistudio.google.com` 域运行 |

## 兼容性与限制

- **浏览器**: 支持现代 Chromium 内核浏览器（Chrome 88+, Edge 88+, Brave 等）。
- **File System Access API**: "直写目录"功能依赖此 API，隐身模式或较旧浏览器可能降级为普通下载。
- **DOM 依赖**: 本项目依赖网页版和 AI Studio 的 DOM 结构，若 Google 频繁更新前端结构，个别功能可能需要修复。

## 隐私声明

- **所有数据纯本地处理**，您的对话内容不会上传到任何第三方服务器。
- 数据仅在浏览器内存和本地 `chrome.storage` 之间流转。
- 扩展不收集任何用户行为数据或遥测信息。

## 许可证

MIT License
