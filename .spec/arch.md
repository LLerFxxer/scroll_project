# ARCH — 系统架构草案

## 1. 总体架构

```
   ┌───────────── Electron 主进程 (electron/) ─────────────┐
   │  main.ts        - 启动、生命周期、托盘                │
   │  ipc.ts         - IPC 路由表 (白名单)                 │
   │  overlay.ts     - 截图遮罩窗口管理 (transparent)      │
   │  capture.ts     - desktopCapturer 截图              │
   │  globalShortcut - 注册 Ctrl+Shift+A                 │
   └──────────────────────┬───────────────────────────────┘
                          │ IPC (invoke/handle)
   ┌──────────────────────▼───────────────────────────────┐
   │  渲染进程 React (src/)                               │
   │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
   │  │ components/ │  │ services/    │  │ lib/       │  │
   │  │ CaptureOverlay│ │ captureService│ │ hotkey.ts │  │
   │  │ TranslateCard │ │ ocrService   │  │ image.ts  │  │
   │  │ SettingsPage  │ │ translateRouter│ │ logger.ts│  │
   │  │ TrayHint      │ │ storageService│ │           │  │
   │  └─────────────┘  └──────────────┘  └────────────┘  │
   │  types/ (Zod schema 真相源)  hooks/                   │
   └───────────────────────────────────────────────────────┘
```

**设计原则：**
- 主进程只做 Native 能力，不含业务逻辑
- 所有 Native 调用经 `src/services/native/` 抽象，`interface INativeCapture`，为 Tauri 迁移留口
- `components` 禁止直接 `fetch` 或 `ipcRenderer`，必须经 `services`

## 2. 目录分层 (与 AGENTS.md 一致)

```
src/
  components/        # 哑组件: CaptureOverlay, TranslateCard, Settings
  services/
    native/          # captureNative, shortcutNative (隔离层)
    ocrService.ts    # IOcrService
    translateRouter.ts # ITranslateRouter
    storageService.ts
  lib/
    image.ts         # base64<->buffer, crop, save
    hotkey.ts
    logger.ts
  types/
    ocr.ts           # OcrResult {text, lang, confidence}
    translate.ts     # TranslateRequest/Response
    capture.ts
    settings.ts
  hooks/
    useCapture.ts
    useTranslate.ts
electron/
  main.ts
  ipc.ts
  overlay.ts
  preload.ts         # contextBridge 暴露安全 API
```

## 3. 核心模块与接口

### 3.1 IOcrService
```ts
// src/types/ocr.ts
export const LangSchema = z.enum(['zh','en','ko','auto'])
export type OcrResult = { text: string; lang: 'zh'|'en'|'ko'; confidence: number; blocks?: TextBlock[] }
export interface IOcrService {
  recognize(image: Buffer | string): Promise<OcrResult>
  detectLang(text: string): 'zh'|'en'|'ko'
}
// 实现链(主进程 recognizeSmart): PaddleSidecar(PP-OCRv5 HTTP, 精度最高) -> TesseractService(降级)
// sidecar: python/ocr_server.py, 主进程 spawn, /health 就绪探测, /ocr POST base64
// 语言: ch(中英) / korean 双引擎懒加载; 结果 parsePaddleResponse 清洗(去空格规则沿用 cleanOcrText)

### 3.2 ITranslateRouter (混合)
```ts
export type TranslateRequest = { text: string; from?: Lang; to: Lang }
export type TranslateResponse = { fast: string; refined?: string; provider: 'deepl'|'opencode'|'fallback'; detectedFrom: Lang; latencyMs: { fast: number; refined?: number }; requestId?: number }
export interface ITranslateRouter {
  translate(req: TranslateRequest, hooks?: { onRefined?: (p: RefinedPayload) => void }): Promise<TranslateResponse>
  // 快通道 DeepL 1.5s 超时；LLM 精译后台完成后经 hooks.onRefined 推送 (IPC translate:refined)
}
// 真实实现: DeepL REST /v2/translate + opencode OpenAI 兼容 /chat/completions (主进程 fetch, .env 配置)
```

### 3.3 ICaptureService
```ts
export interface ICaptureService {
  startCapture(): Promise<void> // 呼起 overlay
  onCaptured(cb: (rect: Rect, image: string) => void): void
}
```

## 4. 数据流 (v2: 原位覆盖式，复刻有道)

```
Ctrl+Shift+A -> overlay 显示(不透明,截图作背景)
 -> 拖拽框选 rect -> crop(dataURL)
 -> [快路径|遮罩内完成] IPC translate:quick:
      ocrService.recognizeBlocks(dataURL)  // 行级 text+bbox+confidence
      -> detectLang; 若 zh 直接返回 blocks
      -> GoogleFreeProvider.translateLines(blocks) 并行逐行 tl=zh-CN (~100-300ms)
      -> 返回 {scale, imageW/H, lines:[{bbox,text,translated}]}
 -> CaptureOverlay phase='result': 按 bbox/scale 白底黑字覆盖渲染
    操作条: 重试 | 主页精译 | 复制全部 | 关闭
 -> [精路径] 主页精译按钮 -> capture:done{text,dataURL,zhFast} -> 主窗口
      主窗口展示 快译 + "LLM 精译"按钮(走 translateRouter DeepL/opencode)
```

状态管理: 轻量 `zustand` 或 `React Context`, 不引入 Redux

## 5. 技术决策与理由

| 决策 | 选型 | 理由 |
|---|---|---|
| 壳 | Electron 32 + Vite 6 | Vibe友好，AI生成质量最高，多屏截图API成熟，社区模板多 |
| OCR | PaddleOCR Node + tesseract.js fallback | 离线、中文/韩文最准，Tesseract兜底保证可用性 |
| 翻译 | DeepL + opencode LLM | 速度+质量兼得，opencode复用订阅无需额外付费 |
| 样式 | Tailwind 3.4 | 原子化，AI少跨文件，样式与组件同处 |
| 类型 | TS strict + Zod | 可执行的文档，AI出错编译期即拦 |
| 测试 | Vitest + Playwright | 单元+端到端，覆盖 F2/F3 核心链路 |

**Tauri 迁移预案:**
- 所有 `electron/*` 调用已隔离在 `src/services/native/electronAdapter.ts`
- 未来只需新增 `tauriAdapter.ts` 实现同一接口 `INativeLayer`，切换 `import` 即可
- 不允许业务层直接 `import { desktopCapturer } from 'electron'`

## 6. 安全与配置

- `preload.ts` 仅暴露白名单 `window.api = { capture, ocr, translate, save, getSettings }` via `contextBridge`
- 禁止 `nodeIntegration: true`, 必须 `contextIsolation: true`
- API Key 存 `electron-store` 加密字段 + `.env` 仅开发期
- CSP: `default-src 'self'`

## 7. 部署与构建

- 构建: `electron-vite build` + `electron-builder` (nsis/dmg)
- 产物: `dist/` 不进 git, 仅发布到 `release/`
- 更新: MVP 不做自动更新，预留 `electron-updater` 接口
