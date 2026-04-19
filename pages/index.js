import { useState, useEffect } from 'react'
import Head from 'next/head'
import styles from '../styles/Home.module.css'

const QMETA = [
  { type: '말씀 속으로',  color: '#a0784e', bg: '#fdf5ec' },
  { type: '내 이야기',    color: '#c4956a', bg: '#fef8f0' },
  { type: '함께 나눔',    color: '#7a9e7e', bg: '#f0f7f1' },
  { type: '이번 주 실천', color: '#6b8f71', bg: '#edf4ee' },
]

function weekLabel(week) {
  const [y, w] = week.split('-W').map(Number)
  const jan1 = new Date(y, 0, 1)
  const sun = new Date(jan1)
  sun.setDate(jan1.getDate() + (w - 1) * 7 - (jan1.getDay() || 7) + 7)
  return `${sun.getMonth() + 1}월 ${sun.getDate()}일 주`
}

function doCopy(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fbCopy(text))
  } else { fbCopy(text) }
}
function fbCopy(text) {
  const t = document.createElement('textarea')
  t.value = text; t.style.cssText = 'position:fixed;opacity:0;'
  document.body.appendChild(t); t.focus(); t.select()
  try { document.execCommand('copy') } catch(e) {}
  document.body.removeChild(t)
}

