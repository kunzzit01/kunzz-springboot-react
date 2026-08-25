package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J2StockTotal;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J2StockTotalRepository extends JpaRepository<J2StockTotal, Integer> {
    List<J2StockTotal> findAllByOrderByProductNameAsc();
}
