/// <reference types="vite/client" />

interface Window {
  api: {
    capture: {
      start(): Promise<void>
      getSources(): Promise<{ id: string; name: string; dataURL: string; scaleFactor?: number }[]>
      done(data: { rect?: { x: number; y: number; width: number; height: number }; dataURL: string; ocrText?: string; zhFast?: string; lang?: string }): Promise<void>
      onDone(cb: (data: { rect?: { x: number; y: number; width: number; height: number }; dataURL: string; ocrText?: string; zhFast?: string; lang?: string }) => void): void
    }
    overlay: {
      close(): Promise<void>
      ready(): void
      onRefresh(cb: () => void): void
    }
    ocr: {
      recognize(dataURL: string): Promise<import('./src/types/ocr').OcrResult>
    }
    translate: {
      translate(req: import('./src/types/translate').TranslateRequest): Promise<import('./src/types/translate').TranslateResponse>
      onRefined(cb: (p: { requestId: number; text: string; provider: string; latencyMs: number }) => void): void
      quick(dataURL: string): Promise<{ ocr: import('./src/types/ocr').OcrResult; lines: Array<import('./src/types/ocr').TextBlock & { translated: string }>; error?: string; allFallback?: boolean }>
    }
    save: {
      saveImage(dataURL: string, opts?: import('./src/types/capture').SaveOpts): Promise<{ path: string }>
    }
    settings: {
      get(): Promise<import('./src/types/settings').AppSettings>
      set(patch: Partial<import('./src/types/settings').AppSettings>): Promise<void>
    }
  }
}
