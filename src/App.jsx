import { Routes, Route } from 'react-router-dom'
import MagicLinkAuth from './pages/MagicLinkAuth.jsx'
import Dashboard from './pages/Dashboard.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<MagicLinkAuth />} />
      <Route path="/" element={<Dashboard />} />
    </Routes>
  )
}
