import { useState, useEffect } from 'react'

type Props = {
  original: string
  translated: string
  refined?: string
  provider?: 'deepl' | 'opencode' | 'fallback'
  refinedProvider?: string
  onClose: () => void
  onSave: () => void
}

const PROVIDER_LABEL: Record<string, string> = {
  deepl: 'DeepL 快译',
  opencode: 'LLM',
  fallback: '原文'
}

export function TranslateCard({ original, translated, refined, provider, refinedProvider, onClose, onSave }: Props) {
  const [showRefined, setShowRefined] = useState(true)
  const hasRefined = !!refined
  const display = showRefined && refined ? refined : translated

  // 精译到达时自动切换 + 高亮闪一下
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (hasRefined) {
      setShowRefined(true)
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 900)
      return () => clearTimeout(t)
    }
  }, [hasRefined, refined])

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="w-[380px] rounded-xl shadow-2xl border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <span className="text-sm font-medium">TransShot</span>
        <div className="flex gap-1 items-center">
          {provider && provider !== 'fallback' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">
              {PROVIDER_LABEL[provider]}
            </span>
          )}
          {hasRefined && (
            <button
              onClick={() => setShowRefined(!showRefined)}
              className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600"
              title={refinedProvider === 'opencode' ? `LLM 精译` : '精译'}
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
            <span>{hasRefined && showRefined ? '译文 · LLM 精译' : '译文'}</span>
            <button onClick={() => copy(display)} className="text-blue-600">
              复制
            </button>
          </div>
          <div
            className={`text-sm p-2 rounded whitespace-pre-wrap transition-all duration-500 ${
              flash ? 'bg-blue-100 ring-2 ring-blue-300' : 'bg-blue-50'
            }`}
          >
            {display || '翻译中...'}
          </div>
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
