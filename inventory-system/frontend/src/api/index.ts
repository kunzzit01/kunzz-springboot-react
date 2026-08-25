import http from './http'
import type {
  BranchRow, BranchStockTotal, Category, DashboardSummary, DishwareBreak,
  DishwareInfo, DishwareSet, DishwareSetItem, DishwareStockVO, DishwareTransfer,
  LoginResponse, PageResult, StockData, StockInout, StockMinimum, StockSot,
  Supply, SupplyMaterial, UserInfo,
} from '../types'

// ---------- 认证 ----------
export const login = (data: { username: string; password: string }) =>
  http.post<unknown, LoginResponse>('/auth/login', data)
export const changePassword = (data: { oldPassword: string; newPassword: string }) =>
  http.post<unknown, void>('/auth/change-password', data)
export const getMe = () => http.get<unknown, UserInfo>('/auth/me')
export const getStockPerms = () =>
  http.get<unknown, { canApply: boolean; canApprove: boolean; systems: string[]; views: string[] }>('/auth/me/stock-perms')

// ---------- 仪表盘 ----------
export const getDashboardSummary = () =>
  http.get<unknown, DashboardSummary>('/dashboard/summary')

// ---------- 库存台账 ----------
export interface StockQuery {
  keyword?: string
  category?: string
  supplier?: string
  startDate?: string
  endDate?: string
  page?: number
  size?: number
}
export interface StockSummaryItem { no?: number; product_name?: string; code_number?: string; specification?: string; total_stock?: number; price?: number; total_price?: number; formatted_stock?: string; formatted_price?: string; formatted_total_price?: string; type?: string }
export const getStockSummary = (system: string) =>
  http.get<unknown, { summary: StockSummaryItem[]; total_value: number; formatted_total_value: string; total_products: number; type_stats?: Record<string, number>; j1_supply_value?: number; j2_supply_value?: number; j3_supply_value?: number }>('/stock/summary', { params: { system } })

// ---------- 货品备注分析（stockremark） ----------
export interface RemarkVariant { code_number?: string; specification?: string; in_quantity?: number; out_quantity?: number; current_stock?: number; formatted_quantity?: string; price?: number; formatted_price?: string; remark_number?: string }
export interface RemarkProduct { product_name?: string; variants: RemarkVariant[]; total_quantity?: number }
export const getStockRemarkAnalysis = () =>
  http.get<unknown, { products: RemarkProduct[] }>('/stock/remark-analysis')

// ---------- 货品种类台账（stockproductname / stockapi.php） ----------
export interface StockProductRow {
  id?: number
  date?: string
  time?: string
  product_code?: string
  product_name?: string
  specification?: string
  category?: string
  supplier?: string
  applicant?: string
  approver?: string
  system_assign?: string
  freezer_category?: string
}
export const getStockProducts = (systemAssign?: string, keyword?: string) =>
  http.get<unknown, { total: number; approved: number; pending: number; items: StockProductRow[] }>('/stock/products', { params: { systemAssign, keyword } })
export const createStockProduct = (data: Partial<StockProductRow>) =>
  http.post<unknown, { success: boolean }>('/stock/products', data)
export const updateStockProduct = (id: number, data: Partial<StockProductRow>) =>
  http.put<unknown, { success: boolean }>(`/stock/products/${id}`, data)
export const deleteStockProduct = (id: number) =>
  http.delete<unknown, { success: boolean }>(`/stock/products/${id}`)
export const approveStockProduct = (id: number, approver: string) =>
  http.put<unknown, { success: boolean }>(`/stock/products/${id}/approve`, { approver })

// ---------- 进出货辅助选项（stockeditapi.php） ----------
export const getCodeNumbers = () =>
  http.get<unknown, { code_number: string; product_name: string }[]>('/stock/options/codenumbers')
export const getProducts = () =>
  http.get<unknown, { product_name: string; product_code: string; supplier?: string; specification?: string; category?: string }[]>('/stock/options/products')
export const getShippers = () =>
  http.get<unknown, string[]>('/stock/options/shippers')
