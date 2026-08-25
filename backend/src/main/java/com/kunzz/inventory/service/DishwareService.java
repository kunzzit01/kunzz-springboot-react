package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.dto.*;
import com.kunzz.inventory.entity.*;
import com.kunzz.inventory.mapper.DishwareBreakMapper;
import com.kunzz.inventory.mapper.DishwareTransferMapper;
import com.kunzz.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 餐具管理：碗碟信息 / 库存 / 套装 / 破损 / 调拨
 */
@Service
@RequiredArgsConstructor
public class DishwareService {

    private final DishwareInfoRepository infoRepo;
    private final DishwareStockRepository stockRepo;
    private final DishwareSetRepository setRepo;
    private final DishwareSetItemRepository setItemRepo;
    private final DishwareBreakRecordRepository breakRepo;
    private final DishwareBreakMapper dishwareBreakMapper;
    private final DishwareSetBreakRecordRepository setBreakRepo;
    private final DishwareTransferRecordRepository transferRepo;
    private final DishwareTransferMapper dishwareTransferMapper;
    private final DishwareSetStockRepository setStockRepo;
    private final DishwareLocationRepository locationRepo;

    // ---------- 碗碟信息 ----------

    @Transactional(readOnly = true)
    public List<DishwareInfo> listInfos() {
        return infoRepo.findAllByOrderByIdAsc();
    }

    @Transactional
    public DishwareInfo createInfo(DishwareInfoRequest req) {
        DishwareInfo d = new DishwareInfo();
        applyInfo(d, req);
        return infoRepo.save(d);
    }

