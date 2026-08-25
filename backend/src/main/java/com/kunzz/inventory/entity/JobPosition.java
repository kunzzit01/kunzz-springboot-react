package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 招聘职位（映射老库 job_positions）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "job_positions")
public class JobPosition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "job_title", length = 200)
    private String jobTitle;

    @Column(name = "work_experience", length = 200)
    private String workExperience;

    @Column(name = "recruitment_count")
    private Integer recruitmentCount;

    @Column(name = "publish_date")
    private LocalDate publishDate;

    @Column(name = "company_category", length = 100)
    private String companyCategory;

    @Column(name = "company_department", length = 100)
    private String companyDepartment;

    @Column(name = "salary", length = 100)
    private String salary;

    @Column(name = "job_description", columnDefinition = "TEXT")
    private String jobDescription;

    @Column(name = "company_location", length = 200)
    private String companyLocation;

    @Column(name = "language", length = 50)
    private String language;
}
