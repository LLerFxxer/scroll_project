import type { TranslateRequest, TranslateResponse, ITranslateProvider, ITranslateRouter } from '../types/translate'
import type { Lang } from '../types/ocr'
import { logger } from '../lib/logger'

export function detectTextLang(text: string): Lang {
  const ko = (text.match(/[\uAC00-\uD7AF]/g) ?? []).length
  const zh = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const en = (text.match(/[a-zA-Z]/g) ?? []).length
  if (ko > 0 && ko >= zh && ko >= en * 0.3) return 'ko'
  if (zh > 0 && zh >= en * 0.5) return 'zh'
  return 'en'
}

function inferTarget(from: Lang): Lang {
  if (from === 'zh') return 'en'
  return 'zh' // en/ko -> zh
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}_TIMEOUT_${ms}ms`)), ms)
    p.then((v) => {
      clearTimeout(t)
      resolve(v)
    }).catch((e) => {
      clearTimeout(t)
      reject(e)
    })
  })
}

/** DeepL REST 快通道 (api-free: 500k字符/月) */
export class DeepLProvider implements ITranslateProvider {
  name = 'deepl'
  constructor(
    private apiKey: string,
    private apiUrl: string // https://api-free.deepl.com | https://api.deepl.com
  ) {}
  async translate(text: string, _from: Lang, to: Lang): Promise<string> {
    if (!this.apiKey) throw new Error('DEEPL_NO_KEY')
    const target = to.toUpperCase() // ZH | EN | KO
    const body = new URLSearchParams({ text, target_lang: target })
    const res = await fetch(`${this.apiUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    })
    if (!res.ok) throw new Error(`DEEPL_HTTP_${res.status}`)
    const json = (await res.json()) as { translations?: { text?: string }[] }
    const out = json.translations?.[0]?.text ?? ''
    if (!out) throw new Error('DEEPL_EMPTY')
    return out
  }
}

const LANG_NAME: Record<Lang, string> = { zh: 'Simplified Chinese', en: 'English', ko: 'Korean', auto: 'the source language' }

/** opencode LLM 精译通道 (OpenAI 兼容 /chat/completions) */
export class OpencodeProvider implements ITranslateProvider {
  name = 'opencode'
  constructor(
    private opts: { baseURL: string; model: string; apiKey?: string; timeoutMs?: number }
  ) {}
  async translate(text: string, from: Lang, to: Lang): Promise<string> {
    void this.opts.timeoutMs // 超时由 Router withTimeout 控制
    const src = from === 'auto' ? '' : ` written in ${LANG_NAME[from]}`
    const prompt =
      `You are a professional translator. Translate the following text${src} into ${LANG_NAME[to]}. ` +
      `Rules: output ONLY the translation without any explanation; keep line breaks, numbers, proper nouns and code identifiers unchanged; use natural idiomatic phrasing.\n\n${text}`
    const res = await fetch(`${this.opts.baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.opts.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15000)
    })
    if (!res.ok) throw new Error(`OPENCODE_HTTP_${res.status}`)
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const out = j.choices?.[0]?.message?.content?.trim() ?? ''
    if (!out) throw new Error('OPENCODE_EMPTY')
    return out
  }
}

export type RefinedPayload = { requestId: number; text: string; provider: string; latencyMs: number }

/**
 * 混合路由:
 * 1) DeepL(1.5s超时) 成功 -> 立即返回 fast；opencode 后台精译 via onRefined
 * 2) DeepL 失败/无Key -> opencode 作为 fast (8s 超时)，无 refined
 * 3) 全失败 -> fast=原文 fallback
 */
export class TranslateRouter implements ITranslateRouter {
  private seq = 0
  constructor(
    private deepl?: ITranslateProvider,
    private opencode?: ITranslateProvider
  ) {}

  async translate(
    req: TranslateRequest,
    hooks?: { onRefined?: (p: RefinedPayload) => void }
  ): Promise<TranslateResponse> {
    const from: Lang = req.from && req.from !== 'auto' ? req.from : detectTextLang(req.text)
    const to: Lang = req.to === 'auto' ? inferTarget(from) : req.to
    const requestId = ++this.seq
    const start = Date.now()
    logger.info('[TranslateRouter] req', { requestId, from, to, len: req.text.length })

    let fast = ''
    let provider: TranslateResponse['provider'] = 'fallback'

    // --- 快通道: DeepL ---
    if (this.deepl) {
      try {
        fast = await withTimeout(this.deepl.translate(req.text, from, to), 1500, 'DEEPL')
        provider = 'deepl'
      } catch (e) {
        logger.warn('[TranslateRouter] deepl fast failed:', e instanceof Error ? e.message : e)
      }
    }

    // --- 精通道: opencode ---
    let refinedPromise: Promise<void> | null = null
    if (this.opencode) {
      const p = (async () => {
        const t1 = Date.now()
        try {
          const refined = await this.opencode!.translate(req.text, from, to)
          if (!fast) {
            fast = refined
            provider = 'opencode'
          } else {
            hooks?.onRefined?.({ requestId, text: refined, provider: 'opencode', latencyMs: Date.now() - t1 })
          }
        } catch (e) {
          logger.warn('[TranslateRouter] opencode failed:', e instanceof Error ? e.message : e)
        }
      })()

      if (fast) {
        // 已有快译：LLM 后台跑，不阻塞返回
        refinedPromise = p
      } else {
        // 无快译：LLM 就是快通道，最多等 8s
        try {
          await withTimeout(p, 8000, 'OPENCODE_FAST')
        } catch {
          /* 已在内部 catch */
        }
      }
    }

    if (!fast) {
      logger.warn('[TranslateRouter] all providers failed, fallback raw text')
      fast = req.text
      provider = 'fallback'
    }

    const latencyMs = Date.now() - start
    logger.info('[TranslateRouter] done', { requestId, provider, latencyMs })

    // 防止未消费的 refined rejection
    refinedPromise?.catch(() => undefined)

    return { fast, provider, detectedFrom: from, latencyMs: { fast: latencyMs }, requestId }
  }
}
