import { describe, it, expect } from 'vitest'
import { createOcrService } from './ocrService'

describe('OcrService', () => {
  it('detectLang zh', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('你好世界')).toBe('zh')
  })
  it('detectLang ko', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('안녕하세요')).toBe('ko')
  })
  it('detectLang en', () => {
    const svc = createOcrService('tesseract')
    expect(svc.detectLang('Hello world')).toBe('en')
  })
  it('recognize returns structure', async () => {
    const svc = createOcrService('tesseract')
    const res = await svc.recognize('data:image/png;base64,')
    expect(res).toHaveProperty('text')
    expect(res).toHaveProperty('confidence')
  })
})
