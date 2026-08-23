import { useState, useCallback, useEffect, useRef } from 'react'
import type { TranslateRequest, TranslateResponse } from '@/types/translate'

export function useTranslate() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TranslateResponse | null>(null)
  const [refined, setRefined] = useState<{ text: string; provider: string; latencyMs: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seqRef = useRef(0)

  // 订阅主进程推送的 LLM 精译结果
  useEffect(() => {
    window.api.translate.onRefined((p) => {
      setRefined({ text: p.text, provider: p.provider, latencyMs: p.latencyMs })
    })
  }, [])

  const translate = useCallback(async (req: TranslateRequest) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setRefined(null)
    try {
      const res = await window.api.translate.translate(req)
      void seqRef.current++
      setResult(res)
      return res
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { translate, result, refined, loading, error }
}
