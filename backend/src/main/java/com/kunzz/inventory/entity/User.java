package com.kunzz.inventory.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 系统用户（映射老库 users 表）
 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name = "username", length = 50)
    private String username;

    @Column(name = "username_cn", length = 100)
    private String usernameCn;

    @Column(name = "nickname", length = 50)
    private String nickname;

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "password", length = 255)
    private String password;

    @Column(name = "account_type", length = 20)
    private String accountType;

    @Column(name = "position", length = 100)
    private String position;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "branch", length = 255)
    private String branch;

    @Column(name = "ic_number", length = 20)
    private String icNumber;

    @Column(name = "bank_name", length = 100)
    private String bankName;

    @Column(name = "bank_account", length = 30)
    private String bankAccount;

    @Column(name = "home_address", length = 255)
    private String homeAddress;

    @Column(name = "current_address", length = 255)
    private String currentAddress;

    @Column(name = "city", length = 100)
    private String city;

    @Column(name = "state", length = 100)
    private String state;

    @Column(name = "postcode", length = 20)
    private String postcode;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "gender", length = 10)
    private String gender;

    @Column(name = "nationality", length = 50)
    private String nationality;

    @Column(name = "race", length = 50)
    private String race;

    @Column(name = "emergency_contact_name", length = 100)
    private String emergencyContactName;

    @Column(name = "emergency_phone_number", length = 20)
    private String emergencyPhoneNumber;

    @Column(name = "bank_account_holder_en", length = 50)
    private String bankAccountHolderEn;

    @Column(name = "registration_code", length = 50)
    private String registrationCode;

    @Column(name = "is_first_login")
    private Boolean isFirstLogin;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    public String getDisplayName() {
        if (nickname != null && !nickname.isBlank()) return nickname;
        if (usernameCn != null && !usernameCn.isBlank()) return usernameCn;
        return username;
    }
}
