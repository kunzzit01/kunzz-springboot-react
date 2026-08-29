import http from './http'

// ---------- AI 助手（本地 Ollama，查询问答 + 进出货草稿） ----------
export interface AiDraft {
  is_draft: boolean
  status: 'draft_ready' | 'error'
  error?: string
  kind: 'in' | 'out'
  date: string
  system: string
  productName: string
  codeNumber?: string
  specification?: string
  type?: string
  deliverTo?: string | null
  inQuantity?: number
  outQuantity?: number
  price: number
  receiver?: string | null
  remark?: string | null
  warning?: string
}

export interface AiChatResult {
  reply: string
  toolUsed?: boolean
  drafts?: AiDraft[]
}

/** 本地模型推理较慢，超时放宽到 5 分钟 */
export const askAi = (message: string, system?: string) =>
  http.post<unknown, AiChatResult>('/ai/chat', { message, system }, { timeout: 300000 })

export interface ParseOrderResult {
  draft_count: number
  drafts: AiDraft[]
  unmatched: string[]
  deliverTo?: string | null
  orderDate?: string | null
}

/** 订单文本确定性解析（不走模型，毫秒级） */
export const parseOrder = (text: string, system?: string) =>
  http.post<unknown, ParseOrderResult>('/ai/parse-order', { text, system }, { timeout: 30000 })
