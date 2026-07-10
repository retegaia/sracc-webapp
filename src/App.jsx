import { Routes, Route } from 'react-router-dom'
import MagicLinkAuth from './pages/MagicLinkAuth.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ContributorForm from './pages/ContributorForm.jsx'
import CoordinatorView from './pages/CoordinatorView.jsx'
import Visualization from './pages/Visualization.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<MagicLinkAuth />} />
      <Route path="/" element={<Dashboard />} />
      <Route path="/form" element={<ContributorForm />} />
      <Route path="/coordinator" element={<CoordinatorView />} />
      <Route path="/visualize/:type" element={<Visualization />} />
    </Routes>
  )
}
