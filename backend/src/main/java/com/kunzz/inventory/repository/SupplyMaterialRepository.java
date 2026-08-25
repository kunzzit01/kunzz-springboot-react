package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.SupplyMaterial;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupplyMaterialRepository extends JpaRepository<SupplyMaterial, Integer> {
    List<SupplyMaterial> findBySupplyIdOrderByIdAsc(Integer supplyId);
}
