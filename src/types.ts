export type ItemType = 'sticky' | 'image' | 'pdf'
export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green' | 'orange'

export interface BoardItem {
  id: string
  type: ItemType
  x: number
  y: number
  rotation: number
  // sticky note
  text?: string
  color?: StickyColor
  // image / pdf
  src?: string
  filename?: string
  // populated after content loads/renders
  renderedW?: number
  renderedH?: number
}

export interface Connection {
  id: string
  fromId: string
  toId: string
}

export interface FreeString {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface FolderItem {
  id: string
  label: string       // user-editable display name
  type: 'image' | 'pdf'
  src: string         // base64 data URL
  dateAdded: number
}

export interface Folder {
  id: string
  name: string
  items: FolderItem[]
}
