import { useState, useCallback } from 'react'
import { TranslateRouter, DeepLProvider, OpencodeProvider } from '@/services/translateRouter'
import type { TranslateRequest, TranslateResponse } from '@/types/translate'

export function useTranslate() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TranslateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const translate = useCallback(async (req: TranslateRequest) => {
    setLoading(true)
    setError(null)
    try {
      // 从 window.api.settings 读取配置，注入 router
      // MVP 先用无配置 mock
      const router = new TranslateRouter(
        new DeepLProvider('', 'https://api-free.deepl.com'),
        new OpencodeProvider('http://localhost:4096/v1', 'opencode/gemini-2.5-flash')
      )
      const res = await router.translate(req)
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

  return { translate, result, loading, error }
}
