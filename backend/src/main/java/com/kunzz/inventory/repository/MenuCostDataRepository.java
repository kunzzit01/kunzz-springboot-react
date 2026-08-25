package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.MenuCostData;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MenuCostDataRepository extends JpaRepository<MenuCostData, Integer> {
    List<MenuCostData> findAllByOrderByProductNameAsc();
}
