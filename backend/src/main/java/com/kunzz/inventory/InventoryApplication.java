package com.kunzz.inventory;

import com.kunzz.inventory.common.AppDirs;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Kunzz 库存管理系统启动类（React + Spring Boot 重制版）
 */
@SpringBootApplication
public class InventoryApplication {

    public static void main(String[] args) {
        // 启动就把运行期目录打出来（排查「已上传 0」「照片不见了」时先看这行）
        System.out.println("[AppDirs] " + AppDirs.describe());
        SpringApplication.run(InventoryApplication.class, args);
    }
}
