import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://ipbbsijidskcgqkiwqww.supabase.co';
const SUPABASE_ANON = 'sb_publishable_sxR-xU3NQ9M4jVmT55ruqQ_EQ8acBOb';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
