const ROLE_LABEL = { coordinator: 'Coordinatore', contributor: 'Referente', observer: 'Osservatore' }

// Schermata di scelta del territorio attivo (multi-territorio, 2026-07-11) —
// mostrata da AppLayout quando la sessione è valida ma non c'è ancora un
// territorio scelto per questa sessione, sia alla prima scelta dopo il
// login sia da "Cambia territorio" (AppNav). Stile inline come
// MagicLinkAuth.jsx: vive fuori dal guscio applicativo (nessun AppNav
// montato ancora), quindi non ha senso dipendere dalle classi .card/.ct
// scoped per-pagina usate altrove.
export default function TerritoryPicker({ territories, onSelect }) {
  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Su quale territorio vuoi operare?</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        Hai accesso a più territori — scegline uno per questa sessione.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {territories.map((t) => (
          <button
            key={t.territory_id}
            onClick={() => onSelect(t.territory_id)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              border: '1px solid #ddd',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span>
              <strong>{t.name}</strong>
              {t.region && <span style={{ color: '#999' }}> — {t.region}</span>}
            </span>
            <span style={{ fontSize: 12, color: '#1E4D2B' }}>{ROLE_LABEL[t.role] || t.role}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
