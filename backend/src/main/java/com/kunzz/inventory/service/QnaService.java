package com.kunzz.inventory.service;

import com.kunzz.inventory.common.BusinessException;
import com.kunzz.inventory.entity.QnaResponse;
import com.kunzz.inventory.repository.QnaResponseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * 问卷回答（对应 qna / qnaapi，10 个问题）
 */
@Service
@RequiredArgsConstructor
public class QnaService {

    private final QnaResponseRepository qnaRepo;

    @Transactional(readOnly = true)
    public List<QnaResponse> list() {
        return qnaRepo.findAllByOrderByCreatedAtDesc();
    }

    /** 当前用户的问卷（未提交返回 null，对齐线上 qnaapi GET） */
    @Transactional(readOnly = true)
    public Optional<QnaResponse> findMine(Integer userId) {
        return qnaRepo.findByUserId(userId);
    }

    /** 提交问卷：同一用户重复提交时覆盖更新原记录（刷新后可再次填写） */
    @Transactional
    public QnaResponse create(Integer userId, QnaResponse r) {
        QnaResponse entity = qnaRepo.findByUserId(userId).orElseGet(QnaResponse::new);
        entity.setUserId(userId);
        entity.setQuestion1(r.getQuestion1());
        entity.setQuestion2(r.getQuestion2());
        entity.setQuestion3(r.getQuestion3());
        entity.setQuestion4(r.getQuestion4());
        entity.setQuestion5(r.getQuestion5());
        entity.setQuestion6(r.getQuestion6());
        entity.setQuestion7(r.getQuestion7());
        entity.setQuestion8(r.getQuestion8());
        entity.setQuestion9(r.getQuestion9());
        entity.setQuestion10(r.getQuestion10());
        return qnaRepo.save(entity);
    }

    @Transactional
    public void delete(Integer id) {
        if (!qnaRepo.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        qnaRepo.deleteById(id);
    }
}
