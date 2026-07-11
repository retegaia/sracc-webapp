// Helper condivisi tra magic-link.js (invito coordinatore) e
// request-magic-link.js (richiesta pubblica di un nuovo link, 2026-07-11):
// ricerca di un utente Supabase Auth per email e invio del magic link.
// Prima di questo helper la stessa ricerca paginata era duplicata inline in
// magic-link.js; estratta qui perché il nuovo endpoint pubblico ne ha
// bisogno identica.
export async function findAuthUserByEmail(supabase, email) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
    page += 1
  }
}

export async function sendMagicLink(supabase, email, siteUrl) {
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/login` },
  })
}
