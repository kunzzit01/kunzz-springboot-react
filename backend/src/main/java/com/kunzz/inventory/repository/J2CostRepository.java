package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J2Cost;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J2CostRepository extends JpaRepository<J2Cost, Integer> {
    List<J2Cost> findAllByOrderByDateDesc();
}
