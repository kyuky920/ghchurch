import { useEffect, useState } from 'react'

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
}

export default function InstallShortcutButton({ light = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandaloneMode()) {
      setHidden(true)
      return
    }
    setHidden(false)

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setHidden(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  async function handleInstall() {
    if (typeof window === 'undefined') return

    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice.catch(() => {})
      setDeferredPrompt(null)
      return
    }

    alert('안드로이드는 브라우저 메뉴에서 "홈 화면에 추가" 또는 "설치"를 선택해 주세요.\n\n아이폰은 Safari에서 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택하면 됩니다.')
  }

  if (hidden) return null

  return (
    <button
      onClick={handleInstall}
      aria-label="홈 화면에 추가"
      title="홈 화면에 추가"
      style={{
        width: 38,
        height: 38,
        borderRadius: 999,
        border: light ? '1px solid rgba(255,255,255,0.28)' : '1px solid #d8c7ae',
        background: light ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.72)',
        color: light ? '#fff' : '#6f5438',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        boxShadow: light ? 'none' : '0 4px 10px rgba(78,52,24,0.06)',
        backdropFilter: 'blur(6px)',
        flexShrink: 0,
      }}
    >
      ⬇
    </button>
  )
}