export const getPriceBatches = (productName: string, codeNumber?: string, system?: string) =>
  http.get<unknown, { price: string; available_stock: number }[]>('/stock/price-batches', { params: { productName, codeNumber, system } })
export const getPriceStock = (productName: string, codeNumber?: string, requiredQty?: number, system?: string) =>
  http.get<unknown, { price: string; available_stock: number; total_in: number; total_out: number; is_sufficient: boolean }[]>('/stock/price-stock', { params: { productName, codeNumber, requiredQty, system } })
export const getRemarkCodes = (productName: string) =>
  http.get<unknown, string[]>('/stock/remark-codes', { params: { productName } })
export const getStockRecords = (params: StockQuery) =>
  http.get<unknown, PageResult<StockData>>('/stock/records', { params })
export const createStockRecord = (data: Partial<StockData>) =>
  http.post<unknown, StockData>('/stock/records', data)
export const updateStockRecord = (id: number, data: Partial<StockData>) =>
  http.put<unknown, StockData>('/stock/records/' + id, data)
export const deleteStockRecord = (id: number) =>
  http.delete<unknown, void>('/stock/records/' + id)

// ---------- 出入库 ----------
export interface InoutQuery {
  keyword?: string
  targetSystem?: string
  type?: string
  startDate?: string
  endDate?: string
  page?: number
  size?: number
}
export const getStockInout = (params: InoutQuery) =>
  http.get<unknown, PageResult<StockInout>>('/stock/inout', { params })

/** 进出货导出（后端 OpenPDF 生成 PDF，支持中文）：返回 PDF Blob，带 token 下载；includeIn/Out 对齐旧系统可只导出入/出库 */
export const exportStockExcel = (system: string, startDate: string, endDate: string, includeIn = true, includeOut = true) =>
  http.get<unknown, Blob>('/stock/export-excel', { params: { system, startDate, endDate, includeIn, includeOut }, responseType: 'blob' })

/** 中央出库数据（invoice PDF 用） */
export const getInvoiceData = (system: string, startDate: string, endDate: string) =>
  http.get<unknown, Record<string, unknown>[]>('/stock/export-invoice-data', { params: { system, startDate, endDate } })

/** 分店 Excel 导出（对齐旧系统 export_branch_stock_excel.php） */
export const exportBranchExcel = (system: string, startDate: string, endDate: string) =>
  http.get<unknown, Blob>('/stock/export-branch-excel', { params: { system, startDate, endDate }, responseType: 'blob' })
// 进出货检查弹窗：货品名 100% 精确匹配，返回 IN/OUT 数量与金额汇总 + 明细
export interface CheckInoutResult {
  product_name?: string
  in_total?: number
  out_total?: number
  in_value?: number
  out_value?: number
  record_count?: number
  records?: {
    date?: string
    time?: string
    type?: string
    in_quantity?: number
    out_quantity?: number
    price?: number
    receiver?: string
    remark?: string
    target_system?: string
  }[]
}
export const checkStockInout = (params: { productName: string; startDate?: string; endDate?: string; system?: string }) =>
  http.get<unknown, CheckInoutResult>('/stock/inout/check', { params })
export const createStockInout = (data: Partial<StockInout>, system?: string) =>
  http.post<unknown, StockInout>('/stock/inout', data, { params: { system } })
export const updateStockInout = (id: number, data: Partial<StockInout>, system?: string) =>
  http.put<unknown, StockInout>('/stock/inout/' + id, data, { params: { system } })
export const deleteStockInout = (id: number, deletedBy?: string, system?: string) =>
  http.delete<unknown, void>('/stock/inout/' + id, { params: { deletedBy, system } })
export const restoreStockInout = (ids: number[], system?: string) =>
  http.put<unknown, void>('/stock/inout/restore', { ids, system })

// ---------- 最低库存 ----------
export const getMinimums = (system?: string) =>
  http.get<unknown, StockMinimum[]>('/stock/minimum', { params: { system } })
export const createMinimum = (data: Partial<StockMinimum>) =>
  http.post<unknown, StockMinimum>('/stock/minimum', data)
