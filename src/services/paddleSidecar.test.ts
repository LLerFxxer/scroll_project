import { describe, it, expect } from 'vitest'
import { parsePaddleResponse } from './paddleSidecar'

describe('parsePaddleResponse', () => {
  it('valid zh response', () => {
    const res = parsePaddleResponse({
      text: '冷知识，mod4又加强了，sp6直购门槛大幅下降',
      confidence: 0.96,
      lines: ['冷知识，mod4又加强了，sp6直购门槛大幅下降'],
      lang: 'zh'
    } as unknown)
    expect(res.text).toContain('mod4又')
    expect(res.lang).toBe('zh')
    expect(res.confidence).toBe(0.96)
  })
  it('korean lang mapping', () => {
    const res = parsePaddleResponse({ text: '안녕하세요', confidence: 0.9, lines: [], lang: 'ko' } as unknown)
    expect(res.lang).toBe('ko')
  })
  it('throws on error field', () => {
    expect(() => parsePaddleResponse({ error: 'CUDA_OUT_OF_MEMORY' } as unknown)).toThrow('PADDLE_')
  })
  it('throws on empty text', () => {
    expect(() => parsePaddleResponse({ text: '  ' } as unknown)).toThrow('PADDLE_EMPTY')
  })
})
