import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createOverlayWindow, getOverlayWindow, hideOverlay, showOverlay } from './overlay'
import type { IOcrService } from '../src/types/ocr'
import type { TranslateRequest } from '../src/types/translate'
import { TranslateRouter, DeepLProvider, OpencodeProvider } from '../src/services/translateRouter'

let ocrService: IOcrService | null = null

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
    width: 420,
    height: 600,
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
    tray = new Tray(join(__dirname, '../../build/icon.png'))
  } catch {
    return
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: '截图翻译 (Ctrl+Shift+A)', click: () => triggerCapture() },
    { label: '设置', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setToolTip('TransShot')
  tray.setContextMenu(contextMenu)
}

async function triggerCapture() {
  const overlay = getOverlayWindow() ?? createOverlayWindow()
  showOverlay()
  // 确保 overlay 内容已加载，延迟 50ms 再聚焦，避免焦点丢失
  setTimeout(() => overlay.focus(), 50)
}

app.whenReady().then(() => {
  loadDotEnv()
  createMainWindow()
  createTray()
  createOverlayWindow()

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

  ipcMain.handle('capture:done', async (_e, data: { rect: { x: number; y: number; width: number; height: number }; dataURL: string }) => {
    hideOverlay()
    // 转发给主窗口
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

  // OCR: 主进程运行 tesseract worker，避免阻塞渲染进程 UI
  // 注意：首次调用会下载语言包 (~15MB)，之后走缓存
  ipcMain.handle('ocr:recognize', async (_e, dataURL: string) => {
    const { createOcrService } = await import('../src/services/ocrService')
    if (!ocrService) {
      ocrService = createOcrService('tesseract')
    }
    return ocrService.recognize(dataURL)
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
})
