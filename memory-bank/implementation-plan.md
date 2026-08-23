# Implementation Plan — 可并行、可验证

> 规则: 只写指令不写代码，每步独立可验证，小步提交。完成一步才进入下一步。

## 依赖关系
```
步骤1-2 串行 (地基)
步骤3,4 可并行 (UI + 原生)
步骤5 依赖 4 (OCR)
步骤6 依赖 5 (翻译)
步骤7 依赖 3+6 (联调)
步骤8 独立 (设置)
步骤9 依赖 全部 (打包)
```

---

### 步骤1: 项目骨架与质量门禁 [P0][串行]

**指令**: 初始化 `Electron + Vite + React + TS` 项目，配置 Tailwind、ESLint、Prettier、Vitest，跑通 `npm run dev` 显示 Hello World。

**改动文件**:
- `package.json`, `tsconfig.json`, `electron/*`, `src/*`, `tailwind.config.js`

**验证**:
```bash
npm run lint # 0 error
npm run typecheck # 0 error
npm run dev # 窗口正常显示
```

---

### 步骤2: 类型契约与 Reference 样本 [P0][串行]

**指令**: 创建 `src/types/*` Zod schema, 创建 `src/services/_example.reference.ts` 作为AI模仿样本, 创建 `src/services/native/interface.ts` 隔离层。

**验证**:
```bash
npm run typecheck
npm run test # types 测试通过
```

---

### 步骤3: 截图遮罩 UI 组件 [P0][可并行3]

**指令**: 实现 `src/components/CaptureOverlay.tsx` 纯UI组件：全屏半透明、拖拽选区、显示宽高、ESC关闭。先用 Mock 数据，不接 Electron。

**验证**: Storybook 或 `npm run dev` 中按钮触发 overlay，拖拽流畅

---

### 步骤4: 主进程截图能力 [P0][可并行4]

**指令**: 实现 `electron/main.ts`, `ipc.ts`, `overlay.ts`, `preload.ts`，接入 `desktopCapturer` + `globalShortcut`，打通 `window.api.capture.start()` 到 UI。

**验证**:
```bash
npm run dev
# 按 Ctrl+Shift+A 能呼起遮罩，框选后 console 打印 dataURL
```

---

### 步骤5: OCR 本地服务 [P0][依赖4]

**指令**: 实现 `src/services/ocrService.ts` 实现 `IOcrService`，先接 `tesseract.js` (chi_sim+eng+kor)，预留 Paddle 接口，添加语言检测。

**验证**:
```bash
npm run test -- ocrService # 3语种样本图片识别测试
```

---

### 步骤6: 混合翻译路由 [P0][依赖5]

**指令**: 实现 `src/services/translateRouter.ts` + `deeplService.ts` + `opencodeService.ts`，实现快慢双通道 + 熔断，支持中英韩互译。

**验证**:
```bash
npm run test -- translateRouter
# Mock DeepL + Mock LLM，验证 fast 先返回 refined后替换
```

---

### 步骤7: 悬浮翻译卡片联调 [P0][依赖3+6]

**指令**: 实现 `src/components/TranslateCard.tsx` + `hooks/useTranslate.ts`，串联 `截图->OCR->翻译->卡片` 完整链路，支持复制/拖拽/关闭。

**验证**: 端到端手动：截图含中英韩文字，能显示原文+译文+复制成功

---

### 步骤8: 保存与设置 [P1][独立]

**指令**: 实现 `storageService`, `saveService`, `SettingsPage`，托盘、开机自启、热键/路径/模型配置持久化。

**验证**: 修改设置重启后生效，保存图片到指定目录

---

### 步骤9: 打包与发布 [P1][依赖全部]

**指令**: 配置 `electron-builder`, 产出 nsis/dmg，编写 README 安装说明，跑完全量门禁。

**验证**:
```bash
npm run lint && npm run typecheck && npm run test && npm run build
#产物在 dist/ 可安装运行
```

---

## 当前进度
- [x] 步骤1 项目骨架与质量门禁 (提交 519e19d/1df2720)
- [x] 步骤2 类型契约与 Reference 样本 (519e19d)
- [x] 步骤3 截图遮罩 UI 组件 (9296b56 起多次迭代: 双按钮/段落面板)
- [x] 步骤4 主进程截图能力 (5d08866/e0ec9dd/15f094c)
- [x] 步骤5 OCR 本地服务 (d652ae9)
- [x] 步骤6 混合翻译路由 (d34068a, 后改免API快译 d696f32/837949a)
- [x] 步骤7 联调完成 (用户验证通过: 截图→OCR→整段翻译→段落面板→主页精译, 837949a)
- [ ] 步骤8 保存与设置 (P1, 未开始)
- [ ] 步骤9 打包与发布 (P1, 未开始)
