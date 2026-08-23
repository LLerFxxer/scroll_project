import { contextBridge, ipcRenderer } from 'electron'

console.log('[preload] loading', new Date().toISOString())

// Whitelist API
contextBridge.exposeInMainWorld('api', {
  capture: {
    start: () => ipcRenderer.invoke('capture:start'),
    getSources: () => ipcRenderer.invoke('capture:getSources'),
    done: (data: { rect?: { x: number; y: number; width: number; height: number }; dataURL: string; ocrText?: string; zhFast?: string; lang?: string }) =>
      ipcRenderer.invoke('capture:done', data),
    onDone: (cb: (data: { rect?: { x: number; y: number; width: number; height: number }; dataURL: string; ocrText?: string; zhFast?: string; lang?: string }) => void) => {
      ipcRenderer.on('capture:done', (_e, data) => cb(data))
    }
  },
  overlay: {
    close: () => ipcRenderer.invoke('overlay:close'),
    ready: () => ipcRenderer.send('overlay:ready'),
    onRefresh: (cb: () => void) => {
      ipcRenderer.on('overlay:refresh', () => cb())
    }
  },
  ocr: {
    recognize: (dataURL: string) => ipcRenderer.invoke('ocr:recognize', dataURL)
  },
  translate: {
    translate: (req: unknown) => ipcRenderer.invoke('translate:translate', req),
    onRefined: (cb: (p: { requestId: number; text: string; provider: string; latencyMs: number }) => void) => {
      ipcRenderer.on('translate:refined', (_e, p) => cb(p))
    },
    quick: (dataURL: string) => ipcRenderer.invoke('translate:quick', dataURL) as Promise<{ ocr: import('../src/types/ocr').OcrResult; lines: Array<import('../src/types/ocr').TextBlock & { translated: string }>; error?: string }>
  },
  save: {
    saveImage: (dataURL: string, opts?: unknown) => ipcRenderer.invoke('save:saveImage', dataURL, opts)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch)
  }
})
