import { useState } from 'react'
import { useStore } from '../store/index.js'
import Modal from '../components/ui/Modal.jsx'

const EMPTY_FORM = { name: '', endpoint: 'sg', apiKey: '', description: '' }

export default function Agents() {
  const { agents, addAgent, updateAgent, deleteAgent, activeAgentId, setActiveAgent, toast } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showKey, setShowKey] = useState({})

  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (agent) => {
    setEditId(agent.id)
    setForm({ name: agent.name, endpoint: agent.endpoint, apiKey: agent.apiKey, description: agent.description || '' })
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.name.trim() || !form.endpoint.trim() || !form.apiKey.trim()) {
      toast('请填写 Agent 名称、Endpoint 和 API Key', 'error')
      return
    }
    if (editId) {
      updateAgent(editId, form)
      toast(`Agent "${form.name}" 已更新`, 'success')
    } else {
      addAgent(form)
      toast(`Agent "${form.name}" 已添加`, 'success')
    }
    setShowModal(false)
  }

  const handleDelete = (agent) => {
    if (!confirm(`确定删除 Agent "${agent.name}"？\n所有关联的数据表记录也将被移除。`)) return
    deleteAgent(agent.id)
    toast(`Agent "${agent.name}" 已删除`, 'info')
  }

  const maskKey = (key) => key ? key.slice(0, 8) + '••••••••' + key.slice(-6) : ''

  return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div className="flex items-center justify-between mb-16">
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>🔑 Agent 管理</h1>
          <p className="text-soft mt-4">管理本地存储的 GPTBots Agent API Keys</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>＋ 添加 Agent</button>
      </div>

      {agents.length === 0 ? (
        <div className="clay-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon">🔑</div>
            <div className="empty-title">还没有 Agent</div>
            <div className="empty-sub">
              在 GPTBots 平台的 API 密钥页面获取 API Key，然后在这里添加。<br />
              每个 Agent 对应一组 GPTBots 数据库表。
            </div>
            <button className="btn btn-primary mt-12" onClick={openAdd}>＋ 添加第一个 Agent</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {agents.map((agent) => {
            const isActive = agent.id === activeAgentId
            return (
              <div
                key={agent.id}
                className="clay-card"
                style={{ border: isActive ? '2px solid rgba(193,122,255,.40)' : '2px solid transparent' }}
              >
                <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Avatar */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 15,
                    background: isActive ? 'linear-gradient(135deg,var(--lilac),var(--sky))' : 'var(--surface2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, boxShadow: 'var(--sh-sm),var(--in-top)', flexShrink: 0,
                    color: isActive ? '#fff' : undefined
                  }}>
                    🤖
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-8">
                      <span style={{ fontWeight: 900, fontSize: '1rem' }}>{agent.name}</span>
                      {isActive && <span className="badge badge-purple">当前使用中</span>}
                    </div>
                    {agent.description && (
                      <div className="text-soft mt-4">{agent.description}</div>
                    )}
                    <div className="flex gap-12 mt-8" style={{ flexWrap: 'wrap' }}>
                      <span className="text-soft">
                        <span style={{ fontWeight: 800 }}>Endpoint:</span>{' '}
                        <span className="code">api-{agent.endpoint}.gptbots.ai</span>
                      </span>
                      <span className="text-soft flex items-center gap-8">
                        <span style={{ fontWeight: 800 }}>API Key:</span>{' '}
                        <span className="code">
                          {showKey[agent.id] ? agent.apiKey : maskKey(agent.apiKey)}
                        </span>
                        <button
                          className="btn-icon"
                          style={{ width: 24, height: 24, fontSize: 12, borderRadius: 7 }}
                          onClick={() => setShowKey((s) => ({ ...s, [agent.id]: !s[agent.id] }))}
                          title={showKey[agent.id] ? '隐藏' : '显示'}
                        >
                          {showKey[agent.id] ? '🙈' : '👁️'}
                        </button>
                      </span>
                      <span className="text-soft">
                        添加于 {new Date(agent.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-8">
                    {!isActive && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setActiveAgent(agent.id); toast(`已切换到 Agent: ${agent.name}`, 'success') }}>
                        切换使用
                      </button>
                    )}
                    <button className="btn-icon" onClick={() => openEdit(agent)} title="编辑">✏️</button>
                    <button className="btn-icon" onClick={() => handleDelete(agent)} title="删除">🗑️</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? '编辑 Agent' : '添加 Agent'}
        subtitle="配置 GPTBots Agent 的 API Key 和 Endpoint"
      >
        <div className="form-group">
          <label className="form-label">Agent 名称 *</label>
          <input className="clay-input" placeholder="例：客服机器人、产品助手…" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Endpoint Region *</label>
          <input className="clay-input" placeholder="例：sg（默认）、us、ap…（填写 api- 后面的部分）" value={form.endpoint} onChange={(e) => setForm((f) => ({ ...f, endpoint: e.target.value }))} />
          <p className="form-hint">最终会拼成: <span className="code">https://api-{form.endpoint || 'sg'}.gptbots.ai</span></p>
        </div>
        <div className="form-group">
          <label className="form-label">API Key *</label>
          <input className="clay-input" type="password" placeholder="Bearer Token，在 GPTBots API 密钥页面获取" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} />
          <p className="form-hint">密钥仅存储在本地 localStorage，不会上传到任何服务器</p>
        </div>
        <div className="form-group">
          <label className="form-label">备注描述（可选）</label>
          <input className="clay-input" placeholder="用途说明，方便识别" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>{editId ? '保存修改' : '添加 Agent'} →</button>
        </div>
      </Modal>
    </div>
  )
}
