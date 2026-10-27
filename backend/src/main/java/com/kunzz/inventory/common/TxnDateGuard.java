package com.kunzz.inventory.common;

import java.time.LocalDate;

/**
 * 进出货业务日期兜底校验。
 *
 * <p>起因（2026-10-27）：一批 15 条出库的 date 被前端提交成 {@code 0015-10-27}（应为 2026-10-27），
 * 其它字段全部正常，后端照单全收。结果这 15 条（RM 2,265.55）在按日期区间的报表 / 导出 /
 * 本月供货额里整批消失，而库存余额因为是不带日期条件的净额计算反而没暴露问题——
 * 属于"账平了、报表对不上"的隐性事故，只能靠人工翻数据发现。</p>
 *
 * <p>规则：年份早于 {@link #MIN_YEAR} 一律拒绝保存，直接 400 让用户看到。
 * 日期为 null 时放行，各调用点原有的"默认今天"逻辑保持不变。</p>
 */
public final class TxnDateGuard {

    /** 允许的最早业务日期年份；早于此值视为输入/解析错误（不是历史数据，历史数据也不会经过保存接口） */
    public static final int MIN_YEAR = 2000;

    private TxnDateGuard() {
    }

    /**
     * 校验进出货业务日期。
     *
     * @param date 业务日期，可为 null（表示沿用调用方的默认值）
     * @throws BusinessException 年份早于 {@link #MIN_YEAR}
     */
    public static void requireSane(LocalDate date) {
        if (date == null) return;
        if (date.getYear() < MIN_YEAR) {
            throw new BusinessException("日期不合法：" + date
                    + "（年份早于 " + MIN_YEAR + "）。请检查日期输入，正常应为今天或近期日期。");
        }
    }
}
