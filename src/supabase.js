import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // AQUI ESTÁ O SEGREDO:
    // sessionStorage = A sessão morre quando você fecha a aba do navegador.
    // localStorage (o padrão) = A sessão fica salva para sempre.
    storage: window.localStorage, // ALTERADO de sessionStorage para localStorage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})