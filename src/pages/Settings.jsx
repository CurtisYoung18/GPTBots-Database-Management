import { useState } from 'react'
import { Settings as SettingsIcon, Bot, ClipboardList, HardDrive, Eye, EyeOff, Plug, Save, Trash2 } from 'lucide-react'
import { useStore } from '../store/index.js'

const PRESETS = [
  { name: 'MiniMax M2.5',           url: 'https://api.minimaxi.com/v1/chat/completions', model: 'MiniMax-M2.5' },
  { name: 'MiniMax M2.5-highspeed', url: 'https://api.minimaxi.com/v1/chat/completions', model: 'MiniMax-M2.5-highspeed' },
  { name: 'MiniMax M2.7',           url: 'https://api.minimaxi.com/v1/chat/completions', model: 'MiniMax-M2.7' },
  { name: 'OpenAI GPT-4o',          url: 'https://api.openai.com/v1/chat/completions',   model: 'gpt-4o' },
  { name: 'SiliconFlow',            url: 'https://api.siliconflow.cn/v1/chat/completions', model: 'Pro/deepseek-ai/DeepSeek-V3' },
]

export default function Settings() {
  const { settings, updateSettings, toast } = useStore()
  const [form,    setForm]    = useState({ ...settings })
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const handleSave = () => { updateSettings(form); toast('设置已保存', 'success') }

  const testAI = async () => {
    if (!form.aiKey || !form.aiUrl || !form.aiModel) { toast('请填写完整的 AI 配置', 'error'); return }
    setTesting(true)
    try {
      const res  = await fetch('/proxy/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: form.aiUrl, apiKey: form.aiKey, model: form.aiModel, messages: [{ role: 'user', content: '回复"连接成功"四个字' }] }) })
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (content) toast(`AI 连接成功: "${content}"`, 'success')
      else toast(`连接成功但响应格式异常: ${JSON.stringify(data).slice(0, 80)}`, 'warning')
    } catch (e) { toast(`连接失败: ${e.message}`, 'error') }
    finally { setTesting(false) }
  }

  return (
    <div style={{ padding: '28px 28px 48px', maxWidth: 680 }}>
      <div className="mb-16">
        <h1 style={{ fontSize: '1.55rem', fontWeight: 900, letterSpacing: '-.4px' }}>设置</h1>
        <p className="text-soft mt-4">AI 模型配置与应用偏好</p>
      </div>

      {/* AI Config */}
      <div className="clay-card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2 className="flex items-center gap-8"><Bot size={16} /> AI 模型配置</h2>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">快速选择预设</label>
            <div className="chip-row">
              {PRESETS.map((p) => (
                <button key={p.name} className="btn btn-ghost btn-sm" style={{ borderRadius: 'var(--r-xl)' }}
                  onClick={() => setForm((f) => ({ ...f, aiUrl: p.url, aiModel: p.model }))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">API Endpoint URL</label>
            <input className="clay-input" placeholder="https://api.minimaxi.com/v1/chat/completions" value={form.aiUrl} onChange={(e) => setForm((f) => ({ ...f, aiUrl: e.target.value }))} />
            <p className="form-hint">必须是 OpenAI Chat Completions 兼容格式</p>
          </div>
          <div className="form-group">
            <label className="form-label">模型名称</label>
            <input className="clay-input" placeholder="MiniMax-M2.5" value={form.aiModel} onChange={(e) => setForm((f) => ({ ...f, aiModel: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">API Key</label>
            <div className="flex gap-8">
              <input className="clay-input" type={showKey ? 'text' : 'password'} placeholder="sk-..." value={form.aiKey}
                onChange={(e) => setForm((f) => ({ ...f, aiKey: e.target.value }))} style={{ flex: 1 }} />
              <button className="btn-icon" onClick={() => setShowKey((s) => !s)} title={showKey ? '隐藏' : '显示'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="form-hint">API Key 仅存储在本地文件，不会发送到任何第三方服务器</p>
          </div>
          <div className="flex gap-10">
            <button className="btn btn-ghost" onClick={testAI} disabled={testing}>
              {testing ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> 测试中…</> : <><Plug size={14} /> 测试连接</>}
            </button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={14} /> 保存设置</button>
          </div>
        </div>
      </div>

      {/* Current config */}
      <div className="clay-card">
        <div className="card-header"><h2 className="flex items-center gap-8"><ClipboardList size={16} /> 当前配置摘要</h2></div>
        <div className="card-body">
          {[
            ['API URL', settings.aiUrl],
            ['模型',    settings.aiModel],
            ['Key',     settings.aiKey ? settings.aiKey.slice(0, 8) + '••••' : '（未配置）'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center gap-12" style={{ padding: '8px 0', borderBottom: '1px solid rgba(193,122,255,.08)' }}>
              <span style={{ fontWeight: 800, fontSize: '.80rem', color: 'var(--text-soft)', width: 60, flexShrink: 0 }}>{k}</span>
              <span className="code" style={{ fontSize: '.78rem', wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data management */}
      <div className="clay-card" style={{ marginTop: 20 }}>
        <div className="card-header"><h2 className="flex items-center gap-8"><HardDrive size={16} /> 数据管理</h2></div>
        <div className="card-body">
          <p className="text-soft mb-12">所有数据（Agent Keys、表信息、Schema 版本）均存储在项目 data/ 目录中。</p>
          <button className="btn btn-danger btn-sm" onClick={() => {
            if (confirm('确定清除所有本地数据？\n这会删除所有 Agent、数据表记录和 Schema 归档，且不可恢复！')) {
              fetch('/proxy/storage/gptbots-db-store', { method: 'DELETE' }).then(() => window.location.reload())
            }
          }}>
            <Trash2 size={13} /> 清除所有本地数据
          </button>
        </div>
      </div>
    </div>
  )
}
