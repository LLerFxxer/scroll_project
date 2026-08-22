import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

function getPreloadPath(): string {
  const candidates = [join(__dirname, '../preload/preload.js'), join(__dirname, '../preload/preload.mjs')]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  console.warn('[overlay] preload not found, candidates:', candidates)
  return candidates[0] as string
}

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const primaryDisplay = screen.getPrimaryDisplay()
  const { bounds, size } = primaryDisplay
  // 使用 bounds.x/y 兼容多显示器，size 为 DIP 像素
  const width = size.width
  const height = size.height

  const preload = getPreloadPath()
  console.log('[overlay] preload:', preload, 'exists:', existsSync(preload))
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: bounds.x,
    y: bounds.y,
    // 关键修复：Win下 transparent:true 会导致点击穿透，改为不透明黑底 + 截图作背景
    transparent: false,
    backgroundColor: '#000000',
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    fullscreenable: false,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Load same renderer but with query ?overlay
  if (process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?overlay=1`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { overlay: '1' } })
  }

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // ESC 兜底由渲染进程处理，这里仅防止失焦自动隐藏
  // overlayWindow.on('blur', () => {})

  // 确保鼠标事件不被忽略
  overlayWindow.setIgnoreMouseEvents(false)
  // 防止闪烁
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')

  // ESC 兜底：主进程层面监听，确保渲染进程卡死也能退出
  overlayWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'Escape') {
      console.log('[overlay] Escape at main, hiding')
      hideOverlay()
    }
  })

  // 调试：dev 时自动打开 DevTools
  if (process.env['ELECTRON_RENDERER_URL']) {
    // overlayWindow.webContents.openDevTools({ mode: 'detach' })
  }

  console.log('[overlay] created', { width, height, x: bounds.x, y: bounds.y, transparent: false })

  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function hideOverlay() {
  overlayWindow?.hide()
}

export function showOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow()
  }
  overlayWindow?.show()
  overlayWindow?.focus()
  overlayWindow?.setIgnoreMouseEvents(false)
}
