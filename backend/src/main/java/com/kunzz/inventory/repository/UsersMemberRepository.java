package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.UsersMember;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UsersMemberRepository extends JpaRepository<UsersMember, Integer> {
    List<UsersMember> findAllByOrderByIdDesc();
}