export const updateMinimum = (id: number, data: Partial<StockMinimum>) =>
  http.put<unknown, StockMinimum>('/stock/minimum/' + id, data)
export const deleteMinimum = (id: number) =>
  http.delete<unknown, void>('/stock/minimum/' + id)
// 对齐线上 stockminimum.php：按系统列出全部在库货品 + 最低库存设置
export interface MinimumProduct {
  no?: number
  product_name?: string
  product_code?: string
  specification?: string
  minimum_quantity?: number
  current_stock?: number
}
export const getMinimumProducts = (system: string) =>
  http.get<unknown, MinimumProduct[]>('/stock/minimum/products', { params: { system } })
export const saveMinimum = (system: string, product_name: string, minimum_quantity: number) =>
  http.post<unknown, void>('/stock/minimum/save', { product_name, minimum_quantity }, { params: { system } })
export const saveMinimumBatch = (system: string, products: { product_name: string; minimum_quantity: number }[]) =>
  http.post<unknown, void>('/stock/minimum/batch', { products }, { params: { system } })

// ---------- 异常扣除 ----------
export const getSots = () => http.get<unknown, StockSot[]>('/stock/sot')
export const createSot = (data: Partial<StockSot>) =>
  http.post<unknown, StockSot>('/stock/sot', data)
export const updateSot = (id: number, data: Partial<StockSot>) =>
  http.put<unknown, StockSot>('/stock/sot/' + id, data)
export const deleteSot = (id: number) =>
  http.delete<unknown, void>('/stock/sot/' + id)

// ---------- 分类 ----------
export const getCategories = () => http.get<unknown, Category[]>('/categories')
export const createCategory = (name: string) =>
  http.post<unknown, Category>('/categories', { categoryName: name })
export const deleteCategory = (id: number) =>
  http.delete<unknown, void>('/categories/' + id)

// ---------- 供应商 ----------
export const getSuppliers = () => http.get<unknown, Supply[]>('/suppliers')
export const createSupplier = (name: string) =>
  http.post<unknown, Supply>('/suppliers', { name })
export const updateSupplier = (id: number, name: string) =>
  http.put<unknown, Supply>('/suppliers/' + id, { name })
export const deleteSupplier = (id: number) =>
  http.delete<unknown, void>('/suppliers/' + id)
export const getSupplierMaterials = (id: number) =>
  http.get<unknown, SupplyMaterial[]>('/suppliers/' + id + '/materials')
export const createSupplierMaterial = (id: number, data: Partial<SupplyMaterial>) =>
  http.post<unknown, SupplyMaterial>('/suppliers/' + id + '/materials', data)
export const updateSupplierMaterial = (materialId: number, data: Partial<SupplyMaterial>) =>
  http.put<unknown, SupplyMaterial>('/suppliers/materials/' + materialId, data)
export const deleteSupplierMaterial = (materialId: number) =>
  http.delete<unknown, void>('/suppliers/materials/' + materialId)

// ---------- 三店 ----------
export const getMergedStock = () =>
  http.get<unknown, BranchRow[]>('/branches/merged-stock')
export const getBranchStock = (branch: string) =>
  http.get<unknown, BranchStockTotal[]>('/branches/' + branch + '/stock')
export const updateBranchStock = (branch: string, id: number, totalQty: number) =>
  http.put<unknown, BranchStockTotal>('/branches/' + branch + '/stock/' + id, { totalQty })
export const getBranchDaily = (branch: string) =>
  http.get<unknown, unknown[]>('/branches/' + branch + '/daily')
export const getBranchCost = (branch: string) =>
  http.get<unknown, unknown[]>('/branches/' + branch + '/cost')

// ---------- 餐具 ----------
export const getDishwareInfos = () =>
  http.get<unknown, DishwareInfo[]>('/dishware/items')
