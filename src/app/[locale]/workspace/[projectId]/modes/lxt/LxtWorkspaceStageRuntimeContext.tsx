'use client'

import { createContext, useContext, type ReactNode } from 'react'

interface LxtStageRuntimeContextValue {
  onStageChange: (stage: string) => void
}

const LxtStageRuntimeContext = createContext<LxtStageRuntimeContextValue | null>(null)

export function LxtWorkspaceStageRuntimeProvider({
  onStageChange,
  children,
}: {
  onStageChange: (stage: string) => void
  children: ReactNode
}) {
  return (
    <LxtStageRuntimeContext.Provider value={{ onStageChange }}>
      {children}
    </LxtStageRuntimeContext.Provider>
  )
}

export function useLxtWorkspaceStageRuntime() {
  const ctx = useContext(LxtStageRuntimeContext)
  if (!ctx) throw new Error('useLxtWorkspaceStageRuntime must be used within LxtWorkspaceStageRuntimeProvider')
  return ctx
}
