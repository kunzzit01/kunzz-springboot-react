package com.kunzz.inventory.security;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 有界 + 到期自动回收的内存 Map。
 *
 * 为什么不用裸 ConcurrentHashMap：限速/封锁这类计数器的键由请求方决定（客户端 IP 等），
 * 裸 Map 有两个洞——① 过期条目没有回收路径，② 条数无上限。轮换请求头就能无限新增键，
 * 把堆内存灌爆导致整站不可用，而限速本身又没有拦住任何东西。
 *
 * 淘汰策略：条数超过 maxEntries 时，先清掉已过期条目，仍超则按插入顺序淘汰最旧的一条。
 * 线程安全由 synchronized 保证（登录/发信接口的调用频率很低，不需要更复杂的并发结构）。
 */
public class BoundedExpiryMap<V> {

    private final long ttlMillis;
    private final int maxEntries;
    private final Map<String, Entry<V>> map = new LinkedHashMap<>(16, 0.75f, false);

    private record Entry<V>(V value, long expiresAt) {}

    public BoundedExpiryMap(long ttlMillis, int maxEntries) {
        this.ttlMillis = ttlMillis;
        this.maxEntries = maxEntries;
    }

    /** 到期条目按「不存在」返回，并顺手删掉 */
    public synchronized V get(String key) {
        Entry<V> e = map.get(key);
        if (e == null) return null;
        if (e.expiresAt() <= System.currentTimeMillis()) {
            map.remove(key);
            return null;
        }
        return e.value();
    }

    public synchronized void put(String key, V value) {
        // 重新写入要挪到队尾：LinkedHashMap 原地更新不改插入顺序，否则老键会按旧位置被优先淘汰
        map.remove(key);
        if (map.size() >= maxEntries) evict();
        map.put(key, new Entry<>(value, System.currentTimeMillis() + ttlMillis));
    }

    public synchronized void remove(String key) {
        map.remove(key);
    }

    public synchronized int size() {
        return map.size();
    }

    /** 先清过期（插入顺序 ≈ 到期顺序，遇到未过期的即可停），仍满才淘汰最旧一条 */
    private void evict() {
        long now = System.currentTimeMillis();
        for (Iterator<Entry<V>> it = map.values().iterator(); it.hasNext(); ) {
            if (it.next().expiresAt() > now) break;
            it.remove();
        }
        if (map.size() >= maxEntries) {
            Iterator<String> it = map.keySet().iterator();
            if (it.hasNext()) {
                it.next();
                it.remove();
            }
        }
    }
}
