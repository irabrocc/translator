# Screenshot Translator

一款基于 **AI 多模态视觉能力**的桌面截图翻译与数学 OCR 工具，使用
Electron + TypeScript 开发，支持 Windows 和 Ubuntu 24.04 LTS（GNOME/X11）。

它不是“本地 OCR + 机器翻译”的简单拼接：应用会把选中的屏幕区域作为图片提交
给支持视觉输入的多模态模型，由模型理解图片内容、识别文字，并直接生成翻译或
Markdown/LaTeX 数学代码。因此，它也能处理普通 OCR 较难理解的混合排版、上下文、
公式与说明文字。

> [!IMPORTANT]
> 当前版本**仅内置并正式支持 OpenCode Go API**，不能直接填写 OpenAI、Anthropic
> 或其他厂商的 API Key。使用前需要从 [opencode.ai/auth](https://opencode.ai/auth)
> 获取 OpenCode Go API Key。

## 核心功能

- **多模态截图翻译**：框选任意屏幕区域，模型同时完成文字识别、语言检测和翻译。
- **保留原文与译文**：结果窗口分别展示识别文本和翻译文本，并支持一键复制。
- **数学 OCR**：识别公式及其周围的标题、说明、列表和编号等结构。
- **Markdown / LaTeX 输出**：数学结果可即时切换格式、复制，或保存为 `.md` / `.tex`。
- **快速 / 思考模式**：快速模式优先响应速度；思考模式允许模型进行更多推理。
- **多模型切换**：可在托盘菜单或全局快捷键中循环切换 OpenCode Go 提供的模型。
- **语言切换**：支持自动识别源语言，并可通过托盘菜单或快捷键切换翻译方向。
- **系统托盘常驻**：关闭结果或设置窗口后应用仍在后台运行，所有常用操作均可从
  托盘菜单触发。
- **可调整结果窗口**：翻译和数学结果窗口可缩放；后续截图会保留窗口尺寸，并尽量
  避免窗口超出当前显示器工作区。
- **开机启动与自定义快捷键**：可在设置中启用开机启动，并修改全部全局快捷键。

## 当前限制与数据说明

- **需要联网**：OCR、翻译和数学解析均由云端多模态模型完成，没有离线 OCR 模式。
- **仅支持 OpenCode Go**：默认请求发送到 `opencode.ai` 的 OpenAI 兼容或 Anthropic
  兼容端点。设置中的“端点”用于高级覆盖，当前并不代表应用已适配任意 API 服务商。
- **截图会发送到模型服务**：只有用户框选的区域会作为请求内容发送；请勿截取不希望
  上传的密码、密钥或其他敏感信息。数据如何被服务端处理以 OpenCode 的服务条款和
  隐私政策为准。
- **API Key 保存在本机**：配置由 `electron-store` 写入 Electron 用户数据目录下的
  `settings.json`；请妥善保护本机账户和该配置文件。
- **模型输出具有不确定性**：复杂排版、低清晰度图片、生僻语言或大型公式可能出现
  漏识别或格式错误，重要内容请人工校对。
- 当前重点支持 Windows x64 和 Ubuntu 24.04 LTS x64 的 GNOME/X11 桌面，其他平台
  或 Linux 桌面环境尚未验证。

## 快速开始

### 1. 安装并启动

可安装 `release/` 中已构建的对应平台产物，或按下文的“开发与构建”从源码运行。
应用启动后会常驻系统托盘；首次启动且尚未配置 API Key 时，会自动打开设置窗口。

### 2. 配置 OpenCode Go

1. 前往 [opencode.ai/auth](https://opencode.ai/auth) 获取 OpenCode Go API Key。
2. 在设置窗口中粘贴 API Key。
3. 选择模型、默认源语言和目标语言，然后保存。
4. 按 `Alt+S`，拖拽框选屏幕区域，松开鼠标后等待识别和翻译结果。

应用默认使用 `MiniMax M3`、快速模式、自动识别源语言，并翻译为简体中文。

## 使用方式

### 截图翻译

按 `Alt+S` 或在托盘菜单中选择“截图翻译”，按住鼠标左键拖拽选择区域，松开后
提交；按 `Esc` 可取消选择。结果窗口会显示识别到的原文和译文，两部分均可单独复制。

### 数学解析

按 `Alt+M` 或在托盘菜单中选择“数学解析 (MD/TeX)”，框选公式或数学文本。结果
窗口支持：

- 在 Markdown 与可编译的 LaTeX 文档之间切换；
- 复制当前格式的内容；
- 将结果保存为 `.md` 或 `.tex` 文件；
- 记住最近选择的默认显示格式。

### 默认快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Alt+S` | 截图翻译 |
| `Alt+M` | 数学解析 |
| `Alt+Q` | 切换快速 / 思考模式 |
| `Alt+K` | 循环切换模型 |
| `Alt+L` | 循环切换源语言 |
| `Alt+T` | 循环切换目标语言 |

快捷键可在设置中修改，保存后立即重新注册。如果某个组合键已被系统或其他程序占用，
应用会显示注册失败通知。

### 内置语言

- 源语言：自动识别、英语、韩语、希伯来语、法语。
- 目标语言：简体中文、英语、韩语、日语、法语。

### 可选模型

- MiniMax M3（默认，图像识别较稳定）
- Kimi K2.7 Code
- Kimi K2.6
- Qwen3.7 Max
- MiniMax M2.7

模型可用性、配额和计费由 OpenCode Go 决定，可能随服务端调整。不同模型对图像、
语言和数学公式的处理效果也可能不同。

## 平台说明

### Windows

应用入口位于 Windows 任务栏通知区域。绿色 `F` 图标表示快速模式，橙色 `T` 图标
表示思考模式；切换模式后图标会立即更新。将鼠标悬停在图标上可查看当前模式、模型
和翻译方向，右键可执行截图翻译、数学解析、切换选项或打开设置。

若图标被 Windows 收进通知区域的折叠菜单，可在任务栏设置中将 Screenshot Translator
设为始终显示。应用不会创建额外的悬浮状态窗口，因此不会干扰全屏程序或任务栏自动隐藏。

### Ubuntu 24.04 LTS

应用启动后常驻 GNOME 顶栏右侧，与网络、输入法和电源图标位于同一区域，不会为常驻
状态占用 Dock。如果托盘图标没有出现，请确认 AppIndicator 组件已安装：

```bash
sudo apt install libayatana-appindicator3-1 gnome-shell-extension-appindicator
```

当前验证环境为 GNOME/X11；Wayland 和其他桌面环境的截图、全局快捷键或托盘行为可能
受系统限制。

## 开发与构建

### 环境要求

- Node.js `>= 22.12.0`（推荐当前 Node.js 22 LTS）
- npm `>= 10`

Node.js 18 已不适用于当前 Electron 工具链。安装依赖前请先确认版本：

```bash
node --version
npm --version
npm install
```

在部分受限网络环境中，下载 Electron 二进制文件可能需要配置镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

PowerShell 可使用：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
npm install
```

### 常用命令

```bash
npm start          # 编译并启动 Electron 应用
npm run build      # 清理并编译主进程、预加载脚本和渲染进程
npm run dist:win   # 构建 Windows x64 NSIS 安装包
npm run dist:linux # 构建 Linux x64 AppImage 和 deb 包
npm run dist       # 按当前 electron-builder 配置打包
```

打包产物位于 `release/`：

- Windows：NSIS 安装程序；
- Ubuntu/Linux：推荐使用 `.deb`，也可使用免安装的 `.AppImage`。

在 Linux 上交叉构建 Windows 安装包需要 Wine；也可以直接在 Windows 主机上运行
`npm run dist:win`。

## 项目结构

```text
src/main/                 Electron 主进程：托盘、窗口、快捷键、截图、API、设置
src/preload/preload.ts    通过 contextBridge 暴露受控 IPC 接口
src/renderer/selector/    屏幕区域选择器
src/renderer/overlay/     翻译结果窗口
src/renderer/math/        数学解析结果窗口
src/renderer/settings/    设置窗口
scripts/                  构建辅助与手动测试脚本
assets/                   托盘与应用图标
```

项目分别使用 `tsconfig.main.json`（Electron 主进程 / CommonJS）和
`tsconfig.renderer.json`（渲染进程 / ES Modules + DOM）；根目录的 `tsconfig.json`
负责项目引用。`npm run build` 同时承担类型检查，任何 TypeScript 错误都会使构建失败。

## 技术栈

- Electron
- TypeScript
- OpenCode Go 多模态模型 API
- electron-store
- electron-builder

## 常见问题

### 按快捷键没有反应

检查系统通知是否提示快捷键注册失败，并在设置中换用未被占用的组合键；也可通过托盘
菜单直接启动截图。

### 启动截图后无法得到结果

确认已配置有效的 OpenCode Go API Key、网络可以访问 `opencode.ai`，且所选模型当前
可用。API 请求超过 60 秒会被取消并显示超时错误。

### 如何彻底退出应用

关闭窗口只会将应用留在托盘后台运行。请在托盘菜单中选择“退出”。

## License

MIT
