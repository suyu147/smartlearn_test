'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/llm')
  }, [router])

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-[13px] text-[var(--muted-foreground)]">正在重定向...</div>
    </div>
  )
}
