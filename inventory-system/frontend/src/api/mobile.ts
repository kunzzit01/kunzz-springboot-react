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
  /** 备注编号（2026-11-03 起手机出货会带上，货品备注据此扣减） */
  remark_number?: string
  product_remark_checked?: number
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
  freezer_category?: string
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
  /** 备注编号：货品在「货品备注」里有编号在库时必填 */
  remarkNumber?: string
  productRemarkChecked?: boolean
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

export interface MobileTotalsResponse {
  items: MobileTotalRow[]
  summaryCount: number
}

export const getMobileTotals = (system: string) =>
  http.get<unknown, MobileTotalsResponse>('/stock/mobile/totals', { params: { system } })

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
  /** 备注编号（同一货品拆多行时每行都带同一个编号） */
  remarkNumber?: string
  productRemarkChecked?: boolean
  /** true = 「整批出完」快捷出货（仅 Kilo），后端按编号剩余量防超卖 */
  wholeCode?: boolean
}

export const batchSaveMobileRecords = (data: {
  system: string
  documentDate?: string
  rows: MobileBatchRow[]
}) => http.post<unknown, MobileRecord[]>('/stock/mobile/batch-save', data)
