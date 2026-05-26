import { supabase } from '../../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const memberId = String(req.body?.memberId || '')
    const password = String(req.body?.password || '')

    if (!memberId || !password) {
      return res.status(400).json({ error: '비밀번호를 입력해 주세요.' })
    }

    const { data, error } = await supabase
      .from('app_members')
      .select('id,role,admin_password_hash')
      .eq('id', memberId)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: '회원을 찾을 수 없습니다.' })
    if (!['leader', 'admin'].includes(data.role)) {
      return res.status(403).json({ error: '관리자 권한이 없습니다.' })
    }
    if (!data.admin_password_hash || data.admin_password_hash !== password) {
      return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || '관리자 인증 중 오류가 발생했습니다.' })
  }
}
