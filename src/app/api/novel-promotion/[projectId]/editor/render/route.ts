import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler, ApiError } from '@/lib/api-errors'

/**
 * POST /api/novel-promotion/[projectId]/editor/render
 * 发起视频导出渲染任务
 *
 * 请求体: { editorProjectId: string, format?: 'mp4' | 'webm', quality?: 'draft' | 'high', targetPlatform?: string }
 * 响应:   { id: string, status: 'pending' }
 */
export const POST = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { editorProjectId, targetPlatform } = body

    if (!editorProjectId) {
        throw new ApiError('INVALID_PARAMS')
    }

    const editorProject = await prisma.videoEditorProject.findUnique({
        where: { id: editorProjectId },
        select: { id: true, episodeId: true, renderStatus: true }
    })

    if (!editorProject) {
        throw new ApiError('NOT_FOUND')
    }

    // Dedup guard: reject if an active render is already in progress
    if (editorProject.renderStatus === 'pending' || editorProject.renderStatus === 'rendering') {
        return NextResponse.json(
            { error: 'RENDER_IN_PROGRESS', status: editorProject.renderStatus },
            { status: 409 }
        )
    }

    // Mark as pending; actual Remotion render worker is enqueued here in P1
    const updated = await prisma.videoEditorProject.update({
        where: { id: editorProjectId },
        data: {
            renderStatus: 'pending',
            renderTaskId: null,
            outputUrl: null,
        }
    })

    return NextResponse.json({ id: updated.id, status: updated.renderStatus, targetPlatform: targetPlatform ?? null })
})

/**
 * GET /api/novel-promotion/[projectId]/editor/render?id=editorProjectId
 * 查询渲染状态
 *
 * 响应: { status, outputUrl, error }
 */
export const GET = apiHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) => {
    const { projectId } = await params

    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
        throw new ApiError('INVALID_PARAMS')
    }

    const editorProject = await prisma.videoEditorProject.findUnique({
        where: { id },
        select: { id: true, renderStatus: true, outputUrl: true, renderProgress: true, renderError: true }
    })

    if (!editorProject) {
        throw new ApiError('NOT_FOUND')
    }

    return NextResponse.json({
        id: editorProject.id,
        status: editorProject.renderStatus ?? 'idle',
        outputUrl: editorProject.outputUrl ?? null,
        progress: editorProject.renderProgress ?? null,
        error: editorProject.renderError ?? null,
    })
})
