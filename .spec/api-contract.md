# API Contract — 契约即真相源

所有前后果、IPC、存储结构以此文件为准，配合 Zod schema。

## 1. IPC 白名单 (preload 暴露)

```ts
// electron/preload.ts
window.api = {
  capture: {
    start(): Promise<void>
    onDone(cb: (data: { rect: Rect, dataURL: string }) => void): void
  },
  ocr: {
    recognize(dataURL: string): Promise<OcrResult>
  },
  translate: {
    translate(req: TranslateRequest): Promise<TranslateResponse>
    detectLang(text: string): Promise<Lang>
  },
  save: {
    saveImage(dataURL: string, opts?: SaveOpts): Promise<{path: string}>
  },
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<void>
  }
}
```

## 2. 类型定义 (src/types/*.ts)

```ts
// types/ocr.ts
export const LangSchema = z.enum(['zh','en','ko','auto'])
export type Lang = z.infer<typeof LangSchema>
export type OcrResult = {
  text: string
  lang: Lang
  confidence: number // 0-1
  blocks?: Array<{text: string; bbox: [number,number,number,number]}>
  error?: 'NO_TEXT'|'LOW_CONFIDENCE'|'ENGINE_ERROR'
}

// types/translate.ts
export type TranslateRequest = {
  text: string
  from?: Lang // auto 检测
  to: Lang    // 必填, 默认根据 from 推断: zh->en, en->zh, ko->zh
  glossary?: Record<string,string>
}
export type TranslateResponse = {
  fast: string          // DeepL 或首包
  refined?: string      // LLM 精译 (后到)
  provider: 'deepl'|'opencode'|'fallback'
  detectedFrom: Lang
  latencyMs: { fast: number; refined?: number }
}

// types/capture.ts
export type Rect = { x:number; y:number; width:number; height:number; displayId?: number }
export type SaveOpts = { withTranslation?: string; dir?: string }

// types/settings.ts
export type AppSettings = {
  hotkey: string // "CommandOrControl+Shift+A"
  targetLang: Lang // "auto" | 固定
  saveDir: string
  deeplApiKey?: string
  opencode: {
    baseURL: string // default: http://localhost:4096/v1 或 https://api.opencode.dev/v1
    model: string  // "opencode/gemini-2.5-flash"
    apiKey?: string
  }
  ocr: { engine: 'paddle'|'tesseract'|'auto'; lang: Lang[] }
}
```

## 3. 翻译路由策略

```
translate(text):
  1. detectLang(text) -> from
  2. inferTo(from, settings.targetLang)
  3. 并行发起:
     - fastPromise = deeplApi.translate(text, from, to).catch(()=>null) // timeout 1s
     - refinedPromise = opencodeLLM.translate(prompt, text, from, to) // timeout 5s
  4. fast 先返回渲染
  5. refined 后到若 confidence 高则替换
  6. 若 fast 失败且 refined 成功 -> 用 refined 作为 fast
```

Prompt 模板 (opencode):
```
You are a professional translator. Translate {from} to {to}.
Rules: Preserve names, keep line breaks, use natural {to}.
Glossary: {glossary}
Only output translation, no explanation.
Text: """{text}"""
```

## 4. 存储 (electron-store)

```ts
store.get('settings') -> AppSettings
store.get('history') -> Array<{id, timestamp, rect, ocrText, translated, imagePath}>
```

## 5. 错误码

| code | 场景 | UI |
|---|---|---|
| NO_TEXT | OCR 无文本 | 提示“未识别到文字” |
| DEEPL_QUOTA | DeepL 配额耗尽 | 自动切 LLM，提示 |
| LLM_TIMEOUT | LLM 超时 | 保留快译，提示 |
| SAVE_FAILED | 磁盘无权限 | 提示选择新路径 |
