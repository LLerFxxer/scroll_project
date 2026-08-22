import { contextBridge, ipcRenderer } from 'electron'

// Whitelist API
contextBridge.exposeInMainWorld('api', {
  capture: {
    start: () => ipcRenderer.invoke('capture:start'),
    getSources: () => ipcRenderer.invoke('capture:getSources'),
    onDone: (cb: (data: { rect: { x: number; y: number; width: number; height: number }; dataURL: string }) => void) => {
      ipcRenderer.on('capture:done', (_e, data) => cb(data))
    }
  },
  ocr: {
    recognize: (dataURL: string) => ipcRenderer.invoke('ocr:recognize', dataURL)
  },
  translate: {
    translate: (req: unknown) => ipcRenderer.invoke('translate:translate', req)
  },
  save: {
    saveImage: (dataURL: string, opts?: unknown) => ipcRenderer.invoke('save:saveImage', dataURL, opts)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch)
  }
})
