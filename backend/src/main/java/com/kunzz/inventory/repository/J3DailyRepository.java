package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.J3Daily;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface J3DailyRepository extends JpaRepository<J3Daily, Integer> {
    List<J3Daily> findAllByOrderByDateDesc();
}
