import type { Rect, SaveOpts } from '@/types/capture'

export interface INativeCapture {
  start(): Promise<void>
  getSources(): Promise<{ id: string; name: string; dataURL: string }[]>
  onDone(cb: (data: { rect: Rect; dataURL: string }) => void): void
}

export interface INativeSave {
  saveImage(dataURL: string, opts?: SaveOpts): Promise<{ path: string }>
}

// Electron 实现 vs 未来 Tauri 实现均实现此接口
