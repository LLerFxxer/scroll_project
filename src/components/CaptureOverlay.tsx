import { useEffect, useRef, useState } from 'react'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && rect) confirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const confirm = async () => {
    if (!rect || !image) return
    // crop via canvas
    const canvas = document.createElement('canvas')
    canvas.width = rect.width
    canvas.height = rect.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.src = image
    await new Promise((r) => (img.onload = r))
    ctx.drawImage(img, -rect.x, -rect.y)
    const dataURL = canvas.toDataURL('image/png')
    onConfirm(rect, dataURL)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true)
    const r = containerRef.current?.getBoundingClientRect()
    if (!r) return
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    setStart({ x, y })
    setRect({ x, y, width: 0, height: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
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

  const handleMouseUp = () => {
    setDragging(false)
    if (rect && rect.width > 10 && rect.height > 10) {
      // auto confirm optional: require double click/enter
    }
  }

  if (!image) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ backgroundImage: `url(${image})`, backgroundSize: 'cover' }}
    >
      <div className="absolute inset-0 bg-black/30" />
      {rect && (
        <>
          <div
            className="absolute border-2 border-blue-400 bg-white/10"
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
          />
          <div className="absolute bg-black/70 text-white text-xs px-2 py-1 rounded" style={{ left: rect.x, top: rect.y - 24 }}>
            {Math.round(rect.width)} × {Math.round(rect.height)} — 回车确认 / ESC 取消 / 双击确认
          </div>
          <div
            className="absolute"
            style={{ left: rect.x + rect.width / 2 - 40, top: rect.y + rect.height + 8 }}
            onDoubleClick={confirm}
          >
            <button onClick={confirm} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
              确认翻译
            </button>
          </div>
        </>
      )}
    </div>
  )
}
