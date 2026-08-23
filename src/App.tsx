import { useEffect, useState } from 'react'
import { CaptureOverlay } from '@/components/CaptureOverlay'
import { useTranslate } from '@/hooks/useTranslate'

export default function App() {
  const isOverlay = new URLSearchParams(window.location.search).has('overlay')
  const [overlayImage, setOverlayImage] = useState<string | null>(null)
  const [captured, setCaptured] = useState<{ dataURL: string; ocrText?: string; zhFast?: string; lang?: string } | null>(null)
  const { translate, result, refined, loading } = useTranslate()

  // Overlay: 加载全屏截图 (挂载时一次 + 每次热键触发 refresh 重新截屏)
  useEffect(() => {
    if (!isOverlay) return
    console.log('[overlay] mount, window.api exists?', !!window.api)
    if (!window.api?.capture?.getSources) {
      console.error('[overlay] window.api missing!')
      return
    }
    let cancelled = false
    const loadSources = () => {
      window.api.capture
        .getSources()
        .then((sources) => {
          if (cancelled) return
          const primary = sources[0]
          if (primary?.dataURL) setOverlayImage(primary.dataURL)
          if (window.api?.overlay?.ready) window.api.overlay.ready()
        })
        .catch((e) => {
          console.error('[overlay] getSources failed', e)
          if (window.api?.overlay?.ready) window.api.overlay.ready()
        })
    }
    loadSources()
    window.api.overlay.onRefresh(loadSources)
    return () => {
      cancelled = true
    }
  }, [isOverlay])

  useEffect(() => {
    if (!isOverlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (window.api?.overlay?.close) window.api.overlay.close()
        else window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOverlay])

  // 主窗口: 接收遮罩"主页精译"传回的数据
  useEffect(() => {
    if (isOverlay) return
    const handler = (data: { dataURL: string; ocrText?: string; zhFast?: string; lang?: string }) => {
      setCaptured({ dataURL: data.dataURL, ocrText: data.ocrText, zhFast: data.zhFast, lang: data.lang })
    }
    window.api.capture.onDone(handler)
  }, [isOverlay])

  const handleTriggerCapture = async () => {
    await window.api.capture.start()
  }

  const handleOverlayCancel = async () => {
    try {
      if (window.api?.overlay?.close) await window.api.overlay.close()
      else window.close()
    } catch {
      window.close()
    }
  }

  if (isOverlay) {
    if (!window.api) {
      return (
        <div className="fixed inset-0 bg-red-900 text-white flex flex-col items-center justify-center p-8">
          <div className="text-lg font-bold">preload 加载失败</div>
          <div className="text-sm mt-2">window.api 未定义，请检查 preload.cjs 路径</div>
          <button onClick={() => window.close()} className="mt-4 px-4 py-2 bg-white text-red-900 rounded">
            关闭
          </button>
        </div>
      )
    }
    return <CaptureOverlay image={overlayImage} onCancel={handleOverlayCancel} />
  }

  // 主窗口精译: 用 LLM 精译
  const handlePrecise = async () => {
    if (!captured?.ocrText) return
    const from = captured.lang === 'zh' ? 'zh' : ((captured.lang as never) ?? 'auto')
    await translate({ text: captured.ocrText, from, to: 'zh' })
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-3 bg-white border-b flex items-center justify-between">
        <h1 className="font-bold">TransShot</h1>
        <span className="text-xs text-gray-500">v0.1.0 · {loading ? '精译中...' : '就绪'}</span>
      </header>

      <main className="flex-1 p-6 space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h2 className="font-medium mb-2">快捷截图翻译（原位覆盖）</h2>
          <p className="text-sm text-gray-600 mb-3">
            按 <span className="font-mono bg-gray-100 px-1 rounded">Ctrl+Shift+A</span> 框选，译文直接覆盖在原位置（免 API 快译）。
            需更精准时点下方 <span className="font-medium">LLM 精译</span>。
          </p>
          <button onClick={handleTriggerCapture} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            开始截图 (Ctrl+Shift+A)
          </button>
          <div className="text-xs text-gray-400 mt-2">遮罩内：拖拽框选 → 自动译为中文覆盖 → ESC 关闭</div>
        </div>

        {captured && (
          <div className="bg-white p-4 rounded-xl shadow-sm">
            <h3 className="font-medium text-sm mb-3">上次截图 · 精译工作台</h3>
            <div className="flex gap-4">
              <img src={captured.dataURL} alt="captured" className="w-[260px] h-fit border rounded bg-white" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">原文（OCR）</div>
                <div className="text-sm bg-gray-50 p-2 rounded whitespace-pre-wrap break-words max-h-[120px] overflow-auto">{captured.ocrText ?? '—'}</div>
                <div className="text-xs text-gray-500 mt-3 mb-1 flex items-center justify-between">
                  <span>快译（Google 免Key）</span>
                  <span className="text-[10px] px-1 py-0.5 bg-emerald-50 text-emerald-600 rounded">覆盖已显示</span>
                </div>
                <div className="text-sm bg-blue-50 p-2 rounded whitespace-pre-wrap break-words">{captured.zhFast ?? '—'}</div>
                {result?.fast && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">精译（LLM）· {result.provider}</div>
                    <div className="text-sm bg-indigo-50 p-2 rounded whitespace-pre-wrap break-words">{result.fast}</div>
                    {refined && <div className="text-sm bg-indigo-100 p-2 rounded mt-1 whitespace-pre-wrap">{refined.text}</div>}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={handlePrecise} disabled={loading || !captured.ocrText} className="px-4 py-1.5 bg-indigo-600 disabled:opacity-50 text-white rounded text-sm">
                    {loading ? '精译中...' : '用 LLM 精译'}
                  </button>
                  <button
                    onClick={async () => {
                      const txt = refined?.text ?? result?.fast ?? captured.zhFast ?? ''
                      if (txt) await navigator.clipboard.writeText(txt)
                    }}
                    className="px-3 py-1.5 bg-white border rounded text-sm"
                  >
                    复制译文
                  </button>
                  <button onClick={() => setCaptured(null)} className="px-3 py-1.5 text-sm text-gray-500">
                    清除
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!captured && (
          <div className="text-xs text-gray-400 bg-white p-3 rounded-xl">暂无截图记录。按快捷键截图后，覆盖结果会在遮罩内直接显示；精译结果回落到此工作台。</div>
        )}
      </main>

      <footer className="px-4 py-2 text-xs text-gray-400 border-t bg-white">AGENTS.md · .spec/ 为真相源 · 一次只做一件事</footer>
    </div>
  )
}
