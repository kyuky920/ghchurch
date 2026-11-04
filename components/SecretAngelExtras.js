import { useEffect, useRef, useState } from 'react'
import styles from '../styles/SecretAngel.module.css'

const ACTIVITY_KIND = { care: { label: '나만의 마음', hint: '조용히 준비하는 작은 실천', position: '0% 0%' }, together: { label: '함께하는 시간', hint: '옆에서 함께하는 작은 실천', position: '100% 0%' }, photo: { label: '추억 남기기', hint: '함께 남기는 따뜻한 순간', position: '0% 100%' }, letter: { label: '마음 전하기', hint: '친구에게 닿는 작은 응원', position: '100% 100%' } }
export function ActivityArt({ kind = 'care', className = '', decorative = false }) {
  const item = ACTIVITY_KIND[kind] || ACTIVITY_KIND.care
  return <span className={`${styles.activityArt} ${className}`} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : item.hint} style={{ backgroundPosition: item.position }} />
}
export function GardenTree({ percent }) {
  const size = percent === 0 ? 22 : percent < 25 ? 42 : percent < 60 ? 66 : 86
  return <svg className={styles.gardenTree} viewBox="0 0 320 210" aria-hidden="true"><ellipse cx="160" cy="190" rx="112" ry="12" fill="#dbe6ce"/><path d="M160 183V99M160 146l-28-25M160 130l28-27" fill="none" stroke="#937554" strokeWidth={percent < 25 ? 8 : 12} strokeLinecap="round"/><circle cx="160" cy={158-size} r={size} fill="#77996c"/><circle cx={160-size*.45} cy={166-size} r={size*.62} fill="#93b48a"/><circle cx={160+size*.45} cy={163-size} r={size*.62} fill="#527c54"/>{percent >= 60 && [0,1,2,3,4].map(i=><circle key={i} cx={113+i*23} cy={91+(i%2)*20} r="6" fill="#f4d49b"/>)}<path d="M70 186v-15m0 8c-11 0-11-9-11-9 8 0 11 4 11 9m0-4c11 0 11-9 11-9-8 0-11 4-11 9M247 188v-18" stroke="#77996c" strokeWidth="3" fill="#93b48a" strokeLinecap="round"/></svg>
}

