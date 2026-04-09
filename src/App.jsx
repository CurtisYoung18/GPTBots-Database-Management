import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/index.js'
import Sidebar from './components/layout/Sidebar.jsx'
import ToastArea from './components/ui/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Agents from './pages/Agents.jsx'
import Database from './pages/Database.jsx'
import Assistant from './pages/Assistant.jsx'
import Schema from './pages/Schema.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  const _hasHydrated = useStore((s) => s._hasHydrated)

  // Show loading screen while file storage hydrates (usually < 200ms)
  if (!_hasHydrated) {
    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16,
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 18,
          background: 'linear-gradient(135deg, var(--lilac), var(--sky))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, boxShadow: 'var(--sh-md), var(--in-top)',
          animation: 'blobFloat 1.5s ease-in-out infinite alternate',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>
          </svg>
        </div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-dark)' }}>GPTBots Database</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-soft)', fontSize: '.82rem', fontWeight: 600 }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          正在加载本地数据…
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Decorative clay blobs */}
      <div className="decor-blob" style={{ width:360,height:360,background:'radial-gradient(circle,rgba(193,122,255,.28),transparent)',top:-100,left:180,animationDelay:'0s' }} />
      <div className="decor-blob" style={{ width:260,height:260,background:'radial-gradient(circle,rgba(122,196,255,.28),transparent)',bottom:-60,right:80,animationDelay:'-3s' }} />

      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <Routes>
            <Route path="/"           element={<Dashboard />} />
            <Route path="/agents"     element={<Agents />} />
            <Route path="/database"   element={<Database />} />
            <Route path="/assistant"  element={<Assistant />} />
            <Route path="/schema"     element={<Schema />} />
            <Route path="/settings"   element={<Settings />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      <ToastArea />
    </>
  )
}