    @Transactional
    public DishwareInfo updateInfo(Integer id, DishwareInfoRequest req) {
        DishwareInfo d = infoRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "碗碟不存在"));
        applyInfo(d, req);
        return infoRepo.save(d);
    }

    @Transactional
    public void deleteInfo(Integer id) {
        if (!infoRepo.existsById(id)) {
            throw new BusinessException(404, "碗碟不存在");
        }
        stockRepo.findByDishwareId(id).ifPresent(s -> stockRepo.delete(s));
        infoRepo.deleteById(id);
    }

    private void applyInfo(DishwareInfo d, DishwareInfoRequest req) {
        d.setProductName(req.productName());
        d.setCodeNumber(req.codeNumber());
        d.setCategory(req.category());
        d.setSize(req.size());
        d.setUnitPrice(req.unitPrice());
        d.setPhotoPath(req.photoPath());
    }

    // ---------- 碗碟库存（含信息联查） ----------

    @Transactional(readOnly = true)
    public List<DishwareStockVO> listStocks(String keyword, String category) {
        List<DishwareInfo> infos = infoRepo.findAllByOrderByIdAsc();
        Map<Integer, DishwareStock> stocks = stockRepo.findAll().stream()
                .collect(Collectors.toMap(DishwareStock::getDishwareId, Function.identity(), (a, b) -> a));
        return infos.stream()
                .filter(i -> keyword == null || keyword.isBlank()
                        || i.getProductName().toLowerCase().contains(keyword.toLowerCase())
                        || (i.getCodeNumber() != null && i.getCodeNumber().toLowerCase().contains(keyword.toLowerCase())))
                .filter(i -> category == null || category.isBlank() || category.equals(i.getCategory()))
                .map(i -> DishwareStockVO.from(i, stocks.get(i.getId())))
                .toList();
    }

    @Transactional
    public DishwareStock updateStock(Integer dishwareId, DishwareStockRequest req) {
        DishwareStock s = stockRepo.findByDishwareId(dishwareId).orElseGet(() -> {
            DishwareStock n = new DishwareStock();
            n.setDishwareId(dishwareId);
            return n;
        });
        s.setWenhuaQuantity(req.wenhuaQuantity());
        s.setCentralQuantity(req.centralQuantity());
        s.setJ1Quantity(req.j1Quantity());
        s.setJ2Quantity(req.j2Quantity());
        s.setJ3Quantity(req.j3Quantity());
        s.setTotalQuantity(req.wenhuaQuantity() + req.centralQuantity()
                + req.j1Quantity() + req.j2Quantity() + req.j3Quantity());
        return stockRepo.save(s);
    }

    // ---------- 套装 ----------

    @Transactional(readOnly = true)
    public List<DishwareSet> listSets() {
        return setRepo.findAllByOrderByIdAsc();
    }

    @Transactional
    public DishwareSet createSet(DishwareSetRequest req) {
        DishwareSet s = new DishwareSet();
        applySet(s, req);
        return setRepo.save(s);
    }

    @Transactional
    public DishwareSet updateSet(Integer id, DishwareSetRequest req) {
        DishwareSet s = setRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "套装不存在"));
        applySet(s, req);
        return setRepo.save(s);
    }

    @Transactional
    public void deleteSet(Integer id) {
        if (!setRepo.existsById(id)) {
            throw new BusinessException(404, "套装不存在");
        }
        setItemRepo.deleteBySetId(id);
        setRepo.deleteById(id);
    }

    private void applySet(DishwareSet s, DishwareSetRequest req) {
        s.setSetName(req.setName());
        s.setSetCode(req.setCode());
        s.setSetSize(req.setSize());
        s.setSetPrice(req.setPrice());
        s.setDescription(req.description());
        s.setIsActive(req.isActive() == null ? Boolean.TRUE : req.isActive());
    }

    // ---------- 套装明细 ----------

    @Transactional(readOnly = true)
    public List<DishwareSetItem> listSetItems(Integer setId) {
        return setItemRepo.findBySetIdOrderBySortOrderAsc(setId);
    }

    /** 全量替换套装明细 */
    @Transactional
    public void saveSetItems(Integer setId, List<DishwareSetItemRequest> items) {
        setRepo.findById(setId).orElseThrow(() -> new BusinessException(404, "套装不存在"));
        setItemRepo.deleteBySetId(setId);
        int sort = 1;
        for (DishwareSetItemRequest it : items) {
            DishwareSetItem item = new DishwareSetItem();
            item.setSetId(setId);
            item.setDishwareId(it.dishwareId());
            item.setQuantityInSet(it.quantityInSet());
            item.setSortOrder(sort++);
            setItemRepo.save(item);
        }
    }

    // ---------- 破损记录 ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listBreaks(String shopType, String startDate, String endDate) {
        // 对齐旧系统 damage_records：服务端按店 + 日期范围过滤，联表返回编号/名称
        return dishwareBreakMapper.listBreaks(shopType, startDate, endDate);
    }

    @Transactional
    public DishwareBreakRecord createBreak(DishwareBreakRequest req) {
        DishwareBreakRecord r = new DishwareBreakRecord();
        applyBreak(r, req);
        return breakRepo.save(r);
    }

    @Transactional
    public DishwareBreakRecord updateBreak(Integer id, DishwareBreakRequest req) {
        DishwareBreakRecord r = breakRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        applyBreak(r, req);
        return breakRepo.save(r);
    }

    @Transactional
    public void deleteBreak(Integer id) {
        if (!breakRepo.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        breakRepo.deleteById(id);
    }

    private void applyBreak(DishwareBreakRecord r, DishwareBreakRequest req) {
        r.setDishwareId(req.dishwareId());
        r.setShopType(req.shopType());
        r.setBreakQuantity(req.breakQuantity());
        r.setChargeableQuantity(req.chargeableQuantity() == null ? 0 : req.chargeableQuantity());
        r.setUnitPrice(req.unitPrice());
        r.setTotalPrice(req.totalPrice());
        r.setBreakDate(req.breakDate());
        r.setRecordedBy(req.recordedBy());
    }

    // ---------- 调拨记录 ----------

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listTransfers(String shopType, String startDate, String endDate) {
        // 对齐旧系统 transfer_records：服务端按店 + 日期范围过滤，联表返回编号/餐厅名
        return dishwareTransferMapper.listTransfers(shopType, startDate, endDate);
    }

    @Transactional
    public DishwareTransferRecord createTransfer(DishwareTransferRequest req) {
        DishwareTransferRecord r = new DishwareTransferRecord();
        r.setDishwareId(req.dishwareId());
        r.setFromRestaurantId(req.fromRestaurantId() != null ? req.fromRestaurantId() : resolveRestaurantId(req.fromShopType()));
        r.setToRestaurantId(req.toRestaurantId() != null ? req.toRestaurantId() : resolveRestaurantId(req.toShopType()));
        r.setFromShopType(req.fromShopType());
        r.setToShopType(req.toShopType());
        r.setQuantity(req.quantity());
        r.setUnitPrice(req.unitPrice());
        r.setTotalPrice(req.totalPrice());
        r.setTransferDate(req.transferDate() == null ? LocalDate.now() : req.transferDate());
        r.setRecordType("out");
        r.setRecordedBy(req.recordedBy());
        DishwareTransferRecord out = transferRepo.save(r);
        // 对齐旧系统：每次转卖自动生成对应的进货（in）记录，related_record_id 关联出货记录
        DishwareTransferRecord in = new DishwareTransferRecord();
        in.setDishwareId(out.getDishwareId());
        in.setFromRestaurantId(out.getFromRestaurantId());
        in.setToRestaurantId(out.getToRestaurantId());
        in.setFromShopType(out.getFromShopType());
        in.setToShopType(out.getToShopType());
        in.setQuantity(out.getQuantity());
        in.setUnitPrice(out.getUnitPrice());
        in.setTotalPrice(out.getTotalPrice());
        in.setTransferDate(out.getTransferDate());
        in.setRecordType("in");
        in.setRecordedBy("system");
        in.setRelatedRecordId(out.getId());
        transferRepo.save(in);
        return out;
    }

    @Transactional
    public DishwareTransferRecord updateTransfer(Integer id, DishwareTransferRequest req) {
        DishwareTransferRecord r = transferRepo.findById(id)
                .orElseThrow(() -> new BusinessException(404, "记录不存在"));
        r.setDishwareId(req.dishwareId());
        r.setFromRestaurantId(req.fromRestaurantId() != null ? req.fromRestaurantId() : resolveRestaurantId(req.fromShopType()));
        r.setToRestaurantId(req.toRestaurantId() != null ? req.toRestaurantId() : resolveRestaurantId(req.toShopType()));
        r.setFromShopType(req.fromShopType());
        r.setToShopType(req.toShopType());
        r.setQuantity(req.quantity());
        r.setUnitPrice(req.unitPrice());
        r.setTotalPrice(req.totalPrice());
        r.setTransferDate(req.transferDate());
        r.setRecordType(req.recordType() == null ? r.getRecordType() : req.recordType());
        r.setRecordedBy(req.recordedBy());
        r = transferRepo.save(r);
        // 同步关联的 in/out 记录，保持成对数据一致
        syncRelatedTransfer(r);
        return r;
    }

    /** 同步关联记录（out ↔ in，related_record_id 关联），避免只更新一半 */
    private void syncRelatedTransfer(DishwareTransferRecord r) {
        DishwareTransferRecord related;
        if ("in".equals(r.getRecordType())) {
            related = r.getRelatedRecordId() != null ? transferRepo.findById(r.getRelatedRecordId()).orElse(null) : null;
        } else {
            related = transferRepo.findByRelatedRecordId(r.getId());
        }
        if (related == null) return;
        related.setDishwareId(r.getDishwareId());
        related.setFromRestaurantId(r.getFromRestaurantId());
        related.setToRestaurantId(r.getToRestaurantId());
        related.setFromShopType(r.getFromShopType());
        related.setToShopType(r.getToShopType());
        related.setQuantity(r.getQuantity());
        related.setUnitPrice(r.getUnitPrice());
        related.setTotalPrice(r.getTotalPrice());
        related.setTransferDate(r.getTransferDate());
        transferRepo.save(related);
    }

    /** 按店面名（不区分大小写）解析餐厅 ID（对齐旧系统 from_restaurant_id / to_restaurant_id） */
    private Integer resolveRestaurantId(String shopType) {
        if (shopType == null || shopType.isBlank()) return null;
        return locationRepo.findAll().stream()
                .filter(l -> l.getName() != null && l.getName().equalsIgnoreCase(shopType.trim()))
                .map(DishwareLocation::getId)
                .findFirst().orElse(null);
    }

    @Transactional
    public void deleteTransfer(Integer id) {
        if (!transferRepo.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        transferRepo.deleteById(id);
    }

    // ---------- 存放地点 ----------

    @Transactional(readOnly = true)
    public List<DishwareLocation> listLocations() {
        return locationRepo.findAllByOrderByDisplayOrderAscIdAsc();
    }

    /** 新增餐厅店面（对齐旧系统 addRestaurant） */
    @Transactional
    public DishwareLocation createLocation(Map<String, Object> body) {
        String name = body.get("name") == null ? "" : String.valueOf(body.get("name")).trim();
        if (name.isBlank()) throw new BusinessException("餐厅店面名称不能为空");
        DishwareLocation l = new DishwareLocation();
        l.setName(name);
        int order = locationRepo.findAll().stream().mapToInt(x -> x.getDisplayOrder() == null ? 0 : x.getDisplayOrder()).max().orElse(0) + 1;
        l.setDisplayOrder(order);
        l.setIsActive(true);
        return locationRepo.save(l);
    }

    /** 更新餐厅店面 */
    @Transactional
    public DishwareLocation updateLocation(Integer id, Map<String, Object> body) {
        DishwareLocation l = locationRepo.findById(id).orElseThrow(() -> new BusinessException(404, "餐厅店面不存在"));
        if (body.get("name") != null) l.setName(String.valueOf(body.get("name")).trim());
        if (body.get("displayOrder") != null) {
            try { l.setDisplayOrder(Integer.parseInt(String.valueOf(body.get("displayOrder")))); } catch (Exception ignored) {}
        }
        if (body.get("isActive") != null) l.setIsActive(Boolean.parseBoolean(String.valueOf(body.get("isActive"))));
        return locationRepo.save(l);
    }

    /** 删除餐厅店面 */
    @Transactional
    public void deleteLocation(Integer id) {
        if (!locationRepo.existsById(id)) throw new BusinessException(404, "餐厅店面不存在");
        locationRepo.deleteById(id);
    }
}
