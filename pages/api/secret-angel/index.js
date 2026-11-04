import { supabase } from '../../../lib/supabase'
import { makeHandler } from '../../../lib/secret-angel/server.mjs'

export const config = { api: { bodyParser: { sizeLimit: '3mb' } } }
export const maxDuration = 60
export default makeHandler(supabase)
