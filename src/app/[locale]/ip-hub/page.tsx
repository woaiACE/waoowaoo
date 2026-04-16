'use client'

import { Suspense, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import Navbar from '@/components/Navbar'
import { AnimatedBackground } from '@/components/ui/SharedComponents'
import { IpWorkbench } from '@/components/ip-mode'

function IpHubContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const t = useTranslations('ipMode')
  const hasSession = Boolean(session)

  useEffect(() => {
    if (status === 'loading') return
    if (!hasSession) {
      router.push({ pathname: '/auth/signin' })
    }
  }, [hasSession, status, router])

  if (status === 'loading' || !hasSession) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--glass-text-secondary)]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--glass-text-tertiary)] border-t-[var(--glass-accent)]" />
      </div>
    )
  }

  return (
    <div>
      <AnimatedBackground />
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <h1 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-6">
          {t('workbench.title')}
        </h1>
        <IpWorkbench userId="session" />
      </main>
    </div>
  )
}

export default function IpHubPage() {
  return (
    <Suspense>
      <IpHubContent />
    </Suspense>
  )
}
