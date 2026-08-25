# Tech Stack — 版本锁定

> Vibe Coding 铁律：版本不锁定 = AI 每次生成依赖不一致。以下版本禁止擅自升级大版本。

| 层 | 选型 | 版本 | 锁定原因 |
|---|---|---|---|
| 运行时 | Node | 22 LTS | Electron 32 要求 |
| 桌面壳 | Electron | 32.x | 最稳定，globalShortcut/desktopCapturer 成熟 |
| 构建 | Vite | 6.x | HMR 快 |
| 构建插件 | electron-vite | 2.x | 官方推荐 |
| 前端 | React | 19.x | 并发特性，AI 训练数据足 |
| 语言 | TypeScript | 5.6.x | strict 模式必填 |
| 样式 | Tailwind CSS | 3.4.x | 不升 4.x，避免 AI 幻觉 |
| 状态 | Zustand | 4.x | 轻量 |
| 校验 | Zod | 3.23.x | 运行时校验 |
| 测试 | Vitest | 3.x + jsdom | 单元 |
| E2E | Playwright | 1.48.x | 可选 |
| 打包 | electron-builder | 25.x | nsis/dmg |

**Native 能力:**
- `globalShortcut`, `desktopCapturer`, `BrowserWindow(transparent, fullscreen)`, `clipboard`, `nativeImage`

**OCR 依赖:**
- 首选: `PaddleOCR 3.x (PP-OCRv5)` Python sidecar — `paddleocr` + `paddlepaddle`(CPU), lang=`ch`(中英) / `korean`, stdlib HTTP 服务 `python/ocr_server.py`, 由主进程 spawn 管理
- 降级: `tesseract.js@5` (wasm, chi_sim+eng+kor)
- 抽象: `IOcrService` + 主进程 `recognizeSmart()` 链: paddle(ready) → tesseract
- 配置: `.env` `PADDLE_PYTHON`(默认 `python`), 首次自动下载 PP-OCRv5 模型(~20MB)
- 安装: `pip install paddleocr paddlepaddle` (Python 3.8+, 仅需 CPU)

**翻译依赖:**
- `DeepL API` (可选, 500k/月免费)
- `opencode` OpenAI 兼容接口: `baseURL=http://localhost:4096/v1` 或云端, model=`opencode/gemini-2.5-flash` / `opencode/claude-sonnet-4`
- SDK: `openai@4.x` 兼容调用

**存储:**
- `electron-store@8.x`

**安装命令 (AI 必须用此版本):**
```bash
npm create electron-vite@latest  # 选 react-ts
npm i zustand zod electron-store openai tesseract.js
npm i -D tailwindcss@3.4 postcss autoprefixer
```

**禁止:**
- 禁止引入 `axios`, 统一 `fetch`
- 禁止引入 `moment`, 用 `date-fns`
