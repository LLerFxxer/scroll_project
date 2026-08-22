# AGENTS.md — AI 入职手册 (Vibe Coding 宪法)

> 每次对话、每次改代码前，AI 必须先读此文件 + `.spec/` 下所有文档。违反此条的修改视为无效。

## 1. 项目一句话
精简版有道截图翻译：`截图框选 -> 本地OCR(中英韩) -> 混合翻译(DeepL快通道 + opencode LLM精译) -> 悬浮卡片 -> 保存截图`。比有道轻 10 倍，翻译又快又准。

## 2. 技术栈锁定 (不可擅自升级大版本)
- 壳: Electron 32 + Vite 6 + React 19 + TypeScript 5.6 (严格模式)
- 样式: Tailwind CSS 3.4
- 本地能力: electron `globalShortcut`, `desktopCapturer`, `BrowserWindow` (transparent overlay)
- OCR: 本地优先 `PaddleOCR (via Node binding / Python sidecar)`，降级 `tesseract.js`，接口抽象为 `IOcrService`
- 翻译: `ITranslateRouter` -> `DeepL API (快, <200ms)` + `opencode LLM (精, Gemini 2.5 Flash / Claude Sonnet 4.x / GPT-4.1)` 混合
- 存储: `electron-store` 保存配置 + 截图历史索引
- 未来迁移: 所有 Native 调用必须经 `src/services/native/` 隔离，便于一键切 Tauri

## 3. 目录职责 (AI 禁止跨层乱放)
```
src/
  components/   # 纯 UI，无业务逻辑
  services/     # 核心业务：ocrService, translateRouter, captureService, storageService
  lib/          # 工具：hotkey, image, logger
  types/        # 共享类型与 Zod schema，真理源
  hooks/        # React hooks
electron/       # 主进程 (main.ts, ipc.ts, overlay.ts)
.spec/          # 需求/架构契约
memory-bank/    # 执行计划与日志
```

## 4. 开发铁律
1.  **一次只做一件事**：一个 prompt 只改一个模块，禁止加功能+修bug+重构混一起
2.  **Reference 优于描述**：写新 `service` 前先读 `src/services/_example.reference.ts`
3.  **测试定义完成**：新功能必须先有 `*.test.ts`，测试不通过 = 没做完
4.  **结构先于实现**：先更新 `.spec/arch.md` 再写代码
5.  **小步提交**：每完成 `implementation-plan.md` 一个步骤立即 `git commit`，大改前先 commit

## 5. 质量门禁 (每次改动后必须顺序执行，失败则回滚)
```bash
npm run lint        # ESLint + Prettier, 必须 0 error
npm run typecheck   # tsc --noEmit, 必须 0 error
npm run test        # vitest, 核心用例必须 pass
npm run build       # vite build + electron-builder dry-run
```
> CI 会卡门禁，本地不通过禁止提交。

## 6. 禁止事项
- 禁止在 `src/components` 写直接调用 `fetch` 翻译的实现，必须走 `services/translateRouter`
- 禁止硬编码 API Key，全部走 `.env` + `.env.example`
- 禁止将 `screenshots/`, `models/`, `dist/` 提交到 git
- 禁止一次性生成 >300 行代码，超过必须拆步
- 禁止修改 `AGENTS.md` / `.spec/` 而不同步更新 `memory-bank/progress.md`

## 7. 验证命令 (AI 自检用)
- 启动开发: `npm run dev`
- 打包预览: `npm run build && npx electron dist-electron/main.js`
- OCR 自测: `npm run test -- ocrService`
- 翻译路由自测: `npm run test -- translateRouter`

## 8. 提问前检查清单
- [ ] 已读 `.spec/prd.md` 验收标准？
- [ ] 已读 `.spec/arch.md` 模块边界？
- [ ] 已在 `memory-bank/progress.md` 追加日志？
- [ ] 已跑 `lint -> typecheck -> test`？
