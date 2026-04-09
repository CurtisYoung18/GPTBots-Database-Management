import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, User, Paperclip, Trash2, Send, RotateCcw,
  Hammer, Plus, Pencil, Check, X, AlertTriangle,
  Loader2, TableProperties, Clock, KeyRound,
} from 'lucide-react'
import { useStore } from '../store/index.js'
import { sendAIMessage, buildSchemaPrompt, buildTableContext } from '../api/ai.js'
import * as gptbotsApi from '../api/gptbots.js'

const makeWelcome = () => ({
  id: 'welcome',
  role: 'ai',
  type: 'message',
  message: `你好！我是你的 GPTBots 数据库 AI 助手

我可以帮你完成以下操作：
• **自然语言描述** → 设计并创建数据库表
• **上传 Mapping 文档**（JSON / Markdown / TXT）→ 自动解析建表
• **向已有表中添加数据**（只需告诉我表名和内容）
• **更新 / 删除** 已有表中的记录
• 回答关于你的数据库结构的任何问题

**示例指令：**
\`帮我给 product_agent_mapping 表添加一条记录：product_name=jili, agent_id=agent01, chat_id=123456\`
\`删除 product_agent_mapping 表中 id 为 map_001 的记录\`
\`创建一个用户表，包含 id、姓名、邮箱字段\`

或者点击附件图标上传你的 Mapping 文档！`,
})

