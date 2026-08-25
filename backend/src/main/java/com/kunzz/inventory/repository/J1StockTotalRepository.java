package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J1StockTotal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J1StockTotalRepository extends JpaRepository<J1StockTotal, Integer> {
    List<J1StockTotal> findAllByOrderByProductNameAsc();
}
