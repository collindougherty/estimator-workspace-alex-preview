import { createClient } from '@supabase/supabase-js'

import { env } from './env'
import type { Database } from './database.types'

export const supabase = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
)
