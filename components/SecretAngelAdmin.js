import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from '../styles/SecretAngel.module.css'

const date = value => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''

export default function SecretAngelAdmin() {
  const [data, setData] = useState(null)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [invites, setInvites] = useState([])
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmAction, setConfirmAction] = useState('')

  async function api(body, get = false) {
    const res = await fetch('/api/leader/secret-angel' + (get && body.slug ? `?slug=${encodeURIComponent(body.slug)}` : ''), {
      method: get ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(!get ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    })
    const result = await res.json()
    if (!res.ok) {
      throw new Error(result.error || '요청을 처리하지 못했습니다.')
    }
    return result
  }
  async function refresh(selected = slug) {
    const result = await api({ slug: selected }, true)
    if (result.data) { setData(result.data); setSlug(result.data.slug); sessionStorage.setItem('sa_admin_slug', result.data.slug) }
    if (result.seasons) { setSeasons(result.seasons); setData(null); setSlug(''); sessionStorage.removeItem('sa_admin_slug') }
  }
  useEffect(() => {
    const saved = sessionStorage.getItem('sa_admin_slug') || ''
    setSlug(saved)
    refresh(saved).catch(() => refresh('')).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])
  async function perform(body, success = '저장했습니다.') {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api({ slug, ...body })
      if (result.data) setData(result.data)
      if (result.invites) setInvites(result.invites)
      setNotice(success); return result
    } catch (e) { setError(e.message); return null } finally { setBusy(false) }
  }
  async function formAction(e, action, extra = {}) {
    e.preventDefault(); const form = e.currentTarget
    const values = Object.fromEntries(new FormData(form))
    if (action === 'start' && values.startsAt) values.startsAt = new Date(values.startsAt).toISOString()
    const result = await perform({ action, ...values, ...extra })
    if (result) form.reset()
  }
  async function create(e) {
    e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget))
    const result = await perform({ ...values, action: 'create', names: values.names.split('\n').map(n => n.trim()).filter(Boolean) }, '모임을 만들었습니다. 개인 참여코드는 지금 안전하게 전달해 주세요.')
    if (result) { setSlug(result.slug); await refresh(result.slug).catch(e => setError(e.message)) }
  }
  return <div className={styles.page} style={{ minHeight: 'auto', background: 'transparent' }}>
    <div className={styles.main}>
      <div className={styles.row}><div><h2>🕊️ 마니또 관리</h2><p>모임 생성부터 비밀 배정과 마지막 정체 공개까지 이곳에서 관리하세요.</p><small>비밀번호 없이 이용하는 공개 관리 화면입니다.</small></div></div>
      <p><Link href="/secret_angel">참가자 페이지 열기 →</Link></p>
      <div aria-live="polite">{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}</div>
      {loading && <p role="status">모임을 불러오고 있습니다…</p>}
      {!loading && !data && <section className={styles.card}><h2>관리자 · 모임 관리</h2>{seasons.length > 0 && <div className={styles.row}>{seasons.map(s => <button disabled={busy} key={s.slug} onClick={() => refresh(s.slug).catch(e => setError(e.message))}>{s.slug} 열기</button>)}</div>}
        <h3>새 8주 모임</h3><form onSubmit={create}><label>모임 이름<input name="title" required maxLength={60} placeholder="청년부 가을 비밀 천사" /></label><label>모임 코드<input name="slug" required pattern="[a-z0-9][a-z0-9-]{2,39}" maxLength={40} placeholder="youth-2026" /></label><label>참가자 명단 (10~20명, 한 줄에 한 명)<textarea name="names" required rows={10} maxLength={700} placeholder={'김청년\n이소망\n박믿음'} /><small>동명이인은 구분 이름을 사용하세요. 시작 후 명단은 바꿀 수 없습니다.</small></label><button className={styles.primary} disabled={busy}>모임과 개인 참여코드 만들기</button></form></section>}
      {invites.length > 0 && <section className={styles.card}><h2>개인 참여코드 · 한 번만 표시</h2><p>모임 코드: <strong>{slug}</strong>. 각 참가자에게 본인의 코드만 개별 전달하세요. 다시 조회할 수 없으며 분실하면 재발급해야 합니다.</p>{invites.map(x => <div className={styles.invite} key={x.name}><strong>{x.name}</strong><code>{x.code}</code></div>)}<button onClick={() => setInvites([])}>전달 완료 · 화면에서 지우기</button></section>}
      {data && <>
        <section className={styles.summary}><div><span className={styles.eyebrow}>{data.status === 'draft' ? '참가자 등록 중' : data.status === 'revealed' ? '정체 공개' : data.week === 0 ? '시작 대기' : `8주 중 ${data.week}주차`}</span><h2>{data.title}</h2><p>{data.startsAt ? `시작 ${date(data.startsAt)} · 공개 가능 ${date(data.endsAt)}` : '모두 등록하면 관리자가 비밀 배정을 시작합니다.'}</p></div><button disabled={busy} onClick={() => refresh().then(() => setNotice('최신 소식을 불러왔습니다.')).catch(e => setError(e.message))}>새로고침</button></section>

          {data.isTest && <section className={styles.card}>
            <h3>🧪 테스트 진행 도구</h3><p>이 가상 참가자 모임에서만 사용할 수 있습니다. 주차를 이동해 기능 잠금과 마지막 공개를 확인해 보세요.</p>
            <div className={styles.row}>
              {data.status === 'active' && Date.now() < data.endsAt && <>
                {data.week < 3 && <button disabled={busy} onClick={() => perform({ action: 'test_advance', week: 3 }, '3주차로 이동했습니다. 편지와 의심하기를 테스트할 수 있습니다.')}>3주차 기능 열기</button>}
                <button disabled={busy} onClick={() => perform({ action: 'test_advance', week: data.week + 1 }, '테스트 주차를 이동했습니다.')}>{data.week < 8 ? `${data.week + 1}주차로 이동` : '8주 종료로 이동'}</button>
                {data.week < 8 && <button disabled={busy} onClick={() => perform({ action: 'test_advance', week: 9 }, '8주가 종료되었습니다. 아래에서 마지막 정체 공개를 확인해 주세요.')}>8주 종료로 이동</button>}
              </>}
              <button disabled={busy} onClick={() => setConfirmAction('test_reset')}>활동 초기화 · 1주차로</button>
            </div>
            {confirmAction === 'test_reset' && <div className={styles.confirm}><p>이 테스트 모임의 미션·기도·하트·편지·의심 기록을 지우고 1주차로 되돌립니다. 참가자 PIN과 배정은 유지합니다.</p><button disabled={busy} onClick={async () => { await perform({ action: 'test_reset' }, '테스트 기록을 초기화하고 1주차로 돌아왔습니다.'); setConfirmAction('') }}>테스트 초기화 확정</button><button onClick={() => setConfirmAction('')}>취소</button></div>}
          </section>}
          <section className={styles.card}><div className={styles.row}><h2>운영 현황</h2><button disabled={busy} onClick={() => { setInvites([]); refresh('').catch(e => setError(e.message)) }}>모임 목록</button></div><p>등록 {data.participants.filter(p => p.registered).length}/{data.participants.length}명 · 완료 미션 {data.counts.missions}개</p>
            <ul className={styles.list}>{data.participants.map(p => <li key={p.id}><span>{p.name} · {p.registered ? '등록 완료' : '등록 대기'}</span><button disabled={busy || data.status === 'revealed'} onClick={() => setConfirmAction(`reset:${p.id}`)}>PIN / 코드 재발급</button>{confirmAction === `reset:${p.id}` && <div className={styles.confirm}><p>{p.name}님의 기존 PIN과 로그인 세션을 무효화하고 새 코드를 발급합니다.</p><button disabled={busy} onClick={async () => { await perform({ action: 'reset_pin', participantId: p.id }, '새 코드를 개별 전달해 주세요.'); setConfirmAction('') }}>재발급 확정</button><button onClick={() => setConfirmAction('')}>취소</button></div>}</li>)}</ul>
            {data.status === 'draft' && <form onSubmit={e => formAction(e, 'start')}><h3>비밀 배정과 시작</h3><p>10~20명 전원이 등록해야 합니다. 중복·자기 배정·서로 맞교환 없이 무작위 배정하며 다시 뽑을 수 없습니다.</p><label>시작 시각 (기기 현지 시각)<input required type="datetime-local" name="startsAt" /></label><button disabled={busy || data.participants.some(p => !p.registered)} className={styles.primary}>배정 확정 · 8주 시작</button></form>}
            {data.status === 'active' && <><p>8주 종료 후 정체를 공개할 수 있습니다. 공개하면 활동이 종료됩니다.</p><button disabled={busy || Date.now() < data.endsAt} onClick={() => setConfirmAction('reveal')}>마지막 정체 공개</button>{confirmAction === 'reveal' && <div className={styles.confirm}><p>모든 참가자에게 전체 배정이 공개됩니다.</p><button disabled={busy} onClick={async () => { await perform({ action: 'reveal' }); setConfirmAction('') }}>공개 확정</button><button onClick={() => setConfirmAction('')}>취소</button></div>}</>}
          </section>
          {data.assignments.length > 0 && <details className={styles.card}><summary>관리자 전용 비밀 배정표</summary><p>참가자에게 공개하지 마세요.</p>{data.assignments.map(x => <p key={x.from}>{x.from} → {x.to}</p>)}</details>}
          <details className={styles.card}><summary>모임과 개인정보 삭제</summary><p>기도 제목·메시지·배정·PIN·참가자 세션이 모두 삭제되며 복원할 수 없습니다.</p><form onSubmit={async e => { e.preventDefault(); const confirm = new FormData(e.currentTarget).get('confirm'); const result = await perform({ action: 'delete', confirm }); if (result) { setInvites([]); await refresh('').catch(e => setError(e.message)) } }}><label>삭제할 모임 코드 입력<input name="confirm" required autoComplete="off" placeholder={slug} /></label><button disabled={busy}>모임 영구 삭제</button></form></details>
      </>}
    </div>
  </div>
}
