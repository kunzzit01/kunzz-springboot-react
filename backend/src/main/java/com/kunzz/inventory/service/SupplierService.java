package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.SupplyMaterialRequest;
import com.kunzz.inventory.dto.SupplyRequest;
import com.kunzz.inventory.entity.Supply;
import com.kunzz.inventory.entity.SupplyMaterial;
import com.kunzz.inventory.repository.SupplyMaterialRepository;
import com.kunzz.inventory.repository.SupplyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SupplierService {

    private final SupplyRepository supplyRepository;
    private final SupplyMaterialRepository materialRepository;

    @Transactional(readOnly = true)
    public List<Supply> list() {
        return supplyRepository.findAllByOrderByIdAsc();
    }

    @Transactional
    public Supply create(SupplyRequest req) {
        Supply s = new Supply();
        s.setName(req.name());
        return supplyRepository.save(s);
    }

    @Transactional
    public Supply update(Integer id, SupplyRequest req) {
        Supply s = supplyRepository.findById(id)
                .orElseThrow(() -> new BusinessException(404, "供应商不存在"));
        s.setName(req.name());
        return supplyRepository.save(s);
    }

    @Transactional
    public void delete(Integer id) {
        if (!supplyRepository.existsById(id)) {
            throw new BusinessException(404, "供应商不存在");
        }
        materialRepository.findBySupplyIdOrderByIdAsc(id)
                .forEach(m -> materialRepository.delete(m));
        supplyRepository.deleteById(id);
    }

    // ---------- 物料 ----------

    @Transactional(readOnly = true)
    public List<SupplyMaterial> listMaterials(Integer supplyId) {
        return materialRepository.findBySupplyIdOrderByIdAsc(supplyId);
    }

    @Transactional
    public SupplyMaterial createMaterial(Integer supplyId, SupplyMaterialRequest req) {
        supplyRepository.findById(supplyId)
                .orElseThrow(() -> new BusinessException(404, "供应商不存在"));
        SupplyMaterial m = new SupplyMaterial();
        m.setSupplyId(supplyId);
        m.setMaterialName(req.materialName());
        m.setMaterialType(req.materialType());
        m.setPrice(req.price());
        return materialRepository.save(m);
    }

    @Transactional
    public SupplyMaterial updateMaterial(Integer materialId, SupplyMaterialRequest req) {
        SupplyMaterial m = materialRepository.findById(materialId)
                .orElseThrow(() -> new BusinessException(404, "物料不存在"));
        m.setMaterialName(req.materialName());
        m.setMaterialType(req.materialType());
        m.setPrice(req.price());
        return materialRepository.save(m);
    }

    @Transactional
    public void deleteMaterial(Integer materialId) {
        if (!materialRepository.existsById(materialId)) {
            throw new BusinessException(404, "物料不存在");
        }
        materialRepository.deleteById(materialId);
    }
}
