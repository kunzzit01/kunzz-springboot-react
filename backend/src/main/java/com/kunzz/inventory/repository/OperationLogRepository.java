package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.OperationLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OperationLogRepository extends JpaRepository<OperationLog, Integer> {
    List<OperationLog> findTop50ByOrderByCreatedAtDesc();
}
