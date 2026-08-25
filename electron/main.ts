import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen, nativeImage, clipboard } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createOverlayWindow, getOverlayWindow, hideOverlay, showOverlay } from './overlay'
import type { IOcrService, OcrResult } from '../src/types/ocr'
import type { TranslateRequest } from '../src/types/translate'
import { TranslateRouter, DeepLProvider, OpencodeProvider } from '../src/services/translateRouter'
import { PaddleSidecar, resolvePaddleScript } from '../src/services/paddleSidecar'

let ocrService: IOcrService | null = null
const paddleSidecar = new PaddleSidecar(resolvePaddleScript(app.getAppPath()))

/** 智能识别链: Paddle(PP-OCRv5, 精度最高) -> Tesseract(降级) */
async function recognizeSmart(dataURL: string): Promise<OcrResult> {
  if (paddleSidecar.ready) {
    try {
      const r = await paddleSidecar.ocr(dataURL, 'ch')
      return { text: r.text, lang: r.lang, confidence: r.confidence }
    } catch (e) {
      console.warn('[main] paddle failed, fallback tesseract:', e instanceof Error ? e.message : e)
    }
  }
  const { createOcrService } = await import('../src/services/ocrService')
  if (!ocrService) ocrService = createOcrService('tesseract')
  return ocrService.recognize(preprocessImage(dataURL))
}

/** OCR 预处理: 小文本 1.4~2x 上采样(保真 best 质量), 显著提升 tesseract 准确率与特殊符号保留 */
function preprocessImage(dataURL: string): Buffer {
  const img = nativeImage.createFromDataURL(dataURL)
  const size = img.getSize()
  if (size.width <= 0) return Buffer.from('')
  const maxW = 3200
  const scale = size.width < maxW ? Math.min(2, Math.max(1.4, maxW / size.width)) : 1
  const pre = scale > 1.05 ? img.resize({ width: Math.round(size.width * scale), height: Math.round(size.height * scale), quality: 'best' }) : img
  return pre.toPNG()
}

