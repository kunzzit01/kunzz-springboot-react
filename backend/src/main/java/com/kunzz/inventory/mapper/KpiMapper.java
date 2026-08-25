package com.kunzz.inventory.mapper;

import com.kunzz.inventory.entity.BaseBranchCost;
import com.kunzz.inventory.entity.BaseBranchDaily;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * KPI 报表 Mapper：按分店动态表名查询/保存日报与成本
 */
@Mapper
public interface KpiMapper {

    /** 某分店全部日报（表名动态：j1data/j2data/j3data；BaseBranchDaily 为抽象类，返回 Map） */
    List<Map<String, Object>> listDailies(@Param("table") String table, @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 某分店全部成本 */
    List<Map<String, Object>> listCosts(@Param("table") String table, @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 删除某分店某日日报 */
    int deleteDailyByDate(@Param("table") String table, @Param("date") LocalDate date);

    /** 插入日报 */
    int insertDaily(@Param("table") String table, @Param("d") Map<String, Object> d);

    /** 删除某分店某日成本 */
    int deleteCostByDate(@Param("table") String table, @Param("date") LocalDate date);

    /** 插入成本 */
    int insertCost(@Param("table") String table, @Param("c") Map<String, Object> c);

    /** 某日期区间 J1 供应给 J2/J3 的合计 */
    Map<String, Object> listSupplyBetween(@Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    /** 查询某店某月当前库存 */
    Map<String, Object> getMonthStock(@Param("restaurant") String restaurant, @Param("yearMonth") String yearMonth);

    /** 保存某店某月当前库存（restaurant+year_month 唯一键 upsert） */
    int upsertMonthStock(@Param("m") Map<String, Object> m);
}
