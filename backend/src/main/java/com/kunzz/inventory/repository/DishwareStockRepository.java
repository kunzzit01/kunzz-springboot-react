package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareStock;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DishwareStockRepository extends JpaRepository<DishwareStock, Integer> {
    Optional<DishwareStock> findByDishwareId(Integer dishwareId);
}
