package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.StockMinimumSetting;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockMinimumSettingRepository extends JpaRepository<StockMinimumSetting, Integer> {
    List<StockMinimumSetting> findByStockSystemOrderByProductNameAsc(String stockSystem);
}
