import { useEffect, useRef, useState, useCallback } from 'react'

type Rect = { x: number; y: number; width: number; height: number }
type Line = { text: string; bbox: [number, number, number, number]; confidence: number; translated: string }
type Props = {
  image: string | null // 全屏截图 dataURL (物理像素)
  onCancel: () => void
}

const LANG_LABEL: Record<string, string> = { zh: '中文', en: 'English', ko: 'Korean' }

// 覆盖盒样式：黑底白字 + 中文字体栈 + 自适应宽度(不拉伸不挤压)
const BOX_FONT_FAMILY = "'PingFang SC','Microsoft YaHei','Noto Sans SC','Segoe UI',sans-serif"

function lineBoxStyle(ln: Line, rect: Rect, scale: number): React.CSSProperties {
  const [x, y, w, h] = ln.bbox
  const left = rect.x + x / scale
  const top = rect.y + y / scale
  const fontSize = Math.max(10, Math.min(60, (h / scale) * 0.8))
  const estWidth = ln.translated.length * fontSize // CJK 方块字≈字号宽
  const width = Math.max(w / scale, Math.min(estWidth + 10, 720))
  return {
    left,
    top,
    minWidth: w / scale,
    width,
    minHeight: h / scale,
    padding: '2px 6px',
    fontSize,
    backgroundColor: 'rgba(0,0,0,0.88)',
    color: '#fff',
    fontFamily: BOX_FONT_FAMILY,
    lineHeight: 1.2,
    letterSpacing: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center'
  }
}

