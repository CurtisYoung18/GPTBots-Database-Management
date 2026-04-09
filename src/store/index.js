import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

// ─── File-backed storage adapter ─────────────────────────────────────────────
// Talks to the Express server which writes ./data/<key>.json in the project dir
// Falls back gracefully if the server isn't available (e.g. vite-only mode)
const fileStorage = createJSONStorage(() => ({
  getItem: async (name) => {
    try {
      const res = await fetch(`/proxy/storage/${encodeURIComponent(name)}`)
      if (!res.ok) return null
      const data = await res.json()
      if (data === null) return null
      // If the file was written by us, it's the full parsed state object.
      // Zustand's persist expects the JSON *string*, so re-serialize.
      return typeof data === 'string' ? data : JSON.stringify(data)
    } catch {
      return null
    }
  },
  setItem: async (name, value) => {
    try {
      await fetch(`/proxy/storage/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialized: value }),
      })
    } catch {
      // silently ignore write errors (e.g. server not running)
    }
  },
  removeItem: async (name) => {
    try {
      await fetch(`/proxy/storage/${encodeURIComponent(name)}`, { method: 'DELETE' })
    } catch {}
  },
}))

// ─── Store ───────────────────────────────────────────────────────────────────
export const useStore = create(
  persist(
    (set, get) => ({
      // ── Hydration flag ───────────────────────────────────────────────────────
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      // ── Agents ──────────────────────────────────────────────────────────────
      agents: [],
      activeAgentId: null,

      addAgent: (agent) =>
        set((s) => ({
          agents: [...s.agents, { id: uid(), createdAt: Date.now(), ...agent }],
        })),

      updateAgent: (id, updates) =>
        set((s) => ({
          agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      deleteAgent: (id) =>
        set((s) => ({
          agents: s.agents.filter((a) => a.id !== id),
          activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
          tables: s.tables.filter((t) => t.agentId !== id),
        })),

      setActiveAgent: (id) => set({ activeAgentId: id }),

      getActiveAgent: () => {
        const s = get()
        return s.agents.find((a) => a.id === s.activeAgentId) || null
      },

      // ── Tables (locally tracked) ─────────────────────────────────────────────
      tables: [],

      addTable: (table) =>
        set((s) => ({
          tables: [...s.tables, { id: uid(), createdAt: Date.now(), ...table }],
        })),

      updateTable: (id, updates) =>
        set((s) => ({
          tables: s.tables.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      removeTable: (id) =>
        set((s) => ({ tables: s.tables.filter((t) => t.id !== id) })),

      getTablesForAgent: (agentId) => get().tables.filter((t) => t.agentId === agentId),

      // ── Schema Versions ──────────────────────────────────────────────────────
      schemas: [],

      addSchema: (schema) =>
        set((s) => ({
          schemas: [{ id: uid(), createdAt: Date.now(), ...schema }, ...s.schemas],
        })),

      updateSchema: (id, updates) =>
        set((s) => ({
          schemas: s.schemas.map((sc) => (sc.id === id ? { ...sc, ...updates } : sc)),
        })),

      deleteSchema: (id) =>
        set((s) => ({ schemas: s.schemas.filter((sc) => sc.id !== id) })),

      getSchemasForAgent: (agentId) =>
        get()
          .schemas.filter((sc) => sc.agentId === agentId)
          .sort((a, b) => b.createdAt - a.createdAt),

      // ── AI Settings ─────────────────────────────────────────────────────────
      // MiniMax M2.5 via platform.minimaxi.com OpenAI-compatible endpoint
      settings: {
        aiUrl:   'https://api.minimaxi.com/v1/chat/completions',
        aiKey:   'sk-cp-ViBi8EK5hndaLRb5afT2KGc8f9EkdrbHf3AGd5xyy9G139eA5V0z4zFWYADKRhvCkwdxOLDMb_m3ATF0l041nmzy2fA_VU-9HmsVQG1rPVMhmeLz3_xHGX8',
        aiModel: 'MiniMax-M2.5',
      },

      updateSettings: (updates) =>
        set((s) => ({ settings: { ...s.settings, ...updates } })),

      // ── Chat sessions (persisted per agent) ──────────────────────────────────
      // chats: Record<agentId, { messages: ChatMsg[], history: AIHistoryMsg[] }>
      chats: {},

      getChatSession: (agentId) => {
        const session = get().chats[agentId]
        return session || { messages: [], history: [] }
      },

      setChatMessages: (agentId, messages) =>
        set((s) => ({
          chats: { ...s.chats, [agentId]: { ...(s.chats[agentId] || {}), messages } },
        })),

      setChatHistory: (agentId, history) =>
        set((s) => ({
          chats: { ...s.chats, [agentId]: { ...(s.chats[agentId] || {}), history } },
        })),

      clearChatSession: (agentId) =>
        set((s) => {
          const { [agentId]: _, ...rest } = s.chats
          return { chats: rest }
        }),

      // ── Toast notifications ──────────────────────────────────────────────────
      toasts: [],

      toast: (message, type = 'info', duration = 3500) => {
        const id = uid()
        set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
        setTimeout(() => get().dismissToast(id), duration)
        return id
      },

      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'gptbots-db-store',
      storage: fileStorage,
      // Exclude transient UI state from persistence
      partialize: (s) => ({
        agents:        s.agents,
        activeAgentId: s.activeAgentId,
        tables:        s.tables,
        schemas:       s.schemas,
        settings:      s.settings,
        chats:         s.chats,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
