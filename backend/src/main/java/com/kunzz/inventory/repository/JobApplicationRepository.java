package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.JobApplication;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JobApplicationRepository extends JpaRepository<JobApplication, Integer>,
        JpaSpecificationExecutor<JobApplication> {
    List<JobApplication> findAllByOrderByCreatedAtDesc();
    long countByStatus(Integer status);

    /**
     * 悲观写锁读取（认领 / 转交 / 释放共用）。
     * 生成 SELECT ... FOR UPDATE：两个 HR 同时点开同一位应聘者时，后到的事务会等锁，
     * 拿到锁后再读就能看到「已有处理人」，从而不会互相覆盖。与 MobileStockMapper 的 HIFO 行锁同一套路。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from JobApplication a where a.id = :id")
    Optional<JobApplication> findByIdForUpdate(@Param("id") Integer id);
}
