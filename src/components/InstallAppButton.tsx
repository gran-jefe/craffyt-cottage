'use client'

import React, { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * "Install the app" for the footer. Chrome/Edge/Android get a real install button; iPhone
 * Safari has no install API, so it gets the two-step instruction instead. Hidden once installed.
 */
export function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const onPrompt = (e: Event) => {
      e.preventDefault() // keep it for our button instead of the browser's mini-bar
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  if (prompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          await prompt.prompt()
          await prompt.userChoice
          setPrompt(null) // the event can only be used once
        }}
        className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium hover:text-white transition-colors duration-150"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        Install the app
      </button>
    )
  }

  if (ios) {
    return (
      <p className="text-xs leading-relaxed inline-flex items-center gap-1.5">
        <Share className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Install on iPhone: tap Share, then Add to Home Screen.
      </p>
    )
  }

  return null
}
