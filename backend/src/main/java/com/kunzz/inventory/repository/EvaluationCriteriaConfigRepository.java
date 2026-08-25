package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.EvaluationCriteriaConfig;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvaluationCriteriaConfigRepository extends JpaRepository<EvaluationCriteriaConfig, Integer> {
    List<EvaluationCriteriaConfig> findAllByOrderByDepartmentAscCriteriaOrderAsc();
}
