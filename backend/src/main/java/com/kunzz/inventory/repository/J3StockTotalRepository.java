package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J3StockTotal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J3StockTotalRepository extends JpaRepository<J3StockTotal, Integer> {
    List<J3StockTotal> findAllByOrderByProductNameAsc();
}
