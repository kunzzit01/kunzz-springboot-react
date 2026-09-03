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

    /** 列表（systemAssign 为 null/空 = 总览全部；keyword：exact=false 多字段模糊（名称/编号/规格/类型/供应商/冰箱分类），exact=true 货品名完全等于） */
    List<Map<String, Object>> listRows(@Param("systemAssign") String systemAssign,
                                       @Param("keyword") String keyword,
                                       @Param("exact") boolean exact);

    /** 插入新记录 */
    int insertRow(@Param("r") Map<String, Object> r);

    /** 更新记录 */
    int updateRow(@Param("id") Integer id, @Param("r") Map<String, Object> r);

    /** 进货默认单价（货品种类里最新维护的 price，无则 null） */
    Double defaultPrice(@Param("productName") String productName,
                        @Param("codeNumber") String codeNumber);

    /** 批准记录（设置 approver） */
    int approveRow(@Param("id") Integer id, @Param("approver") String approver);

    /** 删除记录 */
    int deleteRow(@Param("id") Integer id);
}
