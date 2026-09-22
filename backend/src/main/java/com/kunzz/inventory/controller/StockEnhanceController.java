package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.mapper.PriceChangeLogMapper;
import com.kunzz.inventory.entity.StockInout;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.realtime.RealtimeService;
import com.kunzz.inventory.service.StockEditService;
import com.kunzz.inventory.service.StockEnhanceService;
import com.kunzz.inventory.service.StockProductService;
import com.kunzz.inventory.service.StaffService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockEnhanceController {

    private final StockEnhanceService stockEnhanceService;
    private final StockProductService stockProductService;
    private final StockEditService stockEditService;
    private final RealtimeService realtimeService;
    private final PriceChangeLogMapper priceChangeLogMapper;
    private final StaffService staffService;

    /** 回收站：软删除的出入库记录 */
    @GetMapping("/recycle")
    public ApiResponse<Map<String, Object>> recycleBin(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<StockInout> p = stockEnhanceService.recycleBin(page, size);
        return ApiResponse.ok(Map.of("total", p.getTotalElements(), "items", p.getContent()));
    }

    /** 恢复软删除记录 */
    @PutMapping("/recycle/{id}/restore")
    public ApiResponse<Void> restore(@PathVariable Integer id) {
        stockEnhanceService.restore(id);
        return ApiResponse.ok();
    }

    /** 产品名称列表（维护） */
    @GetMapping("/product-names")
    public ApiResponse<List<String>> productNames(@RequestParam(required = false) String keyword) {
        return ApiResponse.ok(stockEnhanceService.productNames(keyword));
    }

    /** 重命名产品 */
    @PutMapping("/product-names/rename")
    public ApiResponse<Void> rename(@RequestBody Map<String, String> body) {
        stockEnhanceService.renameProduct(body.get("oldName"), body.get("newName"));
        return ApiResponse.ok();
    }

    /** 备注列表（维护） */
    @GetMapping("/remarks")
    public ApiResponse<List<String>> remarks(@RequestParam(required = false) String keyword) {
        return ApiResponse.ok(stockEnhanceService.remarks(keyword));
    }

    // ---------- 货品种类台账（stockproductname / stockapi.php） ----------

    /** 列表 + 统计（total/approved/pending），systemAssign 支持 overview/central/j1/j2/j3
     *  总览的「4 套单价/冰箱分类」文本按当前用户的系统权限收敛（无权限的系统不显示值，只给「（另有X）」标记） */
    @GetMapping("/products")
    public ApiResponse<Map<String, Object>> products(
            @RequestParam(required = false) String systemAssign,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "false") boolean exact,
            Authentication authentication) {
        return ApiResponse.ok(stockProductService.list(systemAssign, keyword, exact, allowedSystemsOf(authentication)));
    }

    /** 当前用户的库存系统权限（小写 central/j1/j2/j3）；没配置过权限 → null = 不限制（与其它页一致） */
    private List<String> allowedSystemsOf(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User u)) return null;
        Map<String, Object> perms = staffService.stockPerms(u.getId());
        if (!Boolean.TRUE.equals(perms.get("configured"))) return null;
        Object raw = perms.get("systems");
        if (!(raw instanceof List<?> list) || list.isEmpty()) return null; // 全关 → null（前端整页锁死，这里不额外限制）
        List<String> out = new java.util.ArrayList<>();
        for (Object o : list) if (o != null) out.add(String.valueOf(o).trim().toLowerCase());
        return out;
    }

    /** 进货默认单价（该货品在**该系统**下维护的 price；无则 null）。system 省略按中央 */
    @GetMapping("/products/default-price")
    public ApiResponse<Double> productDefaultPrice(
            @RequestParam String productName,
            @RequestParam(required = false) String codeNumber,
            @RequestParam(required = false) String system) {
        return ApiResponse.ok(stockProductService.getDefaultPrice(productName, codeNumber, system));
    }

    /** 新增记录（有「批准」权限的人保存即批准，不用再点「批准」按钮） */
    @PostMapping("/products")
    public ApiResponse<Map<String, Object>> createProduct(@RequestBody Map<String, Object> body, Authentication authentication) {
        ApiResponse<Map<String, Object>> resp = ApiResponse.ok(
                stockProductService.create(body, operatorOf(authentication), canApprove(authentication)));
        realtimeService.notifyStockChanged("all"); // 实时：货品种类变更广播
        return resp;
    }

    // ---------- 改价日志（总库存：最近改价列 + 点击货品名弹窗看历史） ----------

    /** 某货品改价历史（从旧到最新） */
    @GetMapping("/products/price-log")
    public ApiResponse<List<Map<String, Object>>> priceLog(@RequestParam String productName,
                                                           @RequestParam(required = false) String system) {
        return ApiResponse.ok(priceChangeLogMapper.listByProduct(productName, system));
    }

    /** 每个货品最近一次改价（总库存「最近改价」列；一次拉全量，前端按货品名匹配） */
    @GetMapping("/products/price-log-latest")
    public ApiResponse<List<Map<String, Object>>> priceLogLatest(@RequestParam(required = false) String system) {
        return ApiResponse.ok(priceChangeLogMapper.latestAll(system));
    }

    /** 更新记录 */
    @PutMapping("/products/{id}")
    public ApiResponse<Map<String, Object>> updateProduct(@PathVariable Integer id, @RequestBody Map<String, Object> body,
                                                          Authentication authentication) {
        // 启用/停用（active）需要「批准」权限：申请权限的人只能加货品、不能自己停用（2026-09-19 用户要求）
        if (body.containsKey("active")) assertCanApprove(authentication, "停用/启用货品");
        // 改价记录里的「谁改的」用登录态：请求体里的 applicant 是货品申请人（当初建这条记录的人），不是改价人
        // canApprove：有「批准」权限的人保存即批准（本该掉回待批准的行直接写成本次操作人），不用再点「批准」按钮
        ApiResponse<Map<String, Object>> resp = ApiResponse.ok(
                stockProductService.update(id, body, operatorOf(authentication), canApprove(authentication)));
        realtimeService.notifyStockChanged("all"); // 实时：货品种类变更广播
        return resp;
    }

    /** 当前登录用户显示名（昵称 → 中文名 → 用户名，与 /auth/me 的 displayName 一致）；取不到 → null */
    private String operatorOf(Authentication authentication) {
        if (authentication == null) return null;
        Object principal = authentication.getPrincipal();
        return principal instanceof User u ? u.getDisplayName() : authentication.getName();
    }

    /** 删除记录 */
    @DeleteMapping("/products/{id}")
    public ApiResponse<Map<String, Object>> deleteProduct(@PathVariable Integer id, Authentication authentication) {
        assertCanApprove(authentication, "删除货品"); // 与前端一致，防绕过界面直接调接口
        ApiResponse<Map<String, Object>> resp = ApiResponse.ok(stockProductService.delete(id));
        realtimeService.notifyStockChanged("all"); // 实时：货品种类变更广播
        return resp;
    }

    /** 是否具备「批准」权限；**没配置过权限的老账号/demo 默认放行**（与其它页一致）。
     *  未登录 → false（由 SecurityConfig 拦截，这里只是不给自动批准的能力） */
    private boolean canApprove(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User u)) return false;
        Map<String, Object> perms = staffService.stockPerms(u.getId());
        if (!Boolean.TRUE.equals(perms.get("configured"))) return true;
        return Boolean.TRUE.equals(perms.get("canApprove"));
    }

    /** 需要「批准」权限（职员管理→权限设定→库存→批准）；没配置过权限的老账号/demo 默认放行，与其它页一致 */
    private void assertCanApprove(Authentication authentication, String action) {
        if (authentication == null || !(authentication.getPrincipal() instanceof User u)) return; // 未登录由 SecurityConfig 拦截
        if (!canApprove(authentication)) {
            throw new BusinessException(403, "没有" + action + "的权限（需要「批准」权限，见 职员管理→权限设定→库存）");
        }
    }

    /** 批准记录（2026-09-22 修正）：① 需要「批准」权限（原来这个端点没有任何校验，任何登录用户都能批准任意记录）；
     *  ② 批准人由登录态决定 —— 请求体里的 approver 一律忽略，前端伪造不了"谁批的"。
     *  （前端仍会发 body，这里不再声明 @RequestBody，Spring 直接忽略，不影响调用） */
    @PutMapping("/products/{id}/approve")
    public ApiResponse<Map<String, Object>> approveProduct(@PathVariable Integer id, Authentication authentication) {
        assertCanApprove(authentication, "批准货品");
        ApiResponse<Map<String, Object>> resp = ApiResponse.ok(stockProductService.approve(id, operatorOf(authentication)));
        realtimeService.notifyStockChanged("all"); // 实时：批准后广播（其他视图/用户自动刷新）
        return resp;
    }

    // ---------- 进出货辅助选项（stockeditapi.php） ----------

    /** 编号列表（下拉） */
    @GetMapping("/options/codenumbers")
    public ApiResponse<List<Map<String, Object>>> codeNumbers(@RequestParam(required = false) String system) {
        return ApiResponse.ok(stockEditService.codeNumbers(system));
    }

    /** 产品列表（下拉，含供应商）。system 非空时过滤掉该系统下已停用的货品 */
    @GetMapping("/options/products")
    public ApiResponse<List<Map<String, Object>>> products(@RequestParam(required = false) String system) {
        return ApiResponse.ok(stockEditService.products(system));
    }

    /** 收货人列表（下拉） */
    @GetMapping("/options/shippers")
    public ApiResponse<List<String>> shippers() {
        return ApiResponse.ok(stockEditService.shippers());
    }

    /** HIFO 价格批次（出库计价：价格降序，净库存 > 0；分店 j1/j2/j3 查对应分支表） */
    @GetMapping("/price-batches")
    public ApiResponse<List<Map<String, Object>>> priceBatches(
            @RequestParam(defaultValue = "central") String system,
            @RequestParam String productName,
            @RequestParam(required = false) String codeNumber) {
        return ApiResponse.ok(stockEditService.priceBatches(system, productName, codeNumber));
    }

    /** 价格+库存明细（出库价格下拉，含库存检查；分店 j1/j2/j3 查对应分支表） */
    @GetMapping("/price-stock")
    public ApiResponse<List<Map<String, Object>>> priceStock(
            @RequestParam(defaultValue = "central") String system,
            @RequestParam String productName,
            @RequestParam(required = false) String codeNumber,
            @RequestParam(required = false) Double requiredQty) {
        return ApiResponse.ok(stockEditService.priceStock(system, productName, codeNumber, requiredQty));
    }

    /** 在库备注编号（备注编号前缀/后缀生成）。system 省略按中央；分店各查自己的台账 */
    @GetMapping("/remark-codes")
    public ApiResponse<List<String>> remarkCodes(@RequestParam String productName,
                                                @RequestParam(required = false) String system) {
        return ApiResponse.ok(stockEditService.remarkCodes(productName, system));
    }

    /** 在库备注编号 + 剩余量/单位（出货时下拉选择：用户不必再去货品备注页看/扣数量）；按系统 */
    @GetMapping("/remark-code-options")
    public ApiResponse<List<Map<String, Object>>> remarkCodeOptions(@RequestParam String productName,
                                                                   @RequestParam(required = false) String system) {
        return ApiResponse.ok(stockEditService.remarkCodeOptions(productName, system));
    }
}
