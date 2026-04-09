import axios from 'axios'

// ─── System prompt ───────────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are a GPTBots database management assistant embedded in a local admin tool.
Your ONLY job is to help users design and execute GPTBots database operations.

## CRITICAL OUTPUT RULES
1. You MUST respond with ONLY valid JSON — no markdown, no prose, no tool-calls.
2. NEVER use invoke.knowledge, function_call, tool_use, or any other tool-calling syntax.
3. Every response must be one of the two JSON shapes below — nothing else.

## GPTBots Database Rules
- Table names: lowercase a-z, digits, underscores; must start with a letter; max 64 chars
- Field names: same constraints as table names
- Field types: TEXT | INT | FLOAT | DATETIME | BOOLEAN
- Every table MUST have at least one field with "unique": true (acts as primary key)
- Descriptions ≤ 128 chars — write them to help an LLM understand the data purpose
- The API supports ONLY these four ops: create_table, add_records, update_records, delete_records
- There is NO get_table_info, query_records, list_tables, alter_table, drop_table, or rename_table op

## CRITICAL: table_id field rules
- For add_records / update_records / delete_records, the "table_id" MUST be the EXACT string value
  provided in the "## Existing Tables" section below (format: 24-char hex like "673e9c7a9f7bc178002dbce8")
- NEVER set table_id to "undefined", "null", the table name, or any placeholder
- If the user wants to operate on a table that is NOT listed in "## Existing Tables", you MUST respond
  with type "message" (not a plan) and explain: the table is not yet tracked locally, and they must
  first open "数据库浏览", click "添加已有表", enter the table ID, then retry

## Response shape A — when proposing operations
{
  "type": "plan",
  "message": "Human-readable summary in the user's language",
  "operations": [
    {
      "op": "create_table",
      "label": "Create table: <name>",
      "params": {
        "name": "table_name",
        "description": "≤128 char description",
        "fields": [
          { "name": "id",    "description": "Unique record ID", "type": "TEXT", "required": true, "unique": true },
          { "name": "col_a", "description": "...",              "type": "TEXT", "required": true, "unique": false }
        ]
      }
    }
  ],
  "warnings": ["optional array of notes or concerns"]
}

For data ops the params shape is:
  add_records:    { "table_id": "<exact 24-char hex from context>", "records": [{...}] }
  update_records: { "table_id": "<exact 24-char hex from context>", "update_data": [{ "record_id": "...", "updated_fields": {...} }] }
  delete_records: { "table_id": "<exact 24-char hex from context>", "delete_data": [{ "record_id": "..." }] }

## Response shape B — for questions / explanations / clarifications
{ "type": "message", "message": "Your reply in the user's language" }

## Full example (use this exact shape):
User says: "Create a users table with id, name, and email"
You respond:
{
  "type": "plan",
  "message": "I will create a users table with 3 fields.",
  "operations": [
    {
      "op": "create_table",
      "label": "Create table: users",
      "params": {
        "name": "users",
        "description": "Stores user account information",
        "fields": [
          { "name": "id",    "description": "Unique user ID",    "type": "TEXT", "required": true,  "unique": true  },
          { "name": "name",  "description": "User display name", "type": "TEXT", "required": true,  "unique": false },
          { "name": "email", "description": "User email address","type": "TEXT", "required": false, "unique": true  }
        ]
      }
    }
  ],
  "warnings": []
}

Always reply in the same language the user writes in. Always output raw JSON — no code fences, no extra text.`

// ─── Parse AI response ────────────────────────────────────────────────────────
// Handles: clean JSON, JSON inside ```, invoke.knowledge.* tool-call format
export const parseAIResponse = (content) => {
  const text = content.trim()

  // 1. Direct JSON
  if (text.startsWith('{')) {
    try { return JSON.parse(text) } catch {}
  }

  // 2. JSON inside markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]) } catch {}
  }

  // 3. First {...} block anywhere in the text
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]) } catch {}
  }

  // 4. Detect invoke.knowledge.* format and convert to our plan shape
  //    This handles MiniMax's tendency to emit tool-call style output
  if (text.includes('invoke.knowledge.') || text.includes('"invoke"')) {
    return convertInvokeFormat(text)
  }

  // 5. Fallback — treat as plain message
  return { type: 'message', message: content }
}

