import { describe, it, expect } from 'vitest'
import { TranslateRouter, DeepLProvider, OpencodeProvider } from './translateRouter'

describe('TranslateRouter', () => {
  it('fast fallback when no provider', async () => {
    const router = new TranslateRouter()
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.fast).toBe('Hello')
    expect(res.provider).toBe('fallback')
  })

  it('uses deepl as fast', async () => {
    const deepl = new DeepLProvider('fake-key', 'https://api-free.deepl.com')
    const router = new TranslateRouter(deepl)
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.fast).toContain('Hello')
    expect(res.provider).toBe('deepl')
    expect(res.detectedFrom).toBe('en')
  })

  it('uses opencode when deepl missing', async () => {
    const opencode = new OpencodeProvider('http://localhost:4096/v1', 'test-model')
    const router = new TranslateRouter(undefined, opencode)
    const res = await router.translate({ text: '안녕하세요', to: 'zh' })
    expect(res.fast).toContain('안녕하세요')
    expect(res.provider).toBe('opencode')
    expect(res.detectedFrom).toBe('ko')
  })

  it('hybrid: fast from deepl, refined from opencode', async () => {
    const deepl = new DeepLProvider('k', 'url')
    const opencode = new OpencodeProvider('http://localhost:4096/v1', 'm')
    const router = new TranslateRouter(deepl, opencode)
    const res = await router.translate({ text: 'Hello', to: 'zh' })
    expect(res.fast).toBeDefined()
    expect(res.refined).toBeDefined()
  })
})
