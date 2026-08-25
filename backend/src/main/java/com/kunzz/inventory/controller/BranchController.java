package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.BaseBranchStockTotal;
import com.kunzz.inventory.service.BranchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/branches")
@RequiredArgsConstructor
public class BranchController {

    private final BranchService branchService;

    /** 三店合并汇总 */
    @GetMapping("/merged-stock")
    public ApiResponse<List<BranchService.BranchRow>> mergedStock() {
        return ApiResponse.ok(branchService.mergedStock());
    }

    /** 某店库存汇总 */
    @GetMapping("/{branch}/stock")
    public ApiResponse<List<? extends BaseBranchStockTotal>> stock(@PathVariable String branch) {
        return ApiResponse.ok(branchService.stock(branch));
    }

    /** 编辑某店某产品数量 */
    @PutMapping("/{branch}/stock/{id}")
    public ApiResponse<BaseBranchStockTotal> updateStock(
            @PathVariable String branch, @PathVariable Integer id,
            @RequestBody Map<String, BigDecimal> body) {
        return ApiResponse.ok(branchService.updateStock(branch, id, body.get("totalQty")));
    }

    /** 某店日报 */
    @GetMapping("/{branch}/daily")
    public ApiResponse<List<?>> daily(@PathVariable String branch) {
        return ApiResponse.ok(branchService.daily(branch));
    }

    /** 某店成本 */
    @GetMapping("/{branch}/cost")
    public ApiResponse<List<?>> cost(@PathVariable String branch) {
        return ApiResponse.ok(branchService.cost(branch));
    }
}
