// ======= 替代方案：完全禁用Swiper滚轮响应 =======
document.addEventListener("DOMContentLoaded", function () {
    const environmentSwiper = new Swiper('.environment-wrapper', {
        slidesPerView: 3,
        spaceBetween: 0,
        centeredSlides: false,
        loop: true,
        
        // 完全禁用滚轮和自动播放
        mousewheel: false,
        autoplay: false,
        
        pagination: {
            el: '.environment-wrapper .swiper-pagination',
            clickable: true,
        },
        
        navigation: {
            nextEl: '.environment-wrapper .swiper-button-next',
            prevEl: '.environment-wrapper .swiper-button-prev',
        },
        
        breakpoints: {
            1024: { slidesPerView: 3, spaceBetween: 0 },
            768: { slidesPerView: 2, spaceBetween: 0 },
            480: { slidesPerView: 1, spaceBetween: 0 }
        },
        
        watchOverflow: true,
        observer: true,
        observeParents: true,
        
        // 允许触摸和鼠标拖拽，但只允许水平方向
        allowTouchMove: true,
        touchStartPreventDefault: false,
        touchMoveStopPropagation: false,
        simulateTouch: true,  // 允许鼠标拖拽模拟触摸
        grabCursor: true,     // 显示抓手光标
    });
    
    // 方法1：直接覆盖Swiper的滚轮事件处理
    setTimeout(() => {
        if (environmentSwiper.mousewheel) {
            environmentSwiper.mousewheel.disable();
        }
        
        // 强制移除所有滚轮事件监听器
        const swiperEl = document.querySelector('.environment-wrapper');
        if (swiperEl) {
            // 克隆元素来移除所有事件监听器
            const newSwiperEl = swiperEl.cloneNode(true);
            swiperEl.parentNode.replaceChild(newSwiperEl, swiperEl);
            
            // 相同的配置，但禁用自动播放和滚轮
            const newSwiper = new Swiper('.environment-wrapper', {
                slidesPerView: 3,
                spaceBetween: 0,
                loop: true,
                mousewheel: false, // 确保这个是false
                autoplay: false,   // 禁用自动播放
                pagination: { el: '.environment-wrapper .swiper-pagination', clickable: true },
                navigation: {
                    nextEl: '.environment-wrapper .swiper-button-next',
                    prevEl: '.environment-wrapper .swiper-button-prev',
                },
                breakpoints: {
                    1024: { slidesPerView: 3, spaceBetween: 0 },
                    768: { slidesPerView: 2, spaceBetween: 0 },
                    480: { slidesPerView: 1, spaceBetween: 0 }
                },
                allowTouchMove: true,     // 允许拖拽
                simulateTouch: true,      // 允许鼠标拖拽
                grabCursor: true,         // 显示抓手光标
                touchStartPreventDefault: false,
                touchMoveStopPropagation: false,
            });
        }
    }, 100);
});

document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.querySelector(".navbar");
  let lastScrollTop = window.scrollY;

  const backToTopBtn = document.getElementById("backToTop"); // 回到顶部按钮

  window.addEventListener("scroll", function () {
      const scrollTop = window.scrollY;

      // 导航栏隐藏/显示逻辑
      if (scrollTop > lastScrollTop) {
          navbar.classList.add("nav-hidden"); // 向下滚动隐藏
      } else {
          navbar.classList.remove("nav-hidden"); // 向上滚动显示
      }

      lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

      // 回到顶部按钮显示/隐藏逻辑
      if (scrollTop > 100) {
          backToTopBtn.style.display = "block";
      } else {
          backToTopBtn.style.display = "none";
      }
  });

  // 导航链接点击高亮逻辑
  const links = document.querySelectorAll('.nav-links a');
  links.forEach(link => {
      link.addEventListener('click', (e) => {
          links.forEach(l => l.classList.remove('active'));
          e.currentTarget.classList.add('active');
      });
  });
});

(function($) {
  $.fn.timeline = function() {
    var selectors = {
      id: $(this),
      item: $(this).find(".timeline-item"),
      activeClass: "timeline-item--active"
    };

    selectors.item.eq(0).addClass(selectors.activeClass);

    const timelineEl = selectors.id.find(".timeline");

    // 获取初始年份
    const firstYear = parseInt(selectors.item.eq(0).data("year")) || 2023;

    // 添加格子并设置初始为第一项年份
    if (timelineEl.find(".timeline-circle").length === 0) {
      timelineEl.append(`<div class="timeline-circle">${firstYear}</div>`);
    }

    // 添加进度条
    if (timelineEl.find(".timeline-progress").length === 0) {
      timelineEl.append('<div class="timeline-progress"></div>');
    }

    var circle = timelineEl.find(".timeline-circle");
    var progress = timelineEl.find(".timeline-progress");

    let currentYear = firstYear; // 当前显示年份

    function updateScroll() {
      var pos = $(window).scrollTop();
      var windowHeight = $(window).height();
      var windowMiddle = pos + windowHeight / 2;

      selectors.item.each(function() {
        var itemOffset = $(this).offset().top;
        var itemHeight = $(this).outerHeight();
        var itemMiddle = itemOffset + itemHeight / 2;

        if (Math.abs(itemMiddle - windowMiddle) < itemHeight / 2) {
          selectors.item.removeClass(selectors.activeClass);
          $(this).addClass(selectors.activeClass);

          // 获取当前项年份并更新格子（不加一）
          const targetYear = parseInt($(this).data("year"));
          if (!isNaN(targetYear) && targetYear !== currentYear) {
            currentYear = targetYear;
            circle.text(currentYear);
          }
        }
      });

      // 控制格子位置和进度条高度
      var timelineTop = timelineEl.offset().top;
      var timelineHeight = timelineEl.height();
      var scrollCenter = $(window).scrollTop() + windowHeight / 2;
      var circleTop = scrollCenter - timelineTop;

      if (circleTop < 0) circleTop = 0;

      const maxCircleTop = timelineHeight * 0.8;
      if (circleTop > maxCircleTop) circleTop = maxCircleTop;

      circle.css("top", circleTop + "px");
      progress.css("height", circleTop + "px");
    }

    $(window).on("scroll", updateScroll);
    updateScroll();
  };
})(jQuery);