export default function Assistant() {
  const {
    agents, activeAgentId, tables,
    addTable, addSchema,
    settings,
    chats, setChatMessages, setChatHistory, clearChatSession,
    toast,
  } = useStore()

  const agent       = agents.find((a) => a.id === activeAgentId)
  const agentTables = tables.filter((t) => t.agentId === activeAgentId)
  const chatKey     = activeAgentId || '__no_agent__'

  const session  = chats[chatKey]
  const messages = session?.messages?.length ? session.messages : [makeWelcome()]
  const history  = session?.history  || []

  const [loading,      setLoading]      = useState(false)
  const [input,        setInput]        = useState('')
  const [pendingPlan,  setPendingPlan]  = useState(null)
  const [executing,    setExecuting]    = useState(false)
  const [execProgress, setExecProgress] = useState([])

  const bottomRef   = useRef(null)
  const fileRef     = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, executing])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  useEffect(() => { resizeTextarea() }, [input, resizeTextarea])

  const addMessage = (msg) => setChatMessages(chatKey, [...messages, msg])
  const updateHistory = (h) => setChatHistory(chatKey, h)

  const send = async (text) => {
    if (!text.trim()) return
    if (!settings.aiKey) { toast('请先在「设置」中配置 AI API Key', 'error'); return }

    const userMsg = { id: Date.now(), role: 'user', type: 'message', message: text }
    const newMsgs = [...messages, userMsg]
    const newHist = [...history,  { role: 'user', content: text }]

    setChatMessages(chatKey, newMsgs)
    setChatHistory(chatKey, newHist)
    setInput('')
    setLoading(true)

    const tableContext = buildTableContext(agentTables)
    try {
      const { raw, parsed } = await sendAIMessage(settings, newHist, tableContext)
      const aiEntry = { id: Date.now() + 1, role: 'ai', ...parsed, raw }
      const finalMsgs = [...newMsgs, aiEntry]
      const finalHist = [...newHist, { role: 'assistant', content: raw }]
      setChatMessages(chatKey, finalMsgs)
      setChatHistory(chatKey, finalHist)
      if (parsed.type === 'plan') setPendingPlan({ ...parsed, msgId: aiEntry.id })
    } catch (e) {
      toast(`AI 请求失败: ${e.message}`, 'error')
      const errMsg = { id: Date.now() + 1, role: 'ai', type: 'message', message: `请求失败: ${e.message}` }
      setChatMessages(chatKey, [...newMsgs, errMsg])
    } finally { setLoading(false) }
  }

  const reanalyze = () =>
    send('请将上面的回答严格按照 JSON plan 格式重新输出，包含 type、message、operations 字段，不要输出任何其他内容。')

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text    = await file.text()
    const prompt  = buildSchemaPrompt(text, file.name, agentTables)
    const preview = text.slice(0, 300) + (text.length > 300 ? '…（文件内容已发送给 AI）' : '')
    const userMsg = { id: Date.now(), role: 'user', type: 'message', message: `已上传文件: **${file.name}**\n\n${preview}` }
    const newMsgs = [...messages, userMsg]
    const newHist = [...history, { role: 'user', content: prompt }]
    setChatMessages(chatKey, newMsgs)
    setChatHistory(chatKey, newHist)
    setLoading(true)
    const tableContext = buildTableContext(agentTables)
    try {
      const { raw, parsed } = await sendAIMessage(settings, newHist, tableContext)
      const aiEntry = { id: Date.now() + 1, role: 'ai', ...parsed, raw }
      setChatMessages(chatKey, [...newMsgs, aiEntry])
      setChatHistory(chatKey, [...newHist, { role: 'assistant', content: raw }])
      if (parsed.type === 'plan') setPendingPlan({ ...parsed, msgId: aiEntry.id })
    } catch (e) {
      toast(`AI 请求失败: ${e.message}`, 'error')
    } finally { setLoading(false) }
  }

  const executePlan = async (plan) => {
    if (!agent) { toast('请先选择一个 Agent', 'error'); return }
    setExecuting(true)
    setPendingPlan(null)

    const ops        = plan.operations || []
    const statusList = ops.map((op, i) => ({ i, op, status: 'pending', result: null }))
    setExecProgress(statusList)

    const createdTableIds = []
    const newTables       = []

    // Maps table name → real GPTBots tableId for tables created THIS plan run
    // Also seed from known agentTables so CRUD on existing tables works
    const nameToId = {}
    agentTables.forEach((t) => { if (t.name) nameToId[t.name] = t.tableId })

    // Resolve "product_agent_mapping" → real tableId (hex).
    // Priority: 1) just-created in this run  2) known agentTables  3) treat as literal ID
    const resolveTableId = (nameOrId) => {
      if (!nameOrId || nameOrId === 'undefined' || nameOrId === 'null') return null
      return nameToId[nameOrId] ?? nameOrId
    }

    // Validate it looks like a 24-char MongoDB ObjectId hex (GPTBots table IDs)
    const isValidTableId = (id) => /^[a-f0-9]{24}$/i.test(String(id ?? ''))

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]
      setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'running' } : r))
      try {
        let result = null
        if (op.op === 'create_table') {
          const res     = await gptbotsApi.createTable(agent, op.params)
          const tableId = res.data?.data || res.data?.tableId || res.data?.id
          if (!tableId) throw new Error('API 未返回 table_id，创建可能失败')
          createdTableIds.push(tableId)
          newTables.push({ tableId, name: op.params.name, description: op.params.description, fields: op.params.fields, agentId: activeAgentId })
          // Register so subsequent add_records in this same plan can reference by name
          nameToId[op.params.name] = tableId
          result = `表 "${op.params.name}" 创建成功 (ID: ${tableId})`

        } else if (op.op === 'add_records') {
          const tableId = resolveTableId(op.params.table_id)
          if (!tableId) throw new Error(`缺少 table_id。请先在「数据库浏览」页把该表添加到追踪列表，然后重试。`)
          if (!isValidTableId(tableId)) throw new Error(`table_id "${tableId}" 不是有效的 GPTBots 表 ID（应为 24 位十六进制）。请在「数据库浏览」页添加该表后重试。`)
          const res    = await gptbotsApi.importRecords(agent, { table_id: tableId, records: op.params.records })
          const taskId = res.data?.data
          if (!taskId) throw new Error('API 未返回任务 ID，请求可能失败')
          const job = await gptbotsApi.pollImport(agent, taskId)
          if (!job) throw new Error('导入任务超时，未能获取结果')
          if (job.status === 'FAIL') {
            const reason = job.fail_detail?.[0]?.fail_reason || '未知原因'
            throw new Error(`导入失败: ${reason}`)
          }
          result = `成功添加 ${job.success_count ?? '?'} 条记录${job.fail_count ? `，失败 ${job.fail_count} 条` : ''}`

        } else if (op.op === 'update_records') {
          const tableId = resolveTableId(op.params.table_id)
          if (!tableId || !isValidTableId(tableId)) throw new Error(`table_id "${op.params.table_id}" 无效，请先在「数据库浏览」添加该表。`)
          const res = await gptbotsApi.updateRecords(agent, { ...op.params, table_id: tableId })
          result = `更新完成：成功 ${res.data?.success_count ?? '?'} 条`

        } else if (op.op === 'delete_records') {
          const tableId = resolveTableId(op.params.table_id)
          if (!tableId || !isValidTableId(tableId)) throw new Error(`table_id "${op.params.table_id}" 无效，请先在「数据库浏览」添加该表。`)
          await gptbotsApi.deleteRecords(agent, { ...op.params, table_id: tableId })
          result = '删除完成'

        } else {
          throw new Error(`不支持的操作类型 "${op.op}"，已跳过`)
        }
        setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'success', result } : r))
      } catch (e) {
        const errMsg = e.response?.data?.message || e.message
        setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'error', result: errMsg } : r))
      }
    }

    newTables.forEach((t) => addTable(t))
    const versionNum = useStore.getState().schemas.filter((s) => s.agentId === activeAgentId).length + 1
    addSchema({ name: plan.message?.slice(0, 60) || 'AI 操作', version: `v${versionNum}.0`, content: JSON.stringify(plan, null, 2), agentId: activeAgentId, tableIds: createdTableIds, status: 'applied', appliedAt: Date.now() })
    setExecuting(false)
    toast('操作执行完成', 'success')
    const doneMsg = { id: Date.now(), role: 'ai', type: 'message', message: `所有操作执行完毕！\n${newTables.length > 0 ? '新建的表已自动同步到「数据库浏览」页面。' : '数据已更新，可在「数据库浏览」页刷新查看。'}` }
    setChatMessages(chatKey, [...(chats[chatKey]?.messages || messages), doneMsg])
  }

  const cancelPlan = () => {
    setPendingPlan(null)
    setChatMessages(chatKey, [...messages, { id: Date.now(), role: 'ai', type: 'message', message: '已取消本次操作。如需调整，请继续描述你的需求。' }])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const quickCRUD = agentTables.slice(0, 3).map((t) => ({
    label: `添加到 ${t.name}`,
    prompt: `我想向 ${t.name} 表（table_id: ${t.tableId}）添加一条新记录，请帮我生成操作计划，并告知需要哪些字段。`,
  }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ padding: '18px 28px 14px', borderBottom: '1.5px solid rgba(193,122,255,.10)', flexShrink: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-8" style={{ fontSize: '1.45rem', fontWeight: 900, letterSpacing: '-.4px' }}>
              <Bot size={22} /> AI 数据库助手
            </h1>
            <p className="text-soft mt-4">
              {agent ? `Agent: ${agent.name}` : '未选择 Agent（创建表时需要）'}
              {' · '}模型: <span className="code">{settings.aiModel}</span>
              {agentTables.length > 0
                ? <span> · 已加载 <strong>{agentTables.length}</strong> 张表</span>
                : <span style={{ color: 'var(--coral)', fontWeight: 700 }}> · ⚠ 暂无追踪表（数据操作需先在「数据库浏览」添加表）</span>}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { clearChatSession(chatKey); toast('对话已清空', 'info') }}>
            <Trash2 size={13} /> 清空对话
          </button>
        </div>

        {quickCRUD.length > 0 && (
          <div className="flex gap-8 mt-10" style={{ flexWrap: 'wrap' }}>
            {quickCRUD.map((q) => (
              <button key={q.label} className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem', borderRadius: 'var(--r-xl)' }}
                onClick={() => send(q.prompt)} disabled={loading}>
                <Plus size={11} /> {q.label}
              </button>
            ))}
            {agentTables.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem', borderRadius: 'var(--r-xl)' }}
                onClick={() => send('列出当前所有表的名称和字段结构，并说明如何向每张表添加数据')} disabled={loading}>
                <TableProperties size={11} /> 查看所有表结构
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble-wrap${msg.role === 'user' ? ' user' : ''}`}>
            <div className="chat-avatar" style={{ background: msg.role === 'ai' ? 'linear-gradient(135deg,var(--lilac),var(--sky))' : 'linear-gradient(135deg,var(--coral),var(--lemon))' }}>
              {msg.role === 'ai' ? <Bot size={16} color="#fff" /> : <User size={16} color="#fff" />}
            </div>

            <div style={{ maxWidth: '72%' }}>
              {msg.type === 'plan' ? (
                <PlanCard
                  msg={msg}
                  isPending={pendingPlan?.msgId === msg.id && !executing}
                  onConfirm={() => executePlan(msg)}
                  onCancel={cancelPlan}
                  agentTables={agentTables}
                />
              ) : (
                <div>
                  <div className={`chat-bubble ${msg.role}`}>
                    <MessageContent text={msg.message} />
                  </div>
                  {msg.role === 'ai' && !loading && !executing && (
                    <div className="flex gap-6 mt-6" style={{ flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: '.70rem', padding: '4px 9px' }}
                        onClick={reanalyze} title="让 AI 重新以操作计划格式输出">
                        <RotateCcw size={11} /> 重新分析为操作计划
                      </button>
                      {msg.raw && (
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '.70rem', padding: '4px 9px' }}
                          onClick={() => {
                            const el = document.getElementById(`raw-${msg.id}`)
                            if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'
                          }}>
                          查看原始响应
                        </button>
                      )}
                    </div>
                  )}
                  {msg.raw && (
                    <div id={`raw-${msg.id}`} style={{ display: 'none', marginTop: 6, background: 'var(--surface2)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--in-groove)', maxHeight: 160, overflowY: 'auto' }}>
                      <pre style={{ fontSize: '.68rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text-mid)' }}>{msg.raw}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Execution progress */}
        {executing && execProgress.length > 0 && (
          <div className="chat-bubble-wrap">
            <div className="chat-avatar" style={{ background: 'linear-gradient(135deg,var(--lilac),var(--sky))' }}><Bot size={16} color="#fff" /></div>
            <div className="op-plan" style={{ maxWidth: '72%' }}>
              <div className="op-plan-header"><Hammer size={14} /> 正在执行操作…</div>
              <div className="op-plan-body">
                {execProgress.map((r) => (
                  <div className="op-item" key={r.i}>
                    <div className="op-item-icon">
                      {r.status === 'pending'
                        ? <Clock size={14} color="var(--text-soft)" />
                        : r.status === 'running'
                          ? <Loader2 size={14} color="var(--lilac)" style={{ animation: 'spin .7s linear infinite' }} />
                          : r.status === 'success'
                            ? <Check size={14} color="#1B8A5E" />
                            : <X size={14} color="var(--coral)" />}
                    </div>
                    <div className="op-item-content">
                      <div className="op-item-label">{r.op.label || r.op.op}</div>
                      {r.result && <div className="op-item-detail" style={{ color: r.status === 'error' ? 'var(--coral)' : undefined }}>{r.result}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="chat-bubble-wrap">
            <div className="chat-avatar" style={{ background: 'linear-gradient(135deg,var(--lilac),var(--sky))' }}><Bot size={16} color="#fff" /></div>
            <div className="chat-bubble ai flex items-center gap-8">
              <Loader2 size={14} color="var(--lilac)" style={{ animation: 'spin .7s linear infinite' }} />
              <span className="text-soft">AI 思考中…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="chat-input-wrap">
        <input type="file" ref={fileRef} accept=".json,.md,.txt,.csv,.yaml,.yml" style={{ display: 'none' }} onChange={handleFileUpload} />
        <button className="btn-icon" onClick={() => fileRef.current?.click()} title="上传 Mapping / Schema 文件" style={{ flexShrink: 0 }}>
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="描述需要的操作，或问任何问题… (Enter 发送，Shift+Enter 换行)"
          value={input}
          onChange={(e) => { setInput(e.target.value); resizeTextarea() }}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{ resize: 'none', overflowY: 'auto', maxHeight: 200, minHeight: 44 }}
        />
        <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => send(input)} disabled={loading || !input.trim()}>
          {loading
            ? <Loader2 size={16} style={{ animation: 'spin .7s linear infinite' }} />
            : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}

// Operation plan card
function PlanCard({ msg, isPending, onConfirm, onCancel, agentTables = [] }) {
  const [expanded, setExpanded] = useState({})
  const toggle = (i) => setExpanded((s) => ({ ...s, [i]: !s[i] }))

  // Resolve table name → real ID using known tables
  const resolveDisplay = (nameOrId) => {
    if (!nameOrId || nameOrId === 'undefined' || nameOrId === 'null')
      return <span style={{ color: 'var(--coral)', fontWeight: 700 }}>⚠ 未指定（请先在「数据库浏览」添加此表）</span>
    const known = agentTables.find((t) => t.name === nameOrId || t.tableId === nameOrId)
    if (known) return <><span className="code">{known.name}</span><span className="text-soft" style={{ fontSize: '.70rem', marginLeft: 4 }}>({known.tableId})</span></>
    // Not in local tracking — show name with warning
    return (
      <span>
        <span className="code">{nameOrId}</span>
        <span style={{ color: 'var(--coral)', fontSize: '.70rem', marginLeft: 4, fontWeight: 700 }}>
          ⚠ 未在追踪列表（执行前请先到「数据库浏览」添加）
        </span>
      </span>
    )
  }

  const opIcon = {
    create_table:   <Hammer size={14} />,
    add_records:    <Plus size={14} />,
    update_records: <Pencil size={14} />,
    delete_records: <Trash2 size={14} />,
  }

  return (
    <div className="op-plan">
      <div className="op-plan-header"><Hammer size={14} /> AI 操作计划 — 请确认后执行</div>
      <div style={{ padding: '12px 16px 6px' }}>
        <p style={{ fontSize: '.86rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: 12, lineHeight: 1.55 }}>{msg.message}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(msg.operations || []).map((op, i) => (
            <div key={i} style={{ background: 'rgba(193,122,255,.06)', borderRadius: 10, border: '1px solid rgba(193,122,255,.12)', overflow: 'hidden' }}>
              {/* Op header */}
              <div className="op-item" style={{ padding: '8px 12px', cursor: op.op !== 'create_table' ? 'pointer' : 'default' }}
                onClick={() => (op.op !== 'create_table') && toggle(i)}>
                <div className="op-item-icon">{opIcon[op.op] || <AlertTriangle size={14} />}</div>
                <div className="op-item-content" style={{ flex: 1 }}>
                  <div className="op-item-label">{op.label || op.op}</div>
                  {op.op === 'create_table' && op.params?.fields && (
                    <div className="op-item-detail">
                      {op.params.fields.length} 字段: {op.params.fields.map((f) => `${f.name}(${f.type}${f.unique ? ' key' : ''})`).join(' · ')}
                    </div>
                  )}
                  {op.op === 'add_records' && (
                    <div className="op-item-detail">
                      {op.params?.records?.length || 0} 条记录 → 表 {resolveDisplay(op.params?.table_id)}
                    </div>
                  )}
                  {op.op === 'update_records' && (
                    <div className="op-item-detail">{op.params?.update_data?.length || 0} 条更新 → 表 {resolveDisplay(op.params?.table_id)}</div>
                  )}
                  {op.op === 'delete_records' && (
                    <div className="op-item-detail">{op.params?.delete_data?.length || 0} 条删除 → 表 {resolveDisplay(op.params?.table_id)}</div>
                  )}
                </div>
                {/* Expand toggle for record ops */}
                {op.op !== 'create_table' && (op.params?.records || op.params?.update_data || op.params?.delete_data) && (
                  <span style={{ fontSize: '.70rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                    {expanded[i] ? '收起 ▲' : '展开 ▼'}
                  </span>
                )}
              </div>

              {/* Expandable record preview */}
              {expanded[i] && (
                <div style={{ borderTop: '1px solid rgba(193,122,255,.12)', padding: '8px 12px', maxHeight: 240, overflowY: 'auto' }}>
                  <RecordPreview op={op} />
                </div>
              )}

              {/* For create_table: show full field table */}
              {op.op === 'create_table' && op.params?.fields && (
                <div style={{ borderTop: '1px solid rgba(193,122,255,.12)', padding: '8px 12px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '.74rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-soft)', textAlign: 'left' }}>
                        {['字段名', '类型', '必填', '唯一', '描述'].map((h) => (
                          <th key={h} style={{ padding: '3px 8px', fontWeight: 800, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {op.params.fields.map((f, fi) => (
                        <tr key={fi} style={{ borderTop: '1px solid rgba(193,122,255,.08)' }}>
                          <td style={{ padding: '4px 8px', fontWeight: 800 }}>{f.name}{f.unique && <KeyRound size={10} style={{ display: 'inline', marginLeft: 3 }} color="var(--lilac)" />}</td>
                          <td style={{ padding: '4px 8px' }}><span className="badge badge-gray" style={{ fontSize: '.62rem' }}>{f.type}</span></td>
                          <td style={{ padding: '4px 8px' }}>{f.required ? <Check size={12} color="#1B8A5E" /> : <span style={{ color: 'var(--text-soft)' }}>—</span>}</td>
                          <td style={{ padding: '4px 8px' }}>{f.unique  ? <Check size={12} color="var(--lilac)" /> : <span style={{ color: 'var(--text-soft)' }}>—</span>}</td>
                          <td style={{ padding: '4px 8px', color: 'var(--text-soft)' }}>{f.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {msg.warnings?.length > 0 && (
        <div className="op-plan-warn"><AlertTriangle size={13} /> {msg.warnings.join(' · ')}</div>
      )}
      {isPending && (
        <div className="op-plan-footer">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><X size={13} /> 取消</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm}><Check size={13} /> 确认执行</button>
        </div>
      )}
    </div>
  )
}

// Record data preview inside PlanCard
function RecordPreview({ op }) {
  if (op.op === 'add_records') {
    const records = op.params?.records || []
    if (records.length === 0) return <div className="text-soft">无记录数据</div>
    const keys = Object.keys(records[0])
    return (
      <table style={{ width: '100%', fontSize: '.72rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-soft)' }}>
            {keys.map((k) => <th key={k} style={{ padding: '2px 6px', fontWeight: 800, textAlign: 'left', fontSize: '.65rem', textTransform: 'uppercase' }}>{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {records.map((rec, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid rgba(193,122,255,.08)' }}>
              {keys.map((k) => (
                <td key={k} style={{ padding: '3px 6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rec[k] == null || rec[k] === '' ? <span style={{ color: 'var(--text-soft)' }}>—</span> : String(rec[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (op.op === 'update_records') {
    const rows = op.params?.update_data || []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ fontSize: '.72rem' }}>
            <span className="code">{r.record_id}</span>
            <span style={{ color: 'var(--text-soft)', marginLeft: 6 }}>→</span>
            {Object.entries(r.updated_fields || {}).map(([k, v]) => (
              <span key={k} style={{ marginLeft: 6 }}><strong>{k}</strong>: {String(v)}</span>
            ))}
          </div>
        ))}
      </div>
    )
  }
  if (op.op === 'delete_records') {
    const rows = op.params?.delete_data || []
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {rows.map((r, ri) => <span key={ri} className="code" style={{ fontSize: '.72rem' }}>{r.record_id}</span>)}
      </div>
    )
  }
  return null
}

function MessageContent({ text }) {
  return (
    <div>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
              <span>•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(codeify(line.slice(2))) }} />
            </div>
          )
        }
        return <div key={i} style={{ marginBottom: line === '' ? 6 : 2 }} dangerouslySetInnerHTML={{ __html: boldify(codeify(line)) }} />
      })}
    </div>
  )
}

const boldify = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
const codeify  = (s) => s.replace(/`([^`]+)`/g, '<code style="background:rgba(193,122,255,.12);padding:1px 5px;border-radius:4px;font-size:.85em;font-family:monospace">$1</code>')