export function CaptureOverlay({ image, onCancel }: Props) {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [phase, setPhase] = useState<'select' | 'loading' | 'result'>('select')
  const [mode, setMode] = useState<'ocr' | 'translate' | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ocrText, setOcrText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [allFallback, setAllFallback] = useState(false)
  const [ocrLang, setOcrLang] = useState<string>('')
  const [scale, setScale] = useState(1)
  const [cropDataURL, setCropDataURL] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const resetToSelect = useCallback(() => {
    setRect(null)
    setPhase('select')
    setMode(null)
    setLines([])
    setOcrText('')
    setError(null)
    setAllFallback(false)
    setOcrLang('')
    setCropDataURL(null)
  }, [])

  const doQuick = useCallback(
    async (r: Rect, imgSrc: string, m: 'ocr' | 'translate') => {
      setPhase('loading')
      setError(null)
      setAllFallback(false)
      try {
        const img = new Image()
        img.src = imgSrc
        await new Promise<void>((res, rej) => {
          img.onload = () => res()
          img.onerror = () => rej(new Error('bg load fail'))
        })
        const s = img.naturalWidth / window.innerWidth || 1
        setScale(s)
        const sx = Math.round(r.x * s)
        const sy = Math.round(r.y * s)
        const sw = Math.round(r.width * s)
        const sh = Math.round(r.height * s)
        const canvas = document.createElement('canvas')
        canvas.width = sw
        canvas.height = sh
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('canvas fail')
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
        const cropped = canvas.toDataURL('image/png')
        setCropDataURL(cropped)
        setMode(m)
        if (m === 'ocr') {
          // 仅 OCR: 不走网络翻译，直接本地识别
          const ocr = await window.api.ocr.recognize(cropped)
          if (ocr.error || !ocr.text) {
            setError(ocr.error === 'NO_TEXT' ? '未识别到文字' : '识别失败，请重试')
            setLines([])
            setOcrText('')
            setOcrLang('')
          } else {
            setOcrText(ocr.text)
            setOcrLang(ocr.lang)
            setLines((ocr.blocks ?? []).map((b) => ({ ...b, translated: b.text })))
          }
        } else {
          const res = await window.api.translate.quick(cropped)
          if (res.error || !res.ocr.text) {
            setError(res.error === 'NO_TEXT' ? '未识别到文字' : '识别失败，请重试')
            setLines([])
            setOcrText('')
            setOcrLang('')
          } else {
            setLines(res.lines as Line[])
            setOcrText(res.ocr.text)
            setOcrLang(res.ocr.lang)
            setAllFallback(!!res.allFallback)
          }
        }
        setPhase('result')
      } catch (e) {
        console.error('[overlay] quick failed', e)
        setError('识别失败，请重试')
        setPhase('result')
      }
    },
    []
  )

  const confirmTranslate = useCallback(() => {
    if (!rect || !image) return
    if (rect.width < 10 || rect.height < 10) return
    void doQuick(rect, image, 'translate')
  }, [rect, image, doQuick])

  const confirmOcr = useCallback(() => {
    if (!rect || !image) return
    if (rect.width < 10 || rect.height < 10) return
    void doQuick(rect, image, 'ocr')
  }, [rect, image, doQuick])

  // ESC / Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'result' || phase === 'loading') {
          // 结果态 ESC 先回选区，再按一次退出
          if (phase === 'result') {
            resetToSelect()
          } else {
            onCancel()
          }
        } else onCancel()
      }
      if (e.key === 'Enter' && rect && phase === 'select') void confirmTranslate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rect, phase, onCancel, confirmTranslate, resetToSelect])

  // 拖拽
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging || !start) return
      const r = containerRef.current?.getBoundingClientRect()
      if (!r) return
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      setRect({
        x: Math.min(start.x, x),
        y: Math.min(start.y, y),
        width: Math.abs(x - start.x),
        height: Math.abs(y - start.y)
      })
    }
    const onUp = () => setDragging(false)
    if (dragging) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
    }
  }, [dragging, start])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (phase !== 'select') return
    if (e.button === 2) {
      onCancel()
      return
    }
    setDragging(true)
    const r = containerRef.current?.getBoundingClientRect()
    if (!r) return
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    setStart({ x, y })
    setRect({ x, y, width: 0, height: 0 })
  }

  const copyOcrText = async () => {
    await navigator.clipboard.writeText(ocrText)
  }

  const copyAll = async () => {
    const all = lines.map((l) => l.translated).join('\n')
    await navigator.clipboard.writeText(all || ocrText)
  }

  const goPrecise = async () => {
    const allZh = lines.map((l) => l.translated).join('\n')
    // 带到主窗口精译工作台
    if (window.api?.capture?.done && cropDataURL) {
      await window.api.capture.done({
        rect: rect!,
        dataURL: cropDataURL!,
        ocrText,
        zhFast: mode === 'translate' ? allZh : undefined,
        lang: lines.length ? 'unknown' : 'auto',
        mode: mode ?? 'translate'
      } as unknown as { rect: Rect; dataURL: string })
    } else {
      onCancel()
    }
  }

  // 始终渲染容器，保证事件可达
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 select-none"
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      style={
        image
          ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: '0 0', backgroundColor: '#000' }
          : { backgroundColor: '#000' }
      }
    >
      <div className="absolute inset-0 bg-black/25" />

      {!image && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <div className="animate-pulse text-sm">正在截取屏幕...</div>
          <div className="text-xs text-white/70 mt-2">ESC 退出</div>
        </div>
      )}

      {/* 顶部提示 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-3">
        {phase === 'select' && <><span>拖拽框选区域</span><span className="opacity-60">|</span><span>ESC 退出</span></>}
        {phase === 'loading' && <span>正在识别{mode === 'translate' ? '并翻译' : ''}...</span>}
        {phase === 'result' && (
          <>{mode === 'ocr' ? <span>已识别文本 · {LANG_LABEL[ocrLang] ?? ocrLang}</span> : <span>已覆盖为中文 · 原文 {LANG_LABEL[ocrLang] ?? ocrLang}</span>}<span className="opacity-60">|</span><span>ESC 返回</span></>
        )}
        <button onClick={onCancel} className="ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs">
          {phase === 'result' ? '关闭' : '退出'}
        </button>
      </div>

      {/* 选区 */}
      {phase === 'select' && rect && (
        <>
          <div className="absolute border-2 border-blue-400 bg-white/10 pointer-events-none" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
          <div className="absolute bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none" style={{ left: Math.max(0, rect.x), top: Math.max(0, rect.y - 24) }}>
            {Math.round(rect.width)} × {Math.round(rect.height)} — 回车翻译 / ESC 取消
          </div>
          <div className="absolute flex gap-2" style={{ left: rect.x + rect.width / 2 - 90, top: rect.y + rect.height + 8 }}>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={confirmOcr} className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 rounded text-sm shadow border">
              仅 OCR
            </button>
            <button onMouseDown={(e) => e.stopPropagation()} onClick={confirmTranslate} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm shadow">
              OCR+翻译
            </button>
          </div>
        </>
      )}

      {/* 加载 */}
      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/70 text-white px-4 py-3 rounded-lg text-sm">正在识别{mode === 'translate' ? '并翻译' : ''}...</div>
        </div>
      )}

      {/* 覆盖结果：黑底白字 */}
      {phase === 'result' && rect && (
        <>
          {/* 原选区边框仍保留 */}
          <div className="absolute border border-white/40 pointer-events-none" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
          {error ? (
            <div className="absolute bg-red-600 text-white text-sm px-3 py-2 rounded shadow" style={{ left: rect.x, top: rect.y }}>
              {error}
            </div>
          ) : (
            <>
              {allFallback && (
                <div className="absolute bg-amber-500 text-white text-xs px-3 py-2 rounded shadow max-w-[300px]" style={{ left: rect.x, top: rect.y }}>
                  快译不可用（网络受限）。可在主页用 LLM 精译，或点「重试」。
                </div>
              )}
              {lines.map((ln, i) => (
                <div
                  key={i}
                  className={`absolute rounded ${allFallback ? 'opacity-60' : ''}`}
                  style={lineBoxStyle(ln, rect, scale)}
                  title={ln.text}
                >
                  {ln.translated}
                </div>
              ))}
            </>
          )}
          {/* 底部操作条 */}
          <div className="absolute left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur text-white rounded-full px-2 py-1.5 flex items-center gap-1.5 shadow-lg" style={{ top: rect.y + rect.height + 12 }}>
            {mode === 'ocr' ? (
              <>
                <button onClick={copyOcrText} className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-sm">
                  复制文本
                </button>
                <span className="opacity-30">|</span>
                <button onClick={goPrecise} className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-sm">
                  主页精译
                </button>
              </>
            ) : (
              <>
                <button onClick={resetToSelect} className="px-3 py-1 rounded-full hover:bg-white/15 text-sm">
                  重试
                </button>
                <span className="opacity-30">|</span>
                <button onClick={goPrecise} className="px-3 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-sm">
                  主页精译
                </button>
                <button onClick={copyAll} className="px-3 py-1 rounded-full hover:bg-white/15 text-sm">
                  复制全部
                </button>
              </>
            )}
            <button onClick={onCancel} className="px-3 py-1 rounded-full hover:bg-white/15 text-sm">
              关闭
            </button>
          </div>
        </>
      )}
    </div>
  )
}
