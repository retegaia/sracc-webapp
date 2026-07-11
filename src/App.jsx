import { Routes, Route } from 'react-router-dom'
import MagicLinkAuth from './pages/MagicLinkAuth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ContributorForm from './pages/ContributorForm.jsx'
import CoordinatorView from './pages/CoordinatorView.jsx'
import Visualization from './pages/Visualization.jsx'
import IndicatorsPage from './pages/IndicatorsPage.jsx'
import AdminPanel from './pages/AdminPanel.jsx'
import AppLayout from './components/AppLayout.jsx'

// Tutte le route tranne /login vivono sotto AppLayout, che monta la nav
// bar persistente (AppNav) una sola volta invece che in ogni pagina —
// risolve l'audit del 2026-07-10 sulla navigazione tra pagine mancante.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<MagicLinkAuth />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/form" element={<ContributorForm />} />
        <Route path="/coordinator" element={<CoordinatorView />} />
        <Route path="/visualize/:type" element={<Visualization />} />
        <Route path="/indicatori" element={<IndicatorsPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Route>
    </Routes>
  )
}
