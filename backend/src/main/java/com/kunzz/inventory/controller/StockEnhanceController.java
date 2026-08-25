package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.StockInout;
import com.kunzz.inventory.service.StockEditService;
import com.kunzz.inventory.service.StockEnhanceService;
import com.kunzz.inventory.service.StockProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
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

    /** 列表 + 统计（total/approved/pending），systemAssign 支持 overview/central/j1/j2/j3 */
    @GetMapping("/products")
    public ApiResponse<Map<String, Object>> products(
            @RequestParam(required = false) String systemAssign,
            @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(stockProductService.list(systemAssign, keyword));
    }

    /** 新增记录 */
    @PostMapping("/products")
    public ApiResponse<Map<String, Object>> createProduct(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok(stockProductService.create(body));
    }

    /** 更新记录 */
    @PutMapping("/products/{id}")
    public ApiResponse<Map<String, Object>> updateProduct(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok(stockProductService.update(id, body));
    }

    /** 删除记录 */
    @DeleteMapping("/products/{id}")
    public ApiResponse<Map<String, Object>> deleteProduct(@PathVariable Integer id) {
        return ApiResponse.ok(stockProductService.delete(id));
    }

    /** 批准记录 */
    @PutMapping("/products/{id}/approve")
    public ApiResponse<Map<String, Object>> approveProduct(@PathVariable Integer id, @RequestBody(required = false) Map<String, Object> body) {
        String approver = body == null ? null : (String) body.get("approver");
        return ApiResponse.ok(stockProductService.approve(id, approver));
    }

    // ---------- 进出货辅助选项（stockeditapi.php） ----------

    /** 编号列表（下拉） */
    @GetMapping("/options/codenumbers")
    public ApiResponse<List<Map<String, Object>>> codeNumbers() {
        return ApiResponse.ok(stockEditService.codeNumbers());
    }

    /** 产品列表（下拉，含供应商） */
    @GetMapping("/options/products")
    public ApiResponse<List<Map<String, Object>>> products() {
        return ApiResponse.ok(stockEditService.products());
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

    /** 在库备注编号（备注编号前缀/后缀生成） */
    @GetMapping("/remark-codes")
    public ApiResponse<List<String>> remarkCodes(@RequestParam String productName) {
        return ApiResponse.ok(stockEditService.remarkCodes(productName));
    }
}
