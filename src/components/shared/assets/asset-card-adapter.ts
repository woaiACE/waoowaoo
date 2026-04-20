export type SharedAssetKind = 'character' | 'location' | 'prop'

export interface SharedAssetCardActionAdapter {
  onEdit?: () => void
  onDelete?: () => void
  onGenerate?: (count?: number) => void
  onRegenerate?: (count?: number) => void
  onUndo?: () => void
  onCopyFromGlobal?: () => void
}

export interface SharedAssetCardAdapter {
  id: string
  kind: SharedAssetKind
  name: string
  summary?: string | null
  actions: SharedAssetCardActionAdapter
}
