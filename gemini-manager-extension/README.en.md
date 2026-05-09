[中文](./README.md) | English

# Gemini Manager

A Chrome/Edge browser extension for managing, archiving, and exporting Google Gemini and Google AI Studio conversation records (supports export to Obsidian, Markdown, or JSON formats).

## Features

- **Dual Platform Support**: Perfectly supports the standard version [Gemini (gemini.google.com)](https://gemini.google.com) and the pro version [Google AI Studio (aistudio.google.com)](https://aistudio.google.com).
- **Selective Export**: Freely check the conversation turns you want to export, filter out useless conversations, and support select all/deselect all.
- **Conversation Management**: View all conversation lists in the sidebar, with search and filtering capabilities.
- **[Experimental] Sidebar Categorization Management (Gemini Only)**: Rewrite the left sidebar of the webpage with a custom tree-like folder structure. Supports creating new folders, collapsing/expanding, and categorizing conversations via **Drag & Drop**.
- **Batch Export**: One-click batch export of all unarchived historical conversations.
- **Archive Function**: Mark important conversations as "Archived" (📦) for easy categorization, and automatically filter out unwanted archived or unarchived conversations during batch export.
- **Multiple Export Formats**:
  - Markdown (`.md`) - Universal format, including the optional export of the "Think Process" in AI Studio.
  - Obsidian Format - Includes exclusive YAML frontmatter, adapted to Obsidian usage habits.
  - JSON (`.json`) - Structured data, convenient for programmers to process further.
- **Powerful Image Saving**: Automatically parses and downloads model-generated images and user-uploaded images from conversations.
- **Three Obsidian Integration Methods**:
  1. **Direct Directory Write (Recommended)**: Uses the browser's native File System Access API to directly write to your chosen local folder and image subfolders, providing the smoothest experience.
  2. **Obsidian URI**: Creates notes by invoking Obsidian through a URL Scheme, with images automatically converted to Base64 embedding.
  3. **Traditional Download**: Downloads to a specified subdirectory within the system's Downloads folder.

## Installation

### Manual Installation in Developer Mode (Recommended)

1. Download and extract the extension's `.zip` file.
2. Open Chrome or Edge browser, enter `chrome://extensions/` (or `edge://extensions/`) to go to the extensions management page.
3. Turn on the **Developer mode** switch in the top right corner.
4. Click **Load unpacked**.
5. Select the extracted extension root directory folder (the folder containing `manifest.json`).
6. It is recommended to pin the extension icon to the browser toolbar.

## Usage

### Basic Usage

1. Open [gemini.google.com](https://gemini.google.com) or [aistudio.google.com](https://aistudio.google.com) and be on the conversation page.
2. Click the **Gemini Manager** extension icon in the upper right corner of the browser.
3. Operate in the pop-up panel:
   - **Current Conversation**: You can perform actions such as "Export All", "Selective Export", "Export as JSON", etc.
   - **Conversation List**: Browse sidebar historical conversations, you can search, archive, or perform "Export All Sessions".
   - **Settings**: Configure various preferences for Obsidian export.

### Selective Export

1. On the "Current Conversation" page, click the **☑️ Selective Export** button in the lower right corner.
2. The panel will expand to show a preview of all turns in the current conversation.
3. Check the turns you need (supports quick select all/deselect all).
4. Click the export button at the bottom of the panel to export only the selected content.

### Export to Obsidian

#### Method 1: Direct Directory Write (Recommended, Best Experience)

1. In the extension pop-up **Settings**, click **"Open Directory Settings"**.
2. Click **"Select Obsidian Directory"**, and in the system dialog that pops up, select your Obsidian Vault directory (or any fixed directory where you want to store Markdown), and authorize the browser to allow writing.
3. Return to the extension pop-up, check **"Prioritize writing to selected directory"**.
4. Fill in the subdirectory for saving conversations in **"Folder Path"**, for example, `AI对话/Gemini`.
5. When exporting, the extension will directly write the `.md` file to that directory. If the conversation contains images, they will be automatically stored in the `Images/` subdirectory under the same directory.

#### Method 2: Using Obsidian URI

1. Ensure the Obsidian desktop application is installed.
2. In the extension settings, uncheck "Prioritize writing to selected directory", then check **"Use Obsidian URI to open directly"**.
3. Fill in your **Vault Name**.
4. When exporting, it will automatically invoke the local Obsidian application and create a note. Images will be embedded in the Markdown as inline `data:image/...` (Base64).

#### Method 3: Traditional Browser Download

1. Uncheck "Use Obsidian URI" and "Prioritize writing to selected directory".
2. The exported Markdown will default to using the browser's download function to the `Downloads` folder.

### AI Studio Support Notes

AI Studio and standard Gemini have huge differences in underlying architecture. This extension has made deep adaptations:
- Supports fetching very long context conversations.
- Automatically handles temporary images (Blob URLs) that expire in AI Studio, ensuring images are valid during export.
- Optional export of the model's "Think Process".

### Experimental Feature: Sidebar Folder Management (Gemini Only)

The official Gemini web version's sidebar only provides a flat list sorted by time, which becomes extremely difficult to manage when there are many conversations. This extension provides an experimental "injected" solution:

1. **How to Enable**: Click the extension icon, enter the "Settings" tab, check **"Enable Sidebar Folder Categorization (Gemini Only)"** at the bottom and save.
2. **Effect Display**: Return to the Gemini page, the sidebar will be completely taken over, and a `📁 Categorized Directory` interface will appear. Original conversations will be automatically placed in the `Uncategorized Records` folder.
3. **Management and Interaction**:
   - **New Folder**: Click the `+ New` button to create any number of custom folders.
   - **Drag & Drop Categorization**: Directly use your mouse to hold down the conversation item that needs to be categorized, drag and drop it onto the target folder to achieve quick categorization!
   - **Collapse/Expand**: Click the folder title to collapse or expand the conversations below, making the sidebar extremely clean.
   - Alternative move method: Hover your mouse over the `⋮` button on the right side of the conversation, and you can also categorize by entering a serial number.

> **⚠️ Note**: This feature heavily relies on the current DOM structure of the Gemini official web page. If Google updates the web version UI, this feature may fail or cause the sidebar to turn white. If this happens, please **disable** this feature in the extension settings to restore the native interface.

## Technical Architecture

```
gemini-manager-extension/
├── manifest.json              # Extension Manifest (Manifest V3)
├── src/
│   ├── background/
│   │   └── background.js      # Service Worker
│   ├── content/
│   │   ├── content.js         # Content Script - Core DOM parsing, extraction, and conversion
│   │   └── content.css        # Content Script Styles
│   ├── popup/
│   │   ├── popup.html         # Popup UI Panel
│   │   ├── popup.css          # Popup Styles (including selective export panel, etc.)
│   │   └── popup.js           # Popup Logic and State Management
│   ├── pages/
│   │   └── setup.html / .js   # Standalone directory authorization page
│   └── icons/                 # Extension Icons
└── README.md
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Read current page conversation content |
| `storage` | Save archive status and extension settings |
| `downloads` | Download Markdown/JSON files and images |
| `scripting` | Inject extraction scripts into the page |
| `tabs` | Switch/open conversation tabs |
| `host_permissions` | Only run on `gemini.google.com` and `aistudio.google.com` domains |

## Compatibility and Limitations

- **Browser**: Supports modern Chromium-based browsers (Chrome 88+, Edge 88+, Brave, etc.).
- **File System Access API**: The "Direct Directory Write" feature relies on this API; incognito mode or older browsers may degrade to normal downloads.
- **DOM Dependency**: This project depends on the DOM structure of the web version and AI Studio. If Google frequently updates the frontend structure, some features may require fixes.

## Privacy Statement

- **All data is processed purely locally**. Your conversation content will not be uploaded to any third-party server.
- Data only flows between browser memory and local `chrome.storage`.
- The extension does not collect any user behavior data or telemetry information.

## License

MIT License
