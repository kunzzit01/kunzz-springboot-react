package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareSetStock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DishwareSetStockRepository extends JpaRepository<DishwareSetStock, Integer> {
    Optional<DishwareSetStock> findBySetId(Integer setId);
}
