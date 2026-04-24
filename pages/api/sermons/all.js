import { supabase } from '../../../lib/supabase'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('sermons')
        .select('id,week,service,reference,sermon_title,passage,sermon_points,status,error_msg,card_verse,sermon_summary,questions,meditations,created_at')
        .order('week', { ascending: false })
        .order('service', { ascending: true })
      if (error) throw error
      return res.status(200).json({ ok: true, data })
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }) }
  }
  return res.status(405).json({ ok: false, error: 'Method not allowed' })
}
