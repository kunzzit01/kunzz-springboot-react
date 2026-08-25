package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareLocation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareLocationRepository extends JpaRepository<DishwareLocation, Integer> {
    List<DishwareLocation> findAllByOrderByDisplayOrderAscIdAsc();
}
