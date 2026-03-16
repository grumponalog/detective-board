import { useState, useEffect, useRef } from 'react'
import { Folder, FolderItem } from '../types'
import * as pdfjs from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const STORAGE_KEY = 'detective-board:folders'
const ACTIVE_KEY  = 'detective-board:active-folder'

function readDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

let _fid = Date.now() + 1_000_000
const fuid = () => String(_fid++)

const makeFolder = (name: string): Folder => ({ id: fuid(), name, items: [] })

// ── Multi-folder persistence hook ────────────────────────────────────────────

export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch { /* ignore */ }
    return [makeFolder('Case Files')]
  })

  const [activeFolderId, setActiveFolderId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_KEY)
      if (saved) return saved
    } catch { /* ignore */ }
    return ''
  })

  // Persist folders
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        alert('Storage is full — remove some files to add more.')
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw) setFolders(JSON.parse(raw))
        } catch { /* ignore */ }
      }
    }
  }, [folders])

  // Persist active folder id
  useEffect(() => {
    try { localStorage.setItem(ACTIVE_KEY, activeFolderId) } catch { /* ignore */ }
  }, [activeFolderId])

  // Resolve active folder (fall back to first)
  const activeFolder = folders.find(f => f.id === activeFolderId) ?? folders[0]

  // Flat list of all items across all folders (for board-drop lookup)
  const allItems = folders.flatMap(f => f.items)

  // ── Folder CRUD ───────────────────────────────────────────────────────────

  const createFolder = (): string => {
    const f = makeFolder('New Case')
    setFolders(prev => [...prev, f])
    setActiveFolderId(f.id)
    return f.id
  }

  const deleteFolder = (id: string) => {
    setFolders(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(f => f.id !== id)
      if (activeFolderId === id) setActiveFolderId(next[0].id)
      return next
    })
  }

  const renameFolder = (id: string, name: string) =>
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))

  // ── Item CRUD (within active folder) ─────────────────────────────────────

  const addItemsToActive = (items: FolderItem[]) =>
    setFolders(prev => prev.map(f =>
      f.id === activeFolder.id ? { ...f, items: [...f.items, ...items] } : f
    ))

  const removeItemFromActive = (itemId: string) =>
    setFolders(prev => prev.map(f =>
      f.id === activeFolder.id ? { ...f, items: f.items.filter(i => i.id !== itemId) } : f
    ))

  const renameItemInActive = (itemId: string, label: string) =>
    setFolders(prev => prev.map(f =>
      f.id === activeFolder.id
        ? { ...f, items: f.items.map(i => i.id === itemId ? { ...i, label } : i) }
        : f
    ))

  return {
    folders, activeFolderId, setActiveFolderId,
    activeFolder, allItems,
    createFolder, deleteFolder, renameFolder,
    addItemsToActive, removeItemFromActive, renameItemInActive,
  }
}

export type FolderStore = ReturnType<typeof useFolders>

// ── File viewer (lightbox) ────────────────────────────────────────────────────

function PDFAllPages({ src }: { src: string }) {
  const [pages, setPages] = useState<{ dataUrl: string; w: number; h: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function render() {
      const MAX_W = 700
      const pdf = await pdfjs.getDocument(src).promise
      const results: { dataUrl: string; w: number; h: number }[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return
        const page = await pdf.getPage(i)
        const vp0 = page.getViewport({ scale: 1 })
        const scale = Math.min(MAX_W / vp0.width, 2)
        const vp = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(vp.width)
        canvas.height = Math.round(vp.height)
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        if (cancelled) return
        results.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height })
      }
      if (!cancelled) { setPages(results); setLoading(false) }
    }
    render().catch(() => setLoading(false))
    return () => { cancelled = true }
  }, [src])

  if (loading) return <div className="file-viewer-loading">Rendering pages…</div>
  return (
    <div className="file-viewer-pages">
      {pages.map((p, i) => (
        <div key={i} className="file-viewer-page">
          <img src={p.dataUrl} width={p.w} height={p.h} alt={`Page ${i + 1}`} draggable={false} />
          <div className="file-viewer-page-num">— {i + 1} / {pages.length} —</div>
        </div>
      ))}
    </div>
  )
}

interface ViewerProps {
  item: FolderItem
  onClose: () => void
}

