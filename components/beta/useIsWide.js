import { useEffect, useState } from 'react'

export default function useIsWide(breakpoint = 900) {
  const [isWide, setIsWide] = useState(false)

  useEffect(() => {
    function update() {
      setIsWide(window.innerWidth >= breakpoint)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [breakpoint])

  return isWide
}
