package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareBreakRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareBreakRecordRepository extends JpaRepository<DishwareBreakRecord, Integer> {
    List<DishwareBreakRecord> findAllByOrderByBreakDateDescIdDesc();
}
