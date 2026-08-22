import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { createOverlayWindow, getOverlayWindow, hideOverlay, showOverlay } from './overlay'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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
