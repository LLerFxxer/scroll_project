import { useEffect, useRef, useState, useCallback } from 'react'

type Rect = { x: number; y: number; width: number; height: number }
type Props = {
  image: string | null // fullscreen screenshot dataURL
  onConfirm: (rect: Rect, dataURL: string) => void
  onCancel: () => void
}

export function CaptureOverlay({ image, onConfirm, onCancel }: Props) {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const confirm = useCallback(async () => {
    if (!rect || !image) return
    // 边界保护：小于 10px 视为误触
    if (rect.width < 10 || rect.height < 10) return
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(rect.width)
    canvas.height = Math.round(rect.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.src = image
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
    })
    // 注意：dataURL 是按 scaleFactor 缩放后的缩略图，CSS 坐标是 DIP
    // MVP 直接按 DIP 裁剪，高分屏会有轻微模糊，后续可按 scaleFactor 校正
    ctx.drawImage(img, -rect.x, -rect.y)
    const dataURL = canvas.toDataURL('image/png')
    onConfirm(rect, dataURL)
  }, [rect, image, onConfirm])

  // ESC / Enter 全局处理，始终生效（即使 image 为 null 也能退出）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && rect) void confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rect, onCancel, confirm])

  // 全局鼠标移动/抬起，避免快速拖拽丢事件
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
    const onUp = () => {
      setDragging(false)
    }
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
    // 右键直接取消
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

  // 始终渲染容器，保证鼠标事件可达；image 为 null 时显示加载态
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 cursor-crosshair select-none bg-black/30"
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      style={
        image
          ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: '0 0' }
          : undefined
      }
    >
      {!image && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <div className="animate-pulse text-sm">正在截取屏幕...</div>
          <div className="text-xs text-white/70 mt-2">ESC 退出</div>
        </div>
      )}

      {/* 顶部提示条，始终可点 ESC */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-3">
        <span>拖拽框选区域</span>
        <span className="opacity-60">|</span>
        <span>ESC 取消</span>
        <button
          onClick={onCancel}
          className="ml-2 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs"
        >
          退出
        </button>
      </div>

      {rect && (
        <>
          <div
            className="absolute border-2 border-blue-400 bg-white/10 pointer-events-none"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          <div
            className="absolute bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none"
            style={{ left: Math.max(0, rect.x), top: Math.max(0, rect.y - 24) }}
          >
            {Math.round(rect.width)} × {Math.round(rect.height)} — 回车确认 / ESC 取消
          </div>
          <div
            className="absolute flex gap-2"
            style={{ left: rect.x + rect.width / 2 - 60, top: rect.y + rect.height + 8 }}
          >
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={confirm}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm shadow"
            >
              确认翻译
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onCancel}
              className="px-3 py-1 bg-white hover:bg-gray-100 text-gray-800 rounded text-sm shadow border"
            >
              取消
            </button>
          </div>
        </>
      )}
    </div>
  )
}
