import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store/index.js'
import Modal from '../components/ui/Modal.jsx'
import * as api from '../api/gptbots.js'

const TYPE_OPTS = ['TEXT', 'INT', 'FLOAT', 'DATETIME', 'BOOLEAN']
const EMPTY_FIELD = { name: '', description: '', type: 'TEXT', required: false, unique: false }

export default function Database() {
  const { agents, activeAgentId, tables, addTable, removeTable, toast } = useStore()
  const agent = agents.find((a) => a.id === activeAgentId)
  const agentTables = tables.filter((t) => t.agentId === activeAgentId)

  const [selectedTableId, setSelectedTableId] = useState(null)
  const [records, setRecords] = useState([])
  const [tableInfo, setTableInfo] = useState(null)
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [loadingRecords, setLoadingRecords] = useState(false)

  const [showAddTable, setShowAddTable] = useState(false)
  const [showCreateTable, setShowCreateTable] = useState(false)
  const [showAddRecord, setShowAddRecord] = useState(false)
  const [showEditRecord, setShowEditRecord] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)

  const [tableIdInput, setTableIdInput] = useState('')
  const [createForm, setCreateForm] = useState({ name: '', description: '', fields: [{ ...EMPTY_FIELD, unique: true }] })
  const [recordForm, setRecordForm] = useState({})
  const [savingRecord, setSavingRecord] = useState(false)

  const selectedTable = agentTables.find((t) => t.id === selectedTableId) || agentTables[0]

  const fetchRecords = useCallback(async (tbl, pg = 1, kw = '') => {
    if (!agent || !tbl) return
    setLoadingRecords(true)
    try {
      const res = await api.getRecords(agent, { table_id: tbl.tableId, page: pg, page_size: pageSize, keyword: kw || undefined })
      const data = res.data
      setRecords(data.records || [])
      setTotalCount(data.total_count || 0)
      setTableInfo(data.table_info || null)
      // Update local table fields if schema changed
      if (data.table_info?.fields) {
        const store = useStore.getState()
        store.updateTable(tbl.id, { fields: data.table_info.fields, description: data.table_info.description })
      }
    } catch (e) {
      toast(`获取记录失败: ${e.response?.data?.message || e.message}`, 'error')
    } finally {
      setLoadingRecords(false)
    }
  }, [agent, pageSize, toast])

  useEffect(() => {
    if (selectedTable) {
      setPage(1)
      setKeyword('')
      fetchRecords(selectedTable, 1, '')
    }
  }, [selectedTable?.id])

  // ── Add existing table by ID ──────────────────────────────────────────────
  const handleAddTableById = async () => {
    if (!tableIdInput.trim()) return
    if (!agent) return toast('请先选择一个 Agent', 'error')
    setLoadingRecords(true)
    try {
      const res = await api.getRecords(agent, { table_id: tableIdInput.trim(), page: 1, page_size: 1 })
      const info = res.data?.table_info
      if (!info) throw new Error('未找到该表')
      addTable({ tableId: info.id, name: info.name, description: info.description, fields: info.fields, agentId: activeAgentId })
      setTableIdInput('')
      setShowAddTable(false)
      toast(`表 "${info.name}" 已添加`, 'success')
    } catch (e) {
      toast(`添加失败: ${e.response?.data?.message || e.message}`, 'error')
    } finally {
      setLoadingRecords(false)
    }
  }

  // ── Create table ──────────────────────────────────────────────────────────
  const handleCreateTable = async () => {
    if (!agent) return toast('请先选择 Agent', 'error')
    if (!createForm.name.trim() || !createForm.description.trim()) return toast('表名和描述必填', 'error')
    if (createForm.fields.some((f) => !f.name.trim())) return toast('所有字段必须有名称', 'error')
    if (!createForm.fields.some((f) => f.unique)) return toast('至少需要一个 unique 字段', 'error')

    setSavingRecord(true)
    try {
      const res = await api.createTable(agent, createForm)
      const tableId = res.data?.data || res.data?.tableId || res.data?.id
      addTable({ tableId, name: createForm.name, description: createForm.description, fields: createForm.fields, agentId: activeAgentId })
      setShowCreateTable(false)
      setCreateForm({ name: '', description: '', fields: [{ ...EMPTY_FIELD, unique: true }] })
      toast(`表 "${createForm.name}" 创建成功`, 'success')
    } catch (e) {
      toast(`创建失败: ${e.response?.data?.message || e.message}`, 'error')
    } finally {
      setSavingRecord(false)
    }
  }

  // ── Add record ────────────────────────────────────────────────────────────
  const openAddRecord = () => {
    if (!selectedTable) return
    const initial = {}
    selectedTable.fields?.forEach((f) => { initial[f.name] = '' })
    setRecordForm(initial)
    setEditingRecord(null)
    setShowAddRecord(true)
  }

  const openEditRecord = (record) => {
    setEditingRecord(record)
    setRecordForm({ ...record.value })
    setShowEditRecord(true)
  }

  const handleSaveRecord = async () => {
    if (!agent || !selectedTable) return
    setSavingRecord(true)
    try {
      if (editingRecord) {
        await api.updateRecords(agent, {
          table_id: selectedTable.tableId,
          update_data: [{ record_id: editingRecord.id, updated_fields: recordForm }]
        })
        toast('记录已更新', 'success')
        setShowEditRecord(false)
      } else {
        const res = await api.importRecords(agent, { table_id: selectedTable.tableId, records: [recordForm] })
        const taskId = res.data?.data
        if (taskId) {
          await api.pollImport(agent, taskId, (job) => {
            if (job.status === 'FAIL') throw new Error(job.fail_detail?.[0]?.fail_reason || '添加失败')
          })
        }
        toast('记录已添加', 'success')
        setShowAddRecord(false)
      }
      await fetchRecords(selectedTable, page, keyword)
    } catch (e) {
      toast(`操作失败: ${e.message || e.response?.data?.message}`, 'error')
    } finally {
      setSavingRecord(false)
    }
  }

  const handleDeleteRecord = async (record) => {
    if (!confirm('确定删除这条记录？')) return
    if (!agent || !selectedTable) return
    try {
      await api.deleteRecords(agent, { table_id: selectedTable.tableId, delete_data: [{ record_id: record.id }] })
      toast('记录已删除', 'success')
      fetchRecords(selectedTable, page, keyword)
    } catch (e) {
      toast(`删除失败: ${e.response?.data?.message || e.message}`, 'error')
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize)
  const displayFields = (selectedTable?.fields || tableInfo?.fields || [])

  const fieldAddRow = () => setCreateForm((f) => ({ ...f, fields: [...f.fields, { ...EMPTY_FIELD }] }))
  const fieldRemoveRow = (i) => setCreateForm((f) => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) }))
  const fieldUpdate = (i, key, val) => setCreateForm((f) => ({ ...f, fields: f.fields.map((row, idx) => idx === i ? { ...row, [key]: val } : row) }))

  if (!agent) {
    return (
      <div style={{ padding: '28px 28px 48px' }}>
        <div className="clay-card">
          <div className="empty-state" style={{ padding: '64px 24px' }}>
            <div className="empty-icon">🗄️</div>
            <div className="empty-title">请先选择 Agent</div>
            <div className="empty-sub">在左侧选择一个 Agent，或前往「Agent 管理」添加新的 Agent</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 28px 48px', height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>🗄️ 数据库浏览</h1>
          <p className="text-soft mt-4">Agent: <strong>{agent.name}</strong></p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-ghost" onClick={() => setShowAddTable(true)}>🔗 添加已有表</button>
          <button className="btn btn-primary" onClick={() => setShowCreateTable(true)}>＋ 创建新表</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Table list */}
        <div className="clay-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ padding: '14px 16px' }}>
            <h2 style={{ fontSize: '.88rem' }}>📋 数据表</h2>
            <span className="badge badge-purple">{agentTables.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {agentTables.length === 0 ? (
              <div className="empty-state" style={{ padding: '28px 12px' }}>
                <div style={{ fontSize: '1.6rem', opacity: .4 }}>🗄️</div>
                <div className="text-soft" style={{ fontSize: '.76rem', textAlign: 'center' }}>暂无数据表<br />点击上方按钮添加</div>
              </div>
            ) : (
              agentTables.map((t) => {
                const isSelected = t.id === (selectedTable?.id)
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTableId(t.id)}
                    style={{
                      padding: '9px 14px', margin: '0 8px 4px', borderRadius: 12,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      background: isSelected ? 'linear-gradient(135deg,rgba(193,122,255,.18),rgba(122,196,255,.14))' : 'transparent',
                      boxShadow: isSelected ? 'var(--sh-xs),var(--in-top)' : 'none',
                      transition: 'all .18s ease',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>📋</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '.82rem', color: isSelected ? 'var(--text-dark)' : 'var(--text-mid)' }} className="truncate">{t.name}</div>
                      <div className="text-soft" style={{ fontSize: '.68rem' }}>{t.fields?.length || 0} 字段</div>
                    </div>
                    <button
                      style={{ fontSize: 12, opacity: 0.4, cursor: 'pointer', background: 'none', border: 'none', lineHeight: 1 }}
                      onClick={(e) => { e.stopPropagation(); if (confirm(`移除对表 "${t.name}" 的追踪？（不会删除远程表）`)) { removeTable(t.id); if (selectedTable?.id === t.id) setSelectedTableId(null) } }}
                    >✕</button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Records panel */}
        <div className="clay-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {loadingRecords && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}

          {!selectedTable ? (
            <div className="empty-state" style={{ padding: '64px 24px', flex: 1 }}>
              <div className="empty-icon">👈</div>
              <div className="empty-title">选择一张表</div>
              <div className="empty-sub">从左侧点击一张表来查看和管理其数据</div>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="card-header">
                <div style={{ flex: 1 }}>
                  <h2>{selectedTable.name}</h2>
                  <div className="text-soft mt-4">{selectedTable.description} · <span className="code">{selectedTable.tableId}</span></div>
                </div>
                <div className="chip-row">
                  {displayFields.map((f) => (
                    <span key={f.name} className="chip">
                      <span>{f.name}</span>
                      <span className="badge badge-gray" style={{ fontSize: '.60rem', padding: '1px 5px' }}>{f.type}</span>
                      {f.unique && <span style={{ fontSize: 10 }}>🔑</span>}
                    </span>
                  ))}
                </div>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-10" style={{ padding: '12px 16px', borderBottom: '1.5px solid rgba(193,122,255,.08)' }}>
                <input
                  className="clay-input"
                  style={{ maxWidth: 240, padding: '8px 12px' }}
                  placeholder="🔍 关键词搜索…"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchRecords(selectedTable, 1, keyword) } }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => { setPage(1); fetchRecords(selectedTable, 1, keyword) }}>搜索</button>
                <div style={{ flex: 1 }} />
                <span className="text-soft">共 {totalCount} 条</span>
                <button className="btn btn-primary btn-sm" onClick={openAddRecord}>＋ 添加记录</button>
                <button className="btn-icon" onClick={() => fetchRecords(selectedTable, page, keyword)} title="刷新">🔄</button>
              </div>

              {/* Records table */}
              <div className="clay-table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
                {records.length === 0 && !loadingRecords ? (
                  <div className="empty-state" style={{ padding: '40px 24px' }}>
                    <div className="empty-icon">📭</div>
                    <div className="empty-title">暂无记录</div>
                  </div>
                ) : (
                  <table className="clay-table">
                    <thead>
                      <tr>
                        {displayFields.map((f) => <th key={f.name}>{f.name}{f.unique ? ' 🔑' : ''}</th>)}
                        <th style={{ textAlign: 'right' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((rec) => (
                        <tr key={rec.id}>
                          {displayFields.map((f) => (
                            <td key={f.name} className="truncate" style={{ maxWidth: 200 }}>
                              {rec.value?.[f.name] == null ? <span className="text-soft">—</span> :
                               typeof rec.value[f.name] === 'boolean' ? (rec.value[f.name] ? '✅' : '❌') :
                               String(rec.value[f.name])}
                            </td>
                          ))}
                          <td>
                            <div className="flex gap-6" style={{ justifyContent: 'flex-end' }}>
                              <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 12, borderRadius: 8 }} onClick={() => openEditRecord(rec)} title="编辑">✏️</button>
                              <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 12, borderRadius: 8 }} onClick={() => handleDeleteRecord(rec)} title="删除">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <button className="page-btn" disabled={page <= 1} onClick={() => { const p = page-1; setPage(p); fetchRecords(selectedTable, p, keyword) }}>‹</button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const p = i + 1
                    return <button key={p} className={`page-btn${page===p?' active':''}`} onClick={() => { setPage(p); fetchRecords(selectedTable, p, keyword) }}>{p}</button>
                  })}
                  {totalPages > 7 && <span className="text-soft">…{totalPages}</span>}
                  <button className="page-btn" disabled={page >= totalPages} onClick={() => { const p = page+1; setPage(p); fetchRecords(selectedTable, p, keyword) }}>›</button>
                  <span className="page-info">第 {page} / {totalPages} 页</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add table by ID modal */}
      <Modal open={showAddTable} onClose={() => setShowAddTable(false)} title="🔗 添加已有数据表" subtitle="输入表的 ID，系统将自动拉取表结构">
        <div className="form-group">
          <label className="form-label">Table ID</label>
          <input className="clay-input" placeholder="例：673e9c7a9f7bc178002dbce8" value={tableIdInput} onChange={(e) => setTableIdInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTableById()} />
          <p className="form-hint">在 GPTBots 数据表管理页面可以找到 Table ID</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowAddTable(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleAddTableById} disabled={loadingRecords}>
            {loadingRecords ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 获取中…</> : '添加表 →'}
          </button>
        </div>
      </Modal>

      {/* Create table modal */}
      <Modal open={showCreateTable} onClose={() => setShowCreateTable(false)} title="✨ 创建新数据表" wide>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">表名 * <span className="form-hint" style={{ display: 'inline' }}>(小写字母/数字/下划线)</span></label>
            <input className="clay-input" placeholder="my_table_name" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">描述 * <span className="form-hint" style={{ display: 'inline' }}>(帮助 LLM 理解数据)</span></label>
            <input className="clay-input" placeholder="描述这张表存储什么数据" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <div className="flex items-center justify-between mb-8">
            <label className="form-label" style={{ marginBottom: 0 }}>字段定义 *</label>
            <button className="btn btn-ghost btn-sm" onClick={fieldAddRow}>＋ 添加字段</button>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--r-md)', padding: 12, boxShadow: 'var(--in-groove)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 60px 60px 28px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid rgba(193,122,255,.12)', marginBottom: 8 }}>
              {['字段名', '描述', '类型', 'Required', 'Unique', ''].map((h) => (
                <div key={h} style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--text-soft)', letterSpacing: '.6px', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {createForm.fields.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 60px 60px 28px', gap: 8, marginBottom: 8 }}>
                <input className="clay-input" style={{ padding: '7px 10px', fontSize: '.82rem' }} placeholder="field_name" value={f.name} onChange={(e) => fieldUpdate(i, 'name', e.target.value)} />
                <input className="clay-input" style={{ padding: '7px 10px', fontSize: '.82rem' }} placeholder="字段描述" value={f.description} onChange={(e) => fieldUpdate(i, 'description', e.target.value)} />
                <select className="clay-select" style={{ padding: '7px 10px', fontSize: '.82rem' }} value={f.type} onChange={(e) => fieldUpdate(i, 'type', e.target.value)}>
                  {TYPE_OPTS.map((t) => <option key={t}>{t}</option>)}
                </select>
                <div className="flex items-center" style={{ justifyContent: 'center' }}>
                  <label className="toggle" title="Required">
                    <input type="checkbox" checked={f.required} onChange={(e) => fieldUpdate(i, 'required', e.target.checked)} />
                    <div className="toggle-track"></div>
                    <div className="toggle-thumb"></div>
                  </label>
                </div>
                <div className="flex items-center" style={{ justifyContent: 'center' }}>
                  <label className="toggle" title="Unique">
                    <input type="checkbox" checked={f.unique} onChange={(e) => fieldUpdate(i, 'unique', e.target.checked)} />
                    <div className="toggle-track"></div>
                    <div className="toggle-thumb"></div>
                  </label>
                </div>
                <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, borderRadius: 8, alignSelf: 'center' }} onClick={() => fieldRemoveRow(i)} disabled={createForm.fields.length <= 1}>✕</button>
              </div>
            ))}
          </div>
          <p className="form-hint mt-4">至少需要一个 Unique 字段作为主键</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => setShowCreateTable(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleCreateTable} disabled={savingRecord}>
            {savingRecord ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 创建中…</> : '创建数据表 →'}
          </button>
        </div>
      </Modal>

      {/* Add/Edit record modal */}
      {[showAddRecord, showEditRecord].map((open, idx) => (
        <Modal
          key={idx}
          open={open}
          onClose={() => idx === 0 ? setShowAddRecord(false) : setShowEditRecord(false)}
          title={idx === 0 ? '➕ 添加记录' : '✏️ 编辑记录'}
          subtitle={selectedTable?.name}
        >
          {displayFields.map((f) => (
            <div className="form-group" key={f.name}>
              <label className="form-label">
                {f.name}
                {f.required && <span style={{ color: 'var(--coral)', marginLeft: 3 }}>*</span>}
                <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: '.62rem' }}>{f.type}</span>
                {f.unique && <span style={{ marginLeft: 4, fontSize: '.7rem' }}>🔑</span>}
                {f.description && <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>{f.description}</span>}
              </label>
              {f.type === 'BOOLEAN' ? (
                <div className="toggle-wrap">
                  <label className="toggle">
                    <input type="checkbox" checked={!!recordForm[f.name]} onChange={(e) => setRecordForm((r) => ({ ...r, [f.name]: e.target.checked }))} />
                    <div className="toggle-track"></div>
                    <div className="toggle-thumb"></div>
                  </label>
                  <span className="text-soft">{recordForm[f.name] ? 'true' : 'false'}</span>
                </div>
              ) : (
                <input
                  className="clay-input"
                  type={f.type === 'INT' || f.type === 'FLOAT' ? 'number' : 'text'}
                  placeholder={f.type === 'DATETIME' ? 'YYYY-MM-DD HH:mm:ss' : `${f.type} 值`}
                  value={recordForm[f.name] ?? ''}
                  onChange={(e) => setRecordForm((r) => ({ ...r, [f.name]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => idx === 0 ? setShowAddRecord(false) : setShowEditRecord(false)}>取消</button>
            <button className="btn btn-primary" onClick={handleSaveRecord} disabled={savingRecord}>
              {savingRecord ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 保存中…</> : '保存 →'}
            </button>
          </div>
        </Modal>
      ))}
    </div>
  )
}
