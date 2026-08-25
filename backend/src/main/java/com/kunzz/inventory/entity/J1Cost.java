package com.kunzz.inventory.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.NoArgsConstructor;

@Entity
@NoArgsConstructor
@Table(name = "j1cost")
public class J1Cost extends BaseBranchCost {
}
