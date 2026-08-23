import { z } from 'zod'
import type { Lang } from './ocr'

export const TranslateRequestSchema = z.object({
  text: z.string().min(1),
  from: z.enum(['zh', 'en', 'ko', 'auto']).optional(),
  to: z.enum(['zh', 'en', 'ko', 'auto']),
  glossary: z.record(z.string()).optional()
})

export type TranslateRequest = z.infer<typeof TranslateRequestSchema>

export type TranslateResponse = {
  fast: string
  refined?: string
  provider: 'deepl' | 'opencode' | 'google' | 'fallback'
  detectedFrom: Lang
  latencyMs: { fast: number; refined?: number }
  requestId?: number
}

export interface ITranslateRouter {
  translate(req: TranslateRequest): Promise<TranslateResponse>
}

export interface ITranslateProvider {
  translate(text: string, from: Lang, to: Lang): Promise<string>
  name: string
}
