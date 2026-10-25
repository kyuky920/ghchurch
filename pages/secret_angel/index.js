import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import styles from '../../styles/SecretAngel.module.css'

const replies = ['쉿, 비밀이에요 🤫', '그렇게 생각하셨군요 😊', '계속 지켜봐 주세요 👀']
const date = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''

export default function SecretAngel() {
  const [data, setData] = useState(null)
  const [mode, setMode] = useState('login')
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [tab, setTab] = useState('mission')
  const [channel, setChannel] = useState('friend')

  async function api(body, get = false) {
    const res = await fetch('/api/secret-angel' + (get ? (body.slug ? `?slug=${encodeURIComponent(body.slug)}` : '') : ''), {
      method: get ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(!get ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    })
    const result = await res.json()
    if (!res.ok) { if (res.status === 401) { setData(null) } throw new Error(result.error || '요청을 처리하지 못했습니다.') }
    return result
  }
  async function refresh(selected = slug) {
    const result = await api({ slug: selected }, true)
    if (result.data) { setData(result.data); setSlug(result.data.slug); sessionStorage.setItem('sa_slug', result.data.slug) }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem('sa_slug') || ''
    setSlug(saved); setName(localStorage.getItem('wl_member_name') || '')
    refresh(saved).catch(() => {})
  }, [])
  async function perform(body, success = '저장했습니다.') {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api({ slug, ...body })
      if (result.data) setData(result.data)
      setNotice(success); return result
    } catch (e) { setError(e.message); return null } finally { setBusy(false) }
  }
  async function login(e) {
    e.preventDefault()
    const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await perform({ ...values, slug, name, action: mode }, '로그인했습니다.')
    if (result) { e.target.reset(); await refresh(slug).catch(e => setError(e.message)) }
  }
  async function formAction(e, action, extra = {}) {
    e.preventDefault(); const form = e.currentTarget
    const values = Object.fromEntries(new FormData(form))
    const result = await perform({ action, ...values, ...extra })
    if (result) form.reset()
  }
  async function logout() {
    const result = await perform({ action: 'logout' }, '로그아웃했습니다.')
    if (result) { setData(null); sessionStorage.removeItem('sa_slug') }
  }
  const active = data?.status === 'active' && data.week > 0 && Date.now() < data.endsAt
  const canChat = active && data.week >= 2
  const canSuspect = active && data.week >= 3

  return <div className={styles.page}>
    <Head><link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" /><title>비밀 천사 · KYESIN</title><meta name="robots" content="noindex,nofollow" /><meta name="description" content="8주 동안 서로를 위해 기도하고 축복하는 청년부 마니또" /></Head>
    <header className={styles.header}><Link href="/cell">← 셀 모임</Link><span>KYESIN · 청년부</span>{data && <button disabled={busy} onClick={logout}>로그아웃</button>}</header>
    <main className={styles.main}>
      <div className={styles.hero}><span className={styles.eyebrow}>EIGHT WEEKS OF KINDNESS</span><h1>서로의 비밀 천사 🕊️</h1><p>작은 기도와 다정한 마음이 쌓이는 8주</p></div>
      <div aria-live="polite">{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}</div>
      {!data && <section className={styles.card}>
        <h2>우리 모임에 들어가기</h2><p>관리자에게 받은 모임 코드와 개인 참여코드를 준비하세요.</p>
        <div className={styles.tabs}>{[['login', '로그인'], ['join', '첫 등록 / PIN 복구']].map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => { setMode(key); setError('') }}>{label}</button>)}</div>
        <form onSubmit={login}>
          <><label>모임 코드<input required maxLength={40} value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} autoCapitalize="none" placeholder="예: youth-2026" /></label><label>참가자 이름<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} autoComplete="username" /></label>
          {mode === 'join' && <label>개인 참여코드<input required name="code" type="password" maxLength={24} autoComplete="off" /><small>명단에 등록된 이름을 그대로 입력하세요. 코드는 한 번만 사용할 수 있습니다.</small></label>}
          <label>{mode === 'join' ? '새 PIN (숫자 6~12자리)' : 'PIN'}<input name="pin" type="password" required inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete={mode === 'join' ? 'new-password' : 'current-password'} /></label></>
          <button className={styles.primary} disabled={busy}>{busy ? '확인 중…' : mode === 'join' ? '참가 등록 / 복구' : '로그인'}</button>
        </form>
        <p className={styles.muted}>PIN을 잊었다면 관리자에게 새 개인 참여코드를 요청하세요. 공용 기기에서는 사용 후 로그아웃해 주세요.</p>
      </section>}
      {data && <>
        {data.isTest && <p className={styles.notice}>🧪 가상 참가자 테스트 모임입니다. 관리자 화면에서 주차를 이동한 뒤 이 화면을 새로고침해 주세요.</p>}
        <section className={styles.summary}><div><span className={styles.eyebrow}>{data.status === 'draft' ? '참가자 등록 중' : data.status === 'revealed' ? '정체 공개' : data.week === 0 ? '시작 대기' : `8주 중 ${data.week}주차`}</span><h2>{data.title}</h2><p>{data.startsAt ? `시작 ${date(data.startsAt)} · 공개 가능 ${date(data.endsAt)}` : '모두 등록하면 관리자가 비밀 배정을 시작합니다.'}</p></div><button disabled={busy} onClick={() => refresh().then(() => setNotice('최신 소식을 불러왔습니다.')).catch(e => setError(e.message))}>새로고침</button></section>
          <section className={styles.card}><span className={styles.eyebrow}>{data.me.name}님의 비밀 노트</span><h2>{data.friend ? `나의 마니또는 ${data.friend.name}님` : '곧 나의 마니또를 만나요'}</h2><p>받은 하트 ♥ {data.hearts} · 미션 포인트 {data.me.points}P</p>{data.friend && <button disabled={busy || !active || data.heartSent} onClick={() => perform({ action: 'heart' }, '따뜻한 하트를 보냈습니다.')}>{data.heartSent ? '오늘의 하트 전달 완료 ♥' : '마니또에게 하트 보내기 ♡'}</button>}{data.status === 'active' && !active && data.week > 0 && <p>8주 활동이 끝났습니다. 관리자의 정체 공개를 기다려 주세요.</p>}</section>
          <nav className={styles.tabs} aria-label="마니또 활동">{[['mission', '주차별 미션'], ['prayer', '기도 노트'], ['message', '익명 편지'], ['suspect', '의심 노트']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
          {tab === 'mission' && <section className={styles.card}><h2>8주간의 작은 실천</h2><p>각 미션 완료는 10P. 포인트는 나에게만 보이며 지난 주차도 완료할 수 있습니다.</p><ul className={styles.list}>{data.missions.map(m => <li key={m.week}><div><strong>{m.week}주차</strong><p>{m.unlocked ? m.title : '🔒 이 주차가 되면 열려요'}</p></div>{m.unlocked && <button disabled={busy || m.done || !active} onClick={() => perform({ action: 'mission', week: m.week })}>{m.done ? '완료 ✓' : '+10P 완료'}</button>}</li>)}</ul></section>}
          {tab === 'prayer' && <section className={styles.card}><h2>함께 기도해요 🙏</h2><p>내 기도 제목은 나의 비밀 천사에게만 전달됩니다. 매주 한 번 작성할 수 있어요.</p><form onSubmit={e => formAction(e, 'prayer')}><label>이번 주 기도 제목<textarea name="body" required maxLength={500} disabled={!active} /></label><button disabled={busy || !active || data.prayers.some(p => p.mine && p.week === data.week)}>기도 요청하기</button></form>
            {data.prayers.map(p => <article className={styles.note} key={p.id}><small>{p.week}주차 · {p.mine ? '나의 기도' : `${data.friend.name}님의 기도`}</small><p>{p.body}</p><p>{p.prayed ? '🙏 천사가 함께 기도했어요' : '기도를 기다리고 있어요'}</p>{!p.mine && <button disabled={busy || !active || p.prayed} onClick={() => perform({ action: 'pray', id: p.id })}>함께 기도했어요</button>}{p.answered ? <p className={styles.answer}>응답과 감사 · {p.response}</p> : p.mine && <form onSubmit={e => formAction(e, 'prayer_update', { id: p.id })}><label>기도 응답 / 감사<textarea required name="body" maxLength={500} disabled={!active} /></label><button disabled={busy || !active}>응답 기록하기</button></form>}</article>)}
          </section>}
          {tab === 'message' && <section className={styles.card}><h2>익명의 다정한 편지 ✉️</h2><p>2주차부터 열려요. 각 대화방에 하루 5번 보낼 수 있습니다. 이름·연락처·정체를 알 수 있는 내용은 직접 쓰지 않도록 해요.</p><div className={styles.tabs}>{[['friend', '내 마니또와'], ['angel', '나의 비밀 천사와']].map(([key, label]) => <button key={key} aria-pressed={channel === key} onClick={() => setChannel(key)}>{label}</button>)}</div><div className={styles.messages}>{data.messages[channel].length === 0 && <p>아직 편지가 없어요.</p>}{data.messages[channel].map(m => <article key={m.id} className={`${styles.bubble} ${m.mine ? styles.mine : ''}`}><small>{m.mine ? '나' : channel === 'friend' ? '내 마니또' : '비밀 천사'}</small><p>{m.body}</p><small>{date(m.at)}</small></article>)}</div><form onSubmit={e => formAction(e, 'message', { channel })}><label>편지 내용<textarea key={channel} name="body" required maxLength={500} disabled={!canChat} /></label><button className={styles.primary} disabled={busy || !canChat}>익명으로 보내기</button></form></section>}
          {tab === 'suspect' && <section className={styles.card}><h2>혹시 나의 천사인가요? 👀</h2><p>3주차부터 매주 한 번 의심할 수 있어요. 상대는 누가 의심했는지 알 수 있고, 준비된 문구로 한 번 답할 수 있습니다. 정답 여부는 알려주지 않아요.</p><form onSubmit={e => formAction(e, 'suspect')}><label>의심할 사람<select required name="participantId" disabled={!canSuspect}><option value="">선택해 주세요</option>{data.participants.filter(p => p.id !== data.me.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy || !canSuspect || data.suspicions.some(s => !s.incoming && s.week === data.week)}>의심 보내기</button></form>{data.suspicions.map(s => <article key={s.id} className={styles.note}><small>{s.week}주차</small><p>{s.incoming ? `${s.name}님이 나를 의심했어요.` : `${s.name}님에게 의심을 보냈어요.`}</p>{s.reply ? <p>{s.reply}</p> : s.incoming ? <div className={styles.row}>{replies.map(body => <button disabled={busy || !canSuspect} key={body} onClick={() => perform({ action: 'reply', id: s.id, body })}>{body}</button>)}</div> : <small>답변을 기다리고 있어요.</small>}</article>)}</section>}
          {data.status === 'revealed' && <section className={styles.card}><h2>나의 비밀 천사는 {data.angel}님이었어요 🎉</h2><p>8주 동안 함께한 모든 기도와 사랑에 감사해요.</p>{data.reveal.map(x => <p key={x.from}>{x.from} → {x.to}</p>)}</section>}
      </>}
      <footer className={styles.footer}>작은 친절이 서로의 일상을 밝히기를.<br />기도와 편지는 배정된 두 사람 사이에서만 볼 수 있어요.<br />민감한 개인정보는 적지 말고, 불편한 일이 있다면 담당 리더에게 알려 주세요.</footer>
    </main>
  </div>
}
