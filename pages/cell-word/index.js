import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import html2canvas from 'html2canvas'

// 구형식(YYYY-Www) → YYYY-MM-DD 변환
function normalizeWeek(week) {
  if (!week) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan4 = new Date(y, 0, 4)
    const sun = new Date(jan4)
    sun.setDate(jan4.getDate() - jan4.getDay() + (w - 1) * 7)
    return `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`
  }
  return week
}

function weekLabel(week) {
  const normalized = normalizeWeek(week)
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return week || ''
  const d = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(d.getTime())) return normalized
  return `${d.getMonth() + 1}월 ${d.getDate()}일 주`
}

function pickQueryValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function sameWeek(candidate, requested) {
  if (!candidate || !requested) return false
  return candidate === requested || normalizeWeek(candidate) === normalizeWeek(requested)
}
function findMatchingSermon(sermons, requestedWeek, requestedService, sessionWeek, sessionService) {
  if (!Array.isArray(sermons) || sermons.length === 0) return null

  if (requestedWeek && requestedService) {
    const exactRequested = sermons.find(s => sameWeek(s.week, requestedWeek) && s.service === requestedService)
    if (exactRequested) return exactRequested
  }
  if (sessionWeek && sessionService) {
    const exactSession = sermons.find(s => sameWeek(s.week, sessionWeek) && s.service === sessionService)
    if (exactSession) return exactSession
  }
  if (requestedWeek) {
    const requestedWeekFallback = sermons.find(s => sameWeek(s.week, requestedWeek))
    if (requestedWeekFallback) return requestedWeekFallback
  }
  if (sessionWeek) {
    const sessionWeekFallback = sermons.find(s => sameWeek(s.week, sessionWeek))
    if (sessionWeekFallback) return sessionWeekFallback
  }
  return sermons[0] || null
}
function formatSessionTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' })
}
function formatSessionPeriod(session) {
  if (!session?.started_at) return ''
  const start = formatSessionTime(session.started_at)
  const end = formatSessionTime(session.ended_at)
  return end ? `${start} ~ ${end}` : `${start} 시작`
}
function formatGroupName(group) {
  if (!group) return ''
  const groupNo = typeof group === 'object' ? group.group_no : null
  const name = typeof group === 'object' ? group.name : group
  if (!name) return groupNo ? `${groupNo}조` : ''
  if (name.includes('조 - ')) return name
  return groupNo ? `${groupNo}조 - ${name}` : name
}

function getDeviceId() {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('wl_device_id')
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
    localStorage.setItem('wl_device_id', id)
  }
  return id
}
function getSavedName() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('wl_member_name') || ''
}

const QMETA = [
  { type:'말씀 속으로',  color:'#7a5a33', bg:'#fff8ef' },
  { type:'내 이야기',    color:'#8b6440', bg:'#fff9f2' },
  { type:'함께 나눔',    color:'#3f6f54', bg:'#f4fbf6' },
  { type:'이번 주 실천', color:'#3f6f54', bg:'#eff8f1' },
]

const QUESTION_FLOW_ORDER = [
  '말씀을 점검합시다.',
  '말씀을 통해 은혜를 나눕시다.',
  '말씀을 따라 결단합시다.',
]

function inferFlowStage(item = {}) {
  const explicit = item.flow_stage || item.flowStage || item.group_title || item.groupTitle || ''
  if (explicit) return explicit
  const category = item.category || item.type || ''
  if (category === '오프닝' || category === '말씀 속으로' || category === '관찰') return '말씀을 점검합시다.'
  if (category === '내 이야기' || category === '함께 나눔' || category === '적용') return '말씀을 통해 은혜를 나눕시다.'
  if (category === '이번 주 실천' || category === '결단') return '말씀을 따라 결단합시다.'
  return ''
}

function normalizeQuestions(raw) {
  const toItem = (q, options = {}) => {
    const sectionTitle = options.sectionTitle || ''
    const flowStage = options.flowStage || ''
    if (typeof q === 'string') return { section_title: sectionTitle, category: '', explanation: '', question: q, flow_stage: flowStage }
    return {
      section_title: q?.section_title || sectionTitle || '',
      category: q?.category || q?.type || '',
      explanation: q?.explanation || q?.context || '',
      question: q?.question || q?.text || q?.content || '',
      flow_stage: q?.flow_stage || q?.flowStage || q?.group_title || q?.groupTitle || flowStage || '',
    }
  }

  if (Array.isArray(raw)) return raw.map((q) => toItem(q)).filter((q) => q.question)

  if (raw && typeof raw === 'object') {
    const groups = Array.isArray(raw.groups) ? raw.groups : []
    const groupedList = groups.flatMap((group) => {
      const flowStage = group?.flow_stage || group?.flowStage || group?.title || group?.group_title || ''
      const questions = Array.isArray(group?.questions) ? group.questions : []
      return questions.map((q) => toItem(q, { flowStage }))
    })
    if (groupedList.length) return groupedList.filter((q) => q.question)

    const sections = Array.isArray(raw.sections) ? raw.sections : []
    const list = sections.flatMap((s) => {
      const title = s?.section_title || s?.title || s?.topic || ''
      const flowStage = s?.flow_stage || s?.flowStage || s?.group_title || s?.groupTitle || ''
      const questions = Array.isArray(s?.questions) ? s.questions : []
      return questions.map((q) => toItem(q, { sectionTitle: title, flowStage }))
    })
    if (list.length) return list.filter((q) => q.question)
  }
  return []
}

function buildQuestionFlowGroups(items) {
  const normalized = (items || []).map((item) => ({
    ...item,
    flow_stage: inferFlowStage(item),
  }))
  const buckets = new Map()
  normalized.forEach((item) => {
    const key = item.flow_stage || '나눔 질문'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(item)
  })
  const ordered = QUESTION_FLOW_ORDER
    .filter((title) => buckets.has(title))
    .map((title) => ({ title, items: buckets.get(title) }))
  const rest = [...buckets.entries()]
    .filter(([title]) => !QUESTION_FLOW_ORDER.includes(title))
    .map(([title, groupedItems]) => ({ title, items: groupedItems }))
  return [...ordered, ...rest].filter((group) => group.items.length)
}

