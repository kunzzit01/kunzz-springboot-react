package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.OperationLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OperationLogRepository extends JpaRepository<OperationLog, Integer> {
    List<OperationLog> findTop50ByOrderByCreatedAtDesc();

    /** 某条招聘申请的跟进记录（target = job_application:&lt;id&gt;） */
    List<OperationLog> findTop50ByTargetOrderByCreatedAtDesc(String target);
}
