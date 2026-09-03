package com.kunzz.inventory.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.MobileBatchSaveRequest;
import com.kunzz.inventory.dto.MobileStockRequest;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.mapper.StaffMapper;
import com.kunzz.inventory.service.MobileStockService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 手机版（电话版）进出货（对齐旧系统 /jX/jXstockeditmobile_api.php + /mobile/ch/）
 *
 * 权限：users.branch（逗号分隔）须包含 KH（总部）或对应分店，否则 403（对齐旧 session branch 校验）。
 * 数据流（事务内，详见 MobileStockService）：
 *   手机台账 jXstockeditmobile_data 主写 → jXstocklist_total 缓存增减
 *   → 桌面表 jXstockedit_data 镜像同步（receiver='Mobile' + mobile_ref_id）
 *   → 出货 HIFO 跨价格组拆行 / 指定价格层单行直写
 */
@RestController
@RequestMapping("/api/stock/mobile")
@RequiredArgsConstructor
public class MobileStockController {

    private final MobileStockService mobileStockService;
    private final com.kunzz.inventory.realtime.RealtimeService realtimeService;
    private final StaffMapper staffMapper;
    private final ObjectMapper objectMapper;

    // ---------- 权限（双层：① users.branch 对齐旧 session branch 校验，KH 全通；
    // ② 页面权限树 stock_inventory.system：配置过则须包含对应分店，未配置（老手机账号）→ 放行） ----------

    private User user(Authentication authentication) {
        return (User) authentication.getPrincipal();
    }

    private void assertBranch(Authentication authentication, String system) {
        String sys = system == null ? "" : system.trim().toLowerCase();
        User u = user(authentication);
        String branch = u.getBranch() == null ? "" : u.getBranch().toLowerCase();
        List<String> parts = Arrays.stream(branch.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        boolean branchOk = parts.contains("kh") || parts.contains(sys);
        boolean treeOk = true;
        try {
            for (com.kunzz.inventory.entity.UserPagePermission p : staffMapper.listPagePerms(u.getId())) {
                if (!"stock_inventory".equals(p.getPageKey())) continue;
                Map<?, ?> json = objectMapper.readValue(p.getPermissionsJson(), Map.class);
                Object sysObj = json.containsKey("system") ? json.get("system") : json.get("systems");
                if (sysObj instanceof List<?> list) {
                    // 记录存在：勾选了系统 → 须包含；全空 = 管理员明确关闭 → 拒绝
                    treeOk = list.stream().map(String::valueOf).map(String::trim).map(String::toLowerCase).anyMatch(sys::equals);
                }
                break;
            }
        } catch (Exception ignored) { /* 权限 JSON 读取失败 → 不因权限配置故障锁死手机端 */ }
        if (!branchOk || !treeOk) {
            throw new BusinessException("无权限操作 " + sys.toUpperCase() + "（用户分店: " + branch + "）");
        }
    }

    // ---------- 电话版：总库存 + 改量出货 ----------

    /** 电话版列表（按 product+code+spec 实时计算 + 总记录数） */
    @GetMapping("/totals")
    public ApiResponse<Map<String, Object>> totals(@RequestParam(defaultValue = "j1") String system,
                                                   Authentication authentication) {
        assertBranch(authentication, system);
        return ApiResponse.ok(mobileStockService.totals(system));
    }

    /** 电话版批量出货（对齐旧 batch_save：改「剩余量」→ 差值拆层） */
    @PostMapping("/batch-save")
    public ApiResponse<List<Map<String, Object>>> batchSave(@RequestBody MobileBatchSaveRequest req,
                                                            Authentication authentication) {
        assertBranch(authentication, req.system());
        User u = user(authentication);
        List<Map<String, Object>> result = mobileStockService.batchSave(req, u.getUsername());
        realtimeService.notifyStockChanged("all"); // 实时：写入成功后再广播（9/3 修复：原来先广播后写入，前端会刷到旧数据）
        return ApiResponse.ok(result);
    }

    // ---------- 通用记录 CRUD（与旧 mobile API 对齐，供扩展用） ----------

    /** 记录列表（默认当天；对齐旧 action=list：deleted_at IS NULL） */
    @GetMapping("/records")
    public ApiResponse<List<Map<String, Object>>> records(
            @RequestParam(defaultValue = "j1") String system,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(required = false) String productName,
            Authentication authentication) {
        assertBranch(authentication, system);
        return ApiResponse.ok(mobileStockService.records(system, start, end, productName));
    }

    /** 单条记录 */
    @GetMapping("/records/{id}")
    public ApiResponse<Map<String, Object>> record(@PathVariable Integer id,
                                                   @RequestParam(defaultValue = "j1") String system,
                                                   Authentication authentication) {
        assertBranch(authentication, system);
        return ApiResponse.ok(mobileStockService.record(system, id));
    }

    /** 创建（四步数据流）→ 全站实时推送 */
    @PostMapping("/records")
    public ApiResponse<Map<String, Object>> create(@RequestBody MobileStockRequest req, Authentication authentication) {
        assertBranch(authentication, req.system());
        Map<String, Object> created = mobileStockService.create(req);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok(created);
    }

    /** 更新（关键字段变更撤旧加新 / 否则差值回补；桌面镜像删旧重同步）→ 全站实时推送 */
    @PutMapping("/records/{id}")
    public ApiResponse<Map<String, Object>> update(@PathVariable Integer id, @RequestBody MobileStockRequest req,
                                                   Authentication authentication) {
        assertBranch(authentication, req.system());
        Map<String, Object> updated = mobileStockService.update(id, req);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok(updated);
    }

    /** 删除（mobile 硬删 + total 反冲 + mobile_ref_id 级联删桌面行）→ 全站实时推送 */
    @DeleteMapping("/records/{id}")
    public ApiResponse<Void> delete(@PathVariable Integer id, @RequestParam(defaultValue = "j1") String system,
                                    Authentication authentication) {
        assertBranch(authentication, system);
        mobileStockService.delete(id, system);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    /** 出货价格层（含可用量，负数=已超扣；价格从高到低） */
    @GetMapping("/price-tiers")
    public ApiResponse<List<Map<String, Object>>> priceTiers(@RequestParam(defaultValue = "j1") String system,
                                                             @RequestParam String productName,
                                                             @RequestParam(required = false) String codeNumber,
                                                             Authentication authentication) {
        assertBranch(authentication, system);
        return ApiResponse.ok(mobileStockService.priceTiers(system, productName, codeNumber));
    }

    /** 货品下拉（stock_data 主数据） */
    @GetMapping("/options")
    public ApiResponse<List<Map<String, Object>>> options(Authentication authentication) {
        return ApiResponse.ok(mobileStockService.productOptions());
    }
}
