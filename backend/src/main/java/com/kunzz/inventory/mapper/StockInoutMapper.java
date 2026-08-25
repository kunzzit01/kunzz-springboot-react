package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 分店进出货 Mapper（jXstockedit_data 表，对齐 stockeditall?system=j1/j2/j3）
 */
@Mapper
public interface StockInoutMapper {

    /** 分店流水分页列表（表名动态） */
    List<Map<String, Object>> listBranch(@Param("table") String table,
                                         @Param("keyword") String keyword,
                                         @Param("startDate") String startDate,
                                         @Param("endDate") String endDate,
                                         @Param("offset") int offset,
                                         @Param("size") int size);

    /** 分店流水总数 */
    long countBranch(@Param("table") String table,
                     @Param("keyword") String keyword,
                     @Param("startDate") String startDate,
                     @Param("endDate") String endDate);

    /** 分店新增 */
    int insertBranch(@Param("table") String table, @Param("r") Map<String, Object> r);

    /** 分店更新 */
    int updateBranch(@Param("table") String table, @Param("id") Integer id, @Param("r") Map<String, Object> r);

    /** 分店软删除 */
    int softDeleteBranch(@Param("table") String table, @Param("id") Integer id, @Param("deletedBy") String deletedBy);

    /** 分店恢复（撤销删除：清空 deleted_at/deleted_by） */
    int restoreBranch(@Param("table") String table, @Param("id") Integer id);

    /** 查分店记录的中央关联 id */
    Integer findBranchMainId(@Param("table") String table, @Param("id") Integer id);

    // ---------- 分店进出库表（jXstockinout_data，对齐旧系统 saveToJ1Table） ----------

    /** 中央出库转分店入库（main_record_id 关联中央记录，target_system='from_main'） */
    int insertBranchInout(@Param("table") String table, @Param("r") Map<String, Object> r);

    /** 按 main_record_id 更新分店入库记录（同步中央出库修改） */
    int updateBranchInoutByMainId(@Param("table") String table, @Param("mainId") Integer mainId, @Param("r") Map<String, Object> r);

    /** 按 main_record_id 软删除分店入库记录 */
    int softDeleteBranchInoutByMainId(@Param("table") String table, @Param("mainId") Integer mainId, @Param("deletedBy") String deletedBy);

    /** 按 产品名+收货人+目标系统 匹配软删除分店 stockedit 记录（仅用于无法拿到 main_record_id 的历史兼容场景） */
    int softDeleteBranchEditByMatch(@Param("table") String table, @Param("productName") String productName,
                                    @Param("receiver") String receiver, @Param("targetSystem") String targetSystem,
                                    @Param("deletedBy") String deletedBy);

    /** 按 main_record_id 精确软删除分店 stockedit 记录（8/23 线上修复：避免按 产品名+收货人 误删同品名历史记录） */
    int softDeleteBranchEditByMainId(@Param("table") String table, @Param("mainId") Integer mainId,
                                     @Param("targetSystem") String targetSystem, @Param("deletedBy") String deletedBy);

    /** 按 main_record_id 恢复分店入库记录 */
    int restoreBranchInoutByMainId(@Param("table") String table, @Param("mainId") Integer mainId);

    /** 按 main_record_id 恢复分店 stockedit 记录 */
    int restoreBranchEditByMainId(@Param("table") String table, @Param("mainId") Integer mainId,
                                  @Param("targetSystem") String targetSystem);

    // ---------- 出库库存校验（事务内，对齐旧系统） ----------

    /** 中央库存可用量（stockinout_data，排除 SOT） */
    java.math.BigDecimal availableStockCentral(@Param("productName") String productName, @Param("price") java.math.BigDecimal price);

    /** 分店库存可用量（jXstockedit_data） */
    java.math.BigDecimal availableStockBranch(@Param("table") String table, @Param("productName") String productName, @Param("price") java.math.BigDecimal price);

    /** 按产品名精确匹配查询进出货明细（进出货检查弹窗；日期范围可选） */
    List<Map<String, Object>> checkInout(@Param("table") String table,
                                         @Param("productName") String productName,
                                         @Param("startDate") String startDate,
                                         @Param("endDate") String endDate);

    // ---------- 备注编号（对齐旧系统 generateRemarkCode / product_remark_codes） ----------

    /** 同前缀所有备注编号 + 净库存（用于计算下一个可用编号，避让在库） */
    List<Map<String, Object>> remarkCodePool(@Param("prefix") String prefix);

    /** 产品是否存在在库（净库存>0）备注编号 */
    long countInStockRemarkNumber(@Param("productName") String productName);

    /** 备注编号是否在库（净库存>0） */
    long countRemarkNumberInStock(@Param("productName") String productName, @Param("remarkNumber") String remarkNumber);
}