export const uploadDishwarePhoto = (file: File) => {
  const fd = new FormData()
  fd.append('photo', file)
  return http.post<unknown, { photoPath: string }>('/dishware/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const createDishwareInfo = (data: Partial<DishwareInfo>) =>
  http.post<unknown, DishwareInfo>('/dishware/items', data)
export const updateDishwareInfo = (id: number, data: Partial<DishwareInfo>) =>
  http.put<unknown, DishwareInfo>('/dishware/items/' + id, data)
export const deleteDishwareInfo = (id: number) =>
  http.delete<unknown, void>('/dishware/items/' + id)

export const getDishwareStock = (params?: { keyword?: string; category?: string }) =>
  http.get<unknown, DishwareStockVO[]>('/dishware/stock', { params })
export const updateDishwareStock = (dishwareId: number, data: {
  wenhuaQuantity: number; centralQuantity: number; j1Quantity: number; j2Quantity: number; j3Quantity: number;
}) => http.put<unknown, unknown>('/dishware/stock/' + dishwareId, data)

export const getDishwareSets = () =>
  http.get<unknown, DishwareSet[]>('/dishware/sets')
export const createDishwareSet = (data: Partial<DishwareSet>) =>
  http.post<unknown, DishwareSet>('/dishware/sets', data)
export const updateDishwareSet = (id: number, data: Partial<DishwareSet>) =>
  http.put<unknown, DishwareSet>('/dishware/sets/' + id, data)
export const deleteDishwareSet = (id: number) =>
  http.delete<unknown, void>('/dishware/sets/' + id)
export const getDishwareSetItems = (id: number) =>
  http.get<unknown, DishwareSetItem[]>('/dishware/sets/' + id + '/items')
export const saveDishwareSetItems = (id: number, items: { dishwareId: number; quantityInSet: number }[]) =>
  http.put<unknown, void>('/dishware/sets/' + id + '/items', items)

export const getDishwareBreaks = (params?: { shopType?: string; startDate?: string; endDate?: string }) =>
  http.get<unknown, DishwareBreak[]>('/dishware/breaks', { params })
export const createDishwareBreak = (data: Partial<DishwareBreak>) =>
  http.post<unknown, DishwareBreak>('/dishware/breaks', data)
export const updateDishwareBreak = (id: number, data: Partial<DishwareBreak>) =>
  http.put<unknown, DishwareBreak>('/dishware/breaks/' + id, data)
export const deleteDishwareBreak = (id: number) =>
  http.delete<unknown, void>('/dishware/breaks/' + id)

export const getDishwareTransfers = (params?: { shopType?: string; startDate?: string; endDate?: string }) =>
  http.get<unknown, DishwareTransfer[]>('/dishware/transfers', { params })
export const createDishwareTransfer = (data: Partial<DishwareTransfer>) =>
  http.post<unknown, DishwareTransfer>('/dishware/transfers', data)
export const updateDishwareTransfer = (id: number, data: Partial<DishwareTransfer>) =>
  http.put<unknown, DishwareTransfer>('/dishware/transfers/' + id, data)
export const deleteDishwareTransfer = (id: number) =>
  http.delete<unknown, void>('/dishware/transfers/' + id)

export const getDishwareLocations = () =>
  http.get<unknown, { id: number; name: string; displayOrder?: number; isActive?: boolean }[]>('/dishware/locations')
export const createDishwareLocation = (data: { name: string }) =>
  http.post<unknown, unknown>('/dishware/locations', data)
export const updateDishwareLocation = (id: number, data: { name: string }) =>
  http.put<unknown, unknown>('/dishware/locations/' + id, data)
export const deleteDishwareLocation = (id: number) =>
  http.delete<unknown, void>('/dishware/locations/' + id)

// ================= 新模块 API（对齐老系统后台） =================

// ---------- 权限 ----------
export interface Permissions {
  sections: string[]
  submenu: Record<string, string[]>
  brand: Record<string, Record<string, string[]>>
  pages: Record<string, unknown>
}
export const getMyPermissions = () => http.get<unknown, Permissions>('/auth/me/permissions')
export const getUserPermissions = (userId: number) => http.get<unknown, Permissions>('/permissions/' + userId)
export const saveUserPermissions = (userId: number, data: Permissions) =>
  http.put<unknown, void>('/permissions/' + userId, data)

// ---------- 职员 ----------
export const getStaff = (keyword?: string) => http.get<unknown, StaffUser[]>('/staff', { params: { keyword } })
/** 创建职员返回对齐线上 add_user：{ user, code(申请码), defaultPassword(临时密码), emailSent } */
export interface CreateStaffResult {
  user: StaffUser
  code: string
  defaultPassword: string
  emailSent: boolean
}
export const createStaff = (data: Record<string, unknown>) => http.post<unknown, CreateStaffResult>('/staff', data)
export const updateStaff = (id: number, data: Record<string, unknown>) => http.put<unknown, StaffUser>('/staff/' + id, data)
export const deleteStaff = (id: number) => http.delete<unknown, void>('/staff/' + id)
export const getStaffPermissions = (userId: number) =>
  http.get<unknown, Record<string, unknown>>('/permissions/' + userId)
export const saveStaffPermissions = (userId: number, data: Record<string, unknown>) =>
  http.put<unknown, void>('/permissions/' + userId, data)
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

// ---------- 注册码 ----------
export const getCodes = () => http.get<unknown, { id: number; code: string; accountType?: string; used?: boolean; createdAt?: string }[]>('/application-codes')
export const generateCodes = (accountType: string, count: number) =>
  http.post<unknown, unknown[]>('/application-codes/generate?accountType=' + accountType + '&count=' + count)
export const deleteCode = (id: number) => http.delete<unknown, void>('/application-codes/' + id)

// ---------- 招聘 ----------
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
  phoneNumber?: string
  resumeFileUrl?: string
  status?: number
  hrRemarks?: string
  createdAt?: string
}
export const getJobs = () => http.get<unknown, JobPosition[]>('/jobs')
export const createJob = (d: Partial<JobPosition>) => http.post<unknown, JobPosition>('/jobs', d)
export const updateJob = (id: number, d: Partial<JobPosition>) => http.put<unknown, JobPosition>('/jobs/' + id, d)
export const deleteJob = (id: number) => http.delete<unknown, void>('/jobs/' + id)
export const getApplications = () => http.get<unknown, JobApplication[]>('/applications')
export interface ApplicationQuery {
  keyword?: string
  company?: string
  jobTitle?: string
  status?: number
  dateStart?: string
  dateEnd?: string
  page?: number
  pageSize?: number
}
export const getApplicationsPaged = (params: ApplicationQuery) =>
  http.get<unknown, { list: JobApplication[]; total: number; totalPages: number }>('/applications', { params })
export const getPendingCount = () => http.get<unknown, number>('/applications/pending-count')
export const updateApplication = (id: number, d: { status?: number; hrRemarks?: string }) =>
  http.put<unknown, JobApplication>('/applications/' + id, d)
export const deleteApplication = (id: number) => http.delete<unknown, void>('/applications/' + id)

// ---------- 问卷 ----------
export const getQna = () => http.get<unknown, Record<string, unknown>[]>('/qna')
export const getMyQna = () => http.get<unknown, Record<string, unknown> | null>('/qna/mine')
export const createQna = (d: Record<string, unknown>) => http.post<unknown, unknown>('/qna', d)
export const deleteQna = (id: number) => http.delete<unknown, void>('/qna/' + id)

// ---------- 考核 ----------
export const getEvalConfigs = () => http.get<unknown, Record<string, unknown>[]>('/evaluation/configs')
export const saveEvalConfig = (d: Record<string, unknown>) => http.post<unknown, unknown>('/evaluation/configs', d)
export const deleteEvalConfig = (id: number) => http.delete<unknown, void>('/evaluation/configs/' + id)
export const getEvalStandards = () => http.get<unknown, Record<string, unknown>[]>('/evaluation/standards')
export const saveEvalStandard = (d: Record<string, unknown>) => http.post<unknown, unknown>('/evaluation/standards', d)
export const deleteEvalStandard = (id: number) => http.delete<unknown, void>('/evaluation/standards/' + id)
export const getEvalForms = () => http.get<unknown, Record<string, unknown>[]>('/evaluation/forms')
export const getEvalFormDetails = (formId: number) => http.get<unknown, Record<string, unknown>[]>('/evaluation/forms/' + formId + '/details')
export const createEvalForm = (d: Record<string, unknown>) => http.post<unknown, unknown>('/evaluation/forms', d)
export const deleteEvalForm = (id: number) => http.delete<unknown, void>('/evaluation/forms/' + id)

// ---------- 排班 ----------
export interface ScheduleEmployee {
  id: number
  name: string
  phone?: string
  position?: string
  workArea?: string
  restaurant?: string
  isActive?: boolean
}
export interface ScheduleShift { id: number; shiftCode: string; restaurant?: string; startTime?: string; endTime?: string }
export interface ScheduleRecord { id?: number; employeeId: number; scheduleDate: string; valueType: string; valueCode: string; notes?: string | null }
export const getScheduleEmployees = (restaurant?: string, workArea?: string) =>
  http.get<unknown, ScheduleEmployee[]>('/schedule/employees', { params: { restaurant, workArea } })
export const saveScheduleEmployee = (d: Partial<ScheduleEmployee>) => http.post<unknown, ScheduleEmployee>('/schedule/employees', d)
export const deleteScheduleEmployee = (id: number) => http.delete<unknown, void>('/schedule/employees/' + id)
export const getShifts = (restaurant?: string) => http.get<unknown, ScheduleShift[]>('/schedule/shifts', { params: { restaurant } })
export const saveShift = (d: Partial<ScheduleShift>) => http.post<unknown, ScheduleShift>('/schedule/shifts', d)
export const deleteShift = (id: number) => http.delete<unknown, void>('/schedule/shifts/' + id)
export const getLeaveTypes = (restaurant?: string) => http.get<unknown, { id: number; code: string; name: string; color?: string; type?: string; description?: string }[]>('/schedule/leave-types', { params: { restaurant } })
export const saveLeaveType = (d: Record<string, unknown>) => http.post<unknown, unknown>('/schedule/leave-types', d)
export const deleteLeaveType = (id: number) => http.delete<unknown, void>('/schedule/leave-types/' + id)
export const getScheduleRecords = (month: string) => http.get<unknown, ScheduleRecord[]>('/schedule/records', { params: { month } })
export const saveScheduleRecords = (month: string, records: ScheduleRecord[]) =>
  http.put<unknown, void>('/schedule/records?month=' + month, records)
export const upsertScheduleRecord = (d: Partial<ScheduleRecord>) => http.post<unknown, ScheduleRecord>('/schedule/record', d)
export const deleteScheduleRecord = (employeeId: number, scheduleDate: string) =>
  http.delete<unknown, void>('/schedule/record', { params: { employeeId, scheduleDate } })
export interface PhoneRecordItem { employeeId: number; name?: string; position?: string; workArea?: string; getChecked: boolean; startTime?: string; endTime?: string; returnChecked: boolean; hasRecord?: boolean }
export const getPhoneRecordsByDate = (restaurant: string, date: string) =>
  http.get<unknown, PhoneRecordItem[]>('/phone/records', { params: { restaurant, date } })
export const savePhoneRecordsByDate = (restaurant: string, date: string, records: { employeeId: number; getChecked: boolean; startTime: string; endTime: string; returnChecked: boolean }[]) =>
  http.post<unknown, void>('/phone/records', records, { params: { restaurant, date } })
export const getPhoneRecords = (restaurant: string) =>
  http.get<unknown, Record<string, unknown>[]>('/phone', { params: { restaurant } })

// ---------- 菜单 / 菜单成本 ----------
export const getMenuCategories = () => http.get<unknown, Record<string, unknown>[]>('/menu/categories')
export const saveMenuCategory = (d: Record<string, unknown>) => http.post<unknown, unknown>('/menu/categories', d)
export const deleteMenuCategory = (id: number) => http.delete<unknown, void>('/menu/categories/' + id)
export const getMenuItems = (categoryId?: number) => http.get<unknown, Record<string, unknown>[]>('/menu/items', { params: { categoryId } })
export const saveMenuItem = (d: Record<string, unknown>) => http.post<unknown, unknown>('/menu/items', d)
export const deleteMenuItem = (id: number) => http.delete<unknown, void>('/menu/items/' + id)
export const getMenuCostItems = () => http.get<unknown, Record<string, unknown>[]>('/menucost/items')
export const saveMenuCostItem = (d: Record<string, unknown>) => http.post<unknown, unknown>('/menucost/items', d)
export const deleteMenuCostItem = (id: number) => http.delete<unknown, void>('/menucost/items/' + id)
export const getIngredients = (itemId: number) => http.get<unknown, Record<string, unknown>[]>('/menucost/items/' + itemId + '/ingredients')
export const saveIngredients = (itemId: number, items: Record<string, unknown>[]) =>
  http.put<unknown, void>('/menucost/items/' + itemId + '/ingredients', items)
export const getMenuCostData = () => http.get<unknown, Record<string, unknown>[]>('/menucost/data')
export const saveMenuCostData = (d: Record<string, unknown>) => http.post<unknown, unknown>('/menucost/data', d)
export const deleteMenuCostData = (id: number) => http.delete<unknown, void>('/menucost/data/' + id)

// ---------- 餐厅 / 价格对比 ----------
export const getRestaurants = () => http.get<unknown, { id: number; nameCn?: string; nameEn?: string; name?: string; code?: string; isActive?: boolean }[]>('/restaurants')
export const saveRestaurant = (d: Record<string, unknown>) => http.post<unknown, unknown>('/restaurants', d)
export const deleteRestaurant = (id: number) => http.delete<unknown, void>('/restaurants/' + id)
export const getRestaurantFoods = (id: number) => http.get<unknown, { id: number; foodName: string; foodType?: string; price?: number }[]>('/restaurants/' + id + '/foods')
export const saveRestaurantFood = (id: number, d: Record<string, unknown>) => http.post<unknown, unknown>('/restaurants/' + id + '/foods', d)
export const updateRestaurantFood = (foodId: number, d: Record<string, unknown>) => http.put<unknown, unknown>('/restaurants/foods/' + foodId, d)
export const deleteRestaurantFood = (foodId: number) => http.delete<unknown, void>('/restaurants/foods/' + foodId)

// ---------- 价格对比矩阵 ----------
export interface PriceCompareCell { id: number; price: number }
export interface PriceCompareColumn { id: number; label: string }
export interface PriceCompareRow { name: string; type?: string; cells: Record<string, PriceCompareCell> }
export interface PriceCompareData {
  mode: 'restaurant' | 'supplier'
  columns: PriceCompareColumn[]
  rows: PriceCompareRow[]
  types: string[]
}
export const getPriceCompare = (mode: 'restaurant' | 'supplier') =>
  http.get<unknown, PriceCompareData>('/price/compare', { params: { mode } })

// ---------- KPI ----------
export const getKpiReport = (branch: string, month?: string) =>
  http.get<unknown, { branch: string; month?: string; rows: Record<string, unknown>[] }>('/kpi/report', { params: { branch, month } })
export const saveKpiDaily = (branch: string, d: Record<string, unknown>) =>
  http.post<unknown, void>('/kpi/daily?branch=' + branch, d)
export const deleteKpiDaily = (branch: string, date: string) =>
  http.delete<unknown, void>('/kpi/daily?branch=' + branch + '&date=' + date)
export const getKpiMonthStock = (branch: string, yearMonth: string) =>
  http.get<unknown, { current_stock?: number | null }>('/kpi/month-stock', { params: { branch, yearMonth } })
export const saveKpiMonthStock = (branch: string, d: Record<string, unknown>) =>
  http.post<unknown, void>('/kpi/month-stock?branch=' + branch, d)
export const getKpiSupply = (startDate: string, endDate: string) =>
  http.get<unknown, { supply_to_j2?: number; supply_to_j3?: number }>('/kpi/supply', { params: { startDate, endDate } })
export const saveKpiCost = (branch: string, d: Record<string, unknown>) =>
  http.post<unknown, void>('/kpi/cost?branch=' + branch, d)

// ---------- 企业蓝图 ----------
export const getCorporate = () => http.get<unknown, Record<string, unknown>>('/corporate')
export const saveCorporate = (d: Record<string, unknown>) => http.put<unknown, void>('/corporate', d)

// ---------- 媒体 ----------
export const getMediaList = () => http.get<unknown, { name: string; url: string }[]>('/media/list')
export const uploadMedia = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return http.post<unknown, { name: string; url: string }>('/media/upload', fd)
}
export const deleteMedia = (name: string) => http.delete<unknown, void>('/media/' + name)
export const uploadPageImage = (key: string, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('key', key)
  return http.post<unknown, { key: string; url: string; type: string }>('/media/page-image', fd)
}
export interface PageMediaInfo { url: string; type: string; updated: string }
export const getPageImages = () => http.get<unknown, Record<string, PageMediaInfo>>('/media/page-images')

