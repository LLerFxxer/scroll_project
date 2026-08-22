import { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, desktopCapturer, screen } from 'electron'
import { join } from 'path'
import { createOverlayWindow, getOverlayWindow } from './overlay'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
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
  // Get primary display screenshot via desktopCapturer in overlay process
  // Here we just show overlay, overlay will request desktopCapturer itself
  overlay.show()
  overlay.focus()
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

  ipcMain.handle('capture:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: screen.getPrimaryDisplay().size.width,
        height: screen.getPrimaryDisplay().size.height
      }
    })
    // Return dataURL for renderer to crop
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      dataURL: s.thumbnail.toDataURL()
    }))
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

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
