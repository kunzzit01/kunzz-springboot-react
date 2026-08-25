package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.StockInout;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface StockInoutRepository extends JpaRepository<StockInout, Integer>, JpaSpecificationExecutor<StockInout> {
}
