import express from 'express'
import cors from 'cors'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const app = express()
const PORT = 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '50mb' }))

// ─── Generic GPTBots proxy ───────────────────────────────────────────────────
// Receives: { endpoint, apiKey, path, data, method? }
// Forwards to: https://api-{endpoint}.gptbots.ai{path}
app.post('/proxy/gptbots', async (req, res) => {
  const { endpoint, apiKey, path, data, method = 'POST' } = req.body

  if (!endpoint || !apiKey || !path) {
    return res.status(400).json({ error: 'Missing endpoint, apiKey, or path' })
  }

  const url = `https://api-${endpoint}.gptbots.ai${path}`

  try {
    const response = await axios({
      method,
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: method !== 'GET' ? data : undefined,
      params: method === 'GET' ? data : undefined,
      timeout: 30000,
    })
    res.json(response.data)
  } catch (err) {
    const status = err.response?.status || 500
    const body = err.response?.data || { error: err.message }
    res.status(status).json(body)
  }
})

// ─── AI proxy (OpenAI-compatible) ────────────────────────────────────────────
// Receives: { url, apiKey, model, messages, systemPrompt? }
app.post('/proxy/ai', async (req, res) => {
  const { url, apiKey, model, messages } = req.body

  if (!url || !apiKey || !model || !messages) {
    return res.status(400).json({ error: 'Missing required AI parameters' })
  }

  try {
    const response = await axios.post(
      url,
      { model, messages, temperature: 0.3, max_tokens: 4096 },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    )
    res.json(response.data)
  } catch (err) {
    const status = err.response?.status || 500
    const body = err.response?.data || { error: err.message }
    res.status(status).json(body)
  }
})

// ─── File-backed persistent storage ─────────────────────────────────────────
// Replaces localStorage — data lives in ./data/<key>.json (human-readable)

app.get('/proxy/storage/:key', (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.key}.json`)
  if (!fs.existsSync(file)) return res.json(null)
  try {
    res.json(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    res.json(null)
  }
})

app.post('/proxy/storage/:key', (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.key}.json`)
  try {
    // req.body.serialized is the JSON string produced by Zustand persist
    // Store pretty-printed so the file is human-readable and directly editable
    const raw = req.body?.serialized
    if (raw) {
      fs.writeFileSync(file, JSON.stringify(JSON.parse(raw), null, 2))
    } else {
      fs.writeFileSync(file, JSON.stringify(req.body, null, 2))
    }
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/proxy/storage/:key', (req, res) => {
  const file = path.join(DATA_DIR, `${req.params.key}.json`)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`\n🚀 GPTBots proxy server  →  http://localhost:${PORT}`)
  console.log(`   Persistent data dir  →  ${DATA_DIR}\n`)
})
