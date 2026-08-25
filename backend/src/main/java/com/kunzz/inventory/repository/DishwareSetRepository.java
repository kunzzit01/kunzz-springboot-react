package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareSet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareSetRepository extends JpaRepository<DishwareSet, Integer> {
    List<DishwareSet> findAllByOrderByIdAsc();
}
