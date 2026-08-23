import type { Lang } from '../types/ocr'

/**
 * 免Key快译引擎 (国内可达优先):
 * 1) Edge 免费端点 api.edge.microsoft.com (国内直连, Edge 浏览器同款)
 * 2) Google translate_a/single (回退, 需可访问 Google)
 * 失败行回退原文，不阻塞覆盖渲染
 */
const EDGE_ENDPOINT = 'https://api.edge.microsoft.com/translate/translate'
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

function toApiLang(l: Lang, zhVariant: string): string {
  if (l === 'zh') return zhVariant
  return l
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

async function edgeTranslate(text: string, from: Lang, to: Lang, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    from: from === 'auto' ? 'auto' : from,
    to: toApiLang(to, 'zh-CN')
  })
  const res = await fetch(`${EDGE_ENDPOINT}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ Text: text }]),
    signal: AbortSignal.timeout(timeoutMs)
  })
  if (!res.ok) throw new Error(`EDGE_HTTP_${res.status}`)
  const json: unknown = await res.json()
  return parseEdgeResponse(json)
}

async function googleTranslate(text: string, from: Lang, to: Lang, timeoutMs: number): Promise<string> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: from === 'auto' ? 'auto' : from,
    tl: toApiLang(to, 'zh-CN'),
    dt: 't',
    q: text
  })
  const res = await fetch(`${GOOGLE_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`GOOGLE_HTTP_${res.status}`)
  const json: unknown = await res.json()
  const out = parseGoogleFreeResponse(json)
  if (!out.trim()) throw new Error('GOOGLE_EMPTY')
  return out
}

export class GoogleFreeProvider {
  name = 'google'
  async translate(text: string, from: Lang, to: Lang, timeoutMs = 3000): Promise<string> {
    if (!text.trim()) throw new Error('EMPTY_TEXT')
    try {
      return await edgeTranslate(text, from, to, timeoutMs)
    } catch {
      // Edge 失败回退 Google
      return googleTranslate(text, from, to, timeoutMs)
    }
  }

  /** 逐行并行，整体超时 3s；失败行回退原文 */
  async translateLines(lines: string[], from: Lang, to: Lang): Promise<string[]> {
    const results = await Promise.all(
      lines.map(async (line) => {
        try {
          return await this.translate(line, from, to)
        } catch {
          return line // 失败回退原文
        }
      })
    )
    return results
  }
}
