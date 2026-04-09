import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, KeyRound, Database, Bot, Package,
  Settings, ChevronRight,
} from 'lucide-react'
import { useStore } from '../../store/index.js'

const NAV = [
  { to: '/',          Icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents',    Icon: KeyRound,        label: 'Agents 管理' },
  { to: '/database',  Icon: Database,        label: '数据库浏览' },
  { to: '/assistant', Icon: Bot,             label: 'AI 助手' },
  { to: '/schema',    Icon: Package,         label: 'Schema 归档' },
  { to: '/settings',  Icon: Settings,        label: '设置' },
]

export default function Sidebar() {
  const { agents, activeAgentId, setActiveAgent, tables, schemas } = useStore()
  const navigate = useNavigate()

  const activeAgent   = agents.find((a) => a.id === activeAgentId)
  const activeTables  = tables.filter((t) => t.agentId === activeAgentId).length
  const activeSchemas = schemas.filter((s) => s.agentId === activeAgentId).length

  return (
    <aside className="sidebar">
      {/* Logo */}
      <NavLink to="/" className="sidebar-logo">
        <div className="logo-blob">
          <Bot size={22} color="#fff" />
        </div>
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
          onChange={(e) => setActiveAgent(e.target.value || null)}
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

      {NAV.map(({ to, Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon"><Icon size={16} /></span>
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

      {agents.length === 0 && (
        <button
          className="btn btn-primary w-full"
          style={{ justifyContent: 'center', marginBottom: 8 }}
          onClick={() => navigate('/agents')}
        >
          <ChevronRight size={14} /> 添加第一个 Agent
        </button>
      )}

      <div style={{ padding: '8px 4px', fontSize: '.68rem', color: 'var(--text-soft)', fontWeight: 600, textAlign: 'center' }}>
        GPTBots Database Manager v1.0
      </div>
    </aside>
  )
}
