import { useRef, useEffect } from 'react'
import { BoardItem, StickyColor } from '../types'

const COLORS: Record<StickyColor, string> = {
  yellow: '#fff9a5',
  pink:   '#ffd6e8',
  blue:   '#d6e8ff',
  green:  '#d6ffd8',
  orange: '#ffe4b5',
}

interface Props {
  item: BoardItem
  connecting: string | null
  onMouseDown: (e: React.MouseEvent) => void
  onClick: () => void
  onPinClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onTextChange: (text: string) => void
  onDelete: () => void
}

export function StickyNote({ item, connecting, onMouseDown, onClick, onPinClick, onContextMenu, onTextChange, onDelete }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textarea height
  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    }
  }, [item.text])

  const bg = COLORS[item.color ?? 'yellow']
  const isSource = connecting === item.id

  return (
    <div
      className={`board-item sticky-note${isSource ? ' is-source' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        background: bg,
        transform: `rotate(${item.rotation}deg)`,
        transformOrigin: 'center top',
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

      <textarea
        ref={textareaRef}
        className="sticky-textarea"
        value={item.text ?? ''}
        placeholder="Write here…"
        onChange={e => {
          onTextChange(e.target.value)
          // auto-grow
          e.target.style.height = 'auto'
          e.target.style.height = e.target.scrollHeight + 'px'
        }}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

function PinSVG() {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" fill="none">
      {/* pin head */}
      <circle cx="11" cy="9" r="7.5" fill="#cc2222" stroke="#991515" strokeWidth="1.5" />
      {/* shine */}
      <ellipse cx="8.5" cy="6.5" rx="2.2" ry="1.5" fill="rgba(255,255,255,0.38)" />
      {/* shaft */}
      <line x1="11" y1="16.5" x2="11" y2="27" stroke="#9a9090" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
