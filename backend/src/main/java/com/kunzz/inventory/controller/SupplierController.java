package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.dto.SupplyMaterialRequest;
import com.kunzz.inventory.dto.SupplyRequest;
import com.kunzz.inventory.entity.Supply;
import com.kunzz.inventory.entity.SupplyMaterial;
import com.kunzz.inventory.service.SupplierService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/suppliers")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    public ApiResponse<List<Supply>> list() {
        return ApiResponse.ok(supplierService.list());
    }

    @PostMapping
    public ApiResponse<Supply> create(@Valid @RequestBody SupplyRequest req) {
        return ApiResponse.ok(supplierService.create(req));
    }

    @PutMapping("/{id}")
    public ApiResponse<Supply> update(@PathVariable Integer id, @Valid @RequestBody SupplyRequest req) {
        return ApiResponse.ok(supplierService.update(id, req));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Integer id) {
        supplierService.delete(id);
        return ApiResponse.ok();
    }

    // ---------- 物料 ----------

    @GetMapping("/{id}/materials")
    public ApiResponse<List<SupplyMaterial>> listMaterials(@PathVariable Integer id) {
        return ApiResponse.ok(supplierService.listMaterials(id));
    }

    @PostMapping("/{id}/materials")
    public ApiResponse<SupplyMaterial> createMaterial(@PathVariable Integer id, @Valid @RequestBody SupplyMaterialRequest req) {
        return ApiResponse.ok(supplierService.createMaterial(id, req));
    }

    @PutMapping("/materials/{materialId}")
    public ApiResponse<SupplyMaterial> updateMaterial(@PathVariable Integer materialId, @Valid @RequestBody SupplyMaterialRequest req) {
        return ApiResponse.ok(supplierService.updateMaterial(materialId, req));
    }

    @DeleteMapping("/materials/{materialId}")
    public ApiResponse<Void> deleteMaterial(@PathVariable Integer materialId) {
        supplierService.deleteMaterial(materialId);
        return ApiResponse.ok();
    }
}
