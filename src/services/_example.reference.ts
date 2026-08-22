/**
 * Reference 样本 — AI 写新 Service 时模仿此风格
 * 特点: 接口抽象, Zod 校验, 错误码, 可mock, 无直接 fetch 污染
 */
import { z } from 'zod'
import { logger } from '@/lib/logger'

// 1. Schema 是真相源
export const ExampleRequestSchema = z.object({
  input: z.string().min(1)
})
export type ExampleRequest = z.infer<typeof ExampleRequestSchema>
export type ExampleResult = { output: string; latencyMs: number }

// 2. 接口
export interface IExampleService {
  execute(req: ExampleRequest): Promise<ExampleResult>
}

// 3. 实现
export class ExampleService implements IExampleService {
  async execute(req: ExampleRequest): Promise<ExampleResult> {
    const parsed = ExampleRequestSchema.parse(req)
    const start = Date.now()
    logger.info('[ExampleService] input:', parsed.input)
    try {
      // 业务逻辑
      const output = parsed.input.toUpperCase()
      return { output, latencyMs: Date.now() - start }
    } catch (e) {
      logger.error('[ExampleService] error', e)
      throw new Error('EXAMPLE_FAILED')
    }
  }
}
