package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.StockSot;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface StockSotRepository extends JpaRepository<StockSot, Integer> {
    List<StockSot> findAllByOrderByDateDescIdDesc();
}