/** 轻量 .env 加载 (dev 用；打包后走 electron-store，见步骤8) */
function loadDotEnv(): void {
  try {
    const content = readFileSync(join(app.getAppPath(), '.env'), 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
      if (m && !m[1]?.startsWith('#')) {
        const key = m[1] as string
        const val = (m[2] as string).replace(/^["']|["']$/g, '')
        if (!(key in process.env)) process.env[key] = val
      }
    }
    console.log('[main] .env loaded')
  } catch {
    console.log('[main] .env not found, using process env only')
  }
}

let translateRouter: TranslateRouter | null = null
function getTranslateRouter(): TranslateRouter {
  if (!translateRouter) {
    const deepl =
      process.env['DEEPL_API_KEY'] && process.env['DEEPL_API_KEY'] !== ''
        ? new DeepLProvider(process.env['DEEPL_API_KEY'], process.env['DEEPL_API_URL'] ?? 'https://api-free.deepl.com')
        : undefined
    const opencode = new OpencodeProvider({
      baseURL: process.env['OPENCODE_BASE_URL'] ?? 'http://localhost:4096/v1',
      model: process.env['OPENCODE_MODEL'] ?? 'opencode/gemini-2.5-flash',
      apiKey: process.env['OPENCODE_API_KEY'] || undefined,
      timeoutMs: 15000
    })
    translateRouter = new TranslateRouter(deepl, opencode)
    console.log('[main] translate router ready', { deepl: !!deepl, model: opencode['opts' as never] ? '' : '' })
  }
  return translateRouter
}

function getPreloadPath(): string {
  const candidates = [
    join(__dirname, '../preload/preload.cjs'),
    join(__dirname, '../preload/preload.js'),
    join(__dirname, '../preload/preload.mjs')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // 默认返回 cjs，日志会提示不存在
  const def = candidates[0] as string
  console.warn('[main] preload not found, candidates checked:', candidates)
  return def
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createMainWindow() {
  const preload = getPreloadPath()
  console.log('[main] createMainWindow preload:', preload, 'exists:', existsSync(preload))
  mainWindow = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 560,
    minHeight: 520,
    show: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.webContents.on('preload-error', (_e, path, err) => {
    console.error('[main] preload-error', path, err)
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load', code, desc, url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  // Tray icon optional for MVP - skip if no icon file
  try {
    let icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
    if (icon.isEmpty()) {
      // 兜底 1x1 像素拉伸为 16x16 纯色图标，保证托盘可见可退出
      icon = nativeImage
        .createFromDataURL('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBgH/iMBnCAAAAABJRU5ErkJggg==' as never as `${string},${string}` extends never ? never : `data:image/png;base64,${string}` as never)
        .resize({ width: 16, height: 16 })
    }
    tray = new Tray(icon)
  } catch {
    return
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: '截图翻译 (Ctrl+Shift+A)', click: () => triggerCapture() },
    { label: '显示主窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setToolTip('TransShot')
  tray.setContextMenu(contextMenu)
}

async function triggerCapture() {
  // 关键：隐藏主窗口，避免其出现在截图中
  mainWindow?.hide()
  const overlay = getOverlayWindow() ?? createOverlayWindow()
  // 每次触发都让 overlay 重新截屏（refresh/ready 握手），避免陈旧画面
  const ready = new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 900) // 兜底：页面未就绪时直接显示
    ipcMain.once('overlay:ready', () => {
      clearTimeout(t)
      resolve()
    })
  })
  overlay.webContents.send('overlay:refresh')
  await ready
  showOverlay()
  setTimeout(() => overlay.focus(), 30)
}

app.whenReady().then(() => {
  loadDotEnv()
  createMainWindow()
  createTray()
  createOverlayWindow()
  // PaddleOCR sidecar 后台启动(不阻塞 UI); 未就绪时自动回退 tesseract
  paddleSidecar.start().catch((e) => console.warn('[main] paddle sidecar start failed:', e))

  // Global hotkey: Ctrl+Shift+A
  const hotkey = 'CommandOrControl+Shift+A'
  const registered = globalShortcut.register(hotkey, () => {
    triggerCapture()
  })
  if (!registered) {
    console.warn('[main] globalShortcut register failed:', hotkey)
  }

  // IPC: capture
  ipcMain.handle('capture:start', async () => {
    await triggerCapture()
  })

  ipcMain.handle('overlay:close', async () => {
    hideOverlay()
  })

  // overlay 截屏完成信号 (invoke 之外用 send，避免 handler 冲突)
  ipcMain.on('overlay:ready', () => {
    /* 由 triggerCapture 的 once 监听消费 */
  })

  ipcMain.handle('capture:done', async (_e, data: { rect?: { x: number; y: number; width: number; height: number }; dataURL: string; ocrText?: string; zhFast?: string; lang?: string; mode?: 'ocr' | 'translate' }) => {
    hideOverlay()
    // 转发给主窗口 (精译工作台)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('capture:done', data)
      mainWindow.show()
      mainWindow.focus()
    }
  })

  ipcMain.handle('capture:getSources', async () => {
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    const scale = primary.scaleFactor
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width * scale),
        height: Math.round(height * scale)
      }
    })
    // Return dataURL for renderer to crop, 同时返回 scale 供裁剪校正
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      dataURL: s.thumbnail.toDataURL(),
      scaleFactor: scale
    }))
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  // 复制截图图片到系统剪贴板 (可在 QQ/微信/资源管理器粘贴)
  ipcMain.handle('clipboard:copyImage', async (_e, dataURL: string) => {
    const img = nativeImage.createFromDataURL(dataURL)
    if (img.isEmpty()) throw new Error('IMAGE_EMPTY')
    clipboard.writeImage(img)
    console.log('[main] image copied to clipboard')
  })

  // OCR: 主进程运行, Paddle sidecar 优先, tesseract 降级; 不阻塞渲染 UI
  ipcMain.handle('ocr:recognize', async (_e, dataURL: string) => {
    return recognizeSmart(dataURL)
  })

  // 翻译: 快通道同步返回，LLM 精译后台完成后经 translate:refined 推送
  ipcMain.handle('translate:translate', async (_e, req: TranslateRequest) => {
    const win = mainWindow
    return getTranslateRouter().translate(req, {
      onRefined: (p) => {
        if (win && !win.isDestroyed()) win.webContents.send('translate:refined', p)
      }
    })
  })

  // 快译覆盖: 截图 -> OCR(智能链) -> 整段翻译为中文 (免Key, 段落面板显示)
  ipcMain.handle('translate:quick', async (_e, dataURL: string) => {
    const ocr = await recognizeSmart(dataURL)
    if (!ocr.text || ocr.error) {
      return { ocr, full: '', error: ocr.error ?? 'NO_TEXT' }
    }
    if (ocr.lang === 'zh') {
      return { ocr, full: ocr.text }
    }
    // 整段一次翻译(上下文完整, 不截断), 失败回退原文
    const { GoogleFreeProvider } = await import('../src/services/googleFreeProvider')
    const gp = new GoogleFreeProvider()
    let full: string
    try {
      full = await gp.translate(ocr.text, ocr.lang, 'zh', 8000)
    } catch (e) {
      console.warn('[main] quick translate failed, allFallback:', e instanceof Error ? e.message : e)
      full = ocr.text
    }
    const allFallback = full === ocr.text
    if (allFallback) console.warn('[main] quick translate: all lines fell back to original')
    return { ocr, full, allFallback }
  })

  // 兜底：任何时候按 Esc 都尝试隐藏遮罩（防止渲染卡死）
  // 注意：不能全局注册 Escape，会拦截正常输入，仅在 overlay 可见时处理 via before-input-event 已做

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  paddleSidecar.stop()
})
