import { describe, it, expect } from 'vitest'
import { parseGoogleFreeResponse, parseEdgeResponse, parseMyMemoryResponse } from './googleFreeProvider'

describe('parseEdgeResponse', () => {
  it('valid edge response', () => {
    const json = [{ DetectedLanguage: 'en', Translations: [{ Text: '你好', To: 'zh-Hans' }] }] as unknown
    expect(parseEdgeResponse(json)).toBe('你好')
  })
  it('throws on invalid', () => {
    expect(() => parseEdgeResponse([] as unknown)).toThrow('EDGE_PARSE_FAIL')
    expect(() => parseEdgeResponse({} as unknown)).toThrow('EDGE_PARSE_FAIL')
  })
})

describe('parseGoogleFreeResponse', () => {
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

describe('parseMyMemoryResponse', () => {
  it('valid response', () => {
    const json = { responseData: { translatedText: '你好，世界', match: 1 }, responseStatus: 200 } as unknown
    expect(parseMyMemoryResponse(json)).toBe('你好，世界')
  })
  it('throws on quota warning', () => {
    const json = { responseData: { translatedText: 'MYMEMORY WARNING: YOU HAVE USED ALL YOUR AVAILABLE FREE TRANSLATIONS FOR TODAY' } } as unknown
    expect(() => parseMyMemoryResponse(json)).toThrow('MYMEMORY_FAIL')
  })
  it('throws on empty', () => {
    expect(() => parseMyMemoryResponse({} as unknown)).toThrow('MYMEMORY_FAIL')
  })
})