// ─── Convert invoke.knowledge.* → plan ───────────────────────────────────────
function convertInvokeFormat(text) {
  const ops = []

  // Extract all JSON objects in the text
  const jsonBlocks = []
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (text[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1))
          jsonBlocks.push(parsed)
        } catch {}
        start = -1
      }
    }
  }

  // Map invoke.knowledge.create_table → create_table op
  const createMatch = text.match(/invoke\.knowledge\.create_table/)
  if (createMatch) {
    const params = jsonBlocks.find((b) => b.name && b.fields)
    if (params) {
      ops.push({
        op: 'create_table',
        label: `Create table: ${params.name}`,
        params,
      })
    }
  }

  // Map invoke.knowledge.add_records → add_records op
  const addMatch = text.match(/invoke\.knowledge\.add_records/)
  if (addMatch) {
    const params = jsonBlocks.find((b) => b.table_id && b.records)
    if (params) {
      ops.push({
        op: 'add_records',
        label: `Add ${params.records?.length || '?'} records`,
        params,
      })
    }
  }

  if (ops.length > 0) {
    return {
      type: 'plan',
      message: '已从 AI 响应中提取到操作计划，请确认后执行：',
      operations: ops,
      warnings: ['AI 使用了非标准输出格式，已自动转换为操作计划。请仔细核对内容是否正确。'],
    }
  }

  // Couldn't extract ops — return as message with a hint
  return {
    type: 'message',
    message: content + '\n\n⚠️ AI 使用了非标准格式，请点击下方「重新分析」让 AI 按正确格式输出操作计划。',
  }
}

// ─── Send chat to AI ─────────────────────────────────────────────────────────
// tableContext: optional string listing known tables so AI can do CRUD on them
export const sendAIMessage = async (settings, messages, tableContext = '') => {
  // Append live table context to system prompt so AI knows real table IDs
  const systemContent = tableContext
    ? `${SYSTEM_PROMPT}\n\n---\n## Existing Tables in Current Agent (use these table_ids for data operations)\n${tableContext}\n---`
    : SYSTEM_PROMPT

  const res = await axios.post('/proxy/ai', {
    url:      settings.aiUrl,
    apiKey:   settings.aiKey,
    model:    settings.aiModel,
    messages: [{ role: 'system', content: systemContent }, ...messages],
  })

  const raw = res.data?.choices?.[0]?.message?.content
  if (!raw) throw new Error('AI 未返回内容，请检查 API 配置')
  return { raw, parsed: parseAIResponse(raw) }
}

// ─── Build table context string for AI ───────────────────────────────────────
// Gives the AI the real table IDs and schemas so it can do CRUD on existing data
export const buildTableContext = (tables) => {
  if (!tables || tables.length === 0) return ''
  return tables
    .map((t) => {
      const fields = t.fields
        ?.map((f) => `${f.name}(${f.type}${f.unique ? ' UNIQUE' : ''}${f.required ? ' REQUIRED' : ''})`)
        .join(', ')
      return `- "${t.name}"  table_id: "${t.tableId}"\n  Description: ${t.description || 'N/A'}\n  Fields: ${fields || 'unknown'}`
    })
    .join('\n')
}

// ─── Build context message from uploaded schema file ─────────────────────────
export const buildSchemaPrompt = (fileContent, fileName, existingTables = []) => {
  let prompt = `请分析以下 schema/mapping 文档，并生成所需的数据库操作计划（JSON 格式）。

文件名: ${fileName}

---
${fileContent}
---`

  if (existingTables.length > 0) {
    prompt += `\n\n当前 Agent 已有的数据表：\n`
    existingTables.forEach((t) => {
      prompt += `- ${t.name} (table_id: ${t.tableId}): ${t.description || '无描述'}\n`
      t.fields?.forEach((f) => {
        prompt += `  • ${f.name} (${f.type}${f.required ? ', required' : ''}${f.unique ? ', unique🔑' : ''})\n`
      })
    })
  }

  return prompt
}
