import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  canAccessAdmin,
  getRoleLabel,
  readAdminVerifiedMemberId,
  readBetaSession,
  writeAdminVerifiedMemberId,
  writeBetaSession,
} from '../../components/beta/mockAuth'
import { fetchAdminMembers, updateAdminMember, verifyBetaAdmin } from '../../components/beta/missionsStore'

function buildForm(member) {
  return {
    id: member.id,
    name: member.name || '',
    phone: member.phone || '',
    birthYear: member.birthYear || '',
    note: member.note || '',
    role: member.role || 'member',
    memberStatus: member.memberStatus || 'member',
    missionRole: member.missionRole || 'member',
    adminPassword: '',
    clearAdminPassword: false,
    organizations: (member.organizations || []).map((item) => ({
      organizationId: item.organizationId,
      roleInOrg: item.roleInOrg || '',
    })),
  }
}

export default function BetaAdminPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState([])
  const [organizationCatalog, setOrganizationCatalog] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const saved = readBetaSession()
    if (!saved) {
      router.replace('/beta')
      return
    }
    if (!canAccessAdmin(saved)) {
      router.replace('/beta')
      return
    }
    setSession(saved)
    setVerified(readAdminVerifiedMemberId() === saved.id)
  }, [router])

  useEffect(() => {
    if (!session || !verified) return
    setLoading(true)
    fetchAdminMembers(session.id)
      .then((result) => {
        setMembers(result.members || [])
        setOrganizationCatalog(result.organizationCatalog || [])
        const initialId = selectedId || result.members?.[0]?.id || ''
        setSelectedId(initialId)
        const selected = (result.members || []).find((item) => item.id === initialId) || result.members?.[0] || null
        setForm(selected ? buildForm(selected) : null)
        setError('')
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [session, verified])

  const selectedMember = useMemo(
    () => members.find((item) => item.id === selectedId) || null,
    [members, selectedId]
  )

  useEffect(() => {
    if (selectedMember) {
      setForm(buildForm(selectedMember))
    }
  }, [selectedMember])

  if (!session) return null

  async function handleVerify(event) {
    event.preventDefault()
    try {
      setLoading(true)
      await verifyBetaAdmin(session.id, password)
      writeAdminVerifiedMemberId(session.id)
      setVerified(true)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleOrganization(organizationId, checked) {
    if (!form) return
    const nextOrganizations = checked
      ? [...form.organizations, { organizationId, roleInOrg: '' }]
      : form.organizations.filter((item) => item.organizationId !== organizationId)
    setForm({ ...form, organizations: nextOrganizations })
  }

  function updateOrganizationRole(organizationId, roleInOrg) {
    if (!form) return
    setForm({
      ...form,
      organizations: form.organizations.map((item) => (
        item.organizationId === organizationId ? { ...item, roleInOrg } : item
      )),
    })
  }

  async function saveMember(event) {
    event.preventDefault()
    if (!form) return
    try {
      setSaving(true)
      const result = await updateAdminMember({
        actorId: session.id,
        memberId: form.id,
        name: form.name,
        phone: form.phone,
        birthYear: form.birthYear,
        note: form.note,
        role: form.role,
        memberStatus: form.memberStatus,
        missionRole: form.missionRole,
        adminPassword: form.adminPassword,
        clearAdminPassword: form.clearAdminPassword,
        organizations: form.organizations,
      })
      setMembers(result.members || [])
      setOrganizationCatalog(result.organizationCatalog || [])
      const refreshed = (result.members || []).find((item) => item.id === form.id) || null
      if (refreshed) {
        setForm(buildForm(refreshed))
      }
      if (form.id === session.id && refreshed) {
        writeBetaSession({
          ...session,
          name: refreshed.name,
          phone: refreshed.phone,
          role: refreshed.role,
          missionRole: refreshed.missionRole,
          organizations: refreshed.organizations || [],
        })
        setSession(readBetaSession())
      }
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Head>
        <title>광흥교회 통합 앱 관리자</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: '#f4efe6' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 18px 64px' }}>
          <button onClick={() => router.push('/beta')} style={{ border: '1px solid #dccdb6', background: '#fff', borderRadius: 999, padding: '10px 14px', cursor: 'pointer', fontWeight: 700, color: '#6e5b48', marginBottom: 16 }}>
            메인으로 돌아가기
          </button>

          <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 20, padding: 22, marginBottom: 18 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8b6e4e', fontWeight: 700 }}>관리자 화면</p>
            <h1 style={{ margin: '0 0 8px', fontSize: 28, fontFamily: "'Gowun Batang', serif" }}>{session.name} · {getRoleLabel(session.role)}</h1>
            <p style={{ margin: 0, color: '#6e5b48' }}>회원 권한, 전화번호, 선교회 소속과 역할을 이 화면에서 바로 수정할 수 있습니다.</p>
          </div>

          {!verified ? (
            <div style={{ background: '#fffdf8', border: '1px solid #e5d5bd', borderRadius: 18, padding: 22, maxWidth: 420 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>개인 비밀번호 확인</p>
              <form onSubmit={handleVerify} style={{ display: 'grid', gap: 12 }}>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리자 비밀번호" style={{ width: '100%', padding: '14px 15px', borderRadius: 12, border: '1px solid #d8c8af', fontSize: 15 }} />
                {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ border: 'none', borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(135deg,#684737,#8f5a49)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1 }}>
                  {loading ? '확인 중...' : '관리 권한 확인'}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 18 }}>
              <aside style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 18, alignSelf: 'start' }}>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>회원 목록</p>
                {loading ? (
                  <p style={{ margin: 0, color: '#6e5b48' }}>불러오는 중...</p>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {members.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => setSelectedId(member.id)}
                        style={{
                          textAlign: 'left',
                          borderRadius: 14,
                          border: selectedId === member.id ? '1px solid #caa57b' : '1px solid #eadbc5',
                          background: selectedId === member.id ? '#f6ead6' : '#faf5ec',
                          padding: '13px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{member.name}</p>
                        <p style={{ margin: '0 0 3px', fontSize: 13, color: '#6e5b48' }}>{member.phone || '전화번호 미입력'}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#8b6e4e' }}>{getRoleLabel(member.role)} / {member.memberStatus === 'member' ? '회원' : '비회원'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <main>
                {!form ? (
                  <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20, color: '#6e5b48' }}>수정할 회원을 선택해 주세요.</div>
                ) : (
                  <form onSubmit={saveMember} style={{ display: 'grid', gap: 18 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>이름</span>
                          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>전화번호</span>
                          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01012345678" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>출생년도</span>
                          <input value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>앱 권한</span>
                          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                            <option value="member">일반 회원</option>
                            <option value="leader">리더</option>
                            <option value="admin">관리자</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>선교회 상태</span>
                          <select value={form.memberStatus} onChange={(e) => setForm({ ...form, memberStatus: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                            <option value="member">회원</option>
                            <option value="non_member">비회원</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>선교회 권한</span>
                          <select value={form.missionRole} onChange={(e) => setForm({ ...form, missionRole: e.target.value })} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }}>
                            <option value="member">전회원</option>
                            <option value="sub_admin">부관리자</option>
                            <option value="admin">관리자</option>
                          </select>
                        </label>
                      </div>

                      <label style={{ display: 'grid', gap: 6, marginTop: 14 }}>
                        <span style={{ fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>메모</span>
                        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ minHeight: 100, padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af', resize: 'vertical' }} />
                      </label>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>관리자 비밀번호</p>
                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr auto' }}>
                        <input type="text" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value, clearAdminPassword: false })} placeholder="새 비밀번호를 입력하면 변경됩니다" style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid #d8c8af' }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6e5b48' }}>
                          <input type="checkbox" checked={form.clearAdminPassword} onChange={(e) => setForm({ ...form, clearAdminPassword: e.target.checked, adminPassword: e.target.checked ? '' : form.adminPassword })} />
                          비밀번호 삭제
                        </label>
                      </div>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e5d5bd', borderRadius: 18, padding: 20 }}>
                      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8b6e4e', fontWeight: 700 }}>소속 관리</p>
                      <div style={{ display: 'grid', gap: 16 }}>
                        {organizationCatalog.map((category) => (
                          <div key={category.id} style={{ background: '#faf5ec', borderRadius: 14, padding: '14px 15px' }}>
                            <p style={{ margin: '0 0 10px', fontWeight: 700 }}>{category.name}</p>
                            <div style={{ display: 'grid', gap: 10 }}>
                              {category.organizations.map((org) => {
                                const selected = form.organizations.find((item) => item.organizationId === org.id)
                                return (
                                  <div key={org.id} style={{ display: 'grid', gap: 8, gridTemplateColumns: '180px minmax(0,1fr)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6e5b48' }}>
                                      <input type="checkbox" checked={Boolean(selected)} onChange={(e) => toggleOrganization(org.id, e.target.checked)} />
                                      {org.name}
                                    </label>
                                    <input
                                      disabled={!selected}
                                      value={selected?.roleInOrg || ''}
                                      onChange={(e) => updateOrganizationRole(org.id, e.target.value)}
                                      placeholder="역할 예: 학생, 교사, 부장"
                                      style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d8c8af', background: selected ? '#fff' : '#f2ede6' }}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {error && <p style={{ margin: 0, color: '#b33f3f', fontSize: 13 }}>{error}</p>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" disabled={saving} style={{ border: 'none', borderRadius: 14, padding: '14px 18px', background: 'linear-gradient(135deg,#684737,#8f5a49)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.65 : 1 }}>
                        {saving ? '저장 중...' : '회원 정보 저장'}
                      </button>
                    </div>
                  </form>
                )}
              </main>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