export function Photo({ id, api, alt = '천사가 전한 사진' }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    setUrl(''); setError(false)
    if (id) api({ action: 'photo_url', photoId: id }).then(r => { if (live) setUrl(r.url) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [id]) // Each photo URL is short-lived and authorized for this participant.
  if (!id) return null
  return error ? <p>사진을 불러오지 못했어요. 새로고침해 주세요.</p> : url ? <img className={styles.journalPhoto} src={url} alt={alt} crossOrigin="anonymous" onError={() => setError(true)} /> : <p role="status">사진을 불러오는 중…</p>
}
export function PhotoPicker({ api, value, onChange, disabled, onBusy }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setBusy(true); onBusy?.(true); setError('')
    let objectUrl
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('20MB 이하 사진을 선택해 주세요.')
      objectUrl = URL.createObjectURL(file)
      const image = new Image(); image.src = objectUrl; await image.decode()
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const result = await api({ action: 'upload_photo', dataUrl: canvas.toDataURL('image/jpeg', .82) })
      onChange(result.photoId)
    } catch (e) { setError(e.message === 'The source image cannot be decoded.' ? 'JPG·PNG 사진으로 다시 시도해 주세요.' : e.message) } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); setBusy(false); onBusy?.(false) }
  }
  return <div className={styles.photoPicker}><label>사진 한 장 (선택)<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={upload} disabled={disabled || busy} /></label><small>사진 속 얼굴·글씨로 정체가 드러날 수 있어요. 촬영 위치 정보는 제거해요.</small>{busy && <p role="status">사진을 준비하고 있어요…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}{value && <><Photo id={value} api={api} alt="전송할 사진 미리보기" /><button type="button" disabled={disabled || busy} onClick={() => onChange(null)}>사진 첨부 취소</button></>}</div>
}
export function Keepsake({ children, filename = '천사의-발자국' }) {
  const card = useRef(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [image, setImage] = useState(null)
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])
  async function save() {
    setBusy(true); setError('')
    try {
      await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))])
      const images = Array.from(card.current.querySelectorAll('img'))
      await Promise.race([Promise.all(images.map(img => img.decode())), new Promise((_, reject) => setTimeout(() => reject(new Error('사진 로딩 지연')), 6000))])
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(card.current, { backgroundColor: '#fffdf9', scale: 2, useCORS: true, imageTimeout: 5000, logging: false })
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('이미지를 만들지 못했어요.')
      const file = new File([blob], `${filename}.png`, { type: 'image/png' }), url = URL.createObjectURL(blob)
      setImage({ file, url })
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click()
    } catch (e) { setError('이미지 저장을 완료하지 못했어요. 사진이 모두 보인 뒤 다시 눌러 주세요.') } finally { setBusy(false) }
  }
  async function share() {
    try { await navigator.share({ files: [image.file], title: filename }) } catch (e) { if (e.name !== 'AbortError') setError('공유할 수 없어요. 다운로드한 이미지를 직접 보내 주세요.') }
  }
  return <article className={styles.keepsake}><div ref={card} className={styles.keepsakeContent}><span className={styles.eyebrow}>서로의 비밀 천사 🕊️</span>{children}</div><button disabled={busy} onClick={save}>{busy ? '이미지 만드는 중…' : '이미지로 저장'}</button>{image && <div className={styles.savedImage}><p role="status">카드 이미지를 만들었어요. 휴대폰에서는 아래 이미지를 길게 눌러 저장할 수도 있어요.</p><img src={image.url} alt="저장할 추억 카드" className={styles.journalPhoto} /><a href={image.url} download={image.file.name}>이미지 다운로드</a>{navigator.canShare?.({ files: [image.file] }) && <button onClick={share}>이미지 공유하기</button>}</div>}{error && <p role="alert">{error}</p>}</article>
}
export function MissionWeek({ mission: m, active, busy, api, perform }) {
  const [choice, setChoice] = useState(m.selectedId || ''), [note, setNote] = useState(m.note), [privateMemo, setPrivateMemo] = useState(m.privateMemo || ''), [shared, setShared] = useState(m.shared), [photoId, setPhoto] = useState(m.photoId), [editing, setEditing] = useState(!m.done), [uploading, setUploading] = useState(false)
  useEffect(() => { setChoice(m.selectedId || ''); setNote(m.note); setPrivateMemo(m.privateMemo || ''); setShared(m.shared); setPhoto(m.photoId); setEditing(!m.done) }, [m.done, m.selectedId, m.note, m.privateMemo, m.shared, m.photoId])
  async function submit(e) {
    e.preventDefault()
    const result = await perform({ action: m.done ? 'mission_share' : 'mission', week: m.week, missionId: choice, privateMemo, note, photoId, shared }, m.done ? '나의 실천 기록을 저장했어요.' : '미션 완료! 10P를 받았어요.')
    if (result) setEditing(false)
  }
  return <div className={styles.missionWeek}><div className={styles.row}><h3>{m.week}주차의 작은 실천</h3><span className={styles.weekStatus}>{m.done ? '완료 ✓ · 10P' : m.unlocked ? '하나를 골라요 · 10P' : '아직 열리지 않았어요'}</span></div>{!m.unlocked ? <div className={styles.emptyState}><ActivityArt kind="care" /><p>이 주차가 되면 새로운 실천 카드가 열려요.</p></div> : <><p className={styles.muted}>혼자 준비해도, 함께 시간을 보내도 좋아요. 사진은 서로 동의한 경우에만 남겨 주세요.</p><fieldset className={`${styles.missionOptions} ${styles.activityGrid}`} disabled={busy || m.done || !active}><legend className={styles.missionLegend}>{m.week}주차 미션 선택</legend>{m.options.filter(option => !m.done || option.id === m.selectedId).map(option => <label key={option.id} className={`${styles.missionOption} ${styles.activityOption}`}><input type="radio" name={`mission-${m.week}`} checked={choice === option.id} onChange={() => setChoice(option.id)} /><ActivityArt kind={option.kind} decorative /><span className={styles.activityText}><small>{ACTIVITY_KIND[option.kind]?.label || '작은 실천'}</small><strong>{option.title}</strong><span className={styles.choiceHint}>{choice === option.id ? (m.done ? '실천한 미션 ✓' : '이 미션으로 골랐어요 ✓') : '이 미션 고르기'}</span></span></label>)}</fieldset>{!m.done && <button disabled={busy || !active} onClick={() => { const choices = m.options.filter(o => o.id !== choice); setChoice(choices[Math.floor(Math.random() * choices.length)].id) }}>🎲 고민될 땐 미션 추천받기</button>}{editing && (choice || m.done) ? <form onSubmit={submit} className={styles.journalEditor}><div className={styles.privateJournal}><label>나만의 메모 (선택)<textarea value={privateMemo} onChange={e => setPrivateMemo(e.target.value)} maxLength={1000} placeholder="어떤 순간이었는지, 어떤 마음이 들었는지 적어 보세요." disabled={busy} /></label><small>이 메모는 나에게만 보여요. 친구에게 전달되지 않아요.</small></div><details open={shared || undefined} className={styles.shareJournal}><summary>🕊️ 친구에게 마음도 전할까요? (선택)</summary><label>친구에게 남길 한마디<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="이번 주도 잘 지낼 수 있도록 기도했어요." disabled={busy} /></label><PhotoPicker api={api} value={photoId} onChange={setPhoto} onBusy={setUploading} disabled={busy} /><label className={styles.checkLabel}><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} disabled={busy} />미션·한마디·사진을 친구에게 익명으로 전하기</label><small>전하기를 선택해야 친구의 ‘천사의 발자국’에 보여요. 나만의 메모는 제외됩니다.</small></details><button className={styles.primary} disabled={busy || uploading || (!m.done && (!active || !choice))}>{m.done ? '기록 저장하기' : '실천했어요 · +10P'}</button>{m.done && <button type="button" onClick={() => setEditing(false)}>닫기</button>}</form> : m.done && <div className={styles.journalSummary}>{m.privateMemo && <div className={styles.privateJournal}><small>나만의 메모</small><p>{m.privateMemo}</p></div>}<p>{m.shared ? '🕊️ 친구에게 전한 실천' : '나만 보는 실천 기록'}</p>{m.note && <p>{m.note}</p>}<Photo id={m.photoId} api={api} /><button disabled={busy} onClick={() => setEditing(true)}>메모·사진 기록 / 전달 설정</button></div>}</>}</div>
}
export function Community({ data }) {
  const garden = data.garden
  return <section className={styles.card}><h2>함께한 발자국</h2><div className={styles.garden}><GardenTree percent={garden.percent} /><h3>{garden.stage}</h3><p>모두의 작은 실천 {garden.total} / {garden.goal}개</p><progress max={garden.goal || 1} value={garden.total} aria-label="함께 키우는 나무의 성장" /><p>이번 주 미션 완료 {garden.weekCompleted} / {garden.participants}명</p></div><h3>나의 배지</h3><ul className={styles.badges}>{data.badges.map(b => <li key={b.title} className={b.earned ? styles.earned : ''}><span>{b.icon}</span>{b.title}<small>{b.earned ? '획득했어요' : '아직 자라는 중'}</small></li>)}</ul><h3>미션 참여 순위</h3><p>미션 완료만 점수에 반영해요. 같은 점수는 공동 순위입니다.</p><div className={styles.tableWrap}><table className={styles.ranking}><thead><tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">완료</th><th scope="col">포인트</th></tr></thead><tbody>{data.leaderboard.map(p => <tr key={p.id} className={p.mine ? styles.myRank : ''}><td>{p.rank}</td><th scope="row">{p.name}{p.mine ? ' (나)' : ''}</th><td>{p.completed}/8</td><td>{p.points}P</td></tr>)}</tbody></table></div></section>
}
export function PushSettings({ data, api, perform }) {
  const [hint, setHint] = useState(''), [working, setWorking] = useState(false)
  async function enable() {
    setWorking(true); setHint('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('이 브라우저에서는 푸시를 지원하지 않아요. 사이트 안의 알림함으로 확인해 주세요.')
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (ios && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone) throw new Error('아이폰은 Safari 공유 버튼 → 홈 화면에 추가 후, 홈 화면 아이콘으로 열어 알림을 켜 주세요. 해당 화면에서도 기기 등록이 필요할 수 있어요.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('알림이 허용되지 않았어요. 휴대폰·브라우저 설정에서 허용할 수 있습니다.')
      const registration = await navigator.serviceWorker.register('/secret-angel-sw.js', { scope: '/secret_angel' })
      await navigator.serviceWorker.ready
      const key = data.pushPublicKey.replace(/-/g, '+').replace(/_/g, '/')
      const bytes = Uint8Array.from(atob(key + '='.repeat((4 - key.length % 4) % 4)), c => c.charCodeAt(0))
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
      const result = await perform({ action: 'push_subscribe', subscription: subscription.toJSON() }, '알림 받기를 켰어요.')
      if (result) setHint('테스트 알림으로 이 기기에 잘 도착하는지 확인해 보세요.')
    } catch (e) { setHint(e.message) } finally { setWorking(false) }
  }
  async function disable() {
    setWorking(true)
    try {
      const result = await perform({ action: 'push_unsubscribe' }, '알림 받기를 껐어요.')
      if (result && 'serviceWorker' in navigator) { const registration = await navigator.serviceWorker.getRegistration('/secret_angel'); const subscription = await registration?.pushManager.getSubscription(); await subscription?.unsubscribe() }
    } catch (e) { setHint(e.message) } finally { setWorking(false) }
  }
  return <div className={styles.pushSettings}><h3>휴대폰 알림</h3><p>편지·의심·답변·기도 응원·천사의 발자국과 새 주차 소식을 알려드려요. 잠금 화면에는 이름과 편지 내용을 표시하지 않아요.</p>{data.pushEnabled ? <div className={styles.row}><button disabled={working} onClick={() => perform({ action: 'push_test' }, '테스트 알림을 보냈어요.')}>테스트 알림 보내기</button><button disabled={working} onClick={disable}>알림 끄기</button></div> : <button disabled={working || !data.pushPublicKey} onClick={enable}>{working ? '알림 설정 중…' : '알림 받기'}</button>}{!data.pushPublicKey && <p>푸시 알림을 준비 중이에요. 아래 알림함은 바로 사용할 수 있어요.</p>}{hint && <p role="status" className={styles.notice}>{hint}</p>}<small>아이폰(iOS 16.4 이상)은 홈 화면에 추가한 웹앱에서 알림을 허용해 주세요. 카카오톡 안에서는 기본 브라우저로 열어 주세요.</small></div>
}
