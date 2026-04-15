# GPTBots Database Manager — Cursor Memory

> 给下一个对话的 AI 看的项目上下文，避免重复排查已知问题。

---

## 项目概览

本地桌面 App，用于管理 GPTBots Agent 的数据库。技术栈：

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite 5（端口 5173） |
| 后端 | Express.js（端口 3001，`server.js`） |
| 状态管理 | Zustand 5 + persist 中间件 |
| 持久化 | 文件系统：`data/gptbots-db-store.json` |
| AI | MiniMax M2.5（OpenAI-compatible API） |
| 图标 | lucide-react |
| Markdown | react-markdown + remark-gfm |

启动命令：`npm run dev`（同时启动前端 + Express proxy）

---

## 当前数据状态（截至本对话）

### Agent
- 名称：**VW-customer-group**
- Endpoint：`sg` → `https://api-sg.gptbots.ai`
- 内部 ID：`r82tg6lz7dmmnqubzht`

### 已追踪数据表
| 表名 | GPTBots Table ID | 关联 Agent |
|---|---|---|
| `product_agent_mapping` | `69d70d0d515a426a005ce9f1` | VW-customer-group |

表字段：`id (TEXT, unique)` · `product_name (TEXT)` · `agent_id (TEXT)` · `chat_id (TEXT)` · `topic_id (TEXT)` · `description (TEXT)`

表用途：通过 `product_name + agent_id` 组合查找对应的 `chat_id`（群组）和 `topic_id`（线程）。

---

## 已知 Bug 及修复记录

### Bug 1 — `table_id: undefined`（已修复）
**现象**：AI 助手生成的操作计划显示「8 条记录 → 表 undefined」，执行后静默成功但实际没有插入数据。

**根本原因**：
1. `data/gptbots-db-store.json` 里 `product_agent_mapping` 的 `tableId` 字段缺失（历史数据问题）。
2. `buildTableContext` 给 AI 的上下文为空 → AI 不知道真实 tableId → 写入 `"undefined"` 字符串。
3. 执行层没有对 `"undefined"` 字符串做检测，直接用无效 ID 调 API，API 静默失败或返回无意义的 taskId。

**修复**：
- 直接 patch `data/gptbots-db-store.json`，为 `product_agent_mapping` 补充 `"tableId": "69d70d0d515a426a005ce9f1"`。
- `resolveTableId` 现在会将 `"undefined"` / `"null"` 字符串视为空值。
- `isValidTableId` 验证 24 位十六进制，不合格则抛出明确错误。
- 数据库浏览页面：缺少 `tableId` 的表显示红色虚线边框 + **修复** 按钮，可手动补录。
- 系统 Prompt 明确禁止 AI 使用占位符 tableId；若表不在上下文中，要求 AI 返回 message 类型提示用户先添加表。

### Bug 2 — AI 返回 `invoke.knowledge.*` 格式（已修复）
**现象**：AI 返回 `invoke.knowledge.create_table {...}` 而不是 JSON，导致「为啥没有卡片出来」。

**修复**：`parseAIResponse` 增加了 `invoke.knowledge.*` 格式的自动转换逻辑；系统 Prompt 明确禁止使用 tool-call 语法。

### Bug 3 — 聊天气泡偏左（已修复）
**现象**：用户气泡 flex 拉伸后靠左。
**修复**：移除内层 `flex: 1`；CSS 加 `justify-content: flex-start`。

### Bug 4 — 未知 op 类型静默成功（已修复）
**现象**：AI 有时生成 `get_table_info` 等非法 op，执行器跳过但报告成功。
**修复**：`executePlan` 的 else 分支改为 `throw new Error('不支持的操作类型 ...')`。

### Bug 5 — MessageContent text.split undefined crash（已修复）
**现象**：`Assistant.jsx:569 Uncaught TypeError: Cannot read properties of undefined (reading 'split')` — 某些消息的 `msg.message` 为 undefined。
**修复**：`MessageContent` 组件增加 `if (!text && !raw) return null` 空值保护。

---

## 新增功能

### Markdown 渲染
- AI 输出现在用 `react-markdown` + `remark-gfm` 渲染
- 支持表格、代码块、标题、列表、引用等 Markdown 格式

### Think Tag 可折叠 UI
- 解析 AI 响应中的 `<think>...</think>` 标签
- 思考内容显示为可展开/折叠的区域（类似 ChatGPT 的 Thinking UI）
- `parseAIResponse` 在解析 JSON 前先去除 `<think>` 标签

### 聊天会话存档
- 支持一键存档当前对话并新建空白对话
- 存档保存在 `chatArchives[agentId]` 数组中
- 可在「历史存档」弹窗中查看、恢复、删除存档
- 所有存档数据持久化到文件

