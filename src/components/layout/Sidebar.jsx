import { NavLink, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/index.js'

const NAV = [
  { to: '/',          icon: '🏠', label: 'Dashboard' },
  { to: '/agents',    icon: '🔑', label: 'Agents 管理' },
  { to: '/database',  icon: '🗄️', label: '数据库浏览' },
  { to: '/assistant', icon: '🤖', label: 'AI 助手' },
  { to: '/schema',    icon: '📦', label: 'Schema 归档' },
  { to: '/settings',  icon: '⚙️', label: '设置' },
]

export default function Sidebar() {
  const { agents, activeAgentId, setActiveAgent, tables, schemas } = useStore()
  const navigate = useNavigate()

  const handleAgentChange = (e) => {
    setActiveAgent(e.target.value || null)
  }

  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const activeTables  = tables.filter((t) => t.agentId === activeAgentId).length
  const activeSchemas = schemas.filter((s) => s.agentId === activeAgentId).length

  return (
    <aside className="sidebar">
      {/* Logo */}
      <NavLink to="/" className="sidebar-logo">
        <div className="logo-blob">🤖</div>
        <div className="logo-text">
          <strong>GPTBots DB</strong>
          <span>Database Manager</span>
        </div>
      </NavLink>

      {/* Agent selector */}
      <div className="agent-selector">
        <label>当前 Agent</label>
        <select
          className="agent-select-pill"
          value={activeAgentId || ''}
          onChange={handleAgentChange}
        >
          <option value="">— 选择 Agent —</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {activeAgent && (
          <div style={{ marginTop: 6, fontSize: '.68rem', color: 'var(--text-soft)', fontWeight: 600 }}>
            {activeTables} 张表 · {activeSchemas} 个版本
          </div>
        )}
      </div>

      <div className="nav-section">导航</div>

      {NAV.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{icon}</span>
          {label}
          {to === '/agents' && agents.length > 0 && (
            <span className="nav-badge">{agents.length}</span>
          )}
          {to === '/database' && activeTables > 0 && (
            <span className="nav-badge">{activeTables}</span>
          )}
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      {/* Quick add agent */}
      {agents.length === 0 && (
        <button
          className="btn btn-primary w-full"
          style={{ justifyContent: 'center', marginBottom: 8 }}
          onClick={() => navigate('/agents')}
        >
          ＋ 添加第一个 Agent
        </button>
      )}

      <div style={{ padding: '8px 4px', fontSize: '.68rem', color: 'var(--text-soft)', fontWeight: 600, textAlign: 'center' }}>
        GPTBots Database Manager v1.0
      </div>
    </aside>
  )
}