function formatReadingParagraphs(text, sentencesPerParagraph = 2) {
  const raw = String(text || '').trim()
  if (!raw) return []

  const explicitParagraphs = raw
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)

  const baseParagraphs = explicitParagraphs.length ? explicitParagraphs : [raw]

  return baseParagraphs.flatMap((paragraph) => {
    const normalized = paragraph.replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [normalized]
    const cleaned = sentences.map((sentence) => sentence.trim()).filter(Boolean)
    if (cleaned.length <= sentencesPerParagraph) return [cleaned.join(' ')]

    const grouped = []
    for (let index = 0; index < cleaned.length; index += sentencesPerParagraph) {
      grouped.push(cleaned.slice(index, index + sentencesPerParagraph).join(' '))
    }
    return grouped
  })
}

const OVERVIEW_STEP_LABELS = ['위기', '기도', '말씀', '순종', '승리', '열매']

function buildOverviewBlocks(text) {
  return formatReadingParagraphs(text).map((paragraph, index) => ({
    label: OVERVIEW_STEP_LABELS[index] || `흐름 ${index + 1}`,
    text: paragraph,
  }))
}

const OPENING_QUESTION = {
  section_title: '오늘 예배 돌아보기',
  category: '오프닝',
  explanation: '오늘 말씀을 먼저 자유롭게 돌아보며 마음을 여는 질문입니다.',
  question: '오늘 예배와 말씀은 어땠나요? 특별히 마음에 남았던 부분이나 느끼신 점이 있으셨다면 함께 나눠주세요.',
}

