import { describe, it, expect } from 'vitest'
import { createOcrService } from './ocrService'

describe('OcrService.detectLang', () => {
  it('zh', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('你好世界')).toBe('zh')
  })
  it('ko', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('안녕하세요')).toBe('ko')
  })
  it('en', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('Hello world')).toBe('en')
  })
  it('mixed zh+en -> zh', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('你好 world 世界')).toBe('zh')
  })
})

describe('OcrService.recognize (invalid input)', () => {
  it('empty dataURL returns NO_TEXT or ENGINE_ERROR without crash', async () => {
    const svc = createOcrService('tesseract')
    const res = await svc.recognize('')
    expect(['NO_TEXT', 'ENGINE_ERROR']).toContain(res.error)
    expect(res.confidence).toBe(0)
  }, 15000)
})
