package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.dto.*;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.service.DishwareService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/dishware")
@RequiredArgsConstructor
public class DishwareController {

    private final DishwareService dishwareService;

    /** 照片上传（对齐线上 dishware_api.php?action=upload_photo：存 uploads/dishware/） */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<Map<String, String>> uploadPhoto(@RequestParam("photo") MultipartFile photo) {
        if (photo.isEmpty()) throw new com.kunzz.inventory.common.BusinessException("照片文件为空");
        String original = photo.getOriginalFilename() == null ? "" : photo.getOriginalFilename();
        String ext = "";
        int dot = original.lastIndexOf('.');
        if (dot >= 0) ext = original.substring(dot + 1).toLowerCase();
        if (!java.util.Set.of("jpg", "jpeg", "png", "gif").contains(ext)) {
            throw new com.kunzz.inventory.common.BusinessException("不支持的文件格式：" + ext);
        }
        try {
            String dir = System.getProperty("user.dir") + "/uploads/dishware/";
            java.io.File d = new java.io.File(dir);
            if (!d.exists()) d.mkdirs();
            String filename = UUID.randomUUID().toString().replace("-", "") + "." + ext;
            java.io.File target = new java.io.File(dir + filename);
            photo.transferTo(target);
            return ApiResponse.ok(Map.of("photoPath", "uploads/dishware/" + filename));
        } catch (Exception e) {
            throw new com.kunzz.inventory.common.BusinessException("照片保存失败：" + e.getMessage());
        }
    }

    // ---------- 碗碟信息 ----------

    @GetMapping("/items")
    public ApiResponse<List<DishwareInfo>> listInfos() {
        return ApiResponse.ok(dishwareService.listInfos());
    }

    @PostMapping("/items")
    public ApiResponse<DishwareInfo> createInfo(@Valid @RequestBody DishwareInfoRequest req) {
        return ApiResponse.ok(dishwareService.createInfo(req));
    }

    @PutMapping("/items/{id}")
    public ApiResponse<DishwareInfo> updateInfo(@PathVariable Integer id, @Valid @RequestBody DishwareInfoRequest req) {
        return ApiResponse.ok(dishwareService.updateInfo(id, req));
    }

    @DeleteMapping("/items/{id}")
    public ApiResponse<Void> deleteInfo(@PathVariable Integer id) {
        dishwareService.deleteInfo(id);
        return ApiResponse.ok();
    }

    // ---------- 碗碟库存 ----------

    @GetMapping("/stock")
    public ApiResponse<List<DishwareStockVO>> listStocks(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category) {
        return ApiResponse.ok(dishwareService.listStocks(keyword, category));
    }

    @PutMapping("/stock/{dishwareId}")
    public ApiResponse<DishwareStock> updateStock(@PathVariable Integer dishwareId,
                                                  @Valid @RequestBody DishwareStockRequest req) {
        return ApiResponse.ok(dishwareService.updateStock(dishwareId, req));
    }

    // ---------- 套装 ----------

    @GetMapping("/sets")
    public ApiResponse<List<DishwareSet>> listSets() {
        return ApiResponse.ok(dishwareService.listSets());
    }

    @PostMapping("/sets")
    public ApiResponse<DishwareSet> createSet(@Valid @RequestBody DishwareSetRequest req) {
        return ApiResponse.ok(dishwareService.createSet(req));
    }

    @PutMapping("/sets/{id}")
    public ApiResponse<DishwareSet> updateSet(@PathVariable Integer id, @Valid @RequestBody DishwareSetRequest req) {
        return ApiResponse.ok(dishwareService.updateSet(id, req));
    }

    @DeleteMapping("/sets/{id}")
    public ApiResponse<Void> deleteSet(@PathVariable Integer id) {
        dishwareService.deleteSet(id);
        return ApiResponse.ok();
    }

    @GetMapping("/sets/{id}/items")
    public ApiResponse<List<DishwareSetItem>> listSetItems(@PathVariable Integer id) {
        return ApiResponse.ok(dishwareService.listSetItems(id));
    }

    @PutMapping("/sets/{id}/items")
    public ApiResponse<Void> saveSetItems(@PathVariable Integer id,
                                          @Valid @RequestBody List<DishwareSetItemRequest> items) {
        dishwareService.saveSetItems(id, items);
        return ApiResponse.ok();
    }

    // ---------- 破损 ----------

    @GetMapping("/breaks")
    public ApiResponse<List<Map<String, Object>>> listBreaks(
            @RequestParam(required = false) String shopType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(dishwareService.listBreaks(shopType, startDate, endDate));
    }

    @PostMapping("/breaks")
    public ApiResponse<DishwareBreakRecord> createBreak(@Valid @RequestBody DishwareBreakRequest req) {
        return ApiResponse.ok(dishwareService.createBreak(req));
    }

    @PutMapping("/breaks/{id}")
    public ApiResponse<DishwareBreakRecord> updateBreak(@PathVariable Integer id, @Valid @RequestBody DishwareBreakRequest req) {
        return ApiResponse.ok(dishwareService.updateBreak(id, req));
    }

    @DeleteMapping("/breaks/{id}")
    public ApiResponse<Void> deleteBreak(@PathVariable Integer id) {
        dishwareService.deleteBreak(id);
        return ApiResponse.ok();
    }

    // ---------- 调拨 ----------

    @GetMapping("/transfers")
    public ApiResponse<List<Map<String, Object>>> listTransfers(
            @RequestParam(required = false) String shopType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return ApiResponse.ok(dishwareService.listTransfers(shopType, startDate, endDate));
    }

    @PostMapping("/transfers")
    public ApiResponse<DishwareTransferRecord> createTransfer(@Valid @RequestBody DishwareTransferRequest req) {
        return ApiResponse.ok(dishwareService.createTransfer(req));
    }

    @DeleteMapping("/transfers/{id}")
    public ApiResponse<Void> deleteTransfer(@PathVariable Integer id) {
        dishwareService.deleteTransfer(id);
        return ApiResponse.ok();
    }

    @PutMapping("/transfers/{id}")
    public ApiResponse<DishwareTransferRecord> updateTransfer(@PathVariable Integer id, @Valid @RequestBody DishwareTransferRequest req) {
        return ApiResponse.ok(dishwareService.updateTransfer(id, req));
    }

    // ---------- 存放地点 ----------

    @GetMapping("/locations")
    public ApiResponse<List<DishwareLocation>> listLocations() {
        return ApiResponse.ok(dishwareService.listLocations());
    }

    /** 新增餐厅店面（对齐旧系统 addRestaurant） */
    @PostMapping("/locations")
    public ApiResponse<DishwareLocation> createLocation(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok(dishwareService.createLocation(body));
    }

    /** 更新餐厅店面 */
    @PutMapping("/locations/{id}")
    public ApiResponse<DishwareLocation> updateLocation(@PathVariable Integer id, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok(dishwareService.updateLocation(id, body));
    }

    /** 删除餐厅店面 */
    @DeleteMapping("/locations/{id}")
    public ApiResponse<Void> deleteLocation(@PathVariable Integer id) {
        dishwareService.deleteLocation(id);
        return ApiResponse.ok();
    }
}
