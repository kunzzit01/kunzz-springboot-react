package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J1Cost;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J1CostRepository extends JpaRepository<J1Cost, Integer> {
    List<J1Cost> findAllByOrderByDateDesc();
}
