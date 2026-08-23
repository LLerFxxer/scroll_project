import type { Lang } from '../types/ocr'
import { logger } from '../lib/logger'

/**
 * 免Key快译引擎 (国内可达优先):
 * 1) Edge api.edge.microsoft.com (国内直连, 带 UA 头)
 * 2) Google translate_a/single (回退)
 * 3) MyMemory api.mymemory.translated.net (回退, 匿名 5k 字符/天)
 * 全失败时 translateLines 回退原文并打日志；遮罩层会提示"快译不可用"
 */
const EDGE_ENDPOINT = 'https://api.edge.microsoft.com/translate/translate'
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'

function toApiLang(l: Lang, zhVariant: string): string {
  if (l === 'zh') return zhVariant
  return l
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Edge 响应: [{ DetectedLanguage, Translations:[{Text,To}] }] -> 首条译文 */
export function parseEdgeResponse(json: unknown): string {
  const j = json as [{ Translations?: { Text?: string }[] }]
  const t = j?.[0]?.Translations?.[0]?.Text
  if (typeof t !== 'string' || !t) throw new Error('EDGE_PARSE_FAIL')
  return t
}

/** Google 响应: [[["译","原",...],...],...] -> 拼接译文 */
export function parseGoogleFreeResponse(json: unknown): string {
  const j = json as [[[string, ...unknown[]], ...[[string, ...unknown[]]]], ...unknown[]]
  const segs = j?.[0]
  if (!Array.isArray(segs)) throw new Error('GOOGLE_PARSE_FAIL')
  return segs
    .map((s) => (Array.isArray(s) ? (s[0] as string ?? '') : ''))
    .join('')
}

/** MyMemory 响应: { responseData:{ translatedText } } */
export function parseMyMemoryResponse(json: unknown): string {
  const j = json as { responseData?: { translatedText?: string } }
  const out = j.responseData?.translatedText
  if (!out || out.startsWith('MYMEMORY WARNING')) throw new Error('MYMEMORY_FAIL')
  return out
}

async function edgeTranslate(text: string, from: Lang, to: Lang, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    from: from === 'auto' ? 'auto' : from,
    to: toApiLang(to, 'zh-CN')
  })
  const res = await fetch(`${EDGE_ENDPOINT}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify([{ Text: text }]),
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`EDGE_HTTP_${res.status}`)
  const json: unknown = await res.json()
  const out = parseEdgeResponse(json)
  if (!out.trim()) throw new Error('EDGE_EMPTY')
  return out
}

async function googleTranslate(text: string, from: Lang, to: Lang, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from === 'auto' ? 'auto' : from,
    tl: toApiLang(to, 'zh-CN'),
    dt: 't',
    q: text
  })
  const res = await fetch(`${GOOGLE_ENDPOINT}?${params}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`GOOGLE_HTTP_${res.status}`)
  const json: unknown = await res.json()
  const out = parseGoogleFreeResponse(json)
  if (!out.trim()) throw new Error('GOOGLE_EMPTY')
  return out
}

async function myMemoryTranslate(text: string, from: Lang, to: Lang, timeoutMs: number): Promise<string> {
  const lp = `${from === 'auto' ? 'auto' : from}|${toApiLang(to, 'zh-CN')}`
  const res = await fetch(
    `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(lp)}`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) }
  )
  if (!res.ok) throw new Error(`MYMEMORY_HTTP_${res.status}`)
  const json: unknown = await res.json()
  const out = parseMyMemoryResponse(json)
  if (!out.trim()) throw new Error('MYMEMORY_EMPTY')
  return out
}

export class GoogleFreeProvider {
  name = 'google'
  async translate(text: string, from: Lang, to: Lang, timeoutMs = 3000): Promise<string> {
    if (!text.trim()) throw new Error('EMPTY_TEXT')
    const chain = [edgeTranslate, googleTranslate, myMemoryTranslate]
    const errors: string[] = []
    for (const fn of chain) {
      try {
        return await fn(text, from, to, timeoutMs)
      } catch (e) {
        errors.push(errMsg(e))
      }
    }
    throw new Error(`FREE_ALL_FAILED: ${errors.join(' | ')}`)
  }

  /** 逐行并行，失败行回退原文并打日志 */
  async translateLines(lines: string[], from: Lang, to: Lang): Promise<string[]> {
    const results = await Promise.all(
      lines.map(async (line) => {
        try {
          return await this.translate(line, from, to)
        } catch (e) {
          logger.warn('[FreeTranslate] line fallback:', errMsg(e).slice(0, 160))
          return line
        }
      })
    )
    return results
  }
}