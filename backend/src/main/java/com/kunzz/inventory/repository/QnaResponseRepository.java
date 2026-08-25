package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.QnaResponse;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface QnaResponseRepository extends JpaRepository<QnaResponse, Integer> {
    List<QnaResponse> findAllByOrderByCreatedAtDesc();
    Optional<QnaResponse> findByUserId(Integer userId);
}