$(document).ready(function() {
  $("#timeline-1").timeline();
});

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}


// Scroll Activated Number Counter for .stats-section
document.addEventListener("DOMContentLoaded", function () {
  const statSection = document.querySelector('.stats-section');
  const statNumbers = document.querySelectorAll('.stat-number');

  function animateCountUp(el, target, duration = 1000) {
    let startTime = null;

    function update(currentTime) {
      if (!startTime) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(progress * target);

      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target;
        if (el.getAttribute('data-target')?.includes('+')) {
          el.textContent += '+';
        }
      }
    }

    requestAnimationFrame(update);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        statNumbers.forEach(el => {
          const raw = el.getAttribute('data-target') || el.textContent;
          const target = parseInt(raw.replace(/\D/g, ''));
          if (!isNaN(target)) {
            el.setAttribute('data-target', raw); // 保存原始值
            el.textContent = "0";
            animateCountUp(el, target, 1000);
          }
        });
      }
    });
  }, {
    threshold: 0.3 // 当section至少有30%进入视口时触发
  });

  if (statSection) {
    observer.observe(statSection);
  }
});


document.getElementById('jobApplicationForm').addEventListener('submit', function(e) {
  const fileInput = document.getElementById('resume');
  const file = fileInput.files[0];

  if (file && file.size > 3 * 1024 * 1024) { // 3MB
    alert('上传的简历不能超过3MB！');
    e.preventDefault();
  }
});

// ======= 职位详情展开/收起 =======
function toggleDetail(el) {
  const row = el.closest("tr");  // 找到当前职位行
  const detailRow = row.nextElementSibling;  // 找到下一行（详情行）

  if (detailRow && detailRow.classList.contains("detail-row")) {
    if (detailRow.style.display === "table-row") {
      detailRow.style.display = "none";  // 如果展开，则收起
      el.classList.remove("rotate");  // 收起箭头
    } else {
      detailRow.style.display = "table-row";  // 如果收起，则展开
      el.classList.add("rotate");  // 展开箭头
    }
  }
}

// ======= 清空表单：如果从 success.html?from=form 回来的 =======
const form = document.getElementById("jobApplicationForm");
const referrer = document.referrer;
if (referrer.includes("success.html?from=form") && form) {
  form.reset();
}

function closeForm() {
  const modal = document.getElementById('formModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// 其他的 DOMContentLoaded 写法留着没问题
document.addEventListener("DOMContentLoaded", function () {
  // 你的初始化逻辑
});



// ======= 弹窗申请表逻辑 =======

// 打开弹窗并设置职位名称（下面还不能用）
function openForm(positionName) {
  const modal = document.getElementById('formModal');
  const positionField = document.getElementById('formPosition');
  modal.style.display = 'block';
  if (positionField) {
    positionField.value = positionName;
  }
}

document.addEventListener("DOMContentLoaded", function () {

  // 监听提交按钮的点击事件
  document.getElementById('submitBtn').addEventListener('click', function (event) {
    event.preventDefault(); // 阻止表单默认提交
    showConfirmationModal(); // 显示确认弹窗
  });

  // 打开确认提交弹窗
  function showConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'block';
  }

  // 关闭确认提交的弹窗
  function closeConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'none';
  }

  // 提交表单
  function submitForm() {
    document.getElementById('jobApplicationForm').submit(); // 提交表单
    closeConfirmationModal(); // 隐藏确认弹窗
  }

  // 点击确认按钮时，提交表单
  document.getElementById('confirmSubmitBtn').addEventListener('click', function () {
    submitForm(); // 提交表单
  });

  // 点击取消按钮时，关闭确认弹窗
  document.getElementById('closeConfirmationModalBtn').addEventListener('click', function () {
    closeConfirmationModal(); // 关闭弹窗
  });

  // 点击遮罩层关闭弹窗
  window.addEventListener("click", function (event) {
    const modal = document.getElementById('confirmationModal');
    if (event.target === modal) {
      closeConfirmationModal(); // 点击遮罩层关闭弹窗
    }
  });

  // 表单提交前检查并拦截
  document.getElementById('jobApplicationForm').onsubmit = function (event) {
    event.preventDefault(); // 阻止表单的默认提交
    showConfirmationModal(); // 显示确认弹窗
    return false; // 仍然阻止表单的提交
  };
});