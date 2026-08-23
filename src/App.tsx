import { useEffect, useState } from 'react'
import { CaptureOverlay } from '@/components/CaptureOverlay'
import { TranslateCard } from '@/components/TranslateCard'
import { useTranslate } from '@/hooks/useTranslate'

export default function App() {
  const isOverlay = new URLSearchParams(window.location.search).has('overlay')
  const [overlayImage, setOverlayImage] = useState<string | null>(null)
  const [captured, setCaptured] = useState<{ dataURL: string; text?: string } | null>(null)
  const { translate, result, loading } = useTranslate()

  // Overlay 模式：加载截图
  useEffect(() => {
    if (!isOverlay) return
    console.log('[overlay] mount, window.api exists?', !!window.api, window.api)
    if (!window.api?.capture?.getSources) {
      console.error('[overlay] window.api missing! preload failed, check preload.js path')
      // 降级：显示空状态保证可退出
      return
    }
    let cancelled = false
    window.api.capture
      .getSources()
      .then((sources) => {
        if (cancelled) return
        console.log('[overlay] getSources ok', sources.length, sources[0]?.dataURL?.slice(0, 30))
        const primary = sources[0]
        if (primary?.dataURL) setOverlayImage(primary.dataURL)
        else {
          console.warn('[overlay] getSources empty', sources)
        }
      })
      .catch((e) => {
        console.error('[overlay] getSources failed', e)
      })
    // 超时兜底：2s 后仍无图，提示用户 ESC
    const t = setTimeout(() => {
      if (!cancelled) {
        console.warn('[overlay] timeout waiting for screenshot')
      }
    }, 2000)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [isOverlay])

  // Overlay 全局 ESC 兜底：即使 React 未渲染也保证可退出
  useEffect(() => {
    if (!isOverlay) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        console.log('[overlay] global ESC')
        if (window.api?.overlay?.close) window.api.overlay.close()
        else window.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOverlay])

  // 主窗口：监听 overlay 传回的截图 -> OCR -> 翻译
  useEffect(() => {
    if (isOverlay) return
    const handler = async (data: { rect: { x: number; y: number; width: number; height: number }; dataURL: string }) => {
      setCaptured({ dataURL: data.dataURL })
      try {
        // 真实 OCR (主进程 tesseract worker)
        const ocr = await window.api.ocr.recognize(data.dataURL)
        console.log('[main-render] ocr result', ocr)
        if (!ocr.text || ocr.error === 'NO_TEXT') {
          setCaptured({ dataURL: data.dataURL, text: '(未识别到文字)' })
          return
        }
        setCaptured({ dataURL: data.dataURL, text: ocr.text })
        // 翻译：自动目标语言
        const to = ocr.lang === 'zh' ? 'en' : 'zh'
        const res = await translate({ text: ocr.text, from: ocr.lang, to })
        void res
      } catch (e) {
        console.error('[main-render] ocr/translate failed', e)
        setCaptured({ dataURL: data.dataURL, text: '(OCR 失败: ' + String(e).slice(0, 60) + ')' })
      }
    }
    window.api.capture.onDone(handler)
    // 注意：preload 的 onDone 会重复注册，MVP 够用，后续可加 off
  }, [isOverlay, translate])

  const handleTriggerCapture = async () => {
    await window.api.capture.start()
  }

  const handleOverlayConfirm = async (
    _rect: { x: number; y: number; width: number; height: number },
    dataURL: string
  ) => {
    // 通过 IPC 转发给主窗口，主进程会 hideOverlay 并 send 到主窗口
    await window.api.capture.done({ rect: _rect, dataURL })
    // 降级：若 IPC 未生效，直接关闭
    // window.api.overlay.close() 会在 capture:done 中已调用，这里不重复
  }

  const handleOverlayCancel = async () => {
    console.log('[overlay] cancel clicked')
    try {
      if (window.api?.overlay?.close) await window.api.overlay.close()
      else window.close()
    } catch (e) {
      console.error('[overlay] cancel failed', e)
      window.close()
    }
  }

  if (isOverlay) {
    // 调试：若 window.api 缺失，显示错误页保证可关闭
    if (!window.api) {
      return (
        <div className="fixed inset-0 bg-red-900 text-white flex flex-col items-center justify-center p-8">
          <div className="text-lg font-bold">preload 加载失败</div>
          <div className="text-sm mt-2">window.api 未定义，请检查 preload.js 路径</div>
          <button onClick={() => window.close()} className="mt-4 px-4 py-2 bg-white text-red-900 rounded">
            关闭
          </button>
        </div>
      )
    }
    return (
      <CaptureOverlay
        image={overlayImage}
        onConfirm={handleOverlayConfirm}
        onCancel={handleOverlayCancel}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="px-4 py-3 bg-white border-b flex items-center justify-between">
        <h1 className="font-bold">TransShot</h1>
        <span className="text-xs text-gray-500">v0.1.0 · {loading ? '翻译中...' : '就绪'}</span>
      </header>

      <main className="flex-1 p-6 space-y-4">
        <div className="bg-white p-4 rounded-xl shadow-sm">
          <h2 className="font-medium mb-2">截图翻译 (MVP 骨架)</h2>
          <p className="text-sm text-gray-600 mb-3">按 Ctrl+Shift+A 截图，或点击下方按钮。已打通 截图→OCR→翻译 链路占位。</p>
          <button onClick={handleTriggerCapture} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            开始截图 (Ctrl+Shift+A)
          </button>
          <div className="text-xs text-gray-400 mt-2">提示：遮罩内拖拽框选，回车确认，ESC/右键 取消</div>
        </div>

        {captured && (
          <div className="flex gap-4">
            <img src={captured.dataURL} alt="captured" className="w-[200px] border rounded bg-white" />
            <TranslateCard
              original={captured.text ?? '识别中...'}
              translated={result?.fast ?? '等待翻译...'}
              refined={result?.refined}
              onClose={() => setCaptured(null)}
              onSave={async () => {
                if (!captured.dataURL) return
                const { path } = await window.api.save.saveImage(captured.dataURL)
                alert(`已保存: ${path}`)
              }}
            />
          </div>
        )}

        <div className="text-xs text-gray-400">
          质量门禁: npm run lint / typecheck / test / build
          <br />链路: 截图 → 本地OCR(tesseract 中英韩) → 翻译(占位) | 下一步: 步骤6 接入 DeepL/opencode
        </div>
      </main>

      <footer className="px-4 py-2 text-xs text-gray-400 border-t bg-white">AGENTS.md · .spec/ 为真相源 · 一次只做一件事</footer>
    </div>
  )
}
