import { useState } from 'react'

type Props = {
  original: string
  translated: string
  refined?: string
  onClose: () => void
  onSave: () => void
}

export function TranslateCard({ original, translated, refined, onClose, onSave }: Props) {
  const [showRefined, setShowRefined] = useState(true)
  const display = showRefined && refined ? refined : translated

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="w-[380px] rounded-xl shadow-2xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <span className="text-sm font-medium">TransShot</span>
        <div className="flex gap-1">
          {refined && (
            <button
              onClick={() => setShowRefined(!showRefined)}
              className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600"
            >
              {showRefined ? '精译' : '快译'}
            </button>
          )}
          <button onClick={onClose} className="text-xs px-2 py-1 rounded hover:bg-gray-200">
            ✕
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3 max-h-[360px] overflow-auto">
        <div>
          <div className="text-xs text-gray-500 mb-1 flex justify-between">
            <span>原文</span>
            <button onClick={() => copy(original)} className="text-blue-600">
              复制
            </button>
          </div>
          <div className="text-sm bg-gray-50 p-2 rounded whitespace-pre-wrap">{original || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1 flex justify-between">
            <span>译文</span>
            <button onClick={() => copy(display)} className="text-blue-600">
              复制
            </button>
          </div>
          <div className="text-sm bg-blue-50 p-2 rounded whitespace-pre-wrap">{display || '翻译中...'}</div>
        </div>
      </div>

      <div className="flex gap-2 p-2 border-t bg-gray-50">
        <button onClick={onSave} className="flex-1 py-1.5 bg-blue-600 text-white rounded text-sm">
          保存截图
        </button>
        <button onClick={() => copy(display)} className="flex-1 py-1.5 bg-white border rounded text-sm">
          复制译文
        </button>
      </div>
    </div>
  )
}
