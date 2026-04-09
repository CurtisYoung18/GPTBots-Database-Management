import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { sendAIMessage, buildSchemaPrompt, buildTableContext } from '../api/ai.js'
import * as gptbotsApi from '../api/gptbots.js'

// Welcome message shown for a new chat session
const makeWelcome = () => ({
  id: 'welcome',
  role: 'ai',
  type: 'message',
  message: `你好！我是你的 GPTBots 数据库 AI 助手 🤖

我可以帮你完成以下操作：
• 📝 **自然语言描述** → 设计并创建数据库表
• 📄 **上传 Mapping 文档**（JSON / Markdown / TXT）→ 自动解析建表
• ➕ **向已有表中添加数据**（只需告诉我表名和内容）
• ✏️ **更新 / 删除** 已有表中的记录
• ❓ 回答关于你的数据库结构的任何问题

**示例指令：**
\`帮我给 product_agent_mapping 表添加一条记录：product_name=jili, agent_id=agent01, chat_id=123456\`
\`删除 product_agent_mapping 表中 id 为 map_001 的记录\`
\`创建一个用户表，包含 id、姓名、邮箱字段\`

或者点击 📎 上传你的 Mapping 文档！`,
})

export default function Assistant() {
  const {
    agents, activeAgentId, tables,
    addTable, addSchema,
    settings,
    chats, setChatMessages, setChatHistory, clearChatSession,
    toast,
  } = useStore()

  const agent      = agents.find((a) => a.id === activeAgentId)
  const agentTables = tables.filter((t) => t.agentId === activeAgentId)

  // Chat key — one session per agent (fallback to '__no_agent__')
  const chatKey = activeAgentId || '__no_agent__'

  // Load persisted chat session or seed with welcome message
  const session  = chats[chatKey]
  const messages = session?.messages?.length ? session.messages : [makeWelcome()]
  const history  = session?.history  || []

  // Transient UI state (not persisted)
  const [loading,      setLoading]      = useState(false)
  const [input,        setInput]        = useState('')
  const [pendingPlan,  setPendingPlan]  = useState(null)
  const [executing,    setExecuting]    = useState(false)
  const [execProgress, setExecProgress] = useState([])

  const bottomRef  = useRef(null)
  const fileRef    = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, executing])

  // ── Store helpers ───────────────────────────────────────────────────────────
  const addMessage = (msg) => {
    setChatMessages(chatKey, [...messages, msg])
  }
  const updateHistory = (newHistory) => {
    setChatHistory(chatKey, newHistory)
  }

  // ── Send message ────────────────────────────────────────────────────────────
  const send = async (text) => {
    if (!text.trim()) return
    if (!settings.aiKey) { toast('请先在「设置」中配置 AI API Key', 'error'); return }

    const userMsg  = { id: Date.now(), role: 'user', type: 'message', message: text }
    const newMsgs  = [...messages, userMsg]
    const newHist  = [...history,  { role: 'user', content: text }]

    setChatMessages(chatKey, newMsgs)
    setChatHistory(chatKey, newHist)
    setInput('')
    setLoading(true)

    // Build table context so AI knows existing table IDs for CRUD ops
    const tableContext = buildTableContext(agentTables)

    try {
      const { raw, parsed } = await sendAIMessage(settings, newHist, tableContext)
      const aiEntry = { id: Date.now() + 1, role: 'ai', ...parsed, raw }

      const finalMsgs = [...newMsgs, aiEntry]
      const finalHist = [...newHist, { role: 'assistant', content: raw }]
      setChatMessages(chatKey, finalMsgs)
      setChatHistory(chatKey, finalHist)

      if (parsed.type === 'plan') {
        setPendingPlan({ ...parsed, msgId: aiEntry.id })
      }
    } catch (e) {
      toast(`AI 请求失败: ${e.message}`, 'error')
      const errMsg = { id: Date.now() + 1, role: 'ai', type: 'message', message: `❌ 请求失败: ${e.message}` }
      setChatMessages(chatKey, [...newMsgs, errMsg])
    } finally {
      setLoading(false)
    }
  }

  // Ask AI to re-emit its last response as a proper plan
  const reanalyze = () =>
    send('请将上面的回答严格按照 JSON plan 格式重新输出，包含 type、message、operations 字段，不要输出任何其他内容。')

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const text   = await file.text()
    const prompt = buildSchemaPrompt(text, file.name, agentTables)
    const preview = text.slice(0, 300) + (text.length > 300 ? '…（文件内容已发送给 AI）' : '')
    const userMsg = { id: Date.now(), role: 'user', type: 'message', message: `📎 已上传文件: **${file.name}**\n\n${preview}` }
    const newMsgs = [...messages, userMsg]
    const newHist = [...history, { role: 'user', content: prompt }]
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
    } finally {
      setLoading(false)
    }
  }

  // ── Execute confirmed plan ──────────────────────────────────────────────────
  const executePlan = async (plan) => {
    if (!agent) { toast('请先选择一个 Agent', 'error'); return }
    setExecuting(true)
    setPendingPlan(null)

    const ops        = plan.operations || []
    const statusList = ops.map((op, i) => ({ i, op, status: 'pending', result: null }))
    setExecProgress(statusList)

    const createdTableIds = []
    const newTables       = []

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]
      setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'running' } : r))

      try {
        let result = null

        if (op.op === 'create_table') {
          const res     = await gptbotsApi.createTable(agent, op.params)
          const tableId = res.data?.data || res.data?.tableId || res.data?.id
          createdTableIds.push(tableId)
          newTables.push({ tableId, name: op.params.name, description: op.params.description, fields: op.params.fields, agentId: activeAgentId })
          result = `表 "${op.params.name}" 创建成功 (ID: ${tableId})`

        } else if (op.op === 'add_records') {
          const res    = await gptbotsApi.importRecords(agent, { table_id: op.params.table_id, records: op.params.records })
          const taskId = res.data?.data
          if (taskId) {
            const job = await gptbotsApi.pollImport(agent, taskId)
            result = `成功添加 ${job?.success_count ?? '?'} 条记录${job?.fail_count ? `，失败 ${job.fail_count} 条` : ''}`
          } else {
            result = '添加请求已提交'
          }

        } else if (op.op === 'update_records') {
          const res = await gptbotsApi.updateRecords(agent, op.params)
          result = `更新完成：成功 ${res.data?.success_count ?? '?'} 条`

        } else if (op.op === 'delete_records') {
          await gptbotsApi.deleteRecords(agent, op.params)
          result = `删除完成`
        }

        setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'success', result } : r))
      } catch (e) {
        const errMsg = e.response?.data?.message || e.message
        setExecProgress((s) => s.map((r) => r.i === i ? { ...r, status: 'error', result: errMsg } : r))
      }
    }

    // Register newly created tables
    newTables.forEach((t) => addTable(t))

    // Archive to Schema versions
    const now        = Date.now()
    const versionNum = useStore.getState().schemas.filter((s) => s.agentId === activeAgentId).length + 1
    addSchema({
      name:      plan.message?.slice(0, 60) || 'AI 操作',
      version:   `v${versionNum}.0`,
      content:   JSON.stringify(plan, null, 2),
      agentId:   activeAgentId,
      tableIds:  createdTableIds,
      status:    'applied',
      appliedAt: now,
    })

    setExecuting(false)
    toast('操作执行完成', 'success')

    // Append result summary to chat
    const doneMsg = {
      id: Date.now(), role: 'ai', type: 'message',
      message: `✅ 所有操作执行完毕！\n${
        newTables.length > 0
          ? `新建的表已自动同步到「数据库浏览」页面。`
          : '数据已更新，可在「数据库浏览」页刷新查看。'
      }`,
    }
    setChatMessages(chatKey, [...(chats[chatKey]?.messages || messages), doneMsg])
  }

  const cancelPlan = () => {
    setPendingPlan(null)
    const cancelMsg = { id: Date.now(), role: 'ai', type: 'message', message: '已取消本次操作。如需调整，请继续描述你的需求 😊' }
    setChatMessages(chatKey, [...messages, cancelMsg])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  // ── Quick prompts for CRUD on existing tables ───────────────────────────────
  const quickCRUD = agentTables.slice(0, 3).flatMap((t) => [
    { label: `➕ 添加到 ${t.name}`, prompt: `我想向 ${t.name} 表（table_id: ${t.tableId}）添加一条新记录，请帮我生成操作计划，并告知需要哪些字段。` },
  ])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ padding: '18px 28px 14px', borderBottom: '1.5px solid rgba(193,122,255,.10)', flexShrink: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, letterSpacing: '-.4px' }}>🤖 AI 数据库助手</h1>
            <p className="text-soft mt-4">
              {agent ? `Agent: ${agent.name}` : '⚠️ 未选择 Agent（创建表时需要）'}
              {' · '}模型: <span className="code">{settings.aiModel}</span>
              {agentTables.length > 0 && (
                <span> · 已加载 <strong>{agentTables.length}</strong> 张表供 AI 参考</span>
              )}
            </p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { clearChatSession(chatKey); toast('对话已清空', 'info') }}
          >
            🗑️ 清空对话
          </button>
        </div>

        {/* Quick CRUD shortcuts for known tables */}
        {quickCRUD.length > 0 && (
          <div className="flex gap-8 mt-10" style={{ flexWrap: 'wrap' }}>
            {quickCRUD.map((q) => (
              <button
                key={q.label}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '.72rem', borderRadius: 'var(--r-xl)' }}
                onClick={() => send(q.prompt)}
                disabled={loading}
              >
                {q.label}
              </button>
            ))}
            {agentTables.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '.72rem', borderRadius: 'var(--r-xl)' }}
                onClick={() => send(`列出当前所有表的名称和字段结构，并说明如何向每张表添加数据`)}
                disabled={loading}
              >
                📋 查看所有表结构
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        className="chat-messages"
        style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble-wrap${msg.role === 'user' ? ' user' : ''}`}>
            <div
              className="chat-avatar"
              style={{
                background: msg.role === 'ai'
                  ? 'linear-gradient(135deg,var(--lilac),var(--sky))'
                  : 'linear-gradient(135deg,var(--coral),var(--lemon))',
              }}
            >
              {msg.role === 'ai' ? '🤖' : '👤'}
            </div>

            <div style={{ maxWidth: '72%' }}>
              {msg.type === 'plan' ? (
                <PlanCard
                  msg={msg}
                  isPending={pendingPlan?.msgId === msg.id && !executing}
                  onConfirm={() => executePlan(msg)}
                  onCancel={cancelPlan}
                />
              ) : (
                <div>
                  <div className={`chat-bubble ${msg.role}`}>
                    <MessageContent text={msg.message} />
                  </div>
                  {msg.role === 'ai' && !loading && !executing && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '.70rem', padding: '4px 9px' }}
                        onClick={reanalyze}
                        title="让 AI 重新以操作计划格式输出"
                      >
                        🔄 重新分析为操作计划
                      </button>
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
            <div className="chat-avatar" style={{ background: 'linear-gradient(135deg,var(--lilac),var(--sky))' }}>🤖</div>
            <div className="op-plan" style={{ maxWidth: '72%' }}>
              <div className="op-plan-header">⚙️ 正在执行操作…</div>
              <div className="op-plan-body">
                {execProgress.map((r) => (
                  <div className="op-item" key={r.i}>
                    <div className="op-item-icon">
                      {r.status === 'pending' ? '⏳' : r.status === 'running' ? <div className="spinner" /> : r.status === 'success' ? '✅' : '❌'}
                    </div>
                    <div className="op-item-content">
                      <div className="op-item-label">{r.op.label || r.op.op}</div>
                      {r.result && (
                        <div className="op-item-detail" style={{ color: r.status === 'error' ? 'var(--coral)' : undefined }}>
                          {r.result}
                        </div>
                      )}
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
            <div className="chat-avatar" style={{ background: 'linear-gradient(135deg,var(--lilac),var(--sky))' }}>🤖</div>
            <div className="chat-bubble ai flex items-center gap-8">
              <div className="spinner" />
              <span className="text-soft">AI 思考中…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="chat-input-wrap">
        <input type="file" ref={fileRef} accept=".json,.md,.txt,.csv,.yaml,.yml" style={{ display: 'none' }} onChange={handleFileUpload} />
        <button className="btn-icon" onClick={() => fileRef.current?.click()} title="上传 Mapping / Schema 文件" style={{ flexShrink: 0 }}>
          📎
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder="描述需要的操作，或问任何问题… (Enter 发送，Shift+Enter 换行)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{ resize: 'none' }}
        />
        <button
          className="btn btn-primary"
          style={{ flexShrink: 0 }}
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
        >
          {loading
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,.3)', borderTopColor: '#fff' }} />
            : '发送 ↑'}
        </button>
      </div>
    </div>
  )
}

// ── Operation plan confirmation card ─────────────────────────────────────────
function PlanCard({ msg, isPending, onConfirm, onCancel }) {
  const opIcon = { create_table: '🏗️', add_records: '➕', update_records: '✏️', delete_records: '🗑️' }
  return (
    <div className="op-plan">
      <div className="op-plan-header">🏗️ AI 操作计划 — 请确认后执行</div>
      <div style={{ padding: '12px 16px 6px' }}>
        <p style={{ fontSize: '.86rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: 12, lineHeight: 1.55 }}>
          {msg.message}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(msg.operations || []).map((op, i) => (
            <div className="op-item" key={i}>
              <div className="op-item-icon">{opIcon[op.op] || '⚙️'}</div>
              <div className="op-item-content">
                <div className="op-item-label">{op.label || op.op}</div>
                {op.op === 'create_table' && op.params?.fields && (
                  <div className="op-item-detail">
                    {op.params.fields.length} 字段: {op.params.fields.map((f) => `${f.name}(${f.type}${f.unique ? ' 🔑' : ''})`).join(' · ')}
                  </div>
                )}
                {op.op === 'add_records' && (
                  <div className="op-item-detail">
                    {op.params?.records?.length || 0} 条记录 → 表 <span className="code">{op.params?.table_id}</span>
                  </div>
                )}
                {op.op === 'update_records' && (
                  <div className="op-item-detail">
                    {op.params?.update_data?.length || 0} 条更新 → 表 <span className="code">{op.params?.table_id}</span>
                  </div>
                )}
                {op.op === 'delete_records' && (
                  <div className="op-item-detail">
                    {op.params?.delete_data?.length || 0} 条删除 → 表 <span className="code">{op.params?.table_id}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {msg.warnings?.length > 0 && (
        <div className="op-plan-warn">⚠️ {msg.warnings.join(' · ')}</div>
      )}
      {isPending && (
        <div className="op-plan-footer">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm}>✅ 确认执行 →</button>
        </div>
      )}
    </div>
  )
}

// ── Simple markdown renderer for chat messages ────────────────────────────────
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
        return (
          <div key={i} style={{ marginBottom: line === '' ? 6 : 2 }}
            dangerouslySetInnerHTML={{ __html: boldify(codeify(line)) }} />
        )
      })}
    </div>
  )
}

const boldify  = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
const codeify  = (s) => s.replace(/`([^`]+)`/g,
  '<code style="background:rgba(193,122,255,.12);padding:1px 5px;border-radius:4px;font-size:.85em;font-family:monospace">$1</code>')