### 数据库同步按钮
- 数据库浏览页增加「同步表数据」按钮
- 逐一重新拉取所有已追踪表的元数据（名称、字段、描述）
- 注意：GPTBots API 无 list-tables 端点，只能同步已追踪的表

### Schema 页面重构
- JSON 内容自动解析为结构化卡片
- 每个操作（create_table / add_records 等）渲染为独立卡片
- 建表操作展示完整字段表格（字段名、类型、必填、唯一、描述）
- 数据操作展示记录预览

---

## 核心文件结构

```
GPTBots-Database/
├── server.js              # Express proxy（GPTBots API + AI + 文件存储）
├── vite.config.js         # /proxy/* → localhost:3001
├── data/
│   └── gptbots-db-store.json   # 持久化数据（agents/tables/schemas/chats/settings）
├── src/
│   ├── main.jsx
│   ├── App.jsx            # 路由 + 加载屏（等待文件存储 hydration）
│   ├── index.css          # Claymorphism 设计系统
│   ├── store/index.js     # Zustand store（文件持久化）
│   ├── api/
│   │   ├── ai.js          # MiniMax 调用、parseAIResponse、buildTableContext
│   │   └── gptbots.js     # GPTBots CRUD API 封装
│   ├── components/
│   │   ├── layout/Sidebar.jsx
│   │   └── ui/Toast.jsx / Modal.jsx
│   └── pages/
│       ├── Dashboard.jsx
│       ├── Agents.jsx       # Agent 管理（API Key + endpoint）
│       ├── Database.jsx     # 数据库浏览 + CRUD（直接调 GPTBots API）
│       ├── Assistant.jsx    # AI 聊天 + 操作计划执行
│       ├── Schema.jsx       # Schema 版本归档
│       └── Settings.jsx     # AI 设置
```

---

## 重要实现细节

### 持久化链路
```
Zustand state 变更
  → persist 中间件 → fileStorage.setItem
  → POST /proxy/storage/gptbots-db-store
  → Express → data/gptbots-db-store.json
```

重启后 Hydration 流程：`App 启动 → fileStorage.getItem → GET /proxy/storage → 读文件 → 恢复 state → _hasHydrated=true → 渲染`

### AI 聊天记忆
- `chats[agentId].messages`：UI 气泡数组（含 role/type/message/raw）
- `chats[agentId].history`：`[{role, content}]` 纯文本数组，每次请求完整发给 MiniMax
- `chatArchives[agentId]`：存档数组（`[{ id, title, messages, history, archivedAt }]`）
- 两者都持久化到文件，重启后完整恢复
- 点击「存档对话」→ `archiveChatSession(chatKey)` → 保存到 chatArchives + 清空当前会话
- 点击「清空对话」→ `clearChatSession(chatKey)` → 同时清空 messages + history → 下次调用 MiniMax 上下文归零

### Table 上下文注入
```js
// ai.js buildTableContext(agentTables)
// 生成字符串注入 system prompt：
// - "product_agent_mapping"  table_id: "69d70d0d515a426a005ce9f1"
//   Fields: id(TEXT UNIQUE), product_name(TEXT), ...
```
AI 有了这个上下文才能正确填写 `table_id`。若 `agentTables` 为空，AI 没有上下文，会写错 table_id → 执行失败。

### executePlan table_id 解析优先级
```
1. nameToId[nameOrId]         ← 本次 plan 中 create_table 刚创建的表
2. agentTables 中 name 匹配   ← 通过 buildTableContext 注入的已知表
3. nameOrId 原值              ← 兜底（若不是 24 位 hex 则抛错）
```

### GPTBots API 响应格式（create-table）
```json
{ "code": 0, "message": "success", "data": "69d70d0d515a426a005ce9f1" }
```
`data` 字段直接是 tableId 字符串。代码取值：`res.data?.data || res.data?.tableId || res.data?.id`

### 数据库浏览页 CRUD
所有操作都是真实 GPTBots API 调用，即时生效：
- 读取：`getRecords` → `GET /v1/database/records/page`
- 新增：`importRecords` → `POST /v1/database/import/records` + `pollImport` 轮询
- 编辑：`updateRecords` → `POST /v2/database/update/record`
- 删除：`deleteRecords` → `POST /v2/database/delete/record`

---

## MiniMax API 配置
- API URL：`https://api.minimaxi.com/v1/chat/completions`
- Model：`MiniMax-M2.5`
- API Key：存在 `settings.aiKey`（见 store，已配置）

---

## 待办 / 可改进
- [ ] history 越来越长会超 context window，考虑加「只保留最近 N 条」截断
- [ ] 若 create_table 返回无 tableId，当前会抛错提示用户去「数据库浏览」修复，可以考虑自动 fallback 到手动补录弹窗
