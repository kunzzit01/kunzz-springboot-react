// ---------- 认证 ----------
export interface UserInfo {
  id: number
  username: string
  displayName: string
  email: string
  accountType: string
  branch: string
  position: string
  isFirstLogin?: boolean
}

export interface LoginResponse {
  token: string
  user: UserInfo
  mustChangePassword?: boolean
}

// ---------- 分页 ----------
export interface PageResult<T> {
  total: number
  items: T[]
}

// ---------- 库存台账 ----------
export interface StockData {
  id: number
  date: string
  time: string
  productCode: string
  productName: string
  specification?: string
  category?: string
  supplier: string
  applicant?: string
  approver?: string
  systemAssign?: string
  freezerCategory?: string
}

// ---------- 出入库 ----------
export interface StockInout {
  id: number
  date: string
  time: string
  productName: string
  receiver?: string
  inQuantity?: number
  outQuantity?: number
  specification?: string
  price?: number
  codeNumber?: string
  remark?: string
  targetSystem?: string
  type?: string
  remarkNumber?: string
  productRemarkChecked?: boolean
  needGenerateCode?: boolean
  prefix?: string
  createdBy?: string
  createdAt?: string
}

// ---------- 最低库存 / 异常扣除 ----------
export interface StockMinimum {
  id: number
  productName: string
  minimumQuantity: number
}

export interface StockSot {
  id: number
  date: string
  productCode?: string
  productName: string
  quantity: number
  specification?: string
  price?: number
  totalPrice?: number
  category?: string
}

// ---------- 供应商 ----------
export interface Supply {
  id: number
  name: string
}

export interface SupplyMaterial {
  id: number
  supplyId: number
  materialName: string
  materialType?: string
  price?: number
}

// ---------- 分类 ----------
export interface Category {
  id: number
  categoryName: string
}

// ---------- 三店 ----------
export interface BranchRow {
  productName: string
  codeNumber?: string
  specification?: string
  j1Qty: number
  j2Qty: number
  j3Qty: number
  totalQty: number
}

export interface BranchStockTotal {
  id: number
  productName: string
  codeNumber?: string
  specification?: string
  totalQty: number
  lastUpdated?: string
}

// ---------- 餐具 ----------
export interface DishwareInfo {
  id: number
  productName: string
  codeNumber?: string
  category?: string
  size?: string
  unitPrice?: number
  photoPath?: string
}

export interface DishwareStockVO {
  id: number | null
  dishwareId: number
  productName: string
  codeNumber?: string
  category?: string
  size?: string
  unitPrice?: number
  photoPath?: string
  wenhuaQuantity: number
  centralQuantity: number
  j1Quantity: number
  j2Quantity: number
  j3Quantity: number
  totalQuantity: number
}

export interface DishwareSet {
  id: number
  setName: string
  setCode: string
  setSize?: string
  setPrice?: number
  description?: string
  isActive: boolean
}

export interface DishwareSetItem {
  id: number
  setId: number
  dishwareId: number
  quantityInSet: number
  sortOrder?: number
}

export interface DishwareBreak {
  id: number
  dishwareId: number
  shopType?: string
  breakQuantity: number
  chargeableQuantity?: number
  unitPrice?: number
  totalPrice?: number
  breakDate?: string
  recordedBy?: string
}

export interface DishwareTransfer {
  id: number
  dishwareId: number
  fromShopType?: string
  toShopType?: string
  quantity: number
  unitPrice?: number
  totalPrice?: number
  transferDate?: string
  recordType?: string
  recordedBy?: string
  // Mapper 联表返回字段（对齐旧系统 transfer_records）
  codeNumber?: string
  productName?: string
  fromRestaurantName?: string
  toRestaurantName?: string
}

// ---------- 仪表盘 ----------
export interface LowStock {
  system: string
  productName: string
  minimumQuantity: number
  currentQty: number
}

export interface DashboardSummary {
  totalStockRecords: number
  todayInCount: number
  todayOutCount: number
  lowStockCount: number
  dishwareCount: number
  j1ProductCount: number
  j2ProductCount: number
  j3ProductCount: number
  lowStockList: LowStock[]
}

// ============ 新模块类型 ============
export interface Permissions {
  sections: string[]
  submenu: Record<string, string[]>
  brand: Record<string, Record<string, string[]>>
  pages: Record<string, unknown>
}

export interface StaffUser {
  id: number
  username: string
  usernameCn?: string
  nickname?: string
  email: string
  accountType?: string
  position?: string
  phoneNumber?: string
  branch?: string
  icNumber?: string
  bankName?: string
  bankAccount?: string
  homeAddress?: string
  city?: string
  state?: string
  postcode?: string
  gender?: string
  registrationCode?: string
  displayName: string
  createdAt?: string
}

export interface JobPosition {
  id: number
  jobTitle: string
  workExperience?: string
  recruitmentCount?: number
  publishDate?: string
  companyCategory?: string
  companyDepartment?: string
  salary?: string
  jobDescription?: string
  companyLocation?: string
  language?: string
}

export interface JobApplication {
  id: number
  companyName?: string
  jobTitle?: string
  chineseName?: string
  englishName?: string
  gender?: string
  email?: string
  phoneCode?: string
  phoneNumber?: string
  resumeFileUrl?: string
  status?: number
  hrRemarks?: string
  createdAt?: string
}

export interface ScheduleEmployee {
  id: number
  name: string
  phone?: string
  position?: string
  workArea?: string
  restaurant?: string
  isActive?: boolean
}

export interface ScheduleShift {
  id: number
  shiftCode: string
  restaurant?: string
  startTime?: string
  endTime?: string
}

export interface ScheduleRecord {
  id?: number
  employeeId: number
  scheduleDate: string
  valueType: string
  valueCode: string
  notes?: string
}
