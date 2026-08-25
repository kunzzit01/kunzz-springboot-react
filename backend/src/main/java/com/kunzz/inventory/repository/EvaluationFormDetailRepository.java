package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.EvaluationFormDetail;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EvaluationFormDetailRepository extends JpaRepository<EvaluationFormDetail, Integer> {
    List<EvaluationFormDetail> findByFormIdOrderByIdAsc(Integer formId);
}
