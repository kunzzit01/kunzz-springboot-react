import http from './http'

// ---------- 手机版进出货（对齐旧系统 jXstockeditmobile_api.php） ----------

export interface MobileRecord {
  id: number
  date: string
  time: string
  product_name: string
  code_number?: string
  specification?: string
  type?: string
  in_quantity: number
  out_quantity: number
  price?: number
  receiver?: string
  created_at?: string
  updated_at?: string
}

export interface MobilePriceTier {
  price: number
  available: number
  specification?: string
  type?: string
}

export interface MobileProductOption {
  product_name: string
  product_code?: string
  supplier?: string
  specification?: string
  category?: string
}

export interface MobileTotalRow {
  id: number
  product_name: string
  code_number?: string
  specification?: string
  type?: string
  total_qty: number
  last_updated?: string
}

export interface MobileRecordPayload {
  system: string
  date: string
  time: string
  productName: string
  codeNumber?: string
  specification?: string
  type?: string
  inQuantity?: number
  outQuantity?: number
  receiver?: string
  /** 出货指定价格层（必选）；进货可不传由后端匹配最新价 */
  price?: number
}

export const getMobileRecords = (system: string, start?: string, end?: string, productName?: string) =>
  http.get<unknown, MobileRecord[]>('/stock/mobile/records', {
    params: { system, start, end, productName: productName || undefined },
  })

export const createMobileRecord = (data: MobileRecordPayload) =>
  http.post<unknown, MobileRecord>('/stock/mobile/records', data)

export const updateMobileRecord = (id: number, data: MobileRecordPayload) =>
  http.put<unknown, MobileRecord>(`/stock/mobile/records/${id}`, data)

export const deleteMobileRecord = (id: number, system: string) =>
  http.delete<unknown, void>(`/stock/mobile/records/${id}`, { params: { system } })

export const getMobilePriceTiers = (system: string, productName: string, codeNumber?: string) =>
  http.get<unknown, MobilePriceTier[]>('/stock/mobile/price-tiers', {
    params: { system, productName, codeNumber: codeNumber || undefined },
  })

export const getMobileProductOptions = () =>
  http.get<unknown, MobileProductOption[]>('/stock/mobile/options')

export const getMobileTotals = (system: string) =>
  http.get<unknown, MobileTotalRow[]>('/stock/mobile/totals', { params: { system } })

// ---------- 电话版批量出货（对齐旧 batch_save：改剩余量 → 差值拆层） ----------

export interface MobileBatchRow {
  time: string
  productName: string
  codeNumber?: string
  specification?: string
  type?: string
  outQuantity: number
  price?: number
  receiver?: string
}

export const batchSaveMobileRecords = (data: {
  system: string
  documentDate?: string
  rows: MobileBatchRow[]
}) => http.post<unknown, MobileRecord[]>('/stock/mobile/batch-save', data)
