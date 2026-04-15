import axios from 'axios'

const proxy = axios.create({ baseURL: '/proxy/gptbots', timeout: 30000 })

// ─── Helpers ─────────────────────────────────────────────────────────────────
const call = (agent, path, data, method = 'POST') =>
  proxy.post('', { endpoint: agent.endpoint, apiKey: agent.apiKey, path, data, method })

// ─── Knowledge Base (includes database tables) ──────────────────────────────
export const listKnowledgeBases = (agent) =>
  call(agent, '/v1/bot/knowledge/base/page', undefined, 'GET')

// ─── Table APIs ──────────────────────────────────────────────────────────────
export const createTable = (agent, { name, description, fields }) =>
  call(agent, '/v1/database/create-table', { name, description, fields })

export const getRecords = (agent, { table_id, page = 1, page_size = 50, filter, keyword }) =>
  call(agent, '/v1/database/records/page', {
    table_id,
    page,
    page_size,
    ...(filter && { filter }),
    ...(keyword && { keyword }),
  })

export const importRecords = (agent, { table_id, records }) =>
  call(agent, '/v1/database/import/records', { table_id, records })

export const queryImportStatus = (agent, ids) =>
  call(agent, '/v1/database/query/import-results', { ids }, 'GET')

export const updateRecords = (agent, { table_id, update_data, is_create = false }) =>
  call(agent, '/v2/database/update/record', { table_id, update_data, is_create })

export const deleteRecords = (agent, { table_id, delete_data }) =>
  call(agent, '/v2/database/delete/record', { table_id, delete_data })

// ─── Poll import job until complete ──────────────────────────────────────────
export const pollImport = async (agent, taskId, onProgress) => {
  let attempts = 0
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 1500))
    const res = await queryImportStatus(agent, [taskId])
    const job = res.data?.[0]
    if (!job) break
    onProgress?.(job)
    if (job.status === 'AVAILABLE' || job.status === 'FAIL') return job
    attempts++
  }
  return null
}
