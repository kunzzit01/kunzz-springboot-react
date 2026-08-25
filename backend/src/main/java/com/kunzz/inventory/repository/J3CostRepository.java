package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J3Cost;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J3CostRepository extends JpaRepository<J3Cost, Integer> {
    List<J3Cost> findAllByOrderByDateDesc();
}
