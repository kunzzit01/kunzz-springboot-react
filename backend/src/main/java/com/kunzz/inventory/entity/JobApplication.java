package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 求职申请（映射老库 job_applications）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "job_applications")
public class JobApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "company_name", length = 200)
    private String companyName;

    @Column(name = "job_title", length = 200)
    private String jobTitle;

    @Column(name = "chinese_name", length = 100)
    private String chineseName;

    @Column(name = "english_name", length = 100)
    private String englishName;

    @Column(name = "gender", length = 20)
    private String gender;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "phone_code", length = 10)
    private String phoneCode;

    @Column(name = "phone_number", length = 30)
    private String phoneNumber;

    /** 简历文件路径 */
    @Column(name = "resume_file_url", length = 500)
    private String resumeFileUrl;

    /** 状态：0 待处理 / 1 已处理 */
    @Column(name = "status")
    private Integer status;

    @Column(name = "hr_remarks", length = 500)
    private String hrRemarks;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}
