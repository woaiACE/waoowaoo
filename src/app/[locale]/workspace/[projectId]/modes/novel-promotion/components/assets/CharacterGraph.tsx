'use client'

import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import CharacterGraphNode, { type CharacterNodeData } from './CharacterGraphNode'
import type { CharacterNode, CharacterRelation } from '@/lib/query/hooks/useCharacterRelations'

// 关系类型到颜色/样式的映射
const RELATION_STYLE: Record<string, { color: string; strokeDash?: string }> = {
  上下级: { color: '#6b7280' },
  superior: { color: '#6b7280' },
  友好: { color: '#3b82f6' },
  friendly: { color: '#3b82f6' },
  敌对: { color: '#ef4444', strokeDash: '6 3' },
  hostile: { color: '#ef4444', strokeDash: '6 3' },
  恋爱: { color: '#ec4899' },
  romantic: { color: '#ec4899' },
  家族: { color: '#f59e0b' },
  family: { color: '#f59e0b' },
  战友: { color: '#14b8a6' },
  ally: { color: '#14b8a6' },
  仇敌: { color: '#dc2626', strokeDash: '4 4' },
  rival: { color: '#dc2626', strokeDash: '4 4' },
  竞争: { color: '#8b5cf6', strokeDash: '8 3' },
  competing: { color: '#8b5cf6', strokeDash: '8 3' },
  其他: { color: '#9ca3af' },
  other: { color: '#9ca3af' },
}

const ROLE_LEVEL_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4 }
const NODE_WIDTH = 100
const NODE_HEIGHT = 110
const H_GAP = 140
const V_GAP = 150

/**
 * 按 role_level 分层，计算每个节点的位置
 */
function computeLayout(characters: CharacterNode[]): Record<string, { x: number; y: number }> {
  // 按等级分组
  const groups: Record<string, CharacterNode[]> = {}
  for (const char of characters) {
    const lvl = char.roleLevel ?? 'D'
    if (!groups[lvl]) groups[lvl] = []
    groups[lvl].push(char)
  }

  const positions: Record<string, { x: number; y: number }> = {}

  // 等级顺序从高到低排列
  const levels = Object.keys(groups).sort(
    (a, b) => (ROLE_LEVEL_ORDER[a] ?? 99) - (ROLE_LEVEL_ORDER[b] ?? 99),
  )

  let y = 40
  for (const level of levels) {
    const nodesInLevel = groups[level]
    const rowWidth = nodesInLevel.length * (NODE_WIDTH + H_GAP) - H_GAP
    let x = -(rowWidth / 2)
    for (const char of nodesInLevel) {
      positions[char.name] = { x, y }
      x += NODE_WIDTH + H_GAP
    }
    y += NODE_HEIGHT + V_GAP
  }

  return positions
}

const nodeTypes: NodeTypes = {
  character: CharacterGraphNode,
}

interface CharacterGraphProps {
  characters: CharacterNode[]
  relations: CharacterRelation[]
  onNodeClick?: (characterName: string) => void
}

export default function CharacterGraph({ characters, relations, onNodeClick }: CharacterGraphProps) {
  const layout = useMemo(() => computeLayout(characters), [characters])

  // 名字 → id 映射，用于找到边的 source/target
  const nameToId = useMemo(() => {
    const map: Record<string, string> = {}
    for (const char of characters) {
      map[char.name] = char.id
      for (const alias of char.aliases ?? []) {
        map[alias] = char.id
      }
    }
    return map
  }, [characters])

  const initialNodes = useMemo<Node[]>(
    () =>
      characters.map((char) => {
        const pos = layout[char.name] ?? { x: 0, y: 0 }
        const nodeData: CharacterNodeData = {
          name: char.name,
          roleLevel: char.roleLevel,
          imageUrl: char.imageUrl,
          profileConfirmed: char.profileConfirmed,
        }
        return {
          id: char.id,
          type: 'character',
          position: pos,
          data: nodeData as unknown as Record<string, unknown>,
        }
      }),
    [characters, layout],
  )

  const initialEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = []
    const seen = new Set<string>()

    for (const rel of relations) {
      const sourceId = nameToId[rel.fromName]
      const targetId = nameToId[rel.toName]
      if (!sourceId || !targetId) continue

      const isBidirectional = rel.direction === 'bidirectional'

      // 去重策略：
      // - 双向关系：按无向边去重（A-B 与 B-A 视为同一条）
      // - 单向关系：保留方向（A→B 与 B→A 可同时存在）
      const directedKey = `${sourceId}->${targetId}-${rel.relationType}`
      const undirectedKey = [sourceId, targetId].sort().join('-') + `-${rel.relationType}`
      const dedupeKey = isBidirectional ? undirectedKey : directedKey
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const style = RELATION_STYLE[rel.relationType] ?? RELATION_STYLE['其他']
      const isDashed = !!style.strokeDash

      edges.push({
        id: rel.id,
        source: sourceId,
        target: targetId,
        label: rel.relationType,
        labelStyle: { fontSize: 11, fill: style.color, fontWeight: 600 },
        labelBgStyle: { fill: 'white', opacity: 0.9 },
        labelBgPadding: [3, 5] as [number, number],
        labelBgBorderRadius: 4,
        animated: rel.relationType === '恋爱' || rel.relationType === 'romantic',
        style: {
          stroke: style.color,
          strokeWidth: 2,
          strokeDasharray: style.strokeDash,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: style.color,
          width: 14,
          height: 14,
        },
        markerStart: isBidirectional
          ? { type: MarkerType.ArrowClosed, color: style.color, width: 14, height: 14 }
          : undefined,
        type: isDashed ? 'straight' : 'default',
      })
    }
    return edges
  }, [relations, nameToId])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  useEffect(() => {
    setEdges(initialEdges)
  }, [initialEdges, setEdges])

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const char = characters.find((c) => c.id === node.id)
      if (char && onNodeClick) onNodeClick(char.name)
    },
    [characters, onNodeClick],
  )

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e5e7eb" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as CharacterNodeData
            const colors: Record<string, string> = {
              S: '#f59e0b',
              A: '#8b5cf6',
              B: '#3b82f6',
              C: '#14b8a6',
              D: '#6b7280',
            }
            return colors[d?.roleLevel ?? 'D'] ?? '#6b7280'
          }}
          style={{ background: '#f9fafb' }}
        />
      </ReactFlow>
    </div>
  )
}