// ---------- 发展历史 Timeline（对齐线上 aboutpage4upload.php / timeline_api.php） ----------
export interface TimelineItem {
  id?: string
  year?: string | number
  month?: number
  title?: string
  description1?: string
  description2?: string
  image?: string
  image_url?: string
  created?: string
  updated?: string
}
export const getTimeline = (lang = 'zh') => http.get<unknown, { lang: string; items: TimelineItem[] }>('/timeline', { params: { lang } })
export const addTimeline = (lang: string, year: number, month: number) =>
  http.post<unknown, TimelineItem>('/timeline', null, { params: { lang, year, month } })
export const updateTimeline = (id: string, lang: string, data: Record<string, unknown>) =>
  http.put<unknown, TimelineItem>('/timeline/' + id, null, { params: { lang, ...data } })
export const uploadTimelinePhoto = (id: string, lang: string, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('lang', lang)
  return http.post<unknown, TimelineItem>('/timeline/' + id + '/photo', fd)
}
export const deleteTimeline = (id: string, lang = 'zh') => http.delete<unknown, void>('/timeline/' + id, { params: { lang } })

// ---------- 足迹照片（对齐线上 joinpage2upload.php / comphotos_api.php） ----------
export interface ComphotoSlot {
  number: number
  exists: boolean
  url?: string
  updated?: string
}
export const getComphotos = () => http.get<unknown, { total: number; uploaded: number; pending: number; photos: ComphotoSlot[] }>('/comphotos')
export const uploadComphoto = (number: number, file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return http.post<unknown, ComphotoSlot>('/comphotos/' + number, fd)
}
export const deleteComphoto = (number: number) => http.delete<unknown, void>('/comphotos/' + number)

