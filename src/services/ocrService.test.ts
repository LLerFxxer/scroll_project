import { describe, it, expect } from 'vitest'
import { createOcrService, cleanOcrText } from './ocrService'

describe('cleanOcrText', () => {
  it('removes space between CJK and latin/digit', () => {
    expect(cleanOcrText('冷知识，mod4 又加强了，sp6 直购')).toBe('冷知识，mod4又加强了，sp6直购')
  })
  it('handles digit before CJK', () => {
    expect(cleanOcrText('打 pab9 经济弹')).toBe('打pab9经济弹')
  })
  it('keeps spaces between english words', () => {
    expect(cleanOcrText('car rental service 中文')).toBe('car rental service中文')
  })
  it('collapses multiple spaces', () => {
    expect(cleanOcrText('a   b\n c ')).toBe('a b\n c')
  })
  it('kespace between hangul and latin', () => {
    expect(cleanOcrText('안녕 123')).toBe('안녕123')
  })
})

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
