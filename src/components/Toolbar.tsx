interface Props {
  onAddSticky: () => void
  onClear: () => void
  isConnecting: boolean
  onCancelConnect: () => void
  stringMode: boolean
  onToggleStringMode: () => void
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  folderOpen: boolean
  onToggleFolder: () => void
}

export function Toolbar({
  onAddSticky, onClear,
  isConnecting, onCancelConnect,
  stringMode, onToggleStringMode,
  zoom, onZoomIn, onZoomOut, onZoomReset,
  folderOpen, onToggleFolder,
}: Props) {
  return (
    <div className="toolbar">
      <span className="toolbar-logo">🔍 Detective Board</span>
      <span className="toolbar-sep" />

      <button
        className={`toolbar-btn${folderOpen ? ' folder-active' : ''}`}
        onClick={onToggleFolder}
        title="Toggle Case Files panel"
      >
        📁 Case Files
      </button>

      <span className="toolbar-sep" />

      <button className="toolbar-btn" onClick={onAddSticky} title="Add sticky note">
        📝 Note
      </button>

      <button
        className={`toolbar-btn${stringMode ? ' active' : ''}`}
        onClick={onToggleStringMode}
        title="Draw string between any two points (click again or ESC to exit)"
      >
        🧵 String
      </button>

      <button className="toolbar-btn danger" onClick={onClear} title="Clear everything">
        🗑 Clear
      </button>

      <span className="toolbar-sep" />

      <div className="zoom-controls">
        <button className="toolbar-btn zoom-btn" onClick={onZoomOut} title="Zoom out">−</button>
        <button className="zoom-pct" onClick={onZoomReset} title="Fit board">
          {Math.round(zoom * 100)}%
        </button>
        <button className="toolbar-btn zoom-btn" onClick={onZoomIn} title="Zoom in">+</button>
      </div>

      {stringMode && (
        <>
          <span className="toolbar-sep" />
          <div className="connect-hint">
            🧵 Click and drag anywhere to draw string · <strong style={{ cursor: 'pointer' }} onClick={onToggleStringMode}>ESC</strong> to finish
          </div>
        </>
      )}

      {isConnecting && !stringMode && (
        <>
          <span className="toolbar-sep" />
          <div className="connect-hint">
            📌 Right-click another item to connect ·{' '}
            <strong style={{ cursor: 'pointer' }} onClick={onCancelConnect}>ESC</strong> to cancel
          </div>
        </>
      )}
    </div>
  )
}
