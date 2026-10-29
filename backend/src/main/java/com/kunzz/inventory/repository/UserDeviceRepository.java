package com.kunzz.inventory.repository;

import com.kunzz.inventory.entity.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserDeviceRepository extends JpaRepository<UserDevice, Integer> {

    /** 按摘要找设备（登录续期/撤销时用；摘要唯一） */
    Optional<UserDevice> findByTokenHash(String tokenHash);

    /** 某用户全部未撤销、未过期的设备，最近活跃的在前 */
    List<UserDevice> findByUserIdAndRevokedAtMsIsNullAndExpiresAtMsGreaterThanOrderByLastSeenMsDesc(
            Integer userId, Long nowMs);

    List<UserDevice> findByUserIdAndRevokedAtMsIsNull(Integer userId);
}