function FileViewer({ item, onClose }: ViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <div className="file-viewer" onClick={e => e.stopPropagation()}>
        <div className="file-viewer-header">
          <span className="file-viewer-title">{item.label}</span>
          <button className="file-viewer-close" onClick={onClose} title="Close">×</button>
        </div>
        <div className="file-viewer-body">
          {item.type === 'image' ? (
            <img className="file-viewer-img" src={item.src} alt={item.label} draggable={false} />
          ) : (
            <PDFAllPages src={item.src} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-component: individual file item ──────────────────────────────────────

interface ItemRowProps {
  item: FolderItem
  onRemove: (id: string) => void
  onRename: (id: string, label: string) => void
  onExpand: (item: FolderItem) => void
}

function FolderItemRow({ item, onRemove, onRename, onExpand }: ItemRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.label)

  const commit = () => {
    onRename(item.id, draft.trim() || item.label)
    setEditing(false)
  }

  return (
    <div
      className="folder-item"
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('application/x-folder-item-id', item.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
    >
      {item.type === 'image' ? (
        <img
          className="folder-item-thumb"
          src={item.src}
          alt={item.label}
          draggable={false}
          onClick={e => { e.stopPropagation(); onExpand(item) }}
          title="Click to expand"
        />
      ) : (
        <div
          className="folder-item-pdf-thumb"
          onClick={e => { e.stopPropagation(); onExpand(item) }}
          title="Click to expand"
        >📄</div>
      )}

      {editing ? (
        <input
          className="folder-item-rename"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
            e.stopPropagation()
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span
          className="folder-item-label"
          title={`${item.label}\nDouble-click to rename`}
          onDoubleClick={() => { setDraft(item.label); setEditing(true) }}
        >
          {item.label}
        </span>
      )}

      <button
        className="folder-item-del"
        title="Remove from folder"
        onClick={e => { e.stopPropagation(); onRemove(item.id) }}
      >×</button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  store: FolderStore
}

export function CaseFilesPanel({ open, store }: Props) {
  const {
    folders, activeFolderId, setActiveFolderId, activeFolder,
    createFolder, deleteFolder, renameFolder,
    addItemsToActive, removeItemFromActive, renameItemInActive,
  } = store

  const fileInputRef  = useRef<HTMLInputElement>(null)
  const tabsRef       = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  // File viewer (lightbox)
  const [expandedItem, setExpandedItem] = useState<FolderItem | null>(null)

  // Folder tab rename state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [folderNameDraft, setFolderNameDraft]   = useState('')

  // When a new folder is created, immediately enter rename mode
  const handleCreateFolder = () => {
    const id = createFolder()
    setRenamingFolderId(id)
    setFolderNameDraft('New Case')
    // Scroll tabs to end after render
    setTimeout(() => {
      if (tabsRef.current) tabsRef.current.scrollLeft = tabsRef.current.scrollWidth
    }, 50)
  }

  const commitFolderRename = (id: string) => {
    renameFolder(id, folderNameDraft.trim() || 'Case Files')
    setRenamingFolderId(null)
  }

  const handleDeleteFolder = (id: string, name: string) => {
    if (folders.length <= 1) return
    if (window.confirm(`Delete "${name}" and all its files?`)) deleteFolder(id)
  }

  // File processing
  const processFiles = async (files: FileList | File[]) => {
    const newItems: FolderItem[] = []
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        const src = await readDataURL(file)
        newItems.push({
          id: fuid(), label: file.name,
          type: file.type === 'application/pdf' ? 'pdf' : 'image',
          src, dateAdded: Date.now(),
        })
      }
    }
    if (newItems.length) addItemsToActive(newItems)
  }

  const onPanelDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setDragOver(true)
  }
  const onDragLeave = () => {
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragOver(false)
  }
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  return (
    <div
      className={`case-files-panel${open ? '' : ' closed'}${dragOver ? ' drag-over' : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onPanelDrop}
    >
      {/* ── Folder tabs ── */}
      <div className="folder-tabs">
        <div className="folder-tabs-scroll" ref={tabsRef}>
          {folders.map(folder => (
            <div
              key={folder.id}
              className={`folder-tab-item${folder.id === (activeFolderId || folders[0].id) ? ' active' : ''}`}
              onClick={() => { if (renamingFolderId !== folder.id) setActiveFolderId(folder.id) }}
              onDoubleClick={() => { setActiveFolderId(folder.id); setFolderNameDraft(folder.name); setRenamingFolderId(folder.id) }}
            >
              {renamingFolderId === folder.id ? (
                <input
                  className="folder-tab-rename"
                  value={folderNameDraft}
                  autoFocus
                  onChange={e => setFolderNameDraft(e.target.value)}
                  onBlur={() => commitFolderRename(folder.id)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitFolderRename(folder.id)
                    if (e.key === 'Escape') setRenamingFolderId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="folder-tab-name" title={folder.name}>{folder.name}</span>
              )}
              {folders.length > 1 && (
                <button
                  className="folder-tab-del"
                  title={`Delete "${folder.name}"`}
                  onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id, folder.name) }}
                >×</button>
              )}
            </div>
          ))}
        </div>
        <button className="folder-tab-new" onClick={handleCreateFolder} title="New folder">+</button>
      </div>

      {/* ── Add files button ── */}
      <div className="folder-header">
        <button
          className="folder-add-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Browse for images or PDFs to add to this folder"
        >
          + Add Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.length) { processFiles(e.target.files); e.target.value = '' } }}
        />
      </div>

      {/* ── Item list ── */}
      <div className="folder-items">
        {!activeFolder || activeFolder.items.length === 0 ? (
          <div className="folder-empty">
            <div>📎</div>
            <div>Drop images or PDFs</div>
            <div>onto this panel</div>
            <div style={{ marginTop: 8 }}>Drag items to the</div>
            <div>board to place them</div>
          </div>
        ) : (
          activeFolder.items.map(item => (
            <FolderItemRow
              key={item.id}
              item={item}
              onRemove={removeItemFromActive}
              onRename={renameItemInActive}
              onExpand={setExpandedItem}
            />
          ))
        )}
      </div>

      <div className="folder-footer" />

      {expandedItem && (
        <FileViewer item={expandedItem} onClose={() => setExpandedItem(null)} />
      )}
    </div>
  )
}
