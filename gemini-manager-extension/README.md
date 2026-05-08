# Gemini Manager

一个 Chrome 浏览器扩展，用于管理、归档和导出 Google Gemini 网页版的对话记录到 Obsidian。

## 功能特性

- **对话管理**: 查看 Gemini 侧边栏中的所有对话列表
- **归档功能**: 标记重要对话为已归档，方便分类管理
- **多种导出格式**:
  - Markdown (`.md`) - 通用格式，适合任何笔记软件
  - Obsidian 格式 - 带 YAML frontmatter，完美适配 Obsidian
  - JSON (`.json`) - 结构化数据，方便程序处理
- **Obsidian 集成**:
  - 支持 Obsidian URI Scheme 直接创建笔记
  - 可配置 Vault 名称和目标文件夹
  - 自动生成文件名（日期+标题）
- **键盘快捷键**:
  - `Ctrl+Shift+M` / `Cmd+Shift+M` - 导出 Markdown
  - `Ctrl+Shift+O` / `Cmd+Shift+O` - 导出到 Obsidian
- **右键菜单**: 在 Gemini 页面右键即可快速导出

## 安装方法

### 开发者模式安装（推荐）

1. 下载并解压本扩展文件夹
2. 打开 Chrome 浏览器，输入 `chrome://extensions/` 进入扩展管理页面
3. 打开右上角的**开发者模式**开关
4. 点击**加载已解压的扩展程序**
5. 选择本扩展的根目录文件夹
6. 扩展图标将出现在 Chrome 工具栏中

### 从 Chrome Web Store 安装（暂未上架）

等待后续更新...

## 使用方法

### 基本使用

1. 打开 [gemini.google.com](https://gemini.google.com) 并登录
2. 点击 Chrome 工具栏中的 **Gemini Manager** 图标
3. 在弹出窗口中:
   - **当前对话**标签页: 查看并导出当前打开的会话
   - **对话列表**标签页: 浏览所有历史对话，进行归档/取消归档
   - **设置**标签页: 配置 Obsidian 导出选项

### 导出到 Obsidian

#### 方法 1: 直接写入 Obsidian 目录 (推荐)

1. 在 Obsidian 中确定要保存 Gemini 对话的目录，例如 `AI对话/Gemini`
2. 在扩展弹窗设置中点击 **"打开目录设置"**，会打开一个独立设置页
3. 在独立设置页点击 **"选择 Obsidian 目录"**，选择你的 Obsidian Vault 根目录，或直接选择某个固定导出目录
4. 回到扩展弹窗，勾选 **"优先写入已选择目录"**
5. 在 **"文件夹路径"** 中填写保存对话的子目录，例如 `AI对话/Gemini`
6. 点击"导出到 Obsidian"，扩展会把 Markdown 写入该目录，并把图片写入同目录下的 `Images/` 子目录

如果你直接选择的是 `AI对话/Gemini` 目录本身，可以把 **"文件夹路径"** 留空，这样 Markdown 会直接写进你选择的目录，图片会写进其中的 `Images/` 子目录。

#### 方法 2: 使用 Obsidian URI

1. 确保已安装 Obsidian 桌面应用
2. 在扩展设置中勾选 **"使用 Obsidian URI 直接打开"**
3. 填写你的 **Vault 名称** 和 **文件夹路径**
4. 点击"导出到 Obsidian"按钮，将自动在 Obsidian 中创建新笔记
5. 对话中的图片会以内嵌 `data:image/...` 的形式写入 Markdown，适合直接通过 URI 创建笔记

#### 方法 3: 下载到 Downloads 子目录

1. 在扩展设置中取消勾选 "使用 Obsidian URI"
2. 取消勾选 "优先写入已选择目录"，或不选择目录
3. 设置文件夹路径（如 `AI对话/Gemini`）
4. 可选设置"下载子目录"（如 `GeminiExports`）
5. 导出的 Markdown 和图片会下载到 `Downloads/GeminiExports/AI对话/Gemini/`
6. 将该目录软链接、同步或移动到 Obsidian Vault 中:
   ```bash
   # macOS/Linux
   ln -s ~/Downloads/GeminiExports/AI对话 ~/Documents/ObsidianVault/AI对话
   ```

Chrome 扩展的下载 API 不允许直接写入 `/home/...`、`C:\...` 这类任意绝对路径，因此本扩展不会把 Vault 绝对路径当作下载目标。

### 归档功能

- 在**对话列表**中，点击对话项右侧的 📦 图标进行归档
- 归档的对话会标记为 📦，可通过筛选器查看
- 归档状态保存在本地存储中，跨会话保持

## 技术架构

```
gemini-manager-extension/
├── manifest.json              # 扩展清单 (Manifest V3)
├── src/
│   ├── background/
│   │   └── background.js      # Service Worker - 后台处理
│   ├── content/
│   │   ├── content.js         # 内容脚本 - DOM 提取
│   │   └── content.css        # 内容脚本样式
│   ├── popup/
│   │   ├── popup.html         # 弹出窗口 UI
│   │   ├── popup.css          # 弹出窗口样式
│   │   └── popup.js           # 弹出窗口逻辑
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── README.md
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 读取当前 Gemini 页面的对话内容 |
| `storage` | 保存归档状态和扩展设置 |
| `downloads` | 导出 Markdown/JSON 文件到下载文件夹 |
| `scripting` | 在 Gemini 页面注入提取脚本 |
| `tabs` | 切换/打开 Gemini 对话标签页 |
| `host_permissions` | 仅在 `gemini.google.com` 域运行 |

## 兼容性

- **浏览器**: Chrome 88+, Edge 88+, Brave, 其他 Chromium 内核浏览器
- **Gemini 版本**: 支持 Gemini 网页版当前 DOM 结构（2025-2026）
- **Obsidian**: 支持 Obsidian URI Scheme (v0.9.8+)

## 故障排除

### 扩展显示"未在 Gemini 页面"

- 确保当前活动标签页是 `gemini.google.com`
- 刷新页面后重试
- 检查是否已允许扩展访问该网站

### 导出内容为空或不完整

- Gemini DOM 结构更新可能导致提取失败
- 尝试刷新页面后重新导出
- 如果问题持续，请提交 Issue 并附上页面结构信息

### Obsidian URI 无法打开

- 确保 Obsidian 桌面应用已安装
- 检查 Vault 名称是否准确（区分大小写）
- 尝试在浏览器地址栏手动输入 `obsidian://` 测试协议是否注册

## 隐私声明

- **所有数据在本地处理**，不会上传到任何服务器
- 对话内容仅通过内容脚本在浏览器本地提取
- 归档状态和设置保存在浏览器的 `chrome.storage` 中
- 不收集任何用户行为数据或遥测信息

## 开发计划

- [ ] 批量导出多个对话
- [ ] 对话搜索功能增强
- [ ] 支持更多导出格式 (PDF, HTML)
- [ ] 自动同步到指定文件夹
- [ ] 支持 ChatGPT/Claude 等其他 AI 平台

## 许可证

MIT License

## 致谢

- 灵感来源于 [gemini-export](https://github.com/jujusharp/gemini-export) 等开源项目
- DOM 选择器参考了多个 Gemini 导出工具的实践经验
