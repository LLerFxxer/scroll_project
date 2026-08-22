import { z } from 'zod'

export const LangSchema = z.enum(['zh', 'en', 'ko', 'auto'])
export type Lang = z.infer<typeof LangSchema>

export type TextBlock = {
  text: string
  bbox: [number, number, number, number]
  confidence: number
}

export type OcrResult = {
  text: string
  lang: Lang
  confidence: number
  blocks?: TextBlock[]
  error?: 'NO_TEXT' | 'LOW_CONFIDENCE' | 'ENGINE_ERROR'
}

export interface IOcrService {
  recognize(image: Buffer | string): Promise<OcrResult>
  detectLang(text: string): Lang
}
