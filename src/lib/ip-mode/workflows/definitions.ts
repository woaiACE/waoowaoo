/**
 * IP 角色模式 — 工作流定义
 *
 * 注册到现有 WorkflowEngine，复用 GraphRun/GraphStep 执行引擎。
 */

import { TASK_TYPE } from '@/lib/task/types'
import type { WorkflowDefinition } from '@/lib/workflow-engine/registry'

/**
 * IP 资产初始化工作流
 *
 * 创建 IP 角色后，自动提取面部特征并生成参考图集。
 * 参考图集步骤使用 continue 策略（失败不阻塞整体）。
 */
export const IP_ASSET_INIT_DEFINITION: WorkflowDefinition = {
  workflowType: TASK_TYPE.IP_ASSET_INIT_RUN,
  orderedSteps: [
    {
      key: 'extract_face',
      dependsOn: [],
      retryable: true,
      artifactTypes: ['ip.face_descriptor', 'ip.face_reference'],
      failureMode: 'fail_run',
    },
    {
      key: 'ref_sheet_turnaround',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ip.ref_sheet'],
      failureMode: 'fail_run',
    },
    {
      key: 'ref_sheet_expression',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ip.ref_sheet'],
      failureMode: 'fail_run',
    },
    {
      key: 'ref_sheet_pose',
      dependsOn: ['extract_face'],
      retryable: true,
      artifactTypes: ['ip.ref_sheet'],
      failureMode: 'fail_run',
    },
  ],
  resolveRetryInvalidationStepKeys: ({ stepKey, existingStepKeys }) => {
    const affected = new Set<string>([stepKey])
    // 面部特征变更 → 所有参考图集需重新生成
    if (stepKey === 'extract_face') {
      for (const key of existingStepKeys) {
        if (key.startsWith('ref_sheet_')) {
          affected.add(key)
        }
      }
    }
    return Array.from(affected).filter(k => existingStepKeys.includes(k))
  },
}

/**
 * IP 剧本改写工作流
 *
 * 收集选角人设 → LLM 改写 → 结构化拆分 → 持久化
 */
export const IP_SCREENPLAY_REWRITE_DEFINITION: WorkflowDefinition = {
  workflowType: TASK_TYPE.IP_SCREENPLAY_REWRITE_RUN,
  orderedSteps: [
    {
      key: 'inject_personas',
      dependsOn: [],
      retryable: false,
      artifactTypes: ['ip.persona_context'],
      failureMode: 'fail_run',
    },
    {
      key: 'rewrite_screenplay',
      dependsOn: ['inject_personas'],
      retryable: true,
      artifactTypes: ['ip.rewritten_screenplay'],
      failureMode: 'fail_run',
    },
    {
      key: 'parse_segments',
      dependsOn: ['rewrite_screenplay'],
      retryable: true,
      artifactTypes: ['ip.structured_segments'],
      failureMode: 'fail_run',
    },
    {
      key: 'persist_ip_screenplay',
      dependsOn: ['parse_segments'],
      retryable: false,
      artifactTypes: [],
      failureMode: 'fail_run',
    },
  ],
  resolveRetryInvalidationStepKeys: ({ stepKey, existingStepKeys }) => {
    const affected = new Set<string>([stepKey])
    const order = ['inject_personas', 'rewrite_screenplay', 'parse_segments', 'persist_ip_screenplay']
    const idx = order.indexOf(stepKey)
    if (idx >= 0) {
      // 上游变更时，下游全部失效
      for (let i = idx + 1; i < order.length; i++) {
        if (existingStepKeys.includes(order[i])) {
          affected.add(order[i])
        }
      }
    }
    return Array.from(affected)
  },
}

/**
 * 所有 IP 工作流定义，用于注册到全局 registry
 */
export const IP_WORKFLOW_DEFINITIONS: Record<string, WorkflowDefinition> = {
  [IP_ASSET_INIT_DEFINITION.workflowType]: IP_ASSET_INIT_DEFINITION,
  [IP_SCREENPLAY_REWRITE_DEFINITION.workflowType]: IP_SCREENPLAY_REWRITE_DEFINITION,
}
