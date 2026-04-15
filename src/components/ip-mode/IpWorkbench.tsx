'use client'

/**
 * IP 角色工作台 — 主入口组件
 *
 * 管理用户的 IP 角色资产，支持创建/编辑/删除角色、变体管理、参考图集预览。
 * 独立于项目维度，归属于用户全局。
 */

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/contexts/ToastContext'
import { AppIcon } from '@/components/ui/icons'
import GlassButton from '@/components/ui/primitives/GlassButton'
import IpCharacterCard from './IpCharacterCard'
import IpCharacterEditor from './IpCharacterEditor'
import IpVariantManager from './IpVariantManager'
import type { IpCharacterSummary } from './types'
import { useIpCharacters } from './hooks/useIpCharacters'

interface IpWorkbenchProps {
  userId: string
  onCharacterSelect?: (characterId: string) => void
}

export default function IpWorkbench({ userId: _userId, onCharacterSelect }: IpWorkbenchProps) {
  const t = useTranslations('ipMode')
  const { showToast } = useToast()
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showVariants, setShowVariants] = useState(false)

  const {
    characters,
    isLoading,
    createCharacter,
    deleteCharacter,
    refresh,
  } = useIpCharacters()

  const handleCreate = useCallback(async (data: { name: string; faceReferenceUrl?: string }) => {
    try {
      await createCharacter(data)
      setIsCreating(false)
      showToast(t('character.created'), 'success')
    } catch {
      showToast(t('character.createFailed'), 'error')
    }
  }, [createCharacter, showToast, t])

  const handleDelete = useCallback(async (characterId: string) => {
    try {
      await deleteCharacter(characterId)
      if (selectedCharacterId === characterId) {
        setSelectedCharacterId(null)
      }
      showToast(t('character.deleted'), 'success')
    } catch {
      showToast(t('character.deleteFailed'), 'error')
    }
  }, [deleteCharacter, selectedCharacterId, showToast, t])

  const handleSelectCharacter = useCallback((characterId: string) => {
    setSelectedCharacterId(characterId)
    onCharacterSelect?.(characterId)
  }, [onCharacterSelect])

  const selectedCharacter = characters.find((c: IpCharacterSummary) => c.id === selectedCharacterId)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold glass-text-primary">
          {t('workbench.title')}
        </h2>
        <GlassButton
          variant="primary"
          size="sm"
          iconLeft={<AppIcon name="plus" className="w-4 h-4" />}
          onClick={() => setIsCreating(true)}
        >
          {t('workbench.createCharacter')}
        </GlassButton>
      </div>

      {/* Character Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--glass-text-tertiary)] border-t-[var(--glass-accent)]" />
        </div>
      ) : characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <AppIcon name="user" className="w-12 h-12 text-[var(--glass-text-tertiary)]" />
          <p className="glass-text-tertiary text-sm">{t('workbench.empty')}</p>
          <GlassButton variant="secondary" size="sm" onClick={() => setIsCreating(true)}>
            {t('workbench.createFirst')}
          </GlassButton>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {characters.map((character: IpCharacterSummary) => (
            <IpCharacterCard
              key={character.id}
              character={character}
              isSelected={character.id === selectedCharacterId}
              onSelect={() => handleSelectCharacter(character.id)}
              onDelete={() => handleDelete(character.id)}
              onVariants={() => {
                setSelectedCharacterId(character.id)
                setShowVariants(true)
              }}
            />
          ))}
        </div>
      )}

      {/* Character Editor Panel */}
      {selectedCharacter && !showVariants && (
        <IpCharacterEditor
          character={selectedCharacter}
          onClose={() => setSelectedCharacterId(null)}
          onRefresh={refresh}
        />
      )}

      {/* Variant Manager Panel */}
      {selectedCharacter && showVariants && (
        <IpVariantManager
          characterId={selectedCharacter.id}
          characterName={selectedCharacter.name}
          onClose={() => setShowVariants(false)}
        />
      )}

      {/* Create Modal */}
      {isCreating && (
        <IpCharacterEditor
          onClose={() => setIsCreating(false)}
          onSave={handleCreate}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}
