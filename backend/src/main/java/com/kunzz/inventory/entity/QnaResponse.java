package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * 问卷回答（映射老库 qna_responses，10 个问题）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "qna_responses")
public class QnaResponse {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "user_id")
    private Integer userId;

    @Column(name = "question1", columnDefinition = "TEXT")
    private String question1;

    @Column(name = "question2", columnDefinition = "TEXT")
    private String question2;

    @Column(name = "question3", columnDefinition = "TEXT")
    private String question3;

    @Column(name = "question4", columnDefinition = "TEXT")
    private String question4;

    @Column(name = "question5", columnDefinition = "TEXT")
    private String question5;

    @Column(name = "question6", columnDefinition = "TEXT")
    private String question6;

    @Column(name = "question7", columnDefinition = "TEXT")
    private String question7;

    @Column(name = "question8", columnDefinition = "TEXT")
    private String question8;

    @Column(name = "question9", columnDefinition = "TEXT")
    private String question9;

    @Column(name = "question10", columnDefinition = "TEXT")
    private String question10;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;
}
