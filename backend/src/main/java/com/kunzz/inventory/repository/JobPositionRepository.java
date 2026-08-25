package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.JobPosition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JobPositionRepository extends JpaRepository<JobPosition, Integer> {
    List<JobPosition> findAllByOrderByPublishDateDescIdDesc();
}
