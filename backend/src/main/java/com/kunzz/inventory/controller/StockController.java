package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.*;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.service.StaffService;
import com.kunzz.inventory.service.StockRemarkService;
import com.kunzz.inventory.service.StockService;
import com.kunzz.inventory.service.StockSummaryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;
    private final StockSummaryService stockSummaryService;
    private final StockRemarkService stockRemarkService;
    private final StaffService staffService;

    // ---------- 总库存汇总（stocklistall） ----------

    @GetMapping("/stock/summary")
    public ApiResponse<Map<String, Object>> stockSummary(@RequestParam(defaultValue = "central") String system,
                                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate endDate) {
        // endDate：导出日期范围用——截至该日期的库存余额（库存累积，对齐旧系统 stocklistapi.php）
        return ApiResponse.ok(stockSummaryService.summary(system, endDate));
    }

    // ---------- 货品备注分析（stockremark） ----------

    /** 多价格/备注货品分析（对齐线上 stockremarkapi.php?action=analysis） */
    @GetMapping("/stock/remark-analysis")
    public ApiResponse<Map<String, Object>> stockRemarks(@RequestParam(required = false) String system,
                                                         Authentication authentication) {
        assertSystemAllowed(authentication, system);
        return ApiResponse.ok(stockRemarkService.analysis(system));
    }

    /**
     * 货品备注按系统鉴权：权限设置里只勾了 J1 的账号，不该看到中央的备注。
     * 与前端同一判定：没配置过 stock_inventory 权限记录（老账号/demo）→ 默认放行；
     * 配置过 → 请求的 system 必须在 systems 列表里（大小写不敏感）。
     */
    private void assertSystemAllowed(Authentication auth, String system) {
        if (auth == null || !(auth.getPrincipal() instanceof User u)) return; // 未登录由 SecurityConfig 拦截
        Map<String, Object> perms = staffService.stockPerms(u.getId());
        if (!Boolean.TRUE.equals(perms.get("configured"))) return;
        String sys = (system == null || system.isBlank()) ? "central" : system.trim().toLowerCase();
        Object raw = perms.get("systems");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && String.valueOf(o).trim().toLowerCase().equals(sys)) return;
            }
        }
        throw new BusinessException(403, "没有查看「" + sys.toUpperCase() + "」的权限（职员管理→权限设定→库存）");
    }

    // ---------- 库存台账 ----------

    @GetMapping("/stock/records")
    public ApiResponse<PageResult<StockData>> listRecords(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(stockService.listRecords(keyword, category, supplier, startDate, endDate, page, size));
    }

    @PostMapping("/stock/records")
    public ApiResponse<StockData> createRecord(@Valid @RequestBody StockDataRequest req) {
        return ApiResponse.ok(stockService.createRecord(req));
    }

    @PutMapping("/stock/records/{id}")
    public ApiResponse<StockData> updateRecord(@PathVariable Integer id, @Valid @RequestBody StockDataRequest req) {
        return ApiResponse.ok(stockService.updateRecord(id, req));
    }

    @DeleteMapping("/stock/records/{id}")
    public ApiResponse<Void> deleteRecord(@PathVariable Integer id) {
        stockService.deleteRecord(id);
        return ApiResponse.ok();
    }

    // ---------- 出入库流水 ----------

    @GetMapping("/stock/inout")
    public ApiResponse<PageResult<StockInout>> listInout(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String targetSystem,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "false") boolean exactMatch) {
        return ApiResponse.ok(stockService.listInout(keyword, targetSystem, type, startDate, endDate, page, size, exactMatch));
    }

    /** 进出货检查（弹窗）：货品名 100% 精确匹配，返回 IN/OUT 数量与金额汇总 + 明细 */
    @GetMapping("/stock/inout/check")
    public ApiResponse<Map<String, Object>> checkInout(
            @RequestParam String productName,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "central") String system) {
        return ApiResponse.ok(stockService.checkInout(system, productName, startDate, endDate));
    }

    @PostMapping("/stock/inout")
    public ApiResponse<StockInout> createInout(@Valid @RequestBody StockInoutRequest req,
                                               @RequestParam(required = false) String system) {
        ApiResponse<StockInout> resp = ApiResponse.ok(stockService.createInout(req, system));
        realtimeService.notifyStockChanged("all");
        return resp;
    }

    @PutMapping("/stock/inout/{id}")
    public ApiResponse<StockInout> updateInout(@PathVariable Integer id, @Valid @RequestBody StockInoutRequest req,
                                               @RequestParam(required = false) String system,
                                               Authentication authentication) {
        // 编辑人（updated_by）取登录态；请求体里的 createdBy 是创建人，编辑时不许改
        ApiResponse<StockInout> resp = ApiResponse.ok(stockService.updateInout(id, req, system, operatorOf(authentication)));
        realtimeService.notifyStockChanged("all");
        return resp;
    }

    /** 当前登录用户显示名（昵称 → 中文名 → 用户名，与 /auth/me 的 displayName 一致）；取不到 → null */
    private String operatorOf(Authentication authentication) {
        if (authentication == null) return null;
        Object principal = authentication.getPrincipal();
        return principal instanceof User u ? u.getDisplayName() : authentication.getName();
    }

    /** 软删除（保留历史审计） */
    @DeleteMapping("/stock/inout/{id}")
    public ApiResponse<Void> deleteInout(@PathVariable Integer id, @RequestParam(required = false) String deletedBy,
                                         @RequestParam(required = false) String system) {
        stockService.deleteInout(id, deletedBy, system);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    /** 批量恢复（撤销删除：清空 deleted_at/deleted_by，双向联动分店记录） */
    @PutMapping("/stock/inout/restore")
    public ApiResponse<Void> restoreInout(@RequestBody RestoreInoutRequest req) {
        stockService.restoreInout(req.ids(), req.system());
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    // ---------- 最低库存设置 ----------

    @GetMapping("/stock/minimum")
    public ApiResponse<List<StockMinimumSetting>> listMinimum(@RequestParam(defaultValue = "central") String system) {
        return ApiResponse.ok(stockService.listMinimum(system));
    }

    // ---------- 最低库存设置（对齐线上 stockminimumapi.php：按系统列出全部在库货品 + 行内/批量保存） ----------

    /** 某系统全部在库货品 + 最低库存设置 */
    @GetMapping("/stock/minimum/products")
    public ApiResponse<List<Map<String, Object>>> listMinimumProducts(@RequestParam(defaultValue = "central") String system,
                                                                     Authentication authentication) {
        assertSystemAllowed(authentication, system);
        return ApiResponse.ok(stockService.listMinimumProducts(system));
    }

    /** 按 系统+产品名 保存单条最低库存（UPSERT；各系统设置独立） */
    @PostMapping("/stock/minimum/save")
    public ApiResponse<Void> saveMinimum(@RequestParam(defaultValue = "central") String system,
                                         @RequestBody Map<String, Object> body,
                                         Authentication authentication) {
        assertSystemAllowed(authentication, system);
        String name = body.get("product_name") == null ? "" : String.valueOf(body.get("product_name"));
        java.math.BigDecimal qty = body.get("minimum_quantity") == null ? java.math.BigDecimal.ZERO
                : new java.math.BigDecimal(String.valueOf(body.get("minimum_quantity")));
        stockService.saveMinimum(system, name, qty);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    /** 批量保存最低库存（事务内；各系统设置独立） */
    @PostMapping("/stock/minimum/batch")
    @SuppressWarnings("unchecked")
    public ApiResponse<Void> saveMinimumBatch(@RequestParam(defaultValue = "central") String system,
                                              @RequestBody Map<String, Object> body,
                                              Authentication authentication) {
        assertSystemAllowed(authentication, system);
        Object raw = body.get("products");
        List<Map<String, Object>> products = raw instanceof List ? (List<Map<String, Object>>) raw : List.of();
        stockService.saveMinimumBatch(system, products);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    private final com.kunzz.inventory.realtime.RealtimeService realtimeService;

    @PostMapping("/stock/minimum")
    public ApiResponse<StockMinimumSetting> createMinimum(@Valid @RequestBody StockMinimumRequest req) {
        ApiResponse<StockMinimumSetting> resp = ApiResponse.ok(stockService.createMinimum(req));
        realtimeService.notifyStockChanged("all"); // 实时：最低库存影响总库存显示
        return resp;
    }

    @PutMapping("/stock/minimum/{id}")
    public ApiResponse<StockMinimumSetting> updateMinimum(@PathVariable Integer id, @Valid @RequestBody StockMinimumRequest req) {
        ApiResponse<StockMinimumSetting> resp = ApiResponse.ok(stockService.updateMinimum(id, req));
        realtimeService.notifyStockChanged("all");
        return resp;
    }

    @DeleteMapping("/stock/minimum/{id}")
    public ApiResponse<Void> deleteMinimum(@PathVariable Integer id) {
        stockService.deleteMinimum(id);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    // ---------- 异常扣除 ----------

    @GetMapping("/stock/sot")
    public ApiResponse<List<StockSot>> listSot() {
        return ApiResponse.ok(stockService.listSot());
    }

    @PostMapping("/stock/sot")
    public ApiResponse<StockSot> createSot(@Valid @RequestBody StockSotRequest req) {
        ApiResponse<StockSot> resp = ApiResponse.ok(stockService.createSot(req));
        realtimeService.notifyStockChanged("all"); // 实时：异常扣除影响库存量展示
        return resp;
    }

    @PutMapping("/stock/sot/{id}")
    public ApiResponse<StockSot> updateSot(@PathVariable Integer id, @Valid @RequestBody StockSotRequest req) {
        ApiResponse<StockSot> resp = ApiResponse.ok(stockService.updateSot(id, req));
        realtimeService.notifyStockChanged("all");
        return resp;
    }

    @DeleteMapping("/stock/sot/{id}")
    public ApiResponse<Void> deleteSot(@PathVariable Integer id) {
        stockService.deleteSot(id);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    // ---------- 公司分类 ----------

    @GetMapping("/categories")
    public ApiResponse<List<CompanyCategory>> listCategories() {
        return ApiResponse.ok(stockService.listCategories());
    }

    @PostMapping("/categories")
    public ApiResponse<CompanyCategory> createCategory(@Valid @RequestBody CategoryRequest req) {
        return ApiResponse.ok(stockService.createCategory(req));
    }

    @PutMapping("/categories/{id}")
    public ApiResponse<CompanyCategory> updateCategory(@PathVariable Integer id, @Valid @RequestBody CategoryRequest req) {
        return ApiResponse.ok(stockService.updateCategory(id, req));
    }

    @DeleteMapping("/categories/{id}")
    public ApiResponse<Void> deleteCategory(@PathVariable Integer id) {
        stockService.deleteCategory(id);
        return ApiResponse.ok();
    }
}
