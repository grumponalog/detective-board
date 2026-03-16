import { useMemo } from 'react'
import { BoardItem, Connection, FreeString } from '../types'

// Attachment point: rotated pin head center
function attachPoint(item: BoardItem): { x: number; y: number } {
  const contentW = item.type === 'sticky' ? 210 : (item.renderedW ?? 220)
  const cardW = item.type === 'sticky' ? contentW : contentW + 16
  const cx = item.x + cardW / 2
  const angle = ((item.rotation ?? 0) * Math.PI) / 180
  return {
    x: cx + 7 * Math.sin(angle),
    y: item.y - 7 * Math.cos(angle),
  }
}

interface Props {
  items: BoardItem[]
  connections: Connection[]
  freeStrings: FreeString[]
  connecting: string | null
  cursor: { x: number; y: number }
  isDrawingString: boolean
  stringStart: { x: number; y: number } | null
  onRemoveConnection: (id: string) => void
  onRemoveFreeString: (id: string) => void
}

export function StringLayer({
  items, connections, freeStrings,
  connecting, cursor,
  isDrawingString, stringStart,
  onRemoveConnection, onRemoveFreeString,
}: Props) {
  const itemMap = useMemo(() => {
    const m: Record<string, BoardItem> = {}
    items.forEach(i => { m[i.id] = i })
    return m
  }, [items])

  return (
    <svg className="string-layer">
      <defs>
        <filter id="string-drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="1.5" stdDeviation="1.2" floodColor="rgba(0,0,0,0.45)" />
        </filter>
      </defs>

      {/* ── Pin-based connections ─────────────────────────────────────────── */}
      {connections.map(conn => {
        const from = itemMap[conn.fromId]
        const to = itemMap[conn.toId]
        if (!from || !to) return null
        const a = attachPoint(from)
        const b = attachPoint(to)
        const d = `M ${a.x},${a.y} L ${b.x},${b.y}`
        return (
          <g key={conn.id}>
            <path
              d={d}
              stroke="transparent"
              strokeWidth={14}
              fill="none"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onRemoveConnection(conn.id) }}
              title="Click to remove"
            />
            <path
              d={d}
              stroke="#c41e1e"
              strokeWidth={1.8}
              fill="none"
              filter="url(#string-drop-shadow)"
              style={{ pointerEvents: 'none' }}
            />
            <circle cx={a.x} cy={a.y} r={2.5} fill="#a01818" style={{ pointerEvents: 'none' }} />
            <circle cx={b.x} cy={b.y} r={2.5} fill="#a01818" style={{ pointerEvents: 'none' }} />
          </g>
        )
      })}

      {/* ── Freehand strings ─────────────────────────────────────────────── */}
      {freeStrings.map(fs => {
        const d = `M ${fs.x1},${fs.y1} L ${fs.x2},${fs.y2}`
        return (
          <g key={fs.id}>
            <path
              d={d}
              stroke="transparent"
              strokeWidth={14}
              fill="none"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onRemoveFreeString(fs.id) }}
              title="Click to remove"
            />
            <path
              d={d}
              stroke="#c41e1e"
              strokeWidth={1.8}
              fill="none"
              filter="url(#string-drop-shadow)"
              style={{ pointerEvents: 'none' }}
            />
            <circle cx={fs.x1} cy={fs.y1} r={2.5} fill="#a01818" style={{ pointerEvents: 'none' }} />
            <circle cx={fs.x2} cy={fs.y2} r={2.5} fill="#a01818" style={{ pointerEvents: 'none' }} />
          </g>
        )
      })}

      {/* ── Live preview while drawing a freehand string ─────────────────── */}
      {isDrawingString && stringStart && (
        <path
          d={`M ${stringStart.x},${stringStart.y} L ${cursor.x},${cursor.y}`}
          stroke="#c41e1e"
          strokeWidth={1.6}
          strokeDasharray="7 4"
          fill="none"
          opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* ── Preview while picking second pin ─────────────────────────────── */}
      {connecting && itemMap[connecting] && (() => {
        const src = attachPoint(itemMap[connecting])
        const d = `M ${src.x},${src.y} L ${cursor.x},${cursor.y}`
        return (
          <path
            d={d}
            stroke="#c41e1e"
            strokeWidth={1.6}
            strokeDasharray="7 4"
            fill="none"
            opacity={0.65}
            style={{ pointerEvents: 'none' }}
          />
        )
      })()}
    </svg>
  )
}
