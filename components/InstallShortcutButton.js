import { useEffect, useState } from 'react'

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
}

function isIos() {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || '')
}

function isAndroid() {
  if (typeof window === 'undefined') return false
  return /android/i.test(window.navigator.userAgent || '')
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

    const handleInstalled = () => {
      setDeferredPrompt(null)
      setHidden(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function handleInstall() {
    if (typeof window === 'undefined') return

    if (deferredPrompt) {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice.catch(() => {})
      setDeferredPrompt(null)
      return
    }

    if (isAndroid()) {
      alert('안드로이드에서는 보안 정책 때문에 앱이 직접 홈 화면 추가를 완료할 수는 없습니다.\n\n브라우저가 설치 프롬프트를 줄 수 있을 때는 바로 설치창이 뜨고, 그렇지 않을 때는 브라우저 메뉴에서 "홈 화면에 추가" 또는 "설치"를 선택해 주세요.')
      return
    }

    if (isIos()) {
      alert('아이폰에서는 Safari 하단의 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택해 주세요.')
      return
    }

    alert('브라우저 메뉴에서 "홈 화면에 추가" 또는 "설치"를 선택해 주세요.')
  }

  if (hidden) return null

  return (
    <button
      onClick={handleInstall}
      aria-label="홈 화면에 추가"
      title="홈 화면에 추가"
      style={{
        minWidth: 92,
        height: 38,
        borderRadius: 999,
        border: light ? '1px solid rgba(255,255,255,0.28)' : '1px solid #d8c7ae',
        background: light ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.72)',
        color: light ? '#fff' : '#6f5438',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '0 12px',
        fontSize: 13,
        fontWeight: 700,
        boxShadow: light ? 'none' : '0 4px 10px rgba(78,52,24,0.06)',
        backdropFilter: 'blur(6px)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>⬇</span>
      <span>홈에 추가</span>
    </button>
  )
}
