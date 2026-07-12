import { createClient } from '@supabase/supabase-js'

// We use the '!' at the end to tell TypeScript that we guarantee these environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// This creates the actual connection bridge
export const supabase = createClient(supabaseUrl, supabaseKey)