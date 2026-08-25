package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareSetBreakRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareSetBreakRecordRepository extends JpaRepository<DishwareSetBreakRecord, Integer> {
    List<DishwareSetBreakRecord> findAllByOrderByBreakDateDescIdDesc();
}
