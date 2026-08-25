package com.kunzz.inventory.controller;

import com.kunzz.inventory.common.ApiResponse;
import com.kunzz.inventory.entity.QnaResponse;
import com.kunzz.inventory.entity.User;
import com.kunzz.inventory.service.QnaService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/qna")
@RequiredArgsConstructor
public class QnaController {

    private final QnaService qnaService;

    @GetMapping
    public ApiResponse<List<QnaResponse>> list() {
        return ApiResponse.ok(qnaService.list());
    }

    /** 当前用户问卷（未提交返回 null） */
    @GetMapping("/mine")
    public ApiResponse<QnaResponse> mine(Authentication auth) {
        User u = (User) auth.getPrincipal();
        return ApiResponse.ok(qnaService.findMine(u.getId()).orElse(null));
    }

    /** 提交问卷（每用户仅一次） */
    @PostMapping
    public ApiResponse<QnaResponse> create(@RequestBody QnaResponse r, Authentication auth) {
        User u = (User) auth.getPrincipal();
        return ApiResponse.ok(qnaService.create(u.getId(), r));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Integer id) {
        qnaService.delete(id);
        return ApiResponse.ok();
    }
}
