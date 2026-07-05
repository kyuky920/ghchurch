import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import html2canvas from 'html2canvas'

const QMETA = [
  { type:'말씀 속으로',  color:'#a0784e', bg:'#fdf5ec' },
  { type:'내 이야기',    color:'#c4956a', bg:'#fef8f0' },
  { type:'함께 나눔',    color:'#7a9e7e', bg:'#f0f7f1' },
  { type:'이번 주 실천', color:'#6b8f71', bg:'#edf4ee' },
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

function weekLabel(week) {
  if (!week) return ''
  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    const d = new Date(week + 'T00:00:00')
    if (isNaN(d.getTime())) return week
    return `${d.getMonth() + 1}월 ${d.getDate()}일 주`
  }
  // 구형식 YYYY-Www 처리 (하위 호환)
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan1 = new Date(y, 0, 1)
    const sun = new Date(jan1)
    sun.setDate(jan1.getDate() + (w - 1) * 7 - (jan1.getDay() || 7) + 7)
    return `${sun.getMonth() + 1}월 ${sun.getDate()}일 주`
  }
  return week
}

function weekToComparableDate(week) {
  if (!week) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split('-W').map(Number)
    const jan4 = new Date(y, 0, 4)
    const sun = new Date(jan4)
    sun.setDate(jan4.getDate() - jan4.getDay() + (w - 1) * 7)
    return `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`
  }
  return week
}
const S = {
  wrap:   { minHeight:'100vh', background:'#faf6f0', fontFamily:"'Noto Sans KR',sans-serif" },
  header: { background:'linear-gradient(160deg,#e8dcc8,#d4c4a8)', padding:'28px 20px 22px', borderBottom:'1px solid #c8b898', position:'relative', overflow:'hidden' },
  cont:   { maxWidth:640, margin:'0 auto', padding:'16px 16px 48px' },
  card:   { background:'#fff', borderRadius:14, padding:'16px 18px', border:'1px solid #e8d8c0' },
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

export default function Home() {
  const [sermons, setSermons]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [tab, setTab]           = useState(0)
  const [savingImage, setSavingImage] = useState(false)
  const [copyingKakao, setCopyingKakao] = useState(false)
  const [fontScaleKey, setFontScaleKey] = useState('md')

  const [selectedWeek, setSelectedWeek] = useState(null)

  const router = useRouter()
  const captureRef = useRef(null)

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

  useEffect(() => {
    fetch('/api/sermons').then(r=>r.json()).then(d=>{
      if (d.ok) {
        const list = [...(d.data || [])].sort((a, b) => {
          const aWeek = weekToComparableDate(a?.week)
          const bWeek = weekToComparableDate(b?.week)
          if (aWeek && bWeek && aWeek !== bWeek) return bWeek.localeCompare(aWeek)
          if (a?.service !== b?.service) return a?.service === 'morning' ? -1 : 1
          return (b?.id || 0) - (a?.id || 0)
        })
        setSermons(list)
        if (list.length) {
          // URL 파라미터로 주차/예배/탭 설정 (셀 모임 시작 시)
          const qWeek    = router.query.week
          const qService = router.query.service
          const qTab     = router.query.tab

          const targetWeek = qWeek || list[0].week
          setSelectedWeek(targetWeek)

          const target = (qWeek && qService)
            ? list.find(s => s.week === qWeek && s.service === qService)
            : list.find(s => s.week === targetWeek && s.service === 'morning')
          setSelected(target || list[0])

          if (qTab !== undefined) {
            const parsedTab = Number(qTab)
            // 구버전 호환: 0(요약), 1(질문) -> 신버전 1(요약), 2(질문)
            if (parsedTab === 0) setTab(1)
            else if (parsedTab === 1) setTab(2)
            else if (parsedTab >= 0 && parsedTab <= 2) setTab(parsedTab)
          }
        }
      } else setError(d.error)
    }).catch(e=>setError(e.message)).finally(()=>setLoading(false))
  },[router.query])

  const TABS = ['성경말씀','말씀 요약','나눔질문']

  // Supabase에서 JSON string으로 올 수 있어서 파싱 처리
  const parseField = (val) => {
    if (!val) return []
    if (Array.isArray(val)) return val
    if (typeof val === 'object') return val
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch(e) { return [] }
    }
    return []
  }
  const qs      = [OPENING_QUESTION, ...normalizeQuestions(parseField(selected?.questions))]
  const questionFlowGroups = buildQuestionFlowGroups(qs)
  const summary = (() => {
    const s = selected?.sermon_summary
    if (!s) return null
    if (typeof s === 'object') return s
    try { return JSON.parse(s) } catch(e) { return null }
  })()
  const overviewBlocks = buildOverviewBlocks(summary?.overview || '')

  const grouped = sermons.reduce((acc,s)=>{
    if(!acc[s.week]) acc[s.week]=[]
    acc[s.week].push(s); return acc
  },{})
  // 각 주차 내에서 오전→오후 순으로 정렬
  Object.keys(grouped).forEach(wk => {
    grouped[wk].sort((a,b) => a.service === 'morning' ? -1 : 1)
  })
  const sortedWeeks = Object.keys(grouped).sort((a,b) => {
    const aa = weekToComparableDate(a)
    const bb = weekToComparableDate(b)
    return bb.localeCompare(aa)
  })
  const fontScale = FONT_SCALE_OPTIONS.find((option) => option.key === fontScaleKey)?.value || 1

  async function saveCurrentViewAsImage() {
    if (!captureRef.current || !selected) return
    setSavingImage(true)
    try {
      const canvas = await captureElementAsCanvas(captureRef.current)
      const link = document.createElement('a')
      const safeRef = (selected.reference || 'wordlife').replace(/[^\w\-가-힣]+/g, '_')
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
        singleLink.download = `${(selected.reference || 'wordlife').replace(/[^\w\-가-힣]+/g, '_')}_${tab === 0 ? 'passage' : tab === 1 ? 'summary' : 'questions'}.png`
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

      const safeRef = (selected.reference || 'wordlife').replace(/[^\w\-가-힣]+/g, '_')
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
      const safeRef = (selected.reference || 'wordlife').replace(/[^\w\-가-힣]+/g, '_')
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
    const metaText = [weekLabel(selected.week), selected.service === 'morning' ? '주일 오전' : '주일 오후', selected.reference].filter(Boolean).join(' · ')
    const sectionList = Array.isArray(summary?.sections) ? summary.sections : []

    const cover = createShareCardShell('#8e6840', '#c89d6e')
    appendShareHeader(cover, title, metaText)
    appendShareLabel(cover, '핵심 메시지')
    appendShareLead(cover, summary?.key_point || '이번 주 말씀의 핵심 내용을 함께 나눠보세요.')
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
    badge.textContent = '광흥교회 말씀 나눔'
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
        <title>광흥교회 · 시냇가에 심은 나무 WORD &amp; LIFE 말씀 나눔</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <style>{`
          *{box-sizing:border-box;}
          @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          .tab-bar::-webkit-scrollbar{display:none}
          .tab-bar{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>
      </Head>
      <div style={S.wrap}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={{position:'absolute',top:-40,right:-40,width:200,height:200,borderRadius:'50%',background:'rgba(255,255,255,0.08)'}}/>
          <p style={{fontSize:10,color:'#8b6e4e',letterSpacing:'0.2em',fontWeight:600,margin:'0 0 6px'}}>시냇가에 심은 나무 WORD &amp; LIFE</p>
          <h1 style={{fontFamily:"'Gowun Batang',serif",fontSize:24,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>광흥교회 말씀 나눔</h1>
          <p style={{fontSize:12,color:'#8b6e4e',margin:0}}>전 성도를 위한 주간 말씀 &amp; 묵상 가이드</p>
        </div>

        <div style={S.cont}>
          {loading && (
            <div style={{textAlign:'center',padding:48,display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
              <div style={{width:32,height:32,borderRadius:'50%',border:'3px solid #e8dcc8',borderTop:'3px solid #a0784e',animation:'spin 0.9s linear infinite'}}/>
              <p style={{color:'#a0784e',fontSize:13}}>불러오는 중...</p>
            </div>
          )}
          {!loading && error && <p style={{color:'#c0392b',fontSize:13,padding:20}}>⚠ {error}</p>}

          {!loading && !error && (
            <>
              {/* 주차 선택 드롭다운 */}
              {sortedWeeks.length > 0 && (
                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <label style={{fontSize:12,color:'#8b6e4e',fontWeight:700,whiteSpace:'nowrap'}}>주차 선택</label>
                    <select
                      value={selectedWeek || ''}
                      onChange={e => {
                        const wk = e.target.value
                        setSelectedWeek(wk)
                        setTab(0)
                        const items = grouped[wk] || []
                        const first = items.find(s=>s.service==='morning') || items[0]
                        if (first) setSelected(first)
                      }}
                      style={{flex:1,padding:'10px 14px',border:'1.5px solid #ddd0ba',borderRadius:10,fontSize:14,background:'#fff',color:'#4a3520',outline:'none',fontFamily:"'Noto Sans KR',sans-serif",cursor:'pointer'}}
                    >
                      {sortedWeeks.map(wk=>(
                        <option key={wk} value={wk}>{weekLabel(wk)}</option>
                      ))}
                    </select>
                  </div>

                  {/* 선택된 주차의 오전/오후 버튼 */}
                  {selectedWeek && grouped[selectedWeek] && (
                    <div style={{display:'flex',gap:8}}>
                      {grouped[selectedWeek].map(s=>{
                        const isMorn = s.service==='morning'
                        const isSel  = selected?.id===s.id
                        return (
                          <button key={s.id} onClick={()=>{setSelected(s);setTab(0)}}
                            style={{flex:1,padding:'11px 12px',borderRadius:12,border:`2px solid ${isSel?(isMorn?'#f6a623':'#7a6e9e'):'#e8dcc8'}`,background:isSel?(isMorn?'#fff8ec':'#f5f3fa'):'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6,fontFamily:"'Noto Sans KR',sans-serif",transition:'all 0.2s'}}>
                            <span style={{fontSize:16}}>{isMorn?'☀️':'🌙'}</span>
                            <div style={{textAlign:'left'}}>
                              <p style={{fontSize:12,fontWeight:700,color:isSel?(isMorn?'#e8901a':'#7a6e9e'):'#b8a090',margin:0}}>{isMorn?'주일 오전':'주일 오후'}</p>
                              <p style={{fontSize:10,color:'#c4a882',margin:0}}>{s.reference}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {selected && (
                <div ref={captureRef} className="capture-root" style={{display:'flex',flexDirection:'column'}}>
                  {/* 말씀 정보 */}
                  <div data-capture-title style={{...S.card,marginBottom:14}}>
                    <span style={{background:selected.service==='morning'?'linear-gradient(135deg,#f6a623,#e8901a)':'linear-gradient(135deg,#7a6e9e,#5a5080)',borderRadius:6,padding:'3px 10px',color:'#fff',fontSize:11,fontWeight:700,display:'inline-block',marginBottom:8}}>
                      {selected.service==='morning'?'주일 오전':'주일 오후'}
                    </span>
                    <h2 style={{fontFamily:"'Gowun Batang',serif",fontSize:18,color:'#4a3520',fontWeight:700,margin:'0 0 2px'}}>{selected.sermon_title || selected.reference}</h2>
                    <p style={{fontSize:13,color:'#8b6e4e',margin:0}}>
                      {[weekLabel(selected.week), selected.reference].filter(Boolean).join(' · ')}
                    </p>
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

                  {/* 탭 */}
                  <div className="tab-bar" style={{background:'#fff',display:'flex',borderTop:'1px solid #e8dcc8',borderBottom:'1px solid #e8dcc8',marginBottom:16,position:'sticky',top:0,zIndex:10}}>
                    {TABS.map((t,i)=>(
                      <button key={i} onClick={()=>setTab(i)}
                        style={{flex:1,padding:'13px 8px',border:'none',background:'none',fontSize:13,fontFamily:"'Gowun Batang',serif",color:tab===i?'#8b6e4e':'#bba888',fontWeight:tab===i?700:400,borderBottom:tab===i?'2.5px solid #a0784e':'2.5px solid transparent',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* 탭 0: 성경말씀 */}
                  {tab===0 && (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {selected.passage ? (
                        <div data-capture-block style={S.card}>
                          <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 8px'}}>📖 {selected.reference} · 개역개정</p>
                          <p style={{color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:scalePx(13, fontScale),lineHeight:1.95,fontWeight:500,margin:0,whiteSpace:'pre-line'}}>{selected.passage}</p>
                        </div>
                      ) : (
                        <div style={{textAlign:'center',padding:'40px 20px',color:'#b8a090'}}>
                          <p style={{fontSize:13}}>본문 말씀을 불러오는 중...</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 탭 1: 말씀 요약 */}
                  {tab===1 && (
                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                      {!summary ? (
                        <div style={{textAlign:'center',padding:'40px 20px',color:'#b8a090'}}>
                          <p style={{fontSize:13}}>말씀 요약을 불러오는 중...</p>
                        </div>
                      ) : (
                        <>
                          {/* 핵심 메시지 */}
                          <div data-capture-block style={{background:'linear-gradient(135deg,#a0784e,#c4956a)',borderRadius:16,padding:'20px 22px',position:'relative',overflow:'hidden'}}>
                            <div style={{position:'absolute',top:-20,right:-20,width:100,height:100,borderRadius:'50%',background:'rgba(255,255,255,0.08)'}}/>
                            <p style={{color:'rgba(245,230,208,0.85)',fontSize:10,letterSpacing:'0.15em',margin:'0 0 10px',fontWeight:600}}>✦ 핵심 메시지</p>
                            <p style={{color:'#fff',fontFamily:"'Gowun Batang',serif",fontSize:scalePx(16, fontScale),lineHeight:1.8,margin:0,fontWeight:700}}>{summary.key_point}</p>
                          </div>
                          {/* 전체 흐름 */}
                          <div data-capture-block style={{background:'#fff',borderRadius:14,padding:'18px 20px',border:'1px solid #e8d8c0'}}>
                            <p style={{fontSize:11,color:'#a0784e',fontWeight:700,letterSpacing:'0.08em',margin:'0 0 10px'}}>📖 전체 흐름</p>
                            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                              {overviewBlocks.map((block, index) => (
                                <div key={index} style={{background:index % 2 === 0 ? '#fcf8f2' : '#f8f1e6',border:'1px solid #efe1cd',borderRadius:12,padding:'12px 14px'}}>
                                  <p style={{margin:'0 0 6px',color:'#9a7651',fontSize:11,fontWeight:700,letterSpacing:'0.08em'}}>{block.label}</p>
                                  <p style={{color:'#4a3520',fontFamily:"'Gowun Batang',serif",fontSize:scalePx(14, fontScale),lineHeight:1.9,margin:0}}>{block.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* 단락별 요약 */}
                          {summary.sections && summary.sections.map((sec,i) => (
                            <div key={i} data-capture-block style={{background:'#fdf5ec',borderRadius:14,padding:'16px 18px',border:'1px solid #e8d8c0',borderLeft:'4px solid #c4956a',animation:`fadeUp 0.3s ease ${i*0.1}s both`}}>
                              <p style={{fontSize:12,color:'#a0784e',fontWeight:700,margin:'0 0 8px'}}>{sec.title}</p>
                              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                                {formatReadingParagraphs(sec.content).map((paragraph, index) => (
                                  <p key={index} style={{color:'#4a3728',fontFamily:"'Gowun Batang',serif",fontSize:scalePx(14, fontScale),lineHeight:1.9,margin:0}}>{paragraph}</p>
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
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      <p style={{fontFamily:"'Gowun Batang',serif",fontSize:13,color:'#8b6e4e',margin:'4px 0'}}>✦ {selected.reference} 나눔 질문</p>
                      {questionFlowGroups.map((group, groupIndex) => {
                        const firstIndex = questionFlowGroups
                          .slice(0, groupIndex)
                          .reduce((sum, current) => sum + current.items.length, 0)
                        return (
                          <div key={group.title} data-capture-block style={{background:'#fff',borderRadius:18,padding:'18px 18px 16px',border:'1px solid #e8dcc8',boxShadow:'0 2px 8px rgba(55,38,15,0.03)'}}>
                            <div style={{display:'flex',flexDirection:'column',gap:14}}>
                              {group.items.map((item, itemIndex)=>{
                                const q=item.question
                                const ex=item.explanation
                                const isOpening=item.category==='오프닝'
                                const visualIndex = firstIndex + itemIndex
                                const m=QMETA[visualIndex]||QMETA[0]
                                return (
                                  <div key={`${group.title}-${itemIndex}`} style={{padding:itemIndex === 0 ? '0' : '14px 0 0',borderTop:itemIndex === 0 ? 'none' : '1px solid #efe4d3'}}>
                                    {!isOpening && ex&&<div style={{background:'#faf7f2',borderRadius:8,padding:'9px 12px',marginBottom:8,border:'1px solid #efe4d3'}}><p style={{margin:0,color:'#6b5040',fontSize:scalePx(12, fontScale),lineHeight:1.8}}>{ex}</p></div>}
                                    <p style={{margin:0,color:'#3f3124',fontFamily:"'Gowun Batang',serif",fontSize:scalePx(16, fontScale),lineHeight:1.9,fontWeight:700}}>{q}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
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

              {sermons.length===0 && (
                <div style={{textAlign:'center',padding:'60px 20px',color:'#b8a090'}}>
                  <p style={{fontSize:48,marginBottom:12}}>📖</p>
                  <p style={{fontFamily:"'Gowun Batang',serif",fontSize:15}}>아직 등록된 말씀이 없어요</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
