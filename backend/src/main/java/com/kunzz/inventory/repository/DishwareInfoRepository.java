package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareInfo;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareInfoRepository extends JpaRepository<DishwareInfo, Integer> {
    List<DishwareInfo> findAllByOrderByIdAsc();
}
