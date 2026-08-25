package com.kunzz.inventory.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "j2cost")
public class J2Cost extends BaseBranchCost {
}
