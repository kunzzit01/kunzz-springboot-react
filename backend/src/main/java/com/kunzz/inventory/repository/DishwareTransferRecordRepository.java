package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.DishwareTransferRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishwareTransferRecordRepository extends JpaRepository<DishwareTransferRecord, Integer> {
    List<DishwareTransferRecord> findAllByOrderByTransferDateDescIdDesc();

    DishwareTransferRecord findByRelatedRecordId(Integer relatedRecordId);
}
