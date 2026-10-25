import { supabase } from '../../../lib/supabase'
import { makeHandler } from '../../../lib/secret-angel/server.mjs'

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } }
export default makeHandler(supabase, process.env, { adminSurface: true })