// ---------- 背景音乐（对齐线上 bgmusicupload.php：单文件、上传替换、元信息） ----------
export interface BgMusicInfo {
  exists: boolean
  url?: string
  original_name?: string
  format?: string
  updated?: string
  filesize?: number
  size_formatted?: string
  modified?: string
}
export const getBgMusic = () => http.get<unknown, BgMusicInfo>('/media/bgmusic')
export const uploadBgMusic = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return http.post<unknown, BgMusicInfo>('/media/bgmusic', fd)
}
export const deleteBgMusic = () => http.delete<unknown, void>('/media/bgmusic')

// ---------- 库存增强 ----------
export const getRecycleBin = (page = 0, size = 20) =>
  http.get<unknown, { total: number; items: Record<string, unknown>[] }>('/stock/recycle', { params: { page, size } })
export const restoreRecord = (id: number) => http.put<unknown, void>('/stock/recycle/' + id + '/restore')
export const getProductNames = (keyword?: string) => http.get<unknown, string[]>('/stock/product-names', { params: { keyword } })
export const renameProduct = (oldName: string, newName: string) =>
  http.put<unknown, void>('/stock/product-names/rename', { oldName, newName })
export const getStockRemarks = (keyword?: string) => http.get<unknown, string[]>('/stock/remarks', { params: { keyword } })

