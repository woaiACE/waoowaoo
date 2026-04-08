'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type CharacterNodeData = {
  name: string
  roleLevel: string
  imageUrl: string | null
  profileConfirmed?: boolean
  label?: string
}

const ROLE_LEVEL_COLORS: Record<string, string> = {
  S: '#f59e0b', // 金色 - 绝对主角
  A: '#8b5cf6', // 紫色 - 核心配角
  B: '#3b82f6', // 蓝色 - 重要配角
  C: '#14b8a6', // 青色 - 次要角色
  D: '#6b7280', // 灰色 - 群众演员
}

const ROLE_LEVEL_BG: Record<string, string> = {
  S: '#fef3c7',
  A: '#ede9fe',
  B: '#dbeafe',
  C: '#ccfbf1',
  D: '#f3f4f6',
}

function getRoleColor(roleLevel: string): string {
  return ROLE_LEVEL_COLORS[roleLevel] ?? ROLE_LEVEL_COLORS.D
}

function getRoleBg(roleLevel: string): string {
  return ROLE_LEVEL_BG[roleLevel] ?? ROLE_LEVEL_BG.D
}

function CharacterGraphNode({ data }: NodeProps) {
  const nodeData = data as CharacterNodeData
  const { name, roleLevel, imageUrl, profileConfirmed = true } = nodeData
  const color = getRoleColor(roleLevel)
  const bg = getRoleBg(roleLevel)
  const initial = name ? name.charAt(0).toUpperCase() : '?'

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ userSelect: 'none' }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      {/* 角色头像圆圈 */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: `3px solid ${color}`,
          background: imageUrl ? 'transparent' : bg,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 0 2px white, 0 0 0 4px ${color}22`,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        ) : (
          <span style={{ fontSize: 22, fontWeight: 700, color }}>{initial}</span>
        )}
      </div>

      {!profileConfirmed && (
        <div
          style={{
            marginTop: -2,
            background: '#f59e0b',
            color: 'white',
            borderRadius: 4,
            padding: '0px 4px',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '15px',
          }}
          title="该角色档案尚未确认"
        >
          待确认
        </div>
      )}

      {/* 角色名标签 */}
      <div
        style={{
          background: 'white',
          border: `1.5px solid ${color}`,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 12,
          fontWeight: 600,
          color: '#1f2937',
          maxWidth: 90,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
        title={name}
      >
        {name}
      </div>

      {/* 等级标签 */}
      <div
        style={{
          background: color,
          color: 'white',
          borderRadius: 4,
          padding: '0px 5px',
          fontSize: 10,
          fontWeight: 700,
          lineHeight: '16px',
        }}
      >
        {roleLevel}
      </div>
    </div>
  )
}

export default memo(CharacterGraphNode)