const S = {
  wrap:   { minHeight:'100vh', background:'#f6f3ee', fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif", color:'#2f281f' },
  header: { background:'linear-gradient(160deg,#ede2d2,#d8c8ad)', padding:'20px 20px 16px', borderBottom:'1px solid #ccbda3', position:'relative', overflow:'hidden' },
  cont:   { maxWidth:700, margin:'0 auto', padding:'18px 16px 88px' },
  card:   { background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #dfd3c0', boxShadow:'0 4px 16px rgba(55,38,15,0.04)' },
}

const FONT_SCALE_OPTIONS = [
  { key: 'sm', label: '작게', value: 1 },
  { key: 'md', label: '보통', value: 1.12 },
  { key: 'lg', label: '크게', value: 1.24 },
  { key: 'xl', label: '아주 크게', value: 1.42 },
]

function scalePx(size, factor) {
  return `${Math.round(size * factor * 10) / 10}px`
}

export default function CellWord() {
  const router = useRouter()

  const [sermonList, setSermonList]       = useState([])
  const [selected, setSelected]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState(2)
  const [savingImage, setSavingImage]   = useState(false)
  const [copyingKakao, setCopyingKakao] = useState(false)
  const [fontScaleKey, setFontScaleKey] = useState('md')

  const [activeSession, setActiveSession] = useState(null)
  const [myGroup, setMyGroup]             = useState(null)
  const [amLeader, setAmLeader]           = useState(false)
  const [groupEnded, setGroupEnded]       = useState(false)
  const [groupEnding, setGroupEnding]     = useState(false)
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false)
  const [personalNotes, setPersonalNotes] = useState({ questionNotes: {}, prayer: '' })

  const pollRef      = useRef(null)
  const heartbeatRef = useRef(null)
  const captureRef   = useRef(null)

  const activeNoticeKey = activeSession?.notice
    ? `${activeSession.group_no || ''}:${activeSession.notice}`
    : ''

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('wl_font_scale')
    if (saved && FONT_SCALE_OPTIONS.some((option) => option.key === saved)) {
      setFontScaleKey(saved)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('wl_font_scale', fontScaleKey)
  }, [fontScaleKey])

  // ── 폴링 함수 (ref로 감싸서 stale closure 방지) ──
  const pollFn = useRef(null)
  pollFn.current = async function poll() {
    const did = getDeviceId()
    try {
      const { group_no, week } = router.query
      const gno = Array.isArray(group_no) ? group_no[0] : group_no
      if (!gno) {
        setActiveSession(null)
        setMyGroup(null)
        setAmLeader(false)
        return
      }

      const sRes = await fetch(`/api/cell-sessions?group_no=${gno}`)
      const sData = await sRes.json()

      if (!sData.ok || !sData.data) {
        setActiveSession(null); setMyGroup(null); setAmLeader(false)
        return
      }

      const session = sData.data
      setActiveSession(session)

      // 내 조 찾기 — device_id로 매칭
      const gRes = await fetch(`/api/cell-groups?week=${session.week || week}`)
      const gData = await gRes.json()
      if (gData.ok && gData.data?.groups) {
        const groups = gData.data.groups
        // 멤버로 내 조 찾기
        let found = groups.find(g =>
          g.members?.some(m => m.device_id === did)
        )
        // 멤버에 없으면 리더로 찾기 (혹시 멤버 등록 안 된 경우)
        if (!found) {
          found = groups.find(g => g.leader?.device_id === did)
        }
        const isLeader = !!(found?.leader?.device_id === did)
        setMyGroup(found || null)
        setAmLeader(isLeader)
      }
    } catch(e) {}
  }

  // ── 세션 폴링 시작 ──
  useEffect(() => {
    if (!router.isReady) return
    const { week, group_no } = router.query
    const gno = Array.isArray(group_no) ? group_no[0] : group_no
    if (!week) return
    if (!gno) return

    // 즉시 + 5초마다 폴링
    pollFn.current()
    pollRef.current = setInterval(() => pollFn.current(), 5000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [router.isReady, router.query.week, router.query.group_no])

  async function sendHeartbeat() {
    const device_id = getDeviceId()
    const name = getSavedName()
    if (!device_id || !name) return
    try {
      await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id, name })
      })
    } catch (e) {}
  }

  // ── 접속 하트비트 (cell-word에서도 유지) ──
  useEffect(() => {
    sendHeartbeat()
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => sendHeartbeat(), 30000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') sendHeartbeat()
    }
    const onFocus = () => sendHeartbeat()

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    }
  }, [])

  // ── 말씀 로드 ──
  useEffect(() => {
    if (!router.isReady) return
    const week = pickQueryValue(router.query.week)
    const service = pickQueryValue(router.query.service)
    const qTab = pickQueryValue(router.query.tab)
    if (!week && !activeSession?.sermon_week) return
    let alive = true
    setLoading(true)

    fetch('/api/sermons')
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        if (d.ok && d.data?.length) {
          setSermonList(d.data)
          const requestedWeek = week || null
          const requestedService = service || null
          const sessionWeek = activeSession?.sermon_week || null
          const sessionService = activeSession?.sermon_service || null
          const target = findMatchingSermon(
            d.data,
            requestedWeek,
            requestedService,
            sessionWeek,
            sessionService
          )

          setSelected(target || null)
          if (qTab !== undefined) {
            const parsedTab = Number(qTab)
            // 구버전 호환: 0(요약), 1(질문) -> 신버전 1(요약), 2(질문)
            if (parsedTab === 0) setTab(1)
            else if (parsedTab === 1) setTab(2)
            else if (parsedTab >= 0 && parsedTab <= 2) setTab(parsedTab)
          }
        } else {
          setSermonList([])
          setSelected(null)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [router.isReady, router.query.week, router.query.service, router.query.tab, activeSession?.sermon_week, activeSession?.sermon_service])

  useEffect(() => {
    if (!activeSession) {
      setGroupEnded(false)
      return
    }
    setGroupEnded(!activeSession.is_active && !!activeSession.ended_at)
  }, [activeSession?.is_active, activeSession?.ended_at])

  const isLeaderNoticeVisible = !!(
    amLeader &&
    myGroup &&
    activeSession &&
    String(myGroup.group_no) === String(activeSession.group_no) &&
    activeSession.notice &&
    !noticeAcknowledged
  )

  useEffect(() => {
    if (!activeNoticeKey) {
      setNoticeAcknowledged(false)
      return
    }
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem(`wl_notice_ack:${activeNoticeKey}`)
    setNoticeAcknowledged(saved === 'true')
  }, [activeNoticeKey])

  useEffect(() => {
    if (!isLeaderNoticeVisible || typeof window === 'undefined') return
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [isLeaderNoticeVisible, activeNoticeKey])

  function handleNoticeConfirm() {
    if (!activeNoticeKey || typeof window === 'undefined') return
    localStorage.setItem(`wl_notice_ack:${activeNoticeKey}`, 'true')
    setNoticeAcknowledged(true)
  }

  useEffect(() => {
    if (!selected?.id || typeof window === 'undefined') return
    const saved = localStorage.getItem(`wl_cell_notes:${selected.id}`)
    if (!saved) {
      setPersonalNotes({ questionNotes: {}, prayer: '' })
      return
    }
    try {
      const parsed = JSON.parse(saved)
      setPersonalNotes({
        questionNotes: parsed.questionNotes || {},
        prayer: parsed.prayer || '',
      })
    } catch(e) {
      setPersonalNotes({ questionNotes: {}, prayer: '' })
    }
  }, [selected?.id])

  useEffect(() => {
    if (!selected?.id || typeof window === 'undefined') return
    localStorage.setItem(`wl_cell_notes:${selected.id}`, JSON.stringify(personalNotes))
  }, [selected?.id, personalNotes])

  // ── 모임 종료 ──
  async function handleGroupEnd() {
    if (!myGroup) return
    setGroupEnding(true)
    try {
      const res = await fetch('/api/cell-sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'end',
          week: activeSession?.week || router.query.week,
          group_no: String(myGroup.group_no),
          device_id: getDeviceId()
        })
      })
      const d = await res.json()
      if (!d.ok) throw new Error(d.error)
      setGroupEnded(true)
      await pollFn.current()
      router.push('/cell')
    } catch(e) { alert('오류: ' + e.message) }
    finally { setGroupEnding(false) }
  }

  const TABS = ['성경말씀', '말씀 요약', '나눔질문']
  const currentWeek = selected?.week || activeSession?.sermon_week || pickQueryValue(router.query.week) || ''
  const serviceOptions = sermonList
    .filter((s) => sameWeek(s.week, currentWeek))
    .sort((a, b) => (a.service === 'morning' ? -1 : 1))
  const fontScale = FONT_SCALE_OPTIONS.find((option) => option.key === fontScaleKey)?.value || 1

  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return val
    try { return JSON.parse(val) } catch(e) { return [] }
  }
  const qs   = [OPENING_QUESTION, ...normalizeQuestions(parseField(selected?.questions))]
  const questionFlowGroups = buildQuestionFlowGroups(qs)
  const summary = (() => {
    const s = selected?.sermon_summary
    if (!s) return null
    if (typeof s === 'object') return s
    try { return JSON.parse(s) } catch(e) { return null }
  })()
  const overviewBlocks = buildOverviewBlocks(summary?.overview || '')

  async function saveCurrentViewAsImage() {
    if (!captureRef.current || !selected) return
    setSavingImage(true)
    try {
      const canvas = await captureElementAsCanvas(captureRef.current)
      const link = document.createElement('a')
      const safeRef = (selected.reference || 'cell-word').replace(/[^\w\-가-힣]+/g, '_')
      const tabName = tab === 0 ? 'passage' : tab === 1 ? 'summary' : 'questions'
      link.download = `${safeRef}_${tabName}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      alert('이미지 저장 중 오류가 발생했어요.')
    } finally {
      setSavingImage(false)
    }
  }

  async function saveCurrentViewAsSplitImages() {
    if (!captureRef.current || !selected) return
    setSavingImage(true)
    const mount = document.createElement('div')
    mount.style.position = 'fixed'
    mount.style.left = '-99999px'
    mount.style.top = '0'
    mount.style.width = '760px'
    mount.style.pointerEvents = 'none'
    document.body.appendChild(mount)

    try {
      const root = captureRef.current
      const titleNode = root.querySelector('[data-capture-title]')
      const blockNodes = Array.from(root.querySelectorAll('[data-capture-block]'))
      if (!titleNode || !blockNodes.length) {
        const singleCanvas = await captureElementAsCanvas(root)
        const singleLink = document.createElement('a')
        singleLink.download = `${(selected.reference || 'cell-word').replace(/[^\w\-가-힣]+/g, '_')}_${tab === 0 ? 'passage' : tab === 1 ? 'summary' : 'questions'}.png`
        singleLink.href = singleCanvas.toDataURL('image/png')
        singleLink.click()
        return
      }

      const maxPageHeight = tab === 2 ? 1500 : 1650
      const pages = []
      let currentPage = createSplitCapturePage(titleNode, tab)
      mount.appendChild(currentPage)

      for (const blockNode of blockNodes) {
        const clone = blockNode.cloneNode(true)
        clone.style.animation = 'none'
        clone.style.transition = 'none'
        clone.style.transform = 'none'
        clone.style.opacity = '1'
        currentPage.appendChild(clone)
        if (currentPage.scrollHeight > maxPageHeight && currentPage.children.length > 3) {
          currentPage.removeChild(clone)
          pages.push(currentPage)
          currentPage = createSplitCapturePage(titleNode, tab)
          mount.appendChild(currentPage)
          currentPage.appendChild(clone)
        }
      }
      pages.push(currentPage)

      const safeRef = (selected.reference || 'cell-word').replace(/[^\w\-가-힣]+/g, '_')
      const tabName = tab === 0 ? 'passage' : tab === 1 ? 'summary' : 'questions'
      for (let i = 0; i < pages.length; i += 1) {
        const canvas = await captureElementAsCanvas(pages[i])
        const link = document.createElement('a')
        const pageSuffix = pages.length > 1 ? `_${i + 1}` : ''
        link.download = `${safeRef}_${tabName}${pageSuffix}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
    } catch (e) {
      alert('분할 이미지 저장 중 오류가 발생했어요.')
    } finally {
      document.body.removeChild(mount)
      setSavingImage(false)
    }
  }

  function createSplitCapturePage(titleNode, activeTab) {
    const page = document.createElement('div')
    page.style.width = '760px'
    page.style.padding = '24px'
    page.style.background = '#faf6f0'
    page.style.display = 'flex'
    page.style.flexDirection = 'column'
    page.style.gap = '14px'
    page.style.marginBottom = '20px'

    const titleClone = titleNode.cloneNode(true)
    titleClone.style.marginBottom = '0'
    page.appendChild(titleClone)

    const sectionChip = document.createElement('div')
    sectionChip.style.display = 'inline-flex'
    sectionChip.style.alignItems = 'center'
    sectionChip.style.alignSelf = 'flex-start'
    sectionChip.style.padding = '7px 12px'
    sectionChip.style.borderRadius = '999px'
    sectionChip.style.background = '#fff'
    sectionChip.style.border = '1px solid #e2d3bf'
    sectionChip.style.color = '#7a5a33'
    sectionChip.style.fontSize = '12px'
    sectionChip.style.fontWeight = '700'
    sectionChip.textContent = activeTab === 0 ? '성경말씀' : activeTab === 1 ? '말씀요약' : '나눔질문'
    page.appendChild(sectionChip)

    return page
  }

  function captureElementAsCanvas(element) {
    return html2canvas(element, {
      backgroundColor: '#faf6f0',
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll('.capture-root').forEach((el) => {
          el.style.padding = '20px'
          el.style.background = '#faf6f0'
        })
        clonedDoc.querySelectorAll('.tab-bar').forEach((el) => {
          el.style.position = 'static'
          el.style.top = 'auto'
          el.style.zIndex = 'auto'
          el.style.backdropFilter = 'none'
        })
        clonedDoc.querySelectorAll('.capture-actions, .capture-exclude').forEach((el) => {
          el.style.display = 'none'
        })
        clonedDoc.querySelectorAll('*').forEach((el) => {
          el.style.animation = 'none'
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.opacity = '1'
        })
      },
    })
  }

  async function saveShareCardsAsImages() {
    if (!selected) return
    setSavingImage(true)
    const mount = document.createElement('div')
    mount.style.position = 'fixed'
    mount.style.left = '-99999px'
    mount.style.top = '0'
    mount.style.width = '760px'
    mount.style.pointerEvents = 'none'
    document.body.appendChild(mount)

    try {
      const cards = buildShareCards()
      cards.forEach((card) => mount.appendChild(card))
      const safeRef = (selected.reference || 'cell-word').replace(/[^\w\-가-힣]+/g, '_')
      for (let i = 0; i < cards.length; i += 1) {
        const canvas = await captureElementAsCanvas(cards[i])
        const link = document.createElement('a')
        link.download = `${safeRef}_share_${i + 1}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
    } catch (e) {
      alert('공유 카드 저장 중 오류가 발생했어요.')
    } finally {
      document.body.removeChild(mount)
      setSavingImage(false)
    }
  }

  function buildShareCards() {
    const cards = []
    const title = selected.sermon_title || selected.reference || '말씀 나눔'
    const metaText = [weekLabel(selected.week || currentWeek), selected.service === 'morning' ? '주일 오전' : '주일 오후', selected.reference].filter(Boolean).join(' · ')
    const sectionList = Array.isArray(summary?.sections) ? summary.sections : []

    const cover = createShareCardShell('#8e6840', '#c89d6e')
    appendShareHeader(cover, title, metaText)
    appendShareLabel(cover, '핵심 메시지')
    appendShareLead(cover, summary?.key_point || '오늘 말씀의 핵심 내용을 함께 나눠보세요.')
    if (summary?.overview) {
      appendShareLabel(cover, '전체 흐름')
      appendShareParagraph(cover, summary.overview)
    }
    cards.push(cover)

    if (summary?.overview || sectionList.length) {
      const summaryCards = []
      let current = createShareCardShell('#6f5947', '#b58d6b')
      appendShareHeader(current, `${title} · 말씀 요약`, metaText)
      if (summary?.overview) {
        appendShareLabel(current, '전체 흐름')
        appendShareParagraph(current, summary.overview)
      }
      sectionList.forEach((section, index) => {
        if ((index > 0 && index % 2 === 0) || current.childElementCount > 8) {
          summaryCards.push(current)
          current = createShareCardShell('#6f5947', '#b58d6b')
          appendShareHeader(current, `${title} · 말씀 요약`, metaText)
        }
        appendShareSectionCard(current, `${index + 1}. ${section?.title || `단락 ${index + 1}`}`, section?.content || '')
      })
      summaryCards.push(current)
      cards.push(...summaryCards)
    }

    if (questionFlowGroups.length) {
      let questionIndex = 0
      questionFlowGroups.forEach((group) => {
        for (let start = 0; start < group.items.length; start += 3) {
          const pageItems = group.items.slice(start, start + 3)
          const questionCard = createShareCardShell('#5c4b6d', '#8f82b7')
          appendShareHeader(questionCard, `${title} · 나눔 질문`, metaText)
          appendShareLabel(questionCard, group.title)
          pageItems.forEach((item) => {
            const number = questionIndex + 1
            questionIndex += 1
            appendShareQuestionCard(
              questionCard,
              number,
              item?.section_title || item?.category || `질문 ${number}`,
              item?.question || '',
              item?.category === '오프닝' ? '' : item?.explanation || ''
            )
          })
          cards.push(questionCard)
        }
      })
    }

    return cards
  }

  function createShareCardShell(primaryColor, secondaryColor) {
    const card = document.createElement('div')
    card.style.width = '760px'
    card.style.padding = '32px'
    card.style.background = 'linear-gradient(180deg,#fcf8f2 0%,#f7efe3 100%)'
    card.style.borderRadius = '28px'
    card.style.border = '1px solid #eadbc7'
    card.style.display = 'flex'
    card.style.flexDirection = 'column'
    card.style.gap = '14px'
    card.style.marginBottom = '20px'
    card.style.boxShadow = '0 18px 50px rgba(78,55,27,0.10)'
    card.dataset.primaryColor = primaryColor
    card.dataset.secondaryColor = secondaryColor
    return card
  }

  function appendShareHeader(card, title, metaText) {
    const badge = document.createElement('div')
    badge.textContent = '광흥교회 셀모임 말씀 나눔'
    badge.style.alignSelf = 'flex-start'
    badge.style.padding = '7px 12px'
    badge.style.borderRadius = '999px'
    badge.style.background = card.dataset.secondaryColor
    badge.style.color = '#fff'
    badge.style.fontSize = '12px'
    badge.style.fontWeight = '700'
    card.appendChild(badge)

    const heading = document.createElement('h2')
    heading.textContent = title
    heading.style.margin = '0'
    heading.style.color = card.dataset.primaryColor
    heading.style.fontFamily = "'Gowun Batang',serif"
    heading.style.fontSize = '28px'
    heading.style.lineHeight = '1.45'
    card.appendChild(heading)

    const meta = document.createElement('p')
    meta.textContent = metaText
    meta.style.margin = '0'
    meta.style.color = '#7d6750'
    meta.style.fontSize = '14px'
    meta.style.fontWeight = '600'
    card.appendChild(meta)
  }

  function appendShareLabel(card, text) {
    const label = document.createElement('p')
    label.textContent = text
    label.style.margin = '8px 0 0'
    label.style.color = '#9a7651'
    label.style.fontSize = '12px'
    label.style.fontWeight = '700'
    label.style.letterSpacing = '0.08em'
    card.appendChild(label)
  }

  function appendShareLead(card, text) {
    const lead = document.createElement('p')
    lead.textContent = text
    lead.style.margin = '0'
    lead.style.color = '#2f261d'
    lead.style.fontFamily = "'Gowun Batang',serif"
    lead.style.fontSize = '24px'
    lead.style.lineHeight = '1.75'
    lead.style.fontWeight = '700'
    card.appendChild(lead)
  }

  function appendShareParagraph(card, text) {
    formatReadingParagraphs(text).forEach((paragraph, index) => {
      const body = document.createElement('p')
      body.textContent = paragraph
      body.style.margin = index === 0 ? '0' : '2px 0 0'
      body.style.color = '#4b3a2a'
      body.style.fontFamily = "'Gowun Batang',serif"
      body.style.fontSize = '18px'
      body.style.lineHeight = '1.9'
      card.appendChild(body)
    })
  }

  function appendShareSectionCard(card, title, content) {
    const box = document.createElement('div')
    box.style.background = '#fff'
    box.style.border = '1px solid #eadbc7'
    box.style.borderLeft = '4px solid #c89d6e'
    box.style.borderRadius = '18px'
    box.style.padding = '16px 18px'
    box.style.display = 'flex'
    box.style.flexDirection = 'column'
    box.style.gap = '8px'

    const heading = document.createElement('p')
    heading.textContent = title
    heading.style.margin = '0'
    heading.style.color = '#8a6844'
    heading.style.fontSize = '14px'
    heading.style.fontWeight = '700'
    box.appendChild(heading)

    formatReadingParagraphs(content).forEach((paragraph, index) => {
      const body = document.createElement('p')
      body.textContent = paragraph
      body.style.margin = index === 0 ? '0' : '2px 0 0'
      body.style.color = '#3d2e21'
      body.style.fontFamily = "'Gowun Batang',serif"
      body.style.fontSize = '18px'
      body.style.lineHeight = '1.85'
      box.appendChild(body)
    })

    card.appendChild(box)
  }

  function appendShareQuestionCard(card, number, headingText, questionText, descriptionText) {
    const box = document.createElement('div')
    box.style.background = '#fff'
    box.style.border = '1px solid #e4d9ea'
    box.style.borderRadius = '18px'
    box.style.padding = '16px 18px'
    box.style.display = 'flex'
    box.style.flexDirection = 'column'
    box.style.gap = '8px'

    const heading = document.createElement('p')
    heading.textContent = `${number}. ${headingText}`
    heading.style.margin = '0'
    heading.style.color = '#6b5a88'
    heading.style.fontSize = '14px'
    heading.style.fontWeight = '700'
    box.appendChild(heading)

    if (descriptionText) {
      const description = document.createElement('p')
      description.textContent = descriptionText
      description.style.margin = '0'
      description.style.color = '#6a5968'
      description.style.fontSize = '15px'
      description.style.lineHeight = '1.75'
      box.appendChild(description)
    }

    const body = document.createElement('p')
    body.textContent = questionText
    body.style.margin = '0'
    body.style.color = '#2f261d'
    body.style.fontFamily = "'Gowun Batang',serif"
    body.style.fontSize = '20px'
    body.style.lineHeight = '1.85'
    body.style.fontWeight = '700'
    box.appendChild(body)

    card.appendChild(box)
  }

  function buildKakaoCopyText() {
    if (!selected) return ''
    const lines = []
    const title = selected.sermon_title || selected.reference || '말씀 나눔'
    lines.push(`📖 ${title}`)
    if (selected.reference) lines.push(selected.reference)
    lines.push('')

    if (tab === 0) {
      lines.push('(성경말씀)')
      if (selected.passage) lines.push(selected.passage)
      else lines.push('본문 말씀을 준비 중입니다.')
    } else if (tab === 1) {
      lines.push('(말씀요약)')
      if (!summary) {
        lines.push('말씀 요약을 준비 중입니다.')
      } else {
        if (summary.key_point) lines.push(`(핵심메시지) ${summary.key_point}`)
        if (summary.overview) {
          lines.push('')
          lines.push('(전체흐름)')
          lines.push(summary.overview)
        }
        const sections = Array.isArray(summary.sections) ? summary.sections : []
        if (sections.length) {
          lines.push('')
          lines.push('(단락별요약)')
          sections.forEach((sec, idx) => {
            const t = sec?.title || `단락 ${idx + 1}`
            const c = sec?.content || ''
            lines.push(`${idx + 1}. ${t}`)
            if (c) lines.push(c)
          })
        }
      }
    } else {
      lines.push('(나눔질문)')
      if (!qs.length) {
        lines.push('질문을 준비 중입니다.')
      } else {
        let index = 1
        questionFlowGroups.forEach((group) => {
          lines.push(`[${group.title}]`)
          group.items.forEach((item) => {
            const q = item?.question || ''
            const ex = item?.explanation || ''
            const section = item?.section_title || item?.category || `질문 ${index}`
            lines.push(`${index}. ${section}`)
            if (ex && item?.category !== '오프닝') lines.push(`- ${ex}`)
            if (q) lines.push(`- ${q}`)
            lines.push('')
            index += 1
          })
        })
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  async function copyForKakao() {
    if (!selected) return
    const text = buildKakaoCopyText()
    if (!text) return
    setCopyingKakao(true)
    try {
      await navigator.clipboard.writeText(text)
      alert('카카오톡에 붙여넣을 내용이 복사되었습니다.')
    } catch (e) {
      alert('복사에 실패했어요. 브라우저 권한을 확인해 주세요.')
    } finally {
      setCopyingKakao(false)
    }
  }

  return (
    <>
      <Head>
        <title>광흥교회 청년부 · 시냇가에 심은 나무 WORD &amp; LIFE · 셀 모임</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          html,body{margin:0;padding:0;background:#f6f3ee;color:#2f281f}
          body{font-family:'IBM Plex Sans KR','Noto Sans KR',sans-serif;line-height:1.72;-webkit-font-smoothing:antialiased}
          textarea{font:inherit}
          button{font:inherit}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
          .tab-bar::-webkit-scrollbar{display:none}
          .tab-bar{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>
      </Head>
      <div style={S.wrap}>

        {/* ── 셀 리더 종료 바 ── */}
        {amLeader && myGroup && (
          <div style={{
            background: groupEnded ? '#e8f5e9' : '#fff3e0',
            padding:'12px 20px',
            display:'flex', alignItems:'center', justifyContent:'space-between',
            borderBottom:`1px solid ${groupEnded ? '#a5d6a7' : '#ffcc80'}`,
          }}>
            <div>
              <p style={{ fontSize:12, color: groupEnded ? '#2e7d32' : '#e65100', fontWeight:700, margin:'0 0 1px' }}>
                {groupEnded ? `✅ ${formatGroupName(myGroup)} 모임 종료됨` : `👑 ${formatGroupName(myGroup)} 셀 리더`}
              </p>
              <p style={{ fontSize:11, color: groupEnded ? '#447a31' : '#9f3c1a', margin:0 }}>
                {groupEnded ? '함께 나눈 말씀은 계속 볼 수 있어요' : '나눔이 끝나면 종료 버튼을 눌러주세요'}
              </p>
              {activeSession?.started_at && (
                <p style={{ fontSize:11, color: groupEnded ? '#447a31' : '#9f3c1a', margin:'3px 0 0' }}>
                  ⏰ {formatSessionPeriod(activeSession)}
                </p>
              )}
            </div>
            {!groupEnded && activeSession && (
              <button onClick={handleGroupEnd} disabled={groupEnding}
                style={{ background: groupEnding ? '#c4a882' : 'linear-gradient(135deg,#c0392b,#e74c3c)', color:'#fff', border:'none', borderRadius:10, padding:'8px 14px', cursor: groupEnding ? 'not-allowed' : 'pointer', fontSize:12, fontFamily:"'Gowun Batang',serif", fontWeight:700, flexShrink:0 }}>
                {groupEnding ? '전송 중...' : '🙏 모임 종료'}
              </button>
            )}
          </div>
        )}

        {/* ── 헤더 ── */}
        <div style={S.header}>
          <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
            <p style={{ fontSize:10, color:'#8b6e4e', letterSpacing:'0.2em', fontWeight:600, margin:'0 0 4px' }}>시냇가에 심은 나무 WORD &amp; LIFE</p>
            {selected
              ? <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:21, color:'#3a2a19', fontWeight:700, margin:'0 0 3px' }}>{selected.sermon_title || selected.reference}</h1>
              : <h1 style={{ fontFamily:"'Gowun Batang',serif", fontSize:21, color:'#3a2a19', fontWeight:700, margin:0 }}>말씀 나눔</h1>
            }
            {selected && (
              <p style={{ fontSize:12, color:'#6b5740', margin:0, fontWeight:500 }}>
                {[weekLabel(selected.week || currentWeek), selected.reference].filter(Boolean).join(' · ')}
              </p>
            )}
            {activeSession?.started_at && (
              <p style={{ fontSize:11, color:'#6b5740', margin:'4px 0 0' }}>
                ⏰ {formatSessionPeriod(activeSession)}
              </p>
            )}
            </div>
            {myGroup && (
              <div style={{ background:'rgba(160,120,78,0.15)', borderRadius:10, padding:'6px 12px', textAlign:'center', flexShrink:0 }}>
                <p style={{ fontSize:10, color:'#8b6e4e', margin:'0 0 2px', fontWeight:600 }}>내 조</p>
                <p style={{ fontSize:13, color:'#4a3520', fontWeight:700, margin:0, fontFamily:"'Gowun Batang',serif" }}>{formatGroupName(myGroup)}</p>
                {myGroup?.leader?.name && (
                  <p style={{ fontSize:10, color:'#6b5740', margin:'2px 0 0' }}>리더: {myGroup.leader.name}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 컨텐츠 ── */}
        <div style={S.cont}>
          {loading ? (
            <div style={{ textAlign:'center', padding:48, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', border:'3px solid #e8dcc8', borderTop:'3px solid #a0784e', animation:'spin 0.9s linear infinite' }}/>
              <p style={{ color:'#7a5a33', fontSize:14, fontWeight:500 }}>불러오는 중...</p>
            </div>
          ) : !selected ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'#b8a090' }}>
              <p style={{ fontSize:48, marginBottom:12 }}>📖</p>
              <p style={{ fontFamily:"'Gowun Batang',serif", fontSize:15 }}>말씀을 찾을 수 없어요</p>
            </div>
          ) : (
            <div ref={captureRef} className="capture-root" style={{display:'flex',flexDirection:'column'}}>
              {isLeaderNoticeVisible && (
                <div className="capture-exclude" style={{
                  background:'linear-gradient(135deg,#1f6b26,#2f8b3a)',
                  borderRadius:16,
                  padding:'16px 18px',
                  marginBottom:16,
                  boxShadow:'0 8px 24px rgba(27,94,32,0.22)',
                  animation:'slideDown 0.4s ease',
                }}>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.72)', margin:'0 0 6px', fontWeight:700, letterSpacing:'0.12em' }}>📢 리더 공지</p>
                  <p style={{ fontSize:16, color:'#fff', fontFamily:"'Gowun Batang',serif", fontWeight:700, margin:'0 0 12px', lineHeight:1.72 }}>{activeSession.notice}</p>
                  <button
                    onClick={handleNoticeConfirm}
                    style={{background:'rgba(255,255,255,0.16)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:10,color:'#fff',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}}
                  >
                    확인
                  </button>
                </div>
              )}

              <div data-capture-title style={{...S.card,marginBottom:14}}>
                <span style={{background:selected.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:11,fontWeight:700,display:'inline-block',marginBottom:8}}>
                  {selected.service==='morning'?'주일 오전':'주일 오후'}
                </span>
                <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{selected.sermon_title || selected.reference}</h2>
                <p style={{fontSize:13,color:'#8b6e4e',margin:0}}>
                  {[weekLabel(selected.week || currentWeek), selected.reference].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="tab-bar" style={{ background:'rgba(255,255,255,0.92)', display:'flex', borderBottom:'1px solid #ddd0bc', marginBottom:16, position:'sticky', top:0, zIndex:10, backdropFilter:'blur(6px)', borderTopLeftRadius:12, borderTopRightRadius:12 }}>
                {TABS.map((t, i) => (
                  <button key={i} onClick={() => setTab(i)}
                    style={{ flex:1, padding:'14px 8px', border:'none', background:'none', fontSize:14, fontFamily:"'Gowun Batang',serif", color: tab===i ? '#6a4d2d' : '#998465', fontWeight: tab===i ? 700 : 500, borderBottom: tab===i ? '2.5px solid #8b6a45' : '2.5px solid transparent', cursor:'pointer', whiteSpace:'nowrap' }}>
                    {t}
                  </button>
                ))}
              </div>

              <div className="capture-exclude" style={{...S.card,marginBottom:14,padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
                  <p style={{margin:0,fontSize:12,color:'#8b6e4e',fontWeight:700}}>글씨 크기</p>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {FONT_SCALE_OPTIONS.map((option) => {
                      const active = option.key === fontScaleKey
                      return (
                        <button
                          key={option.key}
                          onClick={() => setFontScaleKey(option.key)}
                          style={{
                            border: active ? '1px solid #a0784e' : '1px solid #ddd0ba',
                            background: active ? '#fdf5ec' : '#fff',
                            color: active ? '#7a5a33' : '#8b6e4e',
                            borderRadius: 999,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {serviceOptions.length > 1 && (
                <div className="capture-exclude" style={{display:'flex',gap:8,margin:'-6px 0 14px'}}>
                  {serviceOptions.map((s) => {
                    const isMorning = s.service === 'morning'
                    const isSelected = selected?.id === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelected(s)}
                        style={{
                          flex:1,
                          padding:'10px 12px',
                          borderRadius:10,
                          border:`1.5px solid ${isSelected ? (isMorning ? '#f6a623' : '#7a6e9e') : '#ddcfba'}`,
                          background:isSelected ? (isMorning ? '#fff6e9' : '#f5f2fb') : '#fff',
                          color:isSelected ? (isMorning ? '#9f6510' : '#5e4f86') : '#7f6a53',
                          fontSize:13,
                          fontWeight:700,
                          cursor:'pointer',
                        }}
                      >
                        {isMorning ? '☀️ 주일 오전 말씀' : '🌙 주일 오후 말씀'}
                      </button>
                    )
                  })}
                </div>
              )}

            {/* 탭 0: 성경말씀 */}
              {tab===0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {selected.passage ? (
                    <div data-capture-block style={S.card}>
                      <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 8px' }}>📖 {selected.reference} · 개역개정</p>
                      <p style={{ color:'#30261d', fontFamily:"'Gowun Batang',serif", fontSize:scalePx(15, fontScale), lineHeight:1.95, margin:0, whiteSpace:'pre-line' }}>{selected.passage}</p>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'40px 20px', color:'#b8a090' }}>
                      <p style={{ fontSize:13 }}>본문 말씀을 준비 중이에요</p>
                    </div>
                  )}
                </div>
              )}

            {/* 탭 1: 말씀 요약 */}
              {tab===1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {!summary ? (
                    <div style={{ textAlign:'center', padding:'40px 20px', color:'#b8a090' }}>
                      <p style={{ fontSize:13 }}>말씀 요약을 준비 중이에요</p>
                    </div>
                  ) : (
                    <>
                      <div data-capture-block style={{ background:'linear-gradient(135deg,#8f693f,#b98657)', borderRadius:16, padding:'20px 22px', position:'relative', overflow:'hidden' }}>
                        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
                        <p style={{ color:'rgba(245,230,208,0.85)', fontSize:10, letterSpacing:'0.15em', margin:'0 0 10px', fontWeight:600 }}>✦ 핵심 메시지</p>
                        <p style={{ color:'#fff', fontFamily:"'Gowun Batang',serif", fontSize:scalePx(17, fontScale), lineHeight:1.8, margin:0, fontWeight:700 }}>{summary.key_point}</p>
                      </div>
                      <div data-capture-block style={{ background:'#fff', borderRadius:14, padding:'18px 20px', border:'1px solid #e8d8c0' }}>
                        <p style={{ fontSize:11, color:'#a0784e', fontWeight:700, letterSpacing:'0.08em', margin:'0 0 10px' }}>📖 전체 흐름</p>
                        <div style={{display:'flex',flexDirection:'column',gap:10}}>
                          {overviewBlocks.map((block, index) => (
                            <div key={index} style={{background:index % 2 === 0 ? '#fcf8f2' : '#f8f1e6',border:'1px solid #efe1cd',borderRadius:12,padding:'12px 14px'}}>
                              <p style={{margin:'0 0 6px',color:'#9a7651',fontSize:11,fontWeight:700,letterSpacing:'0.08em'}}>{block.label}</p>
                              <p style={{ color:'#382819', fontFamily:"'Gowun Batang',serif", fontSize:scalePx(15, fontScale), lineHeight:1.9, margin:0 }}>{block.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      {summary.sections?.map((sec, i) => (
                        <div key={i} data-capture-block style={{ background:'#fdf5ec', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0', borderLeft:'4px solid #c4956a', animation:`fadeUp 0.3s ease ${i*0.1}s both` }}>
                          <p style={{ fontSize:12, color:'#a0784e', fontWeight:700, margin:'0 0 8px' }}>{sec.title}</p>
                          <div style={{display:'flex',flexDirection:'column',gap:10}}>
                            {formatReadingParagraphs(sec.content).map((paragraph, index) => (
                              <p key={index} style={{ color:'#3a2a1b', fontFamily:"'Gowun Batang',serif", fontSize:scalePx(15, fontScale), lineHeight:1.9, margin:0 }}>{paragraph}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* 탭 2: 나눔 질문 */}
              {tab===2 && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {questionFlowGroups.map((group, groupIndex) => {
                    const firstIndex = questionFlowGroups
                      .slice(0, groupIndex)
                      .reduce((sum, current) => sum + current.items.length, 0)
                    return (
                      <div key={group.title} data-capture-block style={{ background:'#fff', borderRadius:18, padding:'18px 18px 16px', border:'1px solid #e8dcc8', boxShadow:'0 2px 8px rgba(55,38,15,0.03)' }}>
                        <div style={{background:'#f7f0e5',borderRadius:12,padding:'12px 14px',border:'1px solid #eadcc8',marginBottom:12}}>
                          <p style={{margin:0,color:'#6b5040',fontSize:scalePx(14, fontScale),fontWeight:700,fontFamily:"'Gowun Batang',serif"}}>{group.title}</p>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:14}}>
                          {group.items.map((item, itemIndex) => {
                            const q  = item.question
                            const ex = item.explanation
                            const isOpening = item.category === '오프닝'
                            const visualIndex = firstIndex + itemIndex
                            const m  = QMETA[visualIndex] || QMETA[0]
                            return (
                              <div key={`${group.title}-${itemIndex}`} style={{padding:itemIndex === 0 ? '0' : '14px 0 0',borderTop:itemIndex === 0 ? 'none' : '1px solid #efe4d3'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
                                  <p style={{ fontSize:10, color:'#8b6e4e', fontWeight:700, margin:0, letterSpacing:'0.05em' }}>{item.section_title || item.category || m.type}</p>
                                  <span style={{fontSize:10,color:'#b49474',fontWeight:700}}>{itemIndex + 1}</span>
                                </div>
                                {!isOpening && ex && <div style={{ background:'#faf7f2', borderRadius:8, padding:'10px 12px', marginBottom:9, border:'1px solid #efe4d3' }}><p style={{ margin:0, color:'#5a4737', fontSize:scalePx(13, fontScale), lineHeight:1.8 }}>{ex}</p></div>}
                                <p style={{ margin:0, color:'#2f261d', fontFamily:"'Gowun Batang',serif", fontSize:scalePx(16, fontScale), lineHeight:1.9, fontWeight:700 }}>{q}</p>
                                <div className="capture-exclude" style={{marginTop:10}}>
                                  <p style={{fontSize:11,color:m.color,fontWeight:700,margin:'0 0 6px'}}>개인 메모</p>
                                  <textarea
                                    value={personalNotes.questionNotes?.[visualIndex] || ''}
                                    onChange={e => setPersonalNotes(prev => ({
                                      ...prev,
                                      questionNotes: { ...(prev.questionNotes || {}), [visualIndex]: e.target.value }
                                    }))}
                                    placeholder="이 질문에 대한 내 생각과 나눔 포인트를 적어보세요."
                                    style={{width:'100%',minHeight:96,padding:'11px 12px',border:'1px solid #d6cbb9',borderRadius:10,background:'rgba(255,255,255,0.92)',resize:'vertical',fontSize:scalePx(14, fontScale),color:'#2f281f',fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif",lineHeight:1.75}}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  <div className="capture-exclude" style={{...S.card, marginTop:4}}>
                    <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 8px'}}>🙏 오늘의 기도제목</p>
                    <textarea
                      value={personalNotes.prayer || ''}
                      onChange={e => setPersonalNotes(prev => ({ ...prev, prayer: e.target.value }))}
                      placeholder="오늘 셀모임을 통해 붙잡은 기도제목을 기록해 보세요. 이 내용은 내 기기에서만 저장됩니다."
                      style={{width:'100%',minHeight:120,padding:'12px 14px',border:'1px solid #d9ccba',borderRadius:10,background:'#fdfbf8',resize:'vertical',fontSize:scalePx(14, fontScale),color:'#2f281f',fontFamily:"'IBM Plex Sans KR','Noto Sans KR',sans-serif",lineHeight:1.8}}
                    />
                    <p style={{fontSize:11,color:'#a08060',margin:'8px 0 0'}}>이 메모와 기도제목은 서버로 전송되지 않고, 이 기기 브라우저에만 저장됩니다.</p>
                  </div>
                </div>
              )}
              <div className="capture-actions" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:16}}>
                <button
                  onClick={copyForKakao}
                  disabled={copyingKakao}
                  style={{flex:1,background:copyingKakao?'#c8b79e':'linear-gradient(135deg,#f8e5bf,#f0c77a)',color:'#5c4323',border:'1px solid #e0c08a',borderRadius:12,padding:'14px',fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:copyingKakao?'not-allowed':'pointer'}}
                >
                  {copyingKakao ? '복사 중...' : '💬 카톡으로 복사하기'}
                </button>
                <button
                  onClick={saveShareCardsAsImages}
                  disabled={savingImage}
                  style={{flex:1,background:savingImage?'#cabca9':'linear-gradient(135deg,#eadfef,#cdbce2)',color:'#4d3c66',border:'1px solid #d2c1e4',borderRadius:12,padding:'14px',fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:savingImage?'not-allowed':'pointer'}}
                >
                  {savingImage ? '카드 저장 중...' : '💠 공유 카드 저장'}
                </button>
                <button
                  onClick={saveCurrentViewAsSplitImages}
                  disabled={savingImage}
                  style={{flex:1,background:savingImage?'#d7c8b5':'linear-gradient(135deg,#efe4d5,#d9bea2)',color:'#5f4630',border:'1px solid #d7c3ac',borderRadius:12,padding:'14px',fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:savingImage?'not-allowed':'pointer'}}
                >
                  {savingImage ? '분할 저장 중...' : '🧩 나눠서 저장'}
                </button>
                <button
                  onClick={saveCurrentViewAsImage}
                  disabled={savingImage}
                  style={{flex:1,background:savingImage?'#c4a882':'linear-gradient(135deg,#4a3520,#7a5c38)',color:'#fff',border:'none',borderRadius:12,padding:'14px',fontSize:14,fontFamily:"'Gowun Batang',serif",fontWeight:700,cursor:savingImage?'not-allowed':'pointer'}}
                >
                  {savingImage ? '이미지 저장 중...' : '🖼 이미지로 저장'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
