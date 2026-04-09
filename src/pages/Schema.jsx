import { useState } from 'react'
import { useStore } from '../store/index.js'
import Modal from '../components/ui/Modal.jsx'

export default function Schema() {
  const { agents, activeAgentId, schemas, addSchema, updateSchema, deleteSchema, toast } = useStore()
  const agent = agents.find((a) => a.id === activeAgentId)
  const agentSchemas = schemas
    .filter((s) => s.agentId === activeAgentId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const [viewSchema, setViewSchema] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', version: '', content: '', notes: '' })
  const [filterStatus, setFilterStatus] = useState('all')

  const filtered = filterStatus === 'all'
    ? agentSchemas
    : agentSchemas.filter((s) => s.status === filterStatus)

  const handleFileRead = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => {
      setUploadForm((f) => ({ ...f, content: text }))
    })
    e.target.value = ''
  }

  const handleSaveSchema = () => {
    if (!uploadForm.name.trim() || !uploadForm.version.trim()) {
      toast('版本名称和版本号必填', 'error')
      return
    }
    if (!agent) {
      toast('请先选择 Agent', 'error')
      return
    }
    addSchema({
      name: uploadForm.name,
      version: uploadForm.version,
      content: uploadForm.content,
      notes: uploadForm.notes,
      agentId: activeAgentId,
      status: 'draft',
      tableIds: [],
    })
    toast(`Schema "${uploadForm.name}" 已归档`, 'success')
    setShowUpload(false)
    setUploadForm({ name: '', version: '', content: '', notes: '' })
  }

  const statusLabel = { draft: '草稿', applied: '已应用', archived: '已归档' }
  const statusClass = { draft: 'badge-orange', applied: 'badge-green', archived: 'badge-gray' }
  const statusDot   = { draft: 'draft', applied: 'applied', archived: 'archived' }

  if (!agent) {
    return (
      <div style={{ padding: '28px 28px 48px' }}>
        <div className="clay-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon">📦</div>
            <div className="empty-title">请先选择 Agent</div>
            <div className="empty-sub">Schema 归档按 Agent 分类管理</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div className="flex items-center justify-between mb-16">
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>📦 Schema 归档</h1>
          <p className="text-soft mt-4">Agent: <strong>{agent.name}</strong> · {agentSchemas.length} 个版本</p>
        </div>
        <div className="flex gap-8">
          {/* Status filter */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 'var(--r-md)', padding: 4, boxShadow: 'var(--in-groove)' }}>
            {['all', 'applied', 'draft', 'archived'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: '.76rem', fontWeight: 800,
                  background: filterStatus === s ? 'var(--white)' : 'transparent',
                  color: filterStatus === s ? 'var(--text-dark)' : 'var(--text-soft)',
                  boxShadow: filterStatus === s ? 'var(--sh-sm),var(--in-top)' : 'none',
                  transition: 'all .22s ease',
                }}
              >
                {{ all: '全部', applied: '已应用', draft: '草稿', archived: '归档' }[s]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>📄 上传 Schema</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="clay-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon">📦</div>
            <div className="empty-title">暂无 Schema 记录</div>
            <div className="empty-sub">
              {filterStatus === 'all'
                ? '通过 AI 助手执行建表操作，或手动上传 Schema 文档，版本会自动归档在此'
                : `没有"${statusLabel[filterStatus]}"状态的版本`}
            </div>
            {filterStatus === 'all' && <button className="btn btn-primary mt-12" onClick={() => setShowUpload(true)}>📄 上传第一个 Schema</button>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((s) => (
            <div key={s.id} className="version-card">
              <div className="version-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 22 }}>📦</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="version-num">{s.version}</div>
                    <div className="version-name truncate">{s.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-10">
                  <span className={`badge ${statusClass[s.status] || 'badge-gray'}`}>
                    <span className={`status-dot ${statusDot[s.status] || 'archived'}`} style={{ gap: 0, marginRight: 4 }}></span>
                    {statusLabel[s.status] || s.status}
                  </span>
                  <span className="text-soft">{new Date(s.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>

              <div className="version-card-body">
                {s.appliedAt && (
                  <span className="text-soft">应用时间: {new Date(s.appliedAt).toLocaleString('zh-CN')} · </span>
                )}
                {s.tableIds?.length > 0 && (
                  <span className="text-soft">涉及 {s.tableIds.length} 张表 · </span>
                )}
                {s.notes && <span>{s.notes}</span>}
                {s.content && (
                  <div style={{ marginTop: 8, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--in-groove)' }}>
                    <pre style={{ fontSize: '.74rem', color: 'var(--text-mid)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', lineHeight: 1.5 }}>
                      {s.content.slice(0, 240)}{s.content.length > 240 ? '…' : ''}
                    </pre>
                  </div>
                )}
              </div>

              <div className="version-card-foot">
                <button className="btn btn-ghost btn-sm" onClick={() => setViewSchema(s)}>👁️ 查看详情</button>
                {s.status === 'draft' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { updateSchema(s.id, { status: 'archived' }); toast('已归档', 'info') }}>
                    🗃️ 归档
                  </button>
                )}
                {s.status !== 'applied' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => { updateSchema(s.id, { status: 'applied', appliedAt: Date.now() }); toast('状态已标记为已应用', 'success') }}>
                    ✅ 标记已应用
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, borderRadius: 8 }} onClick={() => { if (confirm('删除此版本？')) { deleteSchema(s.id); toast('版本已删除', 'info') } }} title="删除">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View schema modal */}
      <Modal open={!!viewSchema} onClose={() => setViewSchema(null)} title={viewSchema?.name} subtitle={`${viewSchema?.version} · ${statusLabel[viewSchema?.status]}`} wide>
        {viewSchema && (
          <div>
            <div className="flex gap-8 mb-12" style={{ flexWrap: 'wrap' }}>
              <span className={`badge ${statusClass[viewSchema.status]}`}>{statusLabel[viewSchema.status]}</span>
              <span className="text-soft">创建: {new Date(viewSchema.createdAt).toLocaleString('zh-CN')}</span>
              {viewSchema.appliedAt && <span className="text-soft">应用: {new Date(viewSchema.appliedAt).toLocaleString('zh-CN')}</span>}
              {viewSchema.tableIds?.length > 0 && <span className="text-soft">涉及 {viewSchema.tableIds.length} 张表</span>}
            </div>
            {viewSchema.notes && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', background: '#FFF8E8', marginBottom: 12, fontSize: '.84rem', fontWeight: 600 }}>
                📝 {viewSchema.notes}
              </div>
            )}
            <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r-md)', padding: '14px 16px', boxShadow: 'var(--in-groove)', maxHeight: 420, overflow: 'auto' }}>
              <pre style={{ fontSize: '.78rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-dark)' }}>
                {viewSchema.content || '（无内容）'}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(viewSchema.content || ''); toast('已复制到剪贴板', 'success') }}>📋 复制</button>
              <button className="btn btn-ghost" onClick={() => setViewSchema(null)}>关闭</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Upload schema modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="📄 上传 Schema 文档" subtitle="手动归档一个 Schema / Mapping 版本" wide>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">版本名称 *</label>
            <input className="clay-input" placeholder="例：用户模块 Schema、产品数据表…" value={uploadForm.name} onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">版本号 *</label>
            <input className="clay-input" placeholder="例：v1.0.0、v2.1、2024-Q1…" value={uploadForm.version} onChange={(e) => setUploadForm((f) => ({ ...f, version: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">备注</label>
          <input className="clay-input" placeholder="本次变更说明（可选）" value={uploadForm.notes} onChange={(e) => setUploadForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="form-group">
          <div className="flex items-center justify-between mb-8">
            <label className="form-label" style={{ marginBottom: 0 }}>Schema 内容</label>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              📎 从文件导入
              <input type="file" accept=".json,.md,.txt,.yaml,.yml,.csv" style={{ display: 'none' }} onChange={handleFileRead} />
            </label>
          </div>
          <textarea
            className="clay-textarea"
            style={{ minHeight: 180, fontFamily: 'monospace', fontSize: '.80rem' }}
            placeholder="粘贴或输入你的 Schema / Mapping 内容…（JSON、Markdown、自然语言描述均可）"
            value={uploadForm.content}
            onChange={(e) => setUploadForm((f) => ({ ...f, content: e.target.value }))}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSaveSchema}>保存版本 →</button>
        </div>
      </Modal>
    </div>
  )
}
