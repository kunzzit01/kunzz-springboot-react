package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.realtime.RealtimeService;
import com.kunzz.inventory.service.FreezerCategoryService;
import com.kunzz.inventory.service.StaffService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 冰箱分类字典：可改名 / 调顺序 / 停用
 *
 * 读接口对所有登录用户开放（货品种类页的下拉选项要用）；
 * 写接口要求货品种类页的「批准」权限 —— 改名会同时改写全公司的货品，和批准同级。
 */
@RestController
@RequestMapping("/api/stock/freezer-categories")
@RequiredArgsConstructor
public class FreezerCategoryController {

    private final FreezerCategoryService freezerCategoryService;
    private final StaffService staffService;
    private final RealtimeService realtimeService;

    /** 列表（按业务顺序） */
    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        return ApiResponse.ok(freezerCategoryService.list());
    }

    /** 新增分类 */
    @PostMapping
    public ApiResponse<Map<String, Object>> create(@RequestBody Map<String, Object> body, Authentication auth) {
        assertCanApprove(auth);
        Map<String, Object> out = freezerCategoryService.create(str(body.get("name")));
        realtimeService.notifyStockChanged("all"); // 实时：分类变化广播，各页面下拉/排序跟着刷新
        return ApiResponse.ok(out);
    }

    /** 全局改名：字典 + 所有挂了该分类的货品一起改 */
    @PutMapping("/{id}/rename")
    public ApiResponse<Map<String, Object>> rename(@PathVariable Integer id,
                                                   @RequestBody Map<String, Object> body,
                                                   Authentication auth) {
        assertCanApprove(auth);
        Map<String, Object> out = freezerCategoryService.rename(id, str(body.get("name")));
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok(out);
    }

    /** 调顺序：body = { ids: [3, 1, 2, ...] } */
    @PutMapping("/reorder")
    public ApiResponse<Void> reorder(@RequestBody Map<String, Object> body, Authentication auth) {
        assertCanApprove(auth);
        freezerCategoryService.reorder(toIntList(body.get("ids")));
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok();
    }

    /** 删除（force=true 时连同货品上的引用一起去掉；否则有货品在用会被拒绝，提示改用停用） */
    @DeleteMapping("/{id}")
    public ApiResponse<Map<String, Object>> delete(@PathVariable Integer id,
                                                  @RequestParam(defaultValue = "false") boolean force,
                                                  Authentication auth) {
        assertCanApprove(auth);
        Map<String, Object> out = freezerCategoryService.delete(id, force);
        realtimeService.notifyStockChanged("all");
        return ApiResponse.ok(out);
    }

    // ---------- 权限 ----------

    /**
     * 与前端 StockProducts.tsx 的判定保持一致：
     * 没配置过 stock_inventory 权限记录（老账号/demo）→ 默认放行；
     * 配置过 → 必须有 views 里的 approve。
     */
    private void assertCanApprove(Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof User u)) {
            throw new BusinessException(401, "请先登录");
        }
        Map<String, Object> perms = staffService.stockPerms(u.getId());
        boolean configured = Boolean.TRUE.equals(perms.get("configured"));
        if (configured && !Boolean.TRUE.equals(perms.get("canApprove"))) {
            throw new BusinessException(403, "没有维护冰箱分类的权限（需要货品种类页的「批准」权限）");
        }
    }

    private String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private List<Integer> toIntList(Object o) {
        List<Integer> out = new java.util.ArrayList<>();
        if (o instanceof List<?> list) {
            for (Object x : list) {
                if (x instanceof Number n) out.add(n.intValue());
                else {
                    try {
                        out.add(Integer.parseInt(String.valueOf(x).trim()));
                    } catch (Exception ignored) {
                        // 非数字 id 直接跳过，不影响其余项
                    }
                }
            }
        }
        return out;
    }
}
