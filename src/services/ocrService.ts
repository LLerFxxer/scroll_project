import { createWorker, type Worker } from 'tesseract.js'
import type { IOcrService, OcrResult, Lang, TextBlock } from '../types/ocr'
import { logger } from '../lib/logger'
const TESS_LANGS: string[] = ['chi_sim', 'eng', 'kor']

/**
 * OCR 后处理: tesseract 会在 中文/韩文 与 拉丁/数字 token 间插入空格
 * (可能为半角/全角U+3000/不间断U+00A0), 以及 ° 等符号两侧
 * 清洗: 边界空格删除(保留英文单词内空格), 折叠多余空白
 */
export function cleanOcrText(text: string): string {
  const CJK = '[\\u4e00-\\u9fa5\\u3040-\\u30ff\\uAC00-\\uD7AF]'
  const LAT = '[A-Za-z0-9]'
  const PUNC = '[°·×÷—…±%#@&*:;,.!?()\'"\\[\\]{}]'
  return text
    .replace(new RegExp(`(${CJK})[\\s]+(${LAT}|${PUNC})`, 'g'), '$1$2')
    .replace(new RegExp(`(${LAT}|${PUNC})[\\s]+(${CJK})`, 'g'), '$1$2')
    .replace(/[\u0020\u00a0\u3000]{2,}/g, ' ')
    .replace(/[\u0020\u00a0\u3000]+$/g, '')
    .trim()
}

/**
 * Tesseract 本地 OCR 实现 (降级方案，PaddleOCR 后续接入)
 * Worker 单例懒加载，首次调用有 ~2-5s 初始化(下载语言包)，之后 <1s
 */
export class TesseractOcrService implements IOcrService {
  private worker: Worker | null = null
  private initPromise: Promise<Worker> | null = null

  detectLang(text: string): Lang {
    const ko = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length
    const zh = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
    const en = (text.match(/[a-zA-Z]/g) ?? []).length
    // 按字符占比判定，韩文优先(假名范围不与汉字重叠)
    if (ko > 0 && ko >= zh && ko >= en * 0.3) return 'ko'
    if (zh > 0 && zh >= en * 0.5) return 'zh'
    if (en > 0) return 'en'
    return 'auto'
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker
    if (!this.initPromise) {
      this.initPromise = createWorker(TESS_LANGS, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.info('[OcrService] progress:', Math.round(m.progress * 100), '%')
          }
        }
      })
        .then((w) => {
          this.worker = w
          logger.info('[OcrService] worker ready', TESS_LANGS.join('+'))
          return w
        })
        .catch((e) => {
          this.initPromise = null
          throw e
        })
    }
    return this.initPromise
  }

  async recognize(image: Buffer | string): Promise<OcrResult> {
    const start = Date.now()
    try {
      const worker = await this.ensureWorker()
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
      const raw = (data.text ?? '').trim()
      const text = cleanOcrText(raw)
      const confidence = data.confidence ?? 0
      const lang = this.detectLang(text)
      const latencyMs = Date.now() - start
      // 通查日志: JSON 编码暴露隐藏空格字符码 (U+3000/U+00A0 等)
      logger.info('[OcrService] raw  :', JSON.stringify(raw.slice(0, 160)))
      logger.info('[OcrService] clean:', JSON.stringify(text.slice(0, 160)))
      logger.info('[OcrService] done', { lang, confidence, latencyMs, textLen: text.length })

      // 行级 blocks (bbox 物理像素 x0,y0,x1,y1 -> [x,y,w,h])
      const lines: TextBlock[] = []
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
          for (const line of para.lines ?? []) {
            const t = (line.text ?? '').trim()
            if (!t) continue
            const b = line.bbox
            lines.push({ text: t, bbox: [b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0], confidence: line.confidence ?? confidence })
          }
        }
      }

      if (!text || confidence < 30) {
        return { text, lang, confidence, error: text ? 'LOW_CONFIDENCE' : 'NO_TEXT' }
      }
      return { text, lang, confidence, blocks: lines }
    } catch (e) {
      logger.error('[OcrService] recognize failed', e)
      return { text: '', lang: 'auto', confidence: 0, error: 'ENGINE_ERROR' }
    }
  }

  async dispose(): Promise<void> {
    await this.worker?.terminate()
    this.worker = null
    this.initPromise = null
  }
}

export class PaddleOcrService implements IOcrService {
  detectLang(text: string): Lang {
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
    if (/[\u4e00-\u9fa5]/.test(text)) return 'zh'
    return 'en'
  }

  async recognize(_image: Buffer | string): Promise<OcrResult> {
    // TODO 后续: Node binding 或 Python sidecar 调用 PaddleOCR (速度+准确率更优)
    void _image
    throw new Error('PaddleOcrService not implemented yet')
  }
}

// 工厂
export function createOcrService(engine: 'paddle' | 'tesseract' | 'auto' = 'auto'): IOcrService {
  if (engine === 'paddle') return new PaddleOcrService()
  return new TesseractOcrService()
}
