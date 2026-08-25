package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.EvaluationCriteriaStandard;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvaluationCriteriaStandardRepository extends JpaRepository<EvaluationCriteriaStandard, Integer> {
    List<EvaluationCriteriaStandard> findAllByOrderByDepartmentAscCriteriaOrderAsc();
    EvaluationCriteriaStandard findByDepartmentAndCriteriaOrderAndScore(String department, Integer criteriaOrder, Integer score);
}
