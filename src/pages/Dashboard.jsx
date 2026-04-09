import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/index.js'

export default function Dashboard() {
  const { agents, activeAgentId, tables, schemas } = useStore()
  const navigate = useNavigate()

  const activeAgent  = agents.find((a) => a.id === activeAgentId)
  const agentTables  = tables.filter((t) => t.agentId === activeAgentId)
  const agentSchemas = schemas.filter((s) => s.agentId === activeAgentId)
  const appliedSchemas = agentSchemas.filter((s) => s.status === 'applied')

  const recentOps = agentSchemas
    .filter((s) => s.appliedAt)
    .sort((a, b) => b.appliedAt - a.appliedAt)
    .slice(0, 5)

  return (
    <div style={{ padding: '28px 28px 48px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-16">
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>
            Dashboard 👋
          </h1>
          <p className="text-soft mt-4">
            {activeAgent
              ? `当前 Agent: ${activeAgent.name}`
              : '选择或添加一个 Agent 开始使用'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/assistant')}>
          🤖 AI 助手
        </button>
      </div>

      {/* No agent state */}
      {!activeAgent && (
        <div className="clay-card" style={{ marginBottom: 24 }}>
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div className="empty-icon">🔑</div>
            <div className="empty-title">还没有配置 Agent</div>
            <div className="empty-sub">先添加一个 GPTBots Agent 的 API Key，才能管理对应的数据库</div>
            <button className="btn btn-primary mt-12" onClick={() => navigate('/agents')}>
              ＋ 添加 Agent
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid-4 mb-16" style={{ gap: 16 }}>
        <div className="stat-card" style={{ background: 'linear-gradient(145deg,#FFF0EE,#FFE4E0)' }} onClick={() => navigate('/agents')}>
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg,#FF9F93,#FF7062)', color: '#fff' }}>🔑</div>
          <div className="stat-value">{agents.length}</div>
          <div className="stat-label">已配置 Agents</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(145deg,#EDFDF8,#D6F7EF)' }} onClick={() => navigate('/database')}>
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg,#8EE9D4,#4DCFB5)', color: '#fff' }}>🗄️</div>
          <div className="stat-value">{agentTables.length}</div>
          <div className="stat-label">已追踪数据表</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(145deg,#EAF5FF,#D5ECFF)' }} onClick={() => navigate('/schema')}>
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg,#93CFFF,#5AB2F5)', color: '#fff' }}>📦</div>
          <div className="stat-value">{agentSchemas.length}</div>
          <div className="stat-label">Schema 版本</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(145deg,#FFFBEC,#FFF4CE)' }} onClick={() => navigate('/schema')}>
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg,#FFE08A,#FFD04A)', color: '#fff' }}>✅</div>
          <div className="stat-value">{appliedSchemas.length}</div>
          <div className="stat-label">已应用版本</div>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 20, alignItems: 'start' }}>
        {/* Recent tables */}
        <div className="clay-card">
          <div className="card-header">
            <h2>📋 最近数据表</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/database')}>查看全部 →</button>
          </div>
          {agentTables.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <div className="empty-icon">🗄️</div>
              <div className="empty-title">还没有数据表</div>
              <div className="empty-sub">通过 AI 助手创建第一张表，或手动添加现有表 ID</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {agentTables.slice(0, 6).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-12"
                  style={{ padding: '10px 20px', borderBottom: '1px solid rgba(193,122,255,.06)', cursor: 'pointer' }}
                  onClick={() => navigate('/database')}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EDE3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: 'var(--sh-xs),var(--in-top)', flexShrink: 0 }}>📋</div>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '.88rem' }}>{t.name}</div>
                    <div className="text-soft truncate">{t.description || '无描述'}</div>
                  </div>
                  <span className="badge badge-purple">{t.fields?.length || 0} 字段</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent schema versions */}
        <div className="clay-card">
          <div className="card-header">
            <h2>📦 最近 Schema 操作</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/schema')}>归档 →</button>
          </div>
          {recentOps.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <div className="empty-icon">📦</div>
              <div className="empty-title">暂无操作记录</div>
              <div className="empty-sub">通过 AI 助手执行数据库操作后，记录将在此显示</div>
            </div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {recentOps.map((s) => (
                <div key={s.id} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(193,122,255,.06)' }}>
                  <div className="flex items-center gap-8">
                    <span className="badge badge-green">{s.version || 'v?'}</span>
                    <span style={{ fontWeight: 800, fontSize: '.86rem', flex: 1 }} className="truncate">{s.name}</span>
                    <span className="text-soft">{new Date(s.appliedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  {s.tableIds?.length > 0 && (
                    <div className="text-soft mt-4">应用到 {s.tableIds.length} 张表</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="clay-card mt-16">
        <div className="card-header"><h2>⚡ 快速操作</h2></div>
        <div className="card-body">
          <div className="flex gap-12" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/assistant')}>🤖 AI 设计 Schema</button>
            <button className="btn btn-ghost"   onClick={() => navigate('/database')}>➕ 添加数据表</button>
            <button className="btn btn-ghost"   onClick={() => navigate('/schema')}>📄 上传 Mapping</button>
            <button className="btn btn-ghost"   onClick={() => navigate('/agents')}>🔑 管理 Agents</button>
          </div>
        </div>
      </div>
    </div>
  )
}
