import { useRef, useEffect, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import { BoardItem } from '../types'

// Bundle the worker locally via Vite so we're not CDN-dependent
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const MAX_W = 280
const MAX_H = 320

interface Props {
  item: BoardItem
  connecting: string | null
  onMouseDown: (e: React.MouseEvent) => void
  onClick: () => void
  onPinClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onDelete: () => void
  onDimensionsKnown: (w: number, h: number) => void
}

export function MediaCard({
  item,
  connecting,
  onMouseDown,
  onClick,
  onPinClick,
  onContextMenu,
  onDelete,
  onDimensionsKnown,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [totalPages, setTotalPages] = useState(1)
  const isSource = connecting === item.id

  useEffect(() => {
    if (item.type !== 'pdf' || !item.src) return
    let cancelled = false

    async function render() {
      const pdf = await pdfjs.getDocument(item.src!).promise
      if (cancelled) return
      setTotalPages(pdf.numPages)

      const page = await pdf.getPage(1)
      if (cancelled) return

      const vp0 = page.getViewport({ scale: 1 })
      const scale = Math.min(MAX_W / vp0.width, MAX_H / vp0.height)
      const vp = page.getViewport({ scale })

      const canvas = canvasRef.current!
      canvas.width = vp.width
      canvas.height = vp.height

      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      if (!cancelled) onDimensionsKnown(vp.width, vp.height)
    }

    render().catch(err => console.warn('PDF render error:', err))
    return () => { cancelled = true }
  }, [item.src, item.type]) // eslint-disable-line react-hooks/exhaustive-deps

  // How many "stack" layers to show (capped at 3 for visual clarity)
  const stackLayers = Math.min(totalPages - 1, 3)

  return (
    <div
      className={`board-item media-card${isSource ? ' is-source' : ''}${stackLayers > 0 ? ' is-stacked' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        transform: `rotate(${item.rotation}deg)`,
        transformOrigin: 'center top',
        // Box-shadow layers simulate pages peeking out beneath
        boxShadow: stackLayers >= 3
          ? '5px 5px 0 0 #e8e4dd, 10px 10px 0 0 #ddd9d1, 15px 15px 0 0 #d3cfc7, 10px 10px 20px rgba(0,0,0,0.45)'
          : stackLayers === 2
          ? '5px 5px 0 0 #e8e4dd, 10px 10px 0 0 #ddd9d1, 8px 8px 18px rgba(0,0,0,0.42)'
          : stackLayers === 1
          ? '5px 5px 0 0 #e8e4dd, 4px 4px 16px rgba(0,0,0,0.4)'
          : undefined,
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <button className="pin-btn" onClick={onPinClick} title="Connect with string">
        <PinSVG />
      </button>

      <button
        className="del-btn"
        onClick={e => { e.stopPropagation(); onDelete() }}
        title="Remove"
      >
        ×
      </button>

      {item.type === 'pdf' ? (
        <>
          {!item.renderedW && (
            <div className="pdf-placeholder">
              <span className="pdf-icon">📄</span>
              <span>Loading…</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{ display: item.renderedW ? 'block' : 'none' }}
          />
        </>
      ) : (
        <img
          src={item.src}
          alt={item.filename}
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget
            const scale = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1)
            onDimensionsKnown(
              Math.round(img.naturalWidth * scale),
              Math.round(img.naturalHeight * scale)
            )
          }}
        />
      )}

      <span className="media-caption">
        {item.filename}
        {totalPages > 1 && <span className="pdf-pages"> · {totalPages} pp</span>}
      </span>
    </div>
  )
}

function PinSVG() {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" fill="none">
      <circle cx="11" cy="9" r="7.5" fill="#cc2222" stroke="#991515" strokeWidth="1.5" />
      <ellipse cx="8.5" cy="6.5" rx="2.2" ry="1.5" fill="rgba(255,255,255,0.38)" />
      <line x1="11" y1="16.5" x2="11" y2="27" stroke="#9a9090" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
