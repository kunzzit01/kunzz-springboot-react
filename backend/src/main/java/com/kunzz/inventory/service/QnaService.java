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

    /** 提交问卷：每个用户只能提交一次（对齐线上 qnaapi POST） */
    @Transactional
    public QnaResponse create(Integer userId, QnaResponse r) {
        if (qnaRepo.findByUserId(userId).isPresent()) {
            throw new BusinessException("您已经提交过问卷，每个用户只能提交一次");
        }
        r.setUserId(userId);
        r.setId(null);
        return qnaRepo.save(r);
    }

    @Transactional
    public void delete(Integer id) {
        if (!qnaRepo.existsById(id)) {
            throw new BusinessException(404, "记录不存在");
        }
        qnaRepo.deleteById(id);
    }
}
