import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { logger } from '../lib/logger'

export type PaddleResult = {
  text: string
  confidence: number
  lines: string[]
  lang: 'zh' | 'ko'
}

/** 解析 sidecar JSON (纯函数, 可单测) */
export function parsePaddleResponse(json: unknown): PaddleResult {
  const j = json as { text?: string; confidence?: number; lines?: string[]; lang?: string; error?: string }
  if (j.error) throw new Error(`PADDLE_${String(j.error).slice(0, 120)}`)
  const text = (j.text ?? '').trim()
  if (!text) throw new Error('PADDLE_EMPTY')
  return {
    text,
    confidence: j.confidence ?? 0,
    lines: j.lines ?? [],
    lang: j.lang === 'ko' ? 'ko' : 'zh'
  }
}

/**
 * PaddleOCR sidecar 管理: spawn python 进程 -> 健康检查 -> /ocr 请求
 * 未就绪时 ocr() 抛错, 上层回退 tesseract
 */
export class PaddleSidecar {
  private proc: ChildProcess | null = null
  private port = 0
  ready = false

  constructor(
    private scriptPath: string,
    private pythonBin = process.env['PADDLE_PYTHON'] ?? 'python'
  ) {}

  async start(timeoutMs = 90_000): Promise<void> {
    if (this.ready) return
    // 端口取 8765 起 + 随机偏移, 避免与多实例冲突
    this.port = 8765 + Math.floor(Math.random() * 100)
    logger.info('[PaddleSidecar] spawn', this.pythonBin, this.scriptPath)
    this.proc = spawn(this.pythonBin, [this.scriptPath, '--port', String(this.port)], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc.stdout?.on('data', (d) => logger.info('[paddle]', String(d).trim()))
    this.proc.stderr?.on('data', (d) => logger.warn('[paddle]', String(d).trim()))
    this.proc.on('exit', (code) => {
      logger.warn('[PaddleSidecar] exited', code)
      this.ready = false
      this.proc = null
    })

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.ping()) {
        this.ready = true
        logger.info('[PaddleSidecar] ready on port', this.port)
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    logger.warn('[PaddleSidecar] start timeout, fallback tesseract')
    this.stop()
  }

  private async ping(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1500) })
      return res.ok
    } catch {
      return false
    }
  }

  /** 识别; 首次会下载模型可能耗时数分钟 */
  async ocr(imageBase64: string, lang: 'ch' | 'korean' = 'ch', timeoutMs = 180_000): Promise<PaddleResult> {
    if (!this.ready) throw new Error('PADDLE_NOT_READY')
    const res = await fetch(`http://127.0.0.1:${this.port}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, lang }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) throw new Error(`PADDLE_HTTP_${res.status}`)
    return parsePaddleResponse(await res.json())
  }

  stop(): void {
    try {
      this.proc?.kill()
    } catch {
      /* 忽略 */
    }
    this.proc = null
    this.ready = false
  }
}

/** 项目内 sidecar 脚本绝对路径 (dev 与打包后均可用) */
export function resolvePaddleScript(appPath: string): string {
  return join(appPath, 'python', 'ocr_server.py')
}
