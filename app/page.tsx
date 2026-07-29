'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/home')
  }, [router])

  return (
    <div className="flex h-full items-center justify-center bg-[var(--background)]">
      <div className="text-[var(--muted-foreground)]">正在进入主页...</div>
    </div>
  )
}
