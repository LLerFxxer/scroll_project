import { z } from 'zod'

export const AppSettingsSchema = z.object({
  hotkey: z.string().default('CommandOrControl+Shift+A'),
  targetLang: z.enum(['zh', 'en', 'ko', 'auto']).default('auto'),
  saveDir: z.string().default(''),
  deeplApiKey: z.string().optional(),
  deeplApiUrl: z.string().default('https://api-free.deepl.com'),
  opencode: z.object({
    baseURL: z.string().default('http://localhost:4096/v1'),
    model: z.string().default('opencode/gemini-2.5-flash'),
    apiKey: z.string().optional()
  }),
  ocr: z.object({
    engine: z.enum(['paddle', 'tesseract', 'auto']).default('auto'),
    langs: z.array(z.enum(['zh', 'en', 'ko'])).default(['zh', 'en', 'ko'])
  })
})

export type AppSettings = z.infer<typeof AppSettingsSchema>

export const defaultSettings: AppSettings = {
  hotkey: 'CommandOrControl+Shift+A',
  targetLang: 'auto',
  saveDir: '',
  deeplApiUrl: 'https://api-free.deepl.com',
  opencode: {
    baseURL: 'http://localhost:4096/v1',
    model: 'opencode/gemini-2.5-flash'
  },
  ocr: {
    engine: 'auto',
    langs: ['zh', 'en', 'ko']
  }
}
