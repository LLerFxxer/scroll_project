import { describe, it, expect, vi } from 'vitest'
import { TranslateRouter, detectTextLang } from './translateRouter'
import type { ITranslateProvider } from '../types/translate'

function stub(name: string, impl: (text: string, from: string, to: string) => Promise<string>, delayMs = 0): ITranslateProvider {
  return {
    name,
    translate: (text, from, to) =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => impl(text, from, to).then(resolve, reject), delayMs)
      )
  }
}

describe('detectTextLang', () => {
  it('zh / ko / en', () => {
    expect(detectTextLang('你好世界')).toBe('zh')
    expect(detectTextLang('안녕하세요')).toBe('ko')
    expect(detectTextLang('Hello world')).toBe('en')
  })
})

describe('TranslateRouter', () => {
  it('fallback when no providers', async () => {
    const router = new TranslateRouter()
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.provider).toBe('fallback')
    expect(res.fast).toBe('Hello')
  })

  it('deepl fast success + opencode refined callback', async () => {
    const onRefined = vi.fn()
    const deepl = stub('deepl', async () => '你好')
    const opencode = stub('opencode', async () => '您好，世界！(精译)', 30)
    const router = new TranslateRouter(deepl, opencode)
    const res = await router.translate({ text: 'Hello world', from: 'en', to: 'zh' }, { onRefined })
    expect(res.provider).toBe('deepl')
    expect(res.fast).toBe('你好')
    await vi.waitFor(() => expect(onRefined).toHaveBeenCalledOnce())
    expect(onRefined).toHaveBeenCalledWith(expect.objectContaining({ text: '您好，世界！(精译)', provider: 'opencode' }))
  })

  it('opencode as fast when no deepl', async () => {
    const opencode = stub('opencode', async () => '안녕하세요 -> 你好')
    const router = new TranslateRouter(undefined, opencode)
    const res = await router.translate({ text: '안녕하세요', to: 'zh' })
    expect(res.provider).toBe('opencode')
    expect(res.detectedFrom).toBe('ko')
    expect(res.fast).toContain('你好')
  })

  it('deepl failure falls back to opencode as fast', async () => {
    const deepl = stub('deepl', async () => Promise.reject(new Error('DEEPL_HTTP_403')))
    const opencode = stub('opencode', async () => 'LLM译')
    const router = new TranslateRouter(deepl, opencode)
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.provider).toBe('opencode')
    expect(res.fast).toBe('LLM译')
  })

  it('deepl timeout (1.5s) switches to opencode', async () => {
    const deepl = stub('deepl', async () => '太慢了', 3000) // 超过 1.5s
    const opencode = stub('opencode', async () => 'LLM快译', 10)
    const router = new TranslateRouter(deepl, opencode)
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.provider).toBe('opencode')
    expect(res.fast).toBe('LLM快译')
  }, 10000)

  it('auto target inference: zh->en, en->zh', async () => {
    const p = stub('deepl', async (_t, _f, to) => `to=${to}`)
    const router = new TranslateRouter(p)
    const r1 = await router.translate({ text: '你好', from: 'zh', to: 'auto' })
    expect(r1.fast).toBe('to=en')
    const r2 = await router.translate({ text: 'Hello', from: 'en', to: 'auto' })
    expect(r2.fast).toBe('to=zh')
  })
})
