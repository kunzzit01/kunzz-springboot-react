package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 手机版进出货 Mapper（对齐旧系统 jXstockeditmobile_api.php）
 *
 * 双表架构（与旧 live 完全一致，数据互认的生命线）：
 *   ① jXstockeditmobile_data  手机台账（主写）
 *   ② jXstocklist_total       库存总数缓存（手机总库存页数据源）
 *   ③ jXstockedit_data        桌面正式台账（镜像同步，receiver='Mobile' + mobile_ref_id 关联）
 * tableName 一律由 service 白名单映射（j1/j2/j3 前缀拼接），禁止前端直传。
 */
@Mapper
public interface MobileStockMapper {

    // ---------- 手机台账 CRUD ----------

    List<Map<String, Object>> listRecords(@Param("table") String table,
                                          @Param("start") String start,
                                          @Param("end") String end,
                                          @Param("productName") String productName,
                                          @Param("limit") int limit);

    Map<String, Object> getRecord(@Param("table") String table, @Param("id") Integer id);

    int insertRecord(@Param("table") String table, @Param("r") Map<String, Object> r);

    int updateRecord(@Param("table") String table, @Param("r") Map<String, Object> r);

    int deleteRecord(@Param("table") String table, @Param("id") Integer id);

    // ---------- 桌面表镜像（syncToJXStockEditData 对齐实现） ----------

    /** 最近一条非 Mobile 来源的记录（specification/price/type 匹配信息） */
    Map<String, Object> latestMatchInfo(@Param("table") String table, @Param("productName") String productName);

    /** 台账主数据兜底（specification/price/category） */
    Map<String, Object> masterInfo(@Param("productName") String productName);

    String masterCategory(@Param("productName") String productName);

    /** HIFO 分层：按 (price, specification) 分组可用库存，价格从高到低，FOR UPDATE 锁定（与旧版一致） */
    List<Map<String, Object>> hifoTiers(@Param("table") String table,
                                        @Param("productName") String productName,
                                        @Param("codeNumber") String codeNumber,
                                        @Param("specification") String specification);


    /** 价格层（按 price+spec 分组，含可用量/超扣负数；对齐旧 product_stock_by_price，电话版出货拆层用） */
    List<Map<String, Object>> tiersWithSpec(@Param("table") String table,
                                            @Param("productName") String productName,
                                            @Param("codeNumber") String codeNumber);

    /** 指定价格的可用库存（跨规格汇总，含负数；出货指定价格层时的预检） */
    BigDecimal availableAtPrice(@Param("table") String table,
                                @Param("productName") String productName,
                                @Param("codeNumber") String codeNumber,
                                @Param("price") BigDecimal price);

    /** 查找该价格层实际使用的 specification（确保出货写入同一库存桶，对齐 resolveInboundSpecForPrice） */
    String resolveInboundSpecForPrice(@Param("table") String table,
                                      @Param("productName") String productName,
                                      @Param("codeNumber") String codeNumber,
                                      @Param("price") BigDecimal price);

    /** 镜像单行插入（receiver='Mobile'，含 mobile_ref_id） */
    int insertDesktopRow(@Param("table") String table, @Param("r") Map<String, Object> r);

    /** 按 mobile_ref_id 精准删除镜像行（出货拆行会产生多行，一并删） */
    int deleteDesktopByRef(@Param("table") String table,
                           @Param("refId") Integer refId,
                           @Param("system") String system);

    // ---------- 库存总数缓存（jXstocklist_total） ----------

    Map<String, Object> findTotal(@Param("table") String table,
                                  @Param("productName") String productName,
                                  @Param("codeNumber") String codeNumber,
                                  @Param("specification") String specification);

    int adjustTotal(@Param("table") String table,
                    @Param("productName") String productName,
                    @Param("codeNumber") String codeNumber,
                    @Param("specification") String specification,
                    @Param("deltaIn") BigDecimal deltaIn,
                    @Param("deltaOut") BigDecimal deltaOut);

    int insertTotal(@Param("table") String table,
                    @Param("productName") String productName,
                    @Param("codeNumber") String codeNumber,
                    @Param("specification") String specification,
                    @Param("qty") BigDecimal qty);

    /** 电话版列表：按 (product, code, spec) 实时计算（对齐旧 stocklist_total action） */
    List<Map<String, Object>> phoneStockList(@Param("table") String table);

    /** 总记录数（对齐旧 stats 总记录口径） */
    Integer summaryCount(@Param("table") String table);

    List<Map<String, Object>> listTotals(@Param("table") String table);
}
