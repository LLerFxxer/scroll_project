import type { Lang } from '../types/ocr'

/**
 * Google 免费翻译端点 (无Key, 快 ~100-300ms)
 * GET translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=...
 * 仅用于快通道覆盖渲染；精译走 DeepL/opencode LLM
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

/** 解析响应: [[["译","原",...],...],[...],...] -> 拼接译文 */
export function parseGoogleFreeResponse(json: unknown): string {
  const j = json as [[[string, ...unknown[]], ...[[string, ...unknown[]]]], ...unknown[]]
  const segs = j?.[0]
  if (!Array.isArray(segs)) throw new Error('GOOGLE_PARSE_FAIL')
  return segs
    .map((s) => (Array.isArray(s) ? (s[0] as string ?? '') : ''))
    .join('')
}

export class GoogleFreeProvider {
  name = 'google'
  async translate(text: string, from: Lang, to: Lang, timeoutMs = 3000): Promise<string> {
    if (!text.trim()) throw new Error('GOOGLE_EMPTY')
    const tl = to === 'zh' ? 'zh-CN' : to // zh-CN / en / ko
    const params = new URLSearchParams({
      client: 'gtx',
      sl: from === 'auto' ? 'auto' : from,
      tl,
      dt: 't',
      dj: '0',
      q: text
    })
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new Error(`GOOGLE_HTTP_${res.status}`)
    const json: unknown = await res.json()
    const out = parseGoogleFreeResponse(json)
    if (!out.trim()) throw new Error('GOOGLE_EMPTY')
    return out
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
