# Screenshot Translator

Electron + TypeScript 截图翻译与数学 OCR 工具。支持 Windows，以及 Ubuntu
24.04 LTS 的 GNOME/X11 桌面。

## 开发环境

安全更新后的 Electron 工具链要求 Node.js 22.12 或更高版本，推荐使用当前的
Node.js 22 LTS。先确认版本再安装依赖：

```bash
node --version
npm --version
npm install
```

如 `node --version` 仍为 18.x，请先升级 Node.js；Node 18 已不适用于当前依赖。

## Ubuntu 24.04 LTS

应用启动后常驻 GNOME 顶栏右上角，与网络、输入法和电源图标位于同一区域。
点击状态图标可截图翻译、数学解析、切换语言/模式或打开设置。Ubuntu 版本不会
创建原先的左下角悬浮状态徽标，也不会为常驻状态占用 Dock。

翻译结果和数学解析结果窗口均可用鼠标拖动边缘或右下角进行缩小、放大；再次
截图时会保留当前窗口尺寸，并自动调整位置以避免超出当前显示器工作区。

应用默认使用快速模式（不启用模型思考）。默认快捷键：

- `Alt+S`：截图翻译
- `Alt+M`：数学解析
- `Alt+Q`：切换快速/思考模式
- `Alt+K`：循环切换模型
- `Alt+L`：循环切换源语言
- `Alt+T`：循环切换目标语言

Ubuntu 默认已安装 AppIndicator 支持。如图标没有出现，可确认以下组件存在：

```bash
sudo apt install libayatana-appindicator3-1 gnome-shell-extension-appindicator
```

开发运行：

```bash
npm start
```

构建 Ubuntu x64 安装包：

```bash
npm run dist:linux
```

输出位于 `release/`：

- `.deb`：推荐用于 Ubuntu，可通过 `sudo apt install ./文件名.deb` 安装。
- `.AppImage`：免安装版本，添加执行权限后直接运行。

## Windows

Windows 行为保持不变，包括系统托盘和悬浮状态徽标。构建 x64 NSIS 安装包：

```bash
npm run dist:win
```

在 Linux 上交叉构建 Windows 安装包需要 Wine；也可在 Windows 主机上运行该命令。
