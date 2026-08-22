import type { ITranslateRouter, TranslateRequest, TranslateResponse, ITranslateProvider } from '@/types/translate'
import type { Lang } from '@/types/ocr'
import { logger } from '@/lib/logger'

// DeepL Provider 占位
export class DeepLProvider implements ITranslateProvider {
  name = 'deepl'
  constructor(
    private apiKey: string,
    private apiUrl: string
  ) {}
  async translate(text: string, _from: Lang, to: Lang): Promise<string> {
    if (!this.apiKey) throw new Error('DEEPL_NO_KEY')
    void this.apiUrl
    // TODO Step 6: fetch DeepL API
    // const res = await fetch(`${this.apiUrl}/v2/translate`, {method:'POST', body: ...})
    return `[DeepL mock:${to}] ${text}`
  }
}

// opencode LLM Provider
export class OpencodeProvider implements ITranslateProvider {
  name = 'opencode'
  constructor(
    private baseURL: string,
    private model: string,
    private apiKey?: string
  ) {}
  async translate(text: string, from: Lang, to: Lang): Promise<string> {
    void from
    // TODO Step 6: OpenAI 兼容调用
    // const client = new OpenAI({baseURL: this.baseURL, apiKey: this.apiKey})
    // const res = await client.chat.completions.create({model: this.model, messages: [...]})
    return `[opencode ${this.model} ${to}] ${text}`
  }
}

function detectLang(text: string): Lang {
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh'
  return 'en'
}

function inferTarget(from: Lang): Lang {
  if (from === 'zh') return 'en'
  if (from === 'ko') return 'zh'
  return 'zh' // en -> zh default
}

export class TranslateRouter implements ITranslateRouter {
  constructor(
    private deepl?: DeepLProvider,
    private opencode?: OpencodeProvider
  ) {}

  async translate(req: TranslateRequest): Promise<TranslateResponse> {
    const from: Lang = (req.from && req.from !== 'auto' ? req.from : detectLang(req.text)) as Lang
    const to: Lang = req.to === 'auto' ? inferTarget(from) : (req.to as Lang)

    const start = Date.now()
    let fast = ''
    let provider: TranslateResponse['provider'] = 'fallback'
    let fastLatency = 0

    // 快通道: DeepL
    if (this.deepl) {
      try {
        const t0 = Date.now()
        fast = await this.deepl.translate(req.text, from, to)
        fastLatency = Date.now() - t0
        provider = 'deepl'
      } catch (e) {
        logger.warn('[TranslateRouter] deepl failed', e)
      }
    }

    // 若快通道失败，尝试 opencode 作为 fast
    let refined: string | undefined
    let refinedLatency: number | undefined

    if (this.opencode) {
      try {
        const t1 = Date.now()
        const result = await this.opencode.translate(req.text, from, to)
        refinedLatency = Date.now() - t1
        if (!fast) {
          fast = result
          fastLatency = refinedLatency
          provider = 'opencode'
        } else {
          refined = result
        }
      } catch (e) {
        logger.warn('[TranslateRouter] opencode failed', e)
      }
    }

    if (!fast) {
      fast = req.text // fallback 至少返回原文
      provider = 'fallback'
    }

    logger.info('[TranslateRouter]', { from, to, provider, fastLatency })

    return {
      fast,
      refined,
      provider,
      detectedFrom: from,
      latencyMs: { fast: fastLatency || Date.now() - start, refined: refinedLatency }
    }
  }
}
