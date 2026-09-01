package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.dto.MobileStockRequest;
import com.kunzz.inventory.service.MobileStockService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 手机版进出货（对齐旧系统 /jX/jXstockeditmobile_api.php）
 *
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

    /** 记录列表（默认当天；对齐旧 action=list：deleted_at IS NULL） */
    @GetMapping("/records")
    public ApiResponse<List<Map<String, Object>>> records(
            @RequestParam(defaultValue = "j1") String system,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(required = false) String productName) {
        return ApiResponse.ok(mobileStockService.records(system, start, end, productName));
    }

    /** 单条记录 */
    @GetMapping("/records/{id}")
    public ApiResponse<Map<String, Object>> record(@PathVariable Integer id,
                                                   @RequestParam(defaultValue = "j1") String system) {
        return ApiResponse.ok(mobileStockService.record(system, id));
    }

    /** 创建（四步数据流） */
    @PostMapping("/records")
    public ApiResponse<Map<String, Object>> create(@RequestBody MobileStockRequest req) {
        return ApiResponse.ok(mobileStockService.create(req));
    }

    /** 更新（关键字段变更撤旧加新 / 否则差值回补；桌面镜像删旧重同步） */
    @PutMapping("/records/{id}")
    public ApiResponse<Map<String, Object>> update(@PathVariable Integer id, @RequestBody MobileStockRequest req) {
        return ApiResponse.ok(mobileStockService.update(id, req));
    }

    /** 删除（mobile 硬删 + total 反冲 + mobile_ref_id 级联删桌面行） */
    @DeleteMapping("/records/{id}")
    public ApiResponse<Void> delete(@PathVariable Integer id, @RequestParam(defaultValue = "j1") String system) {
        mobileStockService.delete(id, system);
        return ApiResponse.ok();
    }

    /** 出货价格层（含可用量，负数=已超扣；价格从高到低） */
    @GetMapping("/price-tiers")
    public ApiResponse<List<Map<String, Object>>> priceTiers(@RequestParam(defaultValue = "j1") String system,
                                                             @RequestParam String productName,
                                                             @RequestParam(required = false) String codeNumber) {
        return ApiResponse.ok(mobileStockService.priceTiers(system, productName, codeNumber));
    }

    /** 货品下拉（stock_data 主数据） */
    @GetMapping("/options")
    public ApiResponse<List<Map<String, Object>>> options() {
        return ApiResponse.ok(mobileStockService.productOptions());
    }

    /** 手机总库存（读 jXstocklist_total，对齐 /mobile/ch/stocklistjX.php） */
    @GetMapping("/totals")
    public ApiResponse<List<Map<String, Object>>> totals(@RequestParam(defaultValue = "j1") String system) {
        return ApiResponse.ok(mobileStockService.totals(system));
    }
}
