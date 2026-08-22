import type { IOcrService, OcrResult, Lang } from '@/types/ocr'
import { logger } from '@/lib/logger'

// Tesseract 降级实现占位，后续接入 PaddleOCR
export class TesseractOcrService implements IOcrService {
  detectLang(text: string): Lang {
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh'
    return 'en'
  }

  async recognize(image: Buffer | string): Promise<OcrResult> {
    const start = Date.now()
    logger.info('[OcrService] recognize start')

    // MVP: tesseract.js 动态导入，避免主线程阻塞
    // 实际调用: const { createWorker } = await import('tesseract.js')
    // 这里先返回 mock，保证链路可跑通，后续步骤填充真实逻辑
    void image
    void start

    // TODO: Step 5 填充真实 OCR
    // const worker = await createWorker(['chi_sim', 'eng', 'kor'])
    // const { data } = await worker.recognize(image)

    return {
      text: '',
      lang: 'auto' as Lang,
      confidence: 0,
      error: 'ENGINE_ERROR'
    }
  }
}

export class PaddleOcrService implements IOcrService {
  detectLang(text: string): Lang {
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh'
    return 'en'
  }

  async recognize(_image: Buffer | string): Promise<OcrResult> {
    // TODO: 通过 Node binding 或 Python sidecar 调用 PaddleOCR
    throw new Error('PaddleOcrService not implemented yet')
  }
}

// 工厂
export function createOcrService(engine: 'paddle' | 'tesseract' | 'auto' = 'auto'): IOcrService {
  if (engine === 'paddle') return new PaddleOcrService()
  return new TesseractOcrService()
}
