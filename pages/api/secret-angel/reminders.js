import { supabase } from '../../../lib/supabase'
import { makeHandler } from '../../../lib/secret-angel/server.mjs'

export const maxDuration = 60
export default makeHandler(supabase, process.env, { maintenance: true })
