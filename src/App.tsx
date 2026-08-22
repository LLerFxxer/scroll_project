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
    window.api.capture.getSources().then((sources) => {
      const primary = sources[0]
      if (primary) setOverlayImage(primary.dataURL)
    })
  }, [isOverlay])

  const handleTriggerCapture = async () => {
    await window.api.capture.start()
  }

  const handleConfirm = async (_rect: { x: number; y: number; width: number; height: number }, dataURL: string) => {
    setCaptured({ dataURL })
    // MVP: mock OCR text, 步骤5后替换为真实 OCR
    const mockText = 'Hello world! 你好，世界! 안녕하세요'
    const res = await translate({ text: mockText, to: 'zh' })
    setCaptured({ dataURL, text: mockText })
    void res
    // 关闭 overlay 窗口 (由主进程 hide)
    // window.close()
  }

  if (isOverlay) {
    return (
      <CaptureOverlay
        image={overlayImage}
        onConfirm={handleConfirm}
        onCancel={() => window.close()}
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
        </div>

        {captured && (
          <div className="flex gap-4">
            <img src={captured.dataURL} alt="captured" className="w-[200px] border rounded" />
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
          <br />下一步: 步骤5 填充真实 OCR (tesseract.js)，步骤6 接入 DeepL/opencode
        </div>
      </main>

      <footer className="px-4 py-2 text-xs text-gray-400 border-t bg-white">AGENTS.md · .spec/ 为真相源 · 一次只做一件事</footer>
    </div>
  )
}
