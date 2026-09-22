package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 货品种类（stock_data 台账）Mapper：对齐线上 stockapi.php?action=list
 * 支持 system_assign（多值逗号分隔 LIKE 匹配）+ product_search 动态过滤
 */
@Mapper
public interface StockProductMapper {

    /** 按 id 查单行（改价日志取旧价用） */
    Map<String, Object> findById(@Param("id") Integer id);

    /** 列表（systemAssign 为 null/空 = 总览全部；keyword：exact=false 多字段模糊（名称/编号/规格/类型/供应商/冰箱分类），exact=true 货品名完全等于）
     *  systemAssign 非空时：冰箱分类/位次/单价 取自 stock_data_system 里**该系统**那一行（2026-09-18 起按系统各存一份）；
     *  为空（总览）时这三个字段返回空，总览改用 service 拼好的「4 套」文本 */
    List<Map<String, Object>> listRows(@Param("systemAssign") String systemAssign,
                                       @Param("keyword") String keyword,
                                       @Param("exact") boolean exact);

    /** 插入新记录（price/冰箱分类/位次 不在这里写：2026-09-18 起改由 StockDataSystemMapper 按系统写） */
    int insertRow(@Param("r") Map<String, Object> r);

    /** 刚插入行的自增 id（@Transactional 内与 insertRow 同一连接） */
    Integer lastInsertId();

    /** 更新记录（price/冰箱分类/位次 同上，不在这里写） */
    int updateRow(@Param("id") Integer id, @Param("r") Map<String, Object> r);

    /** 批准记录（设置 approver） */
    int approveRow(@Param("id") Integer id, @Param("approver") String approver);

    /** 某货品在某系统台账表里的净库存（停用前校验用；按货品编号匹配，table 只允许 stockinout_data / jXstockedit_data） */
    java.math.BigDecimal netStockByCode(@Param("table") String table, @Param("productCode") String productCode);

    /** 删除记录 */
    int deleteRow(@Param("id") Integer id);
}
