import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const primaryDisplay = screen.getPrimaryDisplay()
  const { bounds, size } = primaryDisplay
  // 使用 bounds.x/y 兼容多显示器，size 为 DIP 像素
  const width = size.width
  const height = size.height

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    backgroundColor: '#00000000',
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
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
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
