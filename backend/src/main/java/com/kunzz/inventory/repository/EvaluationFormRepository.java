package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.EvaluationForm;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvaluationFormRepository extends JpaRepository<EvaluationForm, Integer> {
    List<EvaluationForm> findAllByOrderByEvaluationDateDescIdDesc();
}
