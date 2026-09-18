package com.kunzz.inventory.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 货品「按系统各存一份」的字段（冰箱分类 / 位次 / 默认单价）—— 表 stock_data_system（2026-09-18）
 *
 * 背景：这三列原先都在 stock_data 上、一行货品一个值，在中央页改完 J1/J2/J3 跟着一起变。
 * 现在每个系统一行（stock_data_id + stock_system 唯一），读写都带系统。
 * stock_data 里旧的三列保留但不再读写（迁移脚本已把现值复制进本表）。
 */
@Mapper
public interface StockDataSystemMapper {

    /** 按系统写入（不存在则插入）。只更新传入非 null 的列，未携带的字段不动 */
    int upsert(@Param("dataId") Integer dataId,
               @Param("system") String system,
               @Param("category") String category,
               @Param("pos") Integer pos,
               @Param("price") Double price);

    /** 某系统下所有货品的 [货品名, 冰箱分类, 位次]（总库存「冰箱分类+排序」用；按 stock_data.id 升序，同名取第一条） */
    List<Map<String, Object>> freezerRows(@Param("system") String system);

    /** 全量「各系统三件套」（总览只读展示 4 套用；887 行的小表，一次拉全） */
    List<Map<String, Object>> allRows();

    /** 某货品在某系统的默认单价（进货自动抓取；无则 null） */
    Double defaultPrice(@Param("productName") String productName,
                        @Param("codeNumber") String codeNumber,
                        @Param("system") String system);

    /** 货品被删除时清掉它的全部按系统行（避免留孤儿行） */
    int deleteByDataId(@Param("dataId") Integer dataId);

    /** 某货品在某系统当前的默认单价（改价日志取"改前旧价"用；不看 > 0 过滤） */
    Double priceOf(@Param("dataId") Integer dataId, @Param("system") String system);

    // ---------- 冰箱分类字典（FreezerCategoryService）用：改名/删分类/用量统计都打这张表 ----------

    /** 找出所有引用该分类的行（FIND_IN_SET 按逗号 token 精确匹配，避免 LIKE 误命中前缀）；带 product_name 供报错文案用 */
    List<Map<String, Object>> findByFreezerToken(@Param("name") String name);

    /** 只更新 freezer_category 单列（按本表 id，不整行覆写，避免覆盖并发编辑的其它字段） */
    int updateFreezerOnly(@Param("id") Integer id, @Param("value") String value);

    /** 用量统计用：[stock_data_id, freezer_category] 全量行（service 按 token 拆开、按货品去重后计数） */
    List<Map<String, Object>> usageRows();
}
