import { useState, useRef, useEffect } from 'react'
import { BoardItem, Connection, FreeString, ItemType, StickyColor } from './types'
import { StickyNote } from './components/StickyNote'
import { MediaCard } from './components/MediaCard'
import { StringLayer } from './components/StringLayer'
import { Toolbar } from './components/Toolbar'
import { CaseFilesPanel, useFolders } from './components/CaseFilesPanel'

const BOARD_W = 4000
const BOARD_H = 2400
const BOARD_KEY = 'detective-board:board'

const STICKY_COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green', 'orange']
let _uid = Date.now()
const uid = () => String(_uid++)

function readDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

interface SavedBoard {
  items: BoardItem[]
  connections: Connection[]
  freeStrings: FreeString[]
  view: { zoom: number; ox: number; oy: number }
}

function loadBoard(): SavedBoard | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY)
    return raw ? (JSON.parse(raw) as SavedBoard) : null
  } catch {
    return null
  }
}

export default function App() {
  const saved = useRef(loadBoard())

  const [items, setItems] = useState<BoardItem[]>(saved.current?.items ?? [])
  const [connections, setConnections] = useState<Connection[]>(saved.current?.connections ?? [])
  const [freeStrings, setFreeStrings] = useState<FreeString[]>(saved.current?.freeStrings ?? [])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [stringMode, setStringMode] = useState(false)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [view, setView] = useState(saved.current?.view ?? { zoom: 1, ox: 0, oy: 0 })
  const [folderOpen, setFolderOpen] = useState(true)

  // Case files folders (persisted to localStorage)
  const folderStore = useFolders()

  const boardRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ id: string; ox: number; oy: number } | null>(null)
  const movedRef = useRef(false)
  const stringStartRef = useRef<{ x: number; y: number } | null>(null)
  const isDrawingStringRef = useRef(false)
  const isPanningRef = useRef(false)
  const panPrevRef = useRef<{ x: number; y: number } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Helpers ─────────────────────────────────────────────────────────────

  const toLogical = (vx: number, vy: number) => ({
    x: (vx - view.ox) / view.zoom,
    y: (vy - view.oy) / view.zoom,
  })

  const zoomAround = (cx: number, cy: number, factor: number) => {
    setView(prev => {
      const newZoom = Math.max(0.15, Math.min(4, prev.zoom * factor))
      return {
        zoom: newZoom,
        ox: cx - (cx - prev.ox) * (newZoom / prev.zoom),
        oy: cy - (cy - prev.oy) * (newZoom / prev.zoom),
      }
    })
  }

  const zoomAroundCenter = (factor: number) => {
    if (!boardRef.current) return
    const r = boardRef.current.getBoundingClientRect()
    zoomAround(r.width / 2, r.height / 2, factor)
  }

  // ── Fit board to viewport ────────────────────────────────────────────────

  const fitBoard = () => {
    if (!boardRef.current) return
    const { width, height } = boardRef.current.getBoundingClientRect()
    const zoom = Math.min(width / BOARD_W, height / BOARD_H) * 0.92
    setView({
      zoom,
      ox: (width - BOARD_W * zoom) / 2,
      oy: (height - BOARD_H * zoom) / 2,
    })
  }

  // Only fit on first load if there's no saved view
  useEffect(() => { if (!saved.current?.view) fitBoard() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when the folder panel opens/closes so the board uses its new width
  useEffect(() => {
    const t = setTimeout(fitBoard, 240) // wait for CSS transition to finish
    return () => clearTimeout(t)
  }, [folderOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist board state to localStorage (debounced) ──────────────────────

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(BOARD_KEY, JSON.stringify({ items, connections, freeStrings, view }))
      } catch {
        console.warn('detective-board: could not save board (storage full?)')
      }
    }, 800)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [items, connections, freeStrings, view])

  // ── Mouse-wheel zoom ─────────────────────────────────────────────────────

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = board.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = Math.pow(2, -e.deltaY / 500)
      setView(prev => {
        const newZoom = Math.max(0.15, Math.min(4, prev.zoom * factor))
        return {
          zoom: newZoom,
          ox: cx - (cx - prev.ox) * (newZoom / prev.zoom),
          oy: cy - (cy - prev.oy) * (newZoom / prev.zoom),
        }
      })
    }
    board.addEventListener('wheel', onWheel, { passive: false })
    return () => board.removeEventListener('wheel', onWheel)
  }, [])

  // ── File drop onto board ─────────────────────────────────────────────────

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const rect = boardRef.current!.getBoundingClientRect()
    const { x: lx, y: ly } = toLogical(e.clientX - rect.left, e.clientY - rect.top)

    // Check if this is a drag from the Case Files folder panel
    const folderItemId = e.dataTransfer.getData('application/x-folder-item-id')
    if (folderItemId) {
      const fi = folderStore.allItems.find(i => i.id === folderItemId)
      if (fi) {
        setItems(prev => [...prev, {
          id: uid(), type: fi.type,
          x: lx - 120, y: ly - 80,
          rotation: (Math.random() - 0.5) * 7,
          src: fi.src, filename: fi.label,
        }])
      }
      return
    }

    // OS file drop
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
        const src = await readDataURL(file)
        const type: ItemType = file.type === 'application/pdf' ? 'pdf' : 'image'
        setItems(prev => [...prev, {
          id: uid(), type,
          x: lx - 120, y: ly - 80,
          rotation: (Math.random() - 0.5) * 7,
          src, filename: file.name,
        }])
      }
    }
  }

  const onDragOver = (e: React.DragEvent) => e.preventDefault()

  // ── Add sticky note ──────────────────────────────────────────────────────

  const addSticky = () => {
    setItems(prev => [...prev, {
      id: uid(), type: 'sticky',
      x: 100 + Math.random() * (BOARD_W - 400),
      y: 100 + Math.random() * (BOARD_H - 350),
      rotation: (Math.random() - 0.5) * 9,
      text: '',
      color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)],
    }])
  }

  // ── Clear board ──────────────────────────────────────────────────────────

  const clearBoard = () => {
    setItems([])
    setConnections([])
    setFreeStrings([])
    setConnecting(null)
    setStringMode(false)
  }

  // ── Drag ─────────────────────────────────────────────────────────────────

  const startDrag = (id: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (connecting || stringMode) return
    e.preventDefault()
    const rect = boardRef.current!.getBoundingClientRect()
    const item = items.find(i => i.id === id)!
    const { x: lx, y: ly } = toLogical(e.clientX - rect.left, e.clientY - rect.top)
    draggingRef.current = { id, ox: lx - item.x, oy: ly - item.y }
    movedRef.current = false
    setItems(prev => {
      const it = prev.find(i => i.id === id)!
      return [...prev.filter(i => i.id !== id), it]
    })
  }

  // ── Board mouse events ───────────────────────────────────────────────────

  const onBoardMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const onItem = !!(e.target as Element).closest('.board-item')

    if (stringMode) {
      if (onItem) return
      const rect = boardRef.current!.getBoundingClientRect()
      const { x, y } = toLogical(e.clientX - rect.left, e.clientY - rect.top)
      stringStartRef.current = { x, y }
      isDrawingStringRef.current = true
      e.stopPropagation()
      return
    }

    // Pan on empty board space (not in connect mode, not on an item)
    if (!connecting && !onItem) {
      isPanningRef.current = true
      panPrevRef.current = { x: e.clientX, y: e.clientY }
      if (boardRef.current) boardRef.current.style.cursor = 'grabbing'
      e.preventDefault()
    }
  }

  const onBoardMouseMove = (e: React.MouseEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    const { x: lx, y: ly } = toLogical(e.clientX - rect.left, e.clientY - rect.top)
    setCursor({ x: lx, y: ly })

    if (isPanningRef.current && panPrevRef.current) {
      const dx = e.clientX - panPrevRef.current.x
      const dy = e.clientY - panPrevRef.current.y
      panPrevRef.current = { x: e.clientX, y: e.clientY }
      setView(prev => ({ ...prev, ox: prev.ox + dx, oy: prev.oy + dy }))
      return
    }

    if (!stringMode && draggingRef.current) {
      movedRef.current = true
      const { id, ox, oy } = draggingRef.current
      setItems(prev => prev.map(it =>
        it.id === id ? { ...it, x: lx - ox, y: ly - oy } : it
      ))
    }
  }

  const onBoardMouseUp = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false
      panPrevRef.current = null
      if (boardRef.current) boardRef.current.style.cursor = ''
    }

    if (stringMode && isDrawingStringRef.current && stringStartRef.current) {
      const rect = boardRef.current!.getBoundingClientRect()
      const { x, y } = toLogical(e.clientX - rect.left, e.clientY - rect.top)
      const dx = x - stringStartRef.current.x
      const dy = y - stringStartRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        const start = stringStartRef.current
        setFreeStrings(prev => [...prev, { id: uid(), x1: start.x, y1: start.y, x2: x, y2: y }])
      }
      stringStartRef.current = null
      isDrawingStringRef.current = false
    }
    draggingRef.current = null
  }

  // ── Connection logic (pin-based) ─────────────────────────────────────────

  const handleConnect = (id: string) => {
    movedRef.current = false
    if (connecting && connecting !== id) {
      const exists = connections.some(
        c => (c.fromId === connecting && c.toId === id) || (c.fromId === id && c.toId === connecting)
      )
      if (!exists) {
        setConnections(prev => [...prev, { id: uid(), fromId: connecting, toId: id }])
      }
      setConnecting(null)
    } else if (connecting === id) {
      setConnecting(null)
    } else {
      setConnecting(id)
    }
  }

  const handleItemClick = (id: string) => {
    if (movedRef.current) return
    if (!connecting) return
    handleConnect(id)
  }

  const handlePinClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    handleConnect(id)
  }

  const handleItemContextMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (stringMode) return
    handleConnect(id)
  }

  const removeConnection = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id))
  }

  const removeFreeString = (id: string) => {
    setFreeStrings(prev => prev.filter(s => s.id !== id))
  }

  // ── Item management ──────────────────────────────────────────────────────

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id))
    if (connecting === id) setConnecting(null)
  }

  const updateText = (id: string, text: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, text } : i))
  }

  const updateDimensions = (id: string, w: number, h: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, renderedW: w, renderedH: h } : i))
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnecting(null)
        setStringMode(false)
        stringStartRef.current = null
        isDrawingStringRef.current = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isDrawingString = stringMode && !!stringStartRef.current

  return (
    <div className="app">
      <Toolbar
        onAddSticky={addSticky}
        onClear={clearBoard}
        isConnecting={!!connecting}
        onCancelConnect={() => setConnecting(null)}
        stringMode={stringMode}
        onToggleStringMode={() => {
          setStringMode(s => !s)
          setConnecting(null)
        }}
        zoom={view.zoom}
        onZoomIn={() => zoomAroundCenter(1.25)}
        onZoomOut={() => zoomAroundCenter(0.8)}
        onZoomReset={fitBoard}
        folderOpen={folderOpen}
        onToggleFolder={() => setFolderOpen(o => !o)}
      />

      <div className="app-body">
        <CaseFilesPanel
          open={folderOpen}
          store={folderStore}
        />

        <div
          ref={boardRef}
          className={`board${connecting ? ' mode-connect' : ''}${stringMode ? ' mode-string' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onMouseDown={onBoardMouseDown}
          onMouseMove={onBoardMouseMove}
          onMouseUp={onBoardMouseUp}
          onClick={() => { if (connecting) setConnecting(null) }}
          onContextMenu={e => { e.preventDefault(); if (connecting) setConnecting(null) }}
        >
          <div
            className="board-canvas"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `translate(${view.ox}px, ${view.oy}px) scale(${view.zoom})`,
              transformOrigin: '0 0',
            }}
          >
            <div className="board-surface" style={{ width: BOARD_W, height: BOARD_H }} />
            <StringLayer
              items={items}
              connections={connections}
              freeStrings={freeStrings}
              connecting={connecting}
              cursor={cursor}
              isDrawingString={isDrawingString}
              stringStart={stringStartRef.current}
              onRemoveConnection={removeConnection}
              onRemoveFreeString={removeFreeString}
            />
            {items.map(item =>
              item.type === 'sticky' ? (
                <StickyNote
                  key={item.id}
                  item={item}
                  connecting={connecting}
                  onMouseDown={e => startDrag(item.id, e)}
                  onClick={() => handleItemClick(item.id)}
                  onPinClick={e => handlePinClick(item.id, e)}
                  onContextMenu={e => handleItemContextMenu(item.id, e)}
                  onTextChange={t => updateText(item.id, t)}
                  onDelete={() => deleteItem(item.id)}
                />
              ) : (
                <MediaCard
                  key={item.id}
                  item={item}
                  connecting={connecting}
                  onMouseDown={e => startDrag(item.id, e)}
                  onClick={() => handleItemClick(item.id)}
                  onPinClick={e => handlePinClick(item.id, e)}
                  onContextMenu={e => handleItemContextMenu(item.id, e)}
                  onDelete={() => deleteItem(item.id)}
                  onDimensionsKnown={(w, h) => updateDimensions(item.id, w, h)}
                />
              )
            )}
          </div>

          {items.length === 0 && (
            <div className="empty-hint">
              <span className="hint-icon">📌</span>
              <div>Drop images or PDFs onto the board</div>
              <div>or drag from <strong>Case Files</strong></div>
              <div>Click <strong>📝 Note</strong> to add a sticky note</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>Right-click any item to connect with string · or use 🧵 String to draw freely</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
