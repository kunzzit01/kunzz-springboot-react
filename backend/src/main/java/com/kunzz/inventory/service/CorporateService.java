package com.kunzz.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kunzz.inventory.common.BusinessException;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * 企业蓝图（对应 corporate_blueprint，数据存 JSON 文件）
 */
@Service
public class CorporateService {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path dataDir = Paths.get("data").toAbsolutePath().normalize();
    private final Path jsonFile = dataDir.resolve("corporate_strategy.json");

    /** 初始化：首次从老系统复制默认蓝图 */
    public void init() {
        try {
            Files.createDirectories(dataDir);
            if (!Files.exists(jsonFile)) {
                Path src = Paths.get("corporate_strategy.json");
                if (Files.exists(src)) {
                    Files.copy(src, jsonFile);
                } else {
                    Files.writeString(jsonFile, "{\"companyOverview\":{\"companyName\":\"KUNZZ HOLDINGS SDN BHD\",\"planTitle\":\"Corporate Strategic Plan\",\"strategyStartYear\":2027,\"strategyEndYear\":2029,\"ultimateGoal\":\"Establish 10+ successful subsidiaries\"},\"timeline\":[{\"year\":2024,\"goal\":\"创建2间子公司\"},{\"year\":2025,\"goal\":\"创建4间子公司\"}]}",
                        StandardCharsets.UTF_8);
                }
            }
        } catch (IOException e) {
            throw new BusinessException("蓝图文件初始化失败: " + e.getMessage());
        }
    }

    public Map<String, Object> read() {
        init();
        try {
            return objectMapper.readValue(Files.readString(jsonFile, StandardCharsets.UTF_8), Map.class);
        } catch (IOException e) {
            throw new BusinessException("读取蓝图失败: " + e.getMessage());
        }
    }

    public void write(Map<String, Object> data) {
        init();
        try {
            Files.writeString(jsonFile, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(data),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new BusinessException("保存蓝图失败: " + e.getMessage());
        }
    }
}
