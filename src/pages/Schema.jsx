import { useState } from 'react'
import {
  Package, FileText, FileUp, Paperclip, Copy, Archive, CheckCircle2,
  Trash2, Eye, ChevronRight, ChevronDown, Hammer, Plus, Pencil,
  KeyRound, Check, X, TableProperties, Clock,
} from 'lucide-react'
import { useStore } from '../store/index.js'
import Modal from '../components/ui/Modal.jsx'

function tryParseContent(content) {
  if (!content) return null
  try {
    const parsed = JSON.parse(content)
    if (parsed.type === 'plan' && parsed.operations) return parsed
  } catch {}
  return null
}

function SchemaOperationCard({ op }) {
  const [open, setOpen] = useState(true)
  const opLabels = {
    create_table: { icon: <Hammer size={14} />, color: '#8B5CF6' },
    add_records: { icon: <Plus size={14} />, color: '#1B8A5E' },
    update_records: { icon: <Pencil size={14} />, color: '#C0640A' },
    delete_records: { icon: <Trash2 size={14} />, color: '#C03030' },
  }
  const meta = opLabels[op.op] || { icon: <TableProperties size={14} />, color: 'var(--text-mid)' }

  return (
    <div className="schema-op-card">
      <div className="schema-op-header" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, flexShrink: 0 }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--text-dark)' }}>{op.label || op.op}</div>
          {op.op === 'add_records' && <div className="text-soft" style={{ fontSize: '.72rem' }}>{op.params?.records?.length || 0} 条记录</div>}
        </div>
        {open ? <ChevronDown size={14} color="var(--text-soft)" /> : <ChevronRight size={14} color="var(--text-soft)" />}
      </div>

      {open && op.op === 'create_table' && op.params?.fields && (
        <div className="schema-op-body">
          {op.params.description && (
            <div style={{ fontSize: '.76rem', color: 'var(--text-mid)', marginBottom: 8, fontStyle: 'italic' }}>{op.params.description}</div>
          )}
          <table style={{ width: '100%', fontSize: '.76rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-soft)', textAlign: 'left' }}>
                {['字段名', '类型', '必填', '唯一', '描述'].map((h) => (
                  <th key={h} style={{ padding: '4px 8px', fontWeight: 800, fontSize: '.68rem', letterSpacing: '.5px', textTransform: 'uppercase', borderBottom: '1.5px solid rgba(193,122,255,.10)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {op.params.fields.map((f, fi) => (
                <tr key={fi} style={{ borderTop: fi > 0 ? '1px solid rgba(193,122,255,.06)' : 'none' }}>
                  <td style={{ padding: '5px 8px', fontWeight: 800 }}>
                    {f.name}
                    {f.unique && <KeyRound size={10} style={{ display: 'inline', marginLeft: 3 }} color="var(--lilac)" />}
                  </td>
                  <td style={{ padding: '5px 8px' }}><span className="badge badge-gray" style={{ fontSize: '.62rem' }}>{f.type}</span></td>
                  <td style={{ padding: '5px 8px' }}>{f.required ? <Check size={12} color="#1B8A5E" /> : <span style={{ color: 'var(--text-soft)' }}>—</span>}</td>
                  <td style={{ padding: '5px 8px' }}>{f.unique ? <Check size={12} color="var(--lilac)" /> : <span style={{ color: 'var(--text-soft)' }}>—</span>}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-mid)', fontSize: '.72rem' }}>{f.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && op.op === 'add_records' && op.params?.records?.length > 0 && (
        <div className="schema-op-body" style={{ overflowX: 'auto' }}>
          {(() => {
            const records = op.params.records
            const keys = Object.keys(records[0])
            return (
              <table style={{ width: '100%', fontSize: '.72rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-soft)' }}>
                    {keys.map((k) => <th key={k} style={{ padding: '3px 6px', fontWeight: 800, textAlign: 'left', fontSize: '.65rem', textTransform: 'uppercase', borderBottom: '1.5px solid rgba(193,122,255,.10)' }}>{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 10).map((rec, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid rgba(193,122,255,.06)' }}>
                      {keys.map((k) => (
                        <td key={k} style={{ padding: '3px 6px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rec[k] == null || rec[k] === '' ? <span style={{ color: 'var(--text-soft)' }}>—</span> : String(rec[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
          {op.params.records.length > 10 && <div className="text-soft" style={{ marginTop: 4, fontSize: '.70rem' }}>… 还有 {op.params.records.length - 10} 条记录</div>}
        </div>
      )}
    </div>
  )
}

export default function Schema() {
  const { agents, activeAgentId, schemas, addSchema, updateSchema, deleteSchema, toast } = useStore()
  const agent = agents.find((a) => a.id === activeAgentId)
  const agentSchemas = schemas
    .filter((s) => s.agentId === activeAgentId)
    .sort((a, b) => b.createdAt - a.createdAt)

  const [viewSchema,    setViewSchema]   = useState(null)
  const [showUpload,    setShowUpload]   = useState(false)
  const [uploadForm,    setUploadForm]   = useState({ name: '', version: '', content: '', notes: '' })
  const [filterStatus,  setFilterStatus] = useState('all')

  const filtered = filterStatus === 'all' ? agentSchemas : agentSchemas.filter((s) => s.status === filterStatus)

  const handleFileRead = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    file.text().then((text) => setUploadForm((f) => ({ ...f, content: text })))
    e.target.value = ''
  }

  const handleSaveSchema = () => {
    if (!uploadForm.name.trim() || !uploadForm.version.trim()) { toast('版本名称和版本号必填', 'error'); return }
    if (!agent) { toast('请先选择 Agent', 'error'); return }
    addSchema({ name: uploadForm.name, version: uploadForm.version, content: uploadForm.content, notes: uploadForm.notes, agentId: activeAgentId, status: 'draft', tableIds: [] })
    toast(`Schema "${uploadForm.name}" 已归档`, 'success')
    setShowUpload(false)
    setUploadForm({ name: '', version: '', content: '', notes: '' })
  }

  const statusLabel = { draft: '草稿', applied: '已应用', archived: '已归档' }
  const statusClass = { draft: 'badge-orange', applied: 'badge-green', archived: 'badge-gray' }

  if (!agent) return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div className="clay-card">
        <div className="empty-state" style={{ padding: '64px 24px' }}>
          <div className="empty-icon"><Package size={52} color="var(--text-soft)" strokeWidth={1.5} /></div>
          <div className="empty-title">请先选择 Agent</div>
          <div className="empty-sub">Schema 归档按 Agent 分类管理</div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '28px 28px 48px' }}>
      <div className="flex items-center justify-between mb-16">
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>Schema 归档</h1>
          <p className="text-soft mt-4">Agent: <strong>{agent.name}</strong> · {agentSchemas.length} 个版本</p>
        </div>
        <div className="flex gap-8">
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 'var(--r-md)', padding: 4, boxShadow: 'var(--in-groove)' }}>
            {['all', 'applied', 'draft', 'archived'].map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: '6px 12px', borderRadius: 'var(--r-sm)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: '.76rem', fontWeight: 800, background: filterStatus === s ? 'var(--white)' : 'transparent', color: filterStatus === s ? 'var(--text-dark)' : 'var(--text-soft)', boxShadow: filterStatus === s ? 'var(--sh-sm),var(--in-top)' : 'none', transition: 'all .22s ease' }}>
                {{ all: '全部', applied: '已应用', draft: '草稿', archived: '归档' }[s]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}><FileUp size={14} /> 上传 Schema</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="clay-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon"><Package size={52} color="var(--text-soft)" strokeWidth={1.5} /></div>
            <div className="empty-title">暂无 Schema 记录</div>
            <div className="empty-sub">
              {filterStatus === 'all'
                ? '通过 AI 助手执行建表操作，或手动上传 Schema 文档，版本会自动归档在此'
                : `没有"${statusLabel[filterStatus]}"状态的版本`}
            </div>
            {filterStatus === 'all' && <button className="btn btn-primary mt-12" onClick={() => setShowUpload(true)}><FileUp size={14} /> 上传第一个 Schema</button>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((s) => {
            const plan = tryParseContent(s.content)
            return (
              <div key={s.id} className="version-card">
                <div className="version-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#EDE3FF,#D5ECFF)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--sh-xs),var(--in-top)' }}>
                      <Package size={18} color="var(--lilac)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="version-num">{s.version}</div>
                      <div className="version-name truncate">{s.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-10">
                    <span className={`badge ${statusClass[s.status] || 'badge-gray'}`}>
                      <span className={`status-dot ${s.status || 'archived'}`} style={{ marginRight: 4 }}></span>
                      {statusLabel[s.status] || s.status}
                    </span>
                    <span className="text-soft" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />
                      {new Date(s.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div className="version-card-body">
                  {s.notes && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 10, fontSize: '.80rem', color: 'var(--text-mid)' }}>
                      <FileText size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{s.notes}</span>
                    </div>
                  )}

                  {plan ? (
                    <div>
                      <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: 10, lineHeight: 1.5 }}>
                        {plan.message}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(plan.operations || []).map((op, i) => (
                          <SchemaOperationCard key={i} op={op} />
                        ))}
                      </div>
                    </div>
                  ) : s.content ? (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--in-groove)' }}>
                      <pre style={{ fontSize: '.74rem', color: 'var(--text-mid)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden', lineHeight: 1.5 }}>
                        {s.content.slice(0, 400)}{s.content.length > 400 ? '…' : ''}
                      </pre>
                    </div>
                  ) : null}
                </div>

                <div className="version-card-foot">
                  <button className="btn btn-ghost btn-sm" onClick={() => setViewSchema(s)}><Eye size={13} /> 查看详情</button>
                  {s.status === 'draft' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { updateSchema(s.id, { status: 'archived' }); toast('已归档', 'info') }}>
                      <Archive size={13} /> 归档
                    </button>
                  )}
                  {s.status !== 'applied' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { updateSchema(s.id, { status: 'applied', appliedAt: Date.now() }); toast('状态已标记为已应用', 'success') }}>
                      <CheckCircle2 size={13} /> 标记已应用
                    </button>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="btn-icon" style={{ width: 28, height: 28, borderRadius: 8 }}
                    onClick={() => { if (confirm('删除此版本？')) { deleteSchema(s.id); toast('版本已删除', 'info') } }} title="删除">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View schema detail modal */}
      <Modal open={!!viewSchema} onClose={() => setViewSchema(null)} title={viewSchema?.name} subtitle={`${viewSchema?.version} · ${statusLabel[viewSchema?.status]}`} wide>
        {viewSchema && (() => {
          const plan = tryParseContent(viewSchema.content)
          return (
            <div>
              <div className="flex gap-8 mb-12" style={{ flexWrap: 'wrap' }}>
                <span className={`badge ${statusClass[viewSchema.status]}`}>{statusLabel[viewSchema.status]}</span>
                <span className="text-soft">创建: {new Date(viewSchema.createdAt).toLocaleString('zh-CN')}</span>
                {viewSchema.appliedAt && <span className="text-soft">应用: {new Date(viewSchema.appliedAt).toLocaleString('zh-CN')}</span>}
                {viewSchema.tableIds?.length > 0 && <span className="text-soft">涉及 {viewSchema.tableIds.length} 张表</span>}
              </div>
              {viewSchema.notes && (
                <div style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', background: '#FFF8E8', marginBottom: 12, fontSize: '.84rem', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <FileText size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {viewSchema.notes}
                </div>
              )}

              {plan ? (
                <div>
                  <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: 12, lineHeight: 1.5, padding: '0 4px' }}>
                    {plan.message}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(plan.operations || []).map((op, i) => (
                      <SchemaOperationCard key={i} op={op} />
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r-md)', padding: '14px 16px', boxShadow: 'var(--in-groove)', maxHeight: 420, overflow: 'auto' }}>
                  <pre style={{ fontSize: '.78rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text-dark)' }}>
                    {viewSchema.content || '（无内容）'}
                  </pre>
                </div>
              )}

              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(viewSchema.content || ''); toast('已复制到剪贴板', 'success') }}><Copy size={13} /> 复制</button>
                <button className="btn btn-ghost" onClick={() => setViewSchema(null)}>关闭</button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Upload schema modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="上传 Schema 文档" subtitle="手动归档一个 Schema / Mapping 版本" wide>
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
              <Paperclip size={13} /> 从文件导入
              <input type="file" accept=".json,.md,.txt,.yaml,.yml,.csv" style={{ display: 'none' }} onChange={handleFileRead} />
            </label>
          </div>
          <textarea className="clay-textarea" style={{ minHeight: 180, fontFamily: 'monospace', fontSize: '.80rem' }}
            placeholder="粘贴或输入你的 Schema / Mapping 内容…（JSON、Markdown、自然语言描述均可）"
            value={uploadForm.content} onChange={(e) => setUploadForm((f) => ({ ...f, content: e.target.value }))} />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleSaveSchema}>保存版本 <ChevronRight size={14} /></button>
        </div>
      </Modal>
    </div>
  )
}
