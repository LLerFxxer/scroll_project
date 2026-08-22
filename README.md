# TransShot — 精简截图翻译

> `截图 -> 本地OCR(中英韩) -> 混合翻译(DeepL快 + opencode精) -> 悬浮卡片 -> 保存`

比有道轻10倍，离线可OCR，翻译又快又准。

## 技术栈
Electron 32 + Vite 6 + React 19 + TS 5.6 + Tailwind 3.4 + electron-store + Tesseract.js/PaddleOCR + DeepL + opencode LLM

## 快速开始
```bash
npm install
cp .env.example .env  # 填入 DeepL / OPENCODE key
npm run dev           # 启动
```

## 目录
```
.spec/          # 契约 (PRD/ARCH/API)
memory-bank/    # 计划与日志
electron/       # 主进程
src/
  components/   # 纯UI
  services/     # 业务 (ocr/translate)
  types/        # Zod 真相源
```

## 质量门禁
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

详见 `AGENTS.md` 与 `.spec/prd.md`