export default function Home() {
  const [sermons, setSermons]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [selected, setSelected]   = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [copiedKey, setCopiedKey] = useState('')

  useEffect(() => {
    fetch('/api/sermons')
      .then(r => r.json())
      .then(d => {
        if (d.ok) { setSermons(d.data || []); if (d.data?.length) setSelected(d.data[0]) }
        else setError(d.error)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const copy = (text, key) => {
    doCopy(text); setCopiedKey(key)
    setTimeout(() => setCopiedKey(''), 2000)
  }

  const grouped = sermons.reduce((acc, s) => {
    if (!acc[s.week]) acc[s.week] = []
    acc[s.week].push(s)
    return acc
  }, {})

  const TABS = ['나눔 질문', '주간 묵상', '말씀카드']
  const qs   = selected?.questions   || []
  const meds = selected?.meditations || []

  return (
    <>
      <Head>
        <title>말씀 나눔 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.wrap}>
        {/* 헤더 */}
        <div className={styles.header}>
          <div className={styles.headerInner}>
            <p className={styles.headerSub}>WORD &amp; LIFE</p>
            <h1 className={styles.headerTitle}>말씀 나눔</h1>
            <p className={styles.headerDesc}>청년부 주간 말씀 &amp; 묵상 가이드</p>
          </div>
        </div>

        <div className={styles.container}>
          {loading && <div className={styles.center}><div className={styles.spinner} /><p>불러오는 중...</p></div>}
          {!loading && error && <p className={styles.err}>⚠ {error}</p>}

          {!loading && !error && (
            <>
              {/* 주차/예배 선택 */}
              <div className={styles.weekList}>
                {Object.entries(grouped).map(([wk, items]) => (
                  <div key={wk} className={styles.weekGroup}>
                    <p className={styles.weekLabel}>{weekLabel(wk)}</p>
                    <div className={styles.serviceRow}>
                      {items.map(s => {
                        const isMorn = s.service === 'morning'
                        const isSel  = selected?.id === s.id
                        return (
                          <button key={s.id} onClick={() => { setSelected(s); setActiveTab(0) }}
                            className={styles.serviceBtn + (isSel ? (' ' + (isMorn ? styles.selMorn : styles.selAftn)) : '')}>
                            <span>{isMorn ? '☀️' : '🌙'}</span>
                            <span>{isMorn ? '오전' : '오후'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 선택된 말씀 */}
              {selected && (
                <>
                  <div className={styles.sermonInfo}>
                    <span className={styles.badge + ' ' + (selected.service === 'morning' ? styles.badgeMorn : styles.badgeAftn)}>
                      {selected.service === 'morning' ? '주일 오전' : '주일 오후'}
                    </span>
                    <h2 className={styles.sermonRef}>{selected.reference}</h2>
                    {selected.sermon_title && <p className={styles.sermonTitle}>{selected.sermon_title}</p>}
                  </div>

                  {/* 탭 */}
                  <div className={styles.tabBar}>
                    {TABS.map((t, i) => (
                      <button key={i} onClick={() => setActiveTab(i)}
                        className={styles.tab + (activeTab === i ? ' ' + styles.tabActive : '')}>
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className={styles.tabContent}>
                    {/* 탭 0: 나눔 질문 */}
                    {activeTab === 0 && (
                      <div className={styles.section}>
                        {selected.passage && (
                          <div className={styles.passageBox}>
                            <p className={styles.passageLabel}>📖 {selected.reference} · 개역개정</p>
                            <p className={styles.passageText}>{selected.passage}</p>
                          </div>
                        )}
                        <p className={styles.sectionTitle}>✦ {selected.reference} 나눔 질문</p>
                        {qs.map((item, i) => {
                          const q  = typeof item === 'string' ? item : item.question
                          const ex = typeof item === 'object'  ? item.explanation : ''
                          const m  = QMETA[i] || QMETA[0]
                          return (
                            <div key={i} className={styles.qCard}
                              style={{ background: m.bg, borderLeft: `4px solid ${m.color}` }}>
                              <p className={styles.qType} style={{ color: m.color }}>{m.type}</p>
                              {ex && <p className={styles.qEx}>{ex}</p>}
                              <p className={styles.qText}>{q}</p>
                            </div>
                          )
                        })}
                        <button className={styles.copyBtn} onClick={() => {
                          const t = qs.map((item, i) => {
                            const q  = typeof item === 'string' ? item : item.question
                            const ex = typeof item === 'object' && item.explanation ? item.explanation + '\n' : ''
                            return `[${(QMETA[i]||QMETA[0]).type}]\n${ex}Q${i+1}. ${q}`
                          }).join('\n\n')
                          copy(`✦ ${selected.reference} 나눔 질문\n\n${t}`, 'q')
                        }}>
                          {copiedKey === 'q' ? '✓ 복사됨!' : '📋 전체 복사 (카톡 공유용)'}
                        </button>
                      </div>
                    )}

                    {/* 탭 1: 주간 묵상 */}
                    {activeTab === 1 && (
                      <div className={styles.section}>
                        <p className={styles.sectionTitle}>✦ {selected.reference} 주간 묵상</p>
                        {meds.map((m, i) => (
                          <div key={i} className={styles.medCard}>
                            <div className={styles.medHead}>
                              <span className={styles.dayBadge}>{m.day}요일</span>
                              <span className={styles.focus}>"{m.focus}"</span>
                            </div>
                            <p className={styles.medText}>{m.message}</p>
                          </div>
                        ))}
                        <button className={styles.copyBtn} onClick={() => {
                          const t = meds.map(m => `[${m.day}요일]\n"${m.focus}"\n\n${m.message}`).join('\n\n─────\n\n')
                          copy(`✦ ${selected.reference} 주간 묵상\n\n${t}`, 'med')
                        }}>
                          {copiedKey === 'med' ? '✓ 복사됨!' : '📋 전체 복사 (카톡 공유용)'}
                        </button>
                      </div>
                    )}

                    {/* 탭 2: 말씀카드 */}
                    {activeTab === 2 && (
                      <div className={styles.section}>
                        <p className={styles.sectionTitle}>✦ 이번 주 말씀카드</p>
                        <div className={styles.wordCard}>
                          <p className={styles.wordCardLabel}>✦ 이번 주 말씀 · 개역개정</p>
                          <p className={styles.wordCardVerse}>"{selected.card_verse}"</p>
                          <p className={styles.wordCardRef}>{selected.reference} · 개역개정</p>
                        </div>
                        <button className={styles.copyBtn} onClick={() =>
                          copy(`✦ 이번 주 말씀 (개역개정)\n\n"${selected.card_verse}"\n\n— ${selected.reference}`, 'card')
                        }>
                          {copiedKey === 'card' ? '✓ 복사됨!' : '📋 말씀카드 복사'}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {sermons.length === 0 && (
                <div className={styles.center}>
                  <p style={{ fontSize: 48 }}>📖</p>
                  <p>아직 등록된 말씀이 없어요</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
