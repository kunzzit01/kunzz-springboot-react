package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.JobApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface JobApplicationRepository extends JpaRepository<JobApplication, Integer>,
        JpaSpecificationExecutor<JobApplication> {
    List<JobApplication> findAllByOrderByCreatedAtDesc();
    long countByStatus(Integer status);
}
