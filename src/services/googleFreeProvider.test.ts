import { describe, it, expect } from 'vitest'
import { parseGoogleFreeResponse } from './googleFreeProvider'

describe('GoogleFreeProvider', () => {
  it('parse valid response', () => {
    // 模拟真实响应: [[["你好","Hello",...]],...]
    const json = [[['你好', 'Hello']], null, 'en'] as unknown
    expect(parseGoogleFreeResponse(json)).toBe('你好')
  })
  it('parse multiple segments', () => {
    const json = [
      [
        ['第一行', 'line1'],
        ['第二行', 'line2']
      ]
    ] as unknown
    expect(parseGoogleFreeResponse(json)).toBe('第一行第二行')
  })
  it('throws on invalid', () => {
    expect(() => parseGoogleFreeResponse(null as unknown)).toThrow('GOOGLE_PARSE_FAIL')
    expect(() => parseGoogleFreeResponse({} as unknown)).toThrow('GOOGLE_PARSE_FAIL')
  })
})
