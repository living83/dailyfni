/* Daily F&I — shared layout (nav + footer) injection and behaviors.
 * Each page must include placeholder elements:
 *   <div data-site="nav"></div>
 *   <div data-site="footer"></div>
 * and on <body>: data-page="home|about|business|assets|protect|support|notice|privacy|terms"
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------
   * Brand monogram (inline SVG, currentColor)
   * ---------------------------------------------------------- */
  var BRAND_MARK = ''
    + '<svg viewBox="0 0 28 28" class="h-7 w-7 text-accent-300" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    +   '<circle cx="9" cy="17.5" r="6.5"/>'
    +   '<path d="M15.5 17.5 V4 H22.5"/>'
    +   '<path d="M15.5 11 H20"/>'
    + '</svg>';

  var BRAND_MARK_LG = ''
    + '<svg viewBox="0 0 28 28" class="h-9 w-9 text-accent-300" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    +   '<circle cx="9" cy="17.5" r="6.5"/>'
    +   '<path d="M15.5 17.5 V4 H22.5"/>'
    +   '<path d="M15.5 11 H20"/>'
    + '</svg>';

  /* ----------------------------------------------------------
   * TOP UTILITY BAR (legal / company info, md+ only)
   * ---------------------------------------------------------- */
  function buildTopBar() {
    return ''
      + '<div id="topUtilityBar" class="hidden lg:block fixed top-0 inset-x-0 z-50 bg-ink-900/90 backdrop-blur-md border-b border-white/[0.05]">'
      +   '<div class="mx-auto max-w-7xl px-6 lg:px-8 h-14 flex items-center text-2xl leading-none tracking-tight">'
      +     '<div class="flex items-center gap-4 text-zinc-300 min-w-0">'
      +       '<span class="text-white font-bold whitespace-nowrap">(주)데일리에프앤아이대부</span>'
      +       '<span class="h-6 w-px bg-white/20"></span>'
      +       '<span class="whitespace-nowrap tabular-nums">2024-금감원-2626 <span class="text-zinc-400">(대부업)</span></span>'
      +       '<span class="text-zinc-500">·</span>'
      +       '<span class="whitespace-nowrap tabular-nums">2024-금감원-2626 <span class="text-zinc-400">(대부중개업)</span></span>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  /* ----------------------------------------------------------
   * NAV
   * ---------------------------------------------------------- */
  var NAV_LINKS = [
    { page: 'about',    href: './about.html',    label: '회사소개',     full: '회사소개' },
    { page: 'business', href: './business.html', label: '사업영역',     full: '사업영역 · 매입채권추심' },
    { page: 'assets',   href: './assets.html',   label: '자산현황',     full: '자산현황' },
    { page: 'protect',  href: './protect.html',  label: '고객권리',     full: '고객권리 · 채무자보호' },
    { page: 'support',  href: './support.html',  label: '고객센터',     full: '고객센터' },
    { page: 'notice',   href: './notice.html',   label: '공지사항',     full: '공지사항' },
  ];

  function buildNav(currentPage) {
    var desktopItems = NAV_LINKS.map(function (l) {
      var isActive = l.page === currentPage;
      var cls = isActive
        ? 'relative inline-flex items-center px-3.5 py-2 rounded-full text-white bg-white/[0.08] ring-1 ring-white/10 transition'
        : 'inline-flex items-center px-3.5 py-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/[0.05] transition';
      var current = isActive ? ' aria-current="page"' : '';
      return '<li><a href="' + l.href + '" class="' + cls + '"' + current + '>' + l.label + '</a></li>';
    }).join('');

    var mobileItems = NAV_LINKS.map(function (l) {
      var isActive = l.page === currentPage;
      var cls = isActive
        ? 'block px-4 py-3 rounded-2xl text-white bg-white/[0.08] ring-1 ring-white/10'
        : 'block px-4 py-3 rounded-2xl text-zinc-200 hover:bg-white/5';
      var current = isActive ? ' aria-current="page"' : '';
      return '<li><a href="' + l.href + '" class="' + cls + '"' + current + '>' + l.full + '</a></li>';
    }).join('');

    return ''
      + '<header class="fixed top-4 lg:top-16 inset-x-0 z-40 px-4 sm:px-6">'
      +   '<nav aria-label="주 메뉴" class="mx-auto max-w-6xl glass rounded-full pl-4 pr-3 sm:pl-5 sm:pr-4 py-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-4 sm:gap-6">'
      +     '<a href="./index.html" class="flex items-center gap-2.5 group justify-self-start" aria-label="Daily F&amp;I · 데일리에프앤아이대부 홈">'
      +       BRAND_MARK
      +       '<span class="flex flex-col leading-[1.05]">'
      +         '<span class="text-[10px] tracking-[0.22em] text-accent-300 font-semibold">DAILY F&amp;I</span>'
      +         '<span class="mt-[3px] text-[13px] sm:text-[14px] font-semibold tracking-tight text-white">데일리에프앤아이대부</span>'
      +       '</span>'
      +     '</a>'
      +     '<ul class="hidden lg:flex items-center gap-0.5 text-[13.5px] justify-self-center">' + desktopItems + '</ul>'
      +     '<div class="flex items-center gap-2 justify-self-end">'
      +       '<a href="./support.html" class="hidden sm:inline-flex btn-magnet items-center gap-1.5 rounded-full bg-accent-400 text-white px-4 py-2 text-[13px] font-semibold shadow-brand-soft">'
      +         '문의하기'
      +         '<iconify-icon class="arrow" icon="solar:arrow-right-linear" width="14" aria-hidden="true"></iconify-icon>'
      +       '</a>'
      +       '<button id="navToggle" type="button" class="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-zinc-200 hover:bg-white/5" aria-label="메뉴 열기" aria-expanded="false" aria-controls="mobileMenu">'
      +         '<iconify-icon icon="solar:hamburger-menu-linear" width="20" aria-hidden="true"></iconify-icon>'
      +       '</button>'
      +     '</div>'
      +   '</nav>'
      +   '<div id="mobileMenu" class="lg:hidden hidden mx-auto mt-2 max-w-6xl glass rounded-3xl p-2">'
      +     '<ul class="flex flex-col text-sm">' + mobileItems
      +       '<li class="px-2 py-2">'
      +         '<a href="./support.html" class="btn-magnet flex items-center justify-center gap-2 rounded-2xl bg-accent-400 text-white px-4 py-3 font-semibold">'
      +           '문의하기'
      +           '<iconify-icon class="arrow" icon="solar:arrow-right-linear" width="16" aria-hidden="true"></iconify-icon>'
      +         '</a>'
      +       '</li>'
      +     '</ul>'
      +   '</div>'
      + '</header>';
  }

  /* ----------------------------------------------------------
   * FOOTER
   * ---------------------------------------------------------- */
  function buildFooter() {
    var year = new Date().getFullYear();

    var DISCLAIMER = ''
      + '02-2138-0750, 금리 연 20% 이내(연체금리는 약정금리+3%p 이내, 연 20% 이내) 단, 2021.7.7부터 체결, 갱신, 연장되는 계약에 한함. '
      + '취급수수료 등 기타부대비용 및 조기상환조건 없음 단, 부동산 담보대출의 경우 부대비용 및 중도상환 시 중도상환수수료(3%) 발생. '
      + '(대부이자, 연체이자, 중도상환수수료의 합계금액은 연 20%이내에서 수취) ※ 부대비용 : 등록면허세, 지방교육세, 등기신청수수료, 국민주택채권매입금액 및 근저당권해지비용 '
      + '중개수수료를 요구하거나 받는 것은 불법. 과도한 빚은 당신에게 큰 불행을 안겨줄 수 있습니다. 대출시 귀하의 신용등급 또는 개인신용평점이 하락할 수 있습니다. '
      + '단, LTV 산정시 근저당권 설정금액 기준으로 산정함. 당일입금은 공동인증서를 통한 등기설정이 가능한 경우에 한하며, 부동산담보대출 권리보험가입 등의 사유로 제한될 수 있음.';

    var DISCLAIMER_2 = ''
      + '중개수수료를 요구하거나 받는 것은 불법입니다. 과도한 빚은 당신에게 큰 불행을 안겨줄 수 있습니다. '
      + '상환능력에 비해 대출금, 신용카드 사용액이 과도할 경우 개인신용 평점이 하락 할 수 있으며 개인평점 하락으로 금융거래 시 불이익이 발행할 수 있습니다. '
      + '대출게약을 체결하기 전에 관계법령에 따라 금융상품에 관한 중요 사항을 설명 받을 수 있습니다. '
      + '계약을 체결하기 전에 자세한 내용은 상품설명서와 약관을 읽어보시기 바랍니다.';

    return ''
      + '<footer class="relative border-t border-white/[0.06] bg-ink-900/40">'
      // Legal disclaimer — shown above brand block on every page
      +   '<div class="border-b border-white/[0.06]">'
      +     '<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 lg:py-14 space-y-5 lg:space-y-7">'
      +       '<p class="text-base md:text-lg lg:text-2xl leading-[1.85] text-zinc-300 break-keep-all">' + DISCLAIMER + '</p>'
      +       '<p class="text-base md:text-lg lg:text-2xl leading-[1.85] text-zinc-300 break-keep-all">' + DISCLAIMER_2 + '</p>'
      +     '</div>'
      +   '</div>'
      +   '<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">'
      +     '<div class="grid grid-cols-1 lg:grid-cols-12 gap-10">'
      +       '<div class="lg:col-span-5">'
      +         '<a href="./index.html" class="flex items-center gap-3" aria-label="Daily F&amp;I · 데일리에프앤아이대부 주식회사">'
      +           BRAND_MARK_LG
      +           '<span class="flex flex-col leading-none">'
      +             '<span class="text-[11px] tracking-[0.22em] text-accent-300 font-semibold">DAILY F&amp;I</span>'
      +             '<span class="mt-1.5 text-base font-semibold text-white tracking-tight">데일리에프앤아이대부 주식회사</span>'
      +           '</span>'
      +         '</a>'
      +         '<p class="mt-5 text-sm text-zinc-400 leading-relaxed max-w-md">합법 등록 매입채권추심업체. 채무자의 권리를 존중하며, 대부업법·채권추심법·신용정보법을 엄격히 준수합니다.</p>'
      +         '<dl class="mt-8 space-y-2.5 text-xs text-zinc-400">'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">상호</dt><dd>[필수입력: 데일리에프앤아이대부 주식회사]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">대표자</dt><dd>[필수입력: 홍길동]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">사업자등록번호</dt><dd class="tabular-nums">[필수입력: 000-00-00000]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">대부업 등록번호</dt><dd>[필수입력: 시·도 등록번호]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">매입채권추심업 등록</dt><dd>[필수입력: 금융위 등록번호]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">본점 주소</dt><dd>[필수입력: 서울특별시 OO구 OO대로 000]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">대표전화 / 팩스</dt><dd class="tabular-nums">[필수입력] / [필수입력]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">이메일</dt><dd class="break-all">[필수입력: info@example.co.kr]</dd></div>'
      +           '<div class="grid grid-cols-[120px_1fr] gap-2"><dt class="text-zinc-500">개인정보보호책임자</dt><dd>[필수입력: 성명 / 직책]</dd></div>'
      +         '</dl>'
      +       '</div>'
      +       '<div class="lg:col-span-3">'
      +         '<p class="text-[11px] tracking-widest uppercase text-zinc-500">사이트맵</p>'
      +         '<ul class="mt-4 space-y-2.5 text-sm text-zinc-300">'
      +           '<li><a href="./about.html"    class="hover:text-white transition">회사소개</a></li>'
      +           '<li><a href="./business.html" class="hover:text-white transition">사업영역 · 매입채권추심</a></li>'
      +           '<li><a href="./assets.html"   class="hover:text-white transition">자산현황</a></li>'
      +           '<li><a href="./protect.html"  class="hover:text-white transition">고객권리 · 채무자보호</a></li>'
      +           '<li><a href="./support.html"  class="hover:text-white transition">고객센터</a></li>'
      +           '<li><a href="./notice.html"   class="hover:text-white transition">공지사항</a></li>'
      +         '</ul>'
      +       '</div>'
      +       '<div class="lg:col-span-4">'
      +         '<p class="text-[11px] tracking-widest uppercase text-zinc-500">법적 고지</p>'
      +         '<ul class="mt-4 space-y-2.5 text-sm text-zinc-300">'
      +           '<li><a href="./terms.html"   class="hover:text-white transition">이용약관</a></li>'
      +           '<li><a href="./privacy.html" class="hover:text-white transition">개인정보처리방침</a></li>'
      +           '<li><a href="./protect.html" class="hover:text-white transition">채무자 보호 통지</a></li>'
      +           '<li><a href="#" class="hover:text-white transition">채권 추심원 조회 (준비중)</a></li>'
      +         '</ul>'
      +         '<div class="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">'
      +           '<p class="text-[11px] tracking-widest uppercase text-zinc-500">불법추심 신고</p>'
      +           '<ul class="mt-3 space-y-1.5 text-xs text-zinc-300">'
      +             '<li class="flex items-center justify-between"><span>금융감독원</span><span class="tabular-nums text-zinc-400">국번없이 1332</span></li>'
      +             '<li class="flex items-center justify-between"><span>경찰청</span><span class="tabular-nums text-zinc-400">112</span></li>'
      +             '<li class="flex items-center justify-between"><span>대한법률구조공단</span><span class="tabular-nums text-zinc-400">132</span></li>'
      +             '<li class="flex items-center justify-between"><span>한국대부금융협회</span><span class="tabular-nums text-zinc-400">[필수입력]</span></li>'
      +           '</ul>'
      +         '</div>'
      +       '</div>'
      +     '</div>'
      +     '<div class="mt-14 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">'
      +       '<p class="text-xs text-zinc-500">&copy; <span class="tabular-nums">' + year + '</span> 데일리에프앤아이대부. All rights reserved.</p>'
      +       '<p class="text-[11px] text-zinc-600">본 사이트의 모든 콘텐츠는 저작권법의 보호를 받습니다. 무단 복제 · 배포 · 전송을 금지합니다.</p>'
      +     '</div>'
      +   '</div>'
      + '</footer>';
  }

  /* ----------------------------------------------------------
   * INJECT
   * ---------------------------------------------------------- */
  function injectLayout() {
    var page = (document.body && document.body.dataset && document.body.dataset.page) || '';
    var navSlot    = document.querySelector('[data-site="nav"]');
    var footerSlot = document.querySelector('[data-site="footer"]');
    if (navSlot)    navSlot.outerHTML    = buildTopBar() + buildNav(page);
    if (footerSlot) footerSlot.outerHTML = buildFooter();
  }

  /* ----------------------------------------------------------
   * BEHAVIORS (mobile menu, scroll reveal)
   * ---------------------------------------------------------- */
  function bindBehaviors() {
    // Mobile menu toggle
    var btn  = document.getElementById('navToggle');
    var menu = document.getElementById('mobileMenu');
    if (btn && menu) {
      btn.addEventListener('click', function () {
        var isOpen = menu.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(isOpen));
        btn.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
      });
      menu.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.tagName === 'A') {
          menu.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
          btn.setAttribute('aria-label', '메뉴 열기');
        }
      });
    }

    // Reveal-on-scroll (IntersectionObserver, no scroll listeners)
    var reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window && reveals.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    }
  }

  /* ----------------------------------------------------------
   * MOTION: 3D mouse tilt for cards
   * ---------------------------------------------------------- */
  function initTilt() {
    if (window.matchMedia('(pointer: coarse)').matches) return; // skip touch devices
    var cards = document.querySelectorAll('[data-tilt]');
    cards.forEach(function (card) {
      card.style.transformStyle = 'preserve-3d';
      card.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x  = e.clientX - rect.left;
        var y  = e.clientY - rect.top;
        var cx = rect.width  / 2;
        var cy = rect.height / 2;
        var rx = ((y - cy) / cy) * -5; // max ±5deg
        var ry = ((x - cx) / cx) *  5;
        card.style.transition = 'transform 0.12s linear';
        card.style.transform  = 'perspective(1100px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transition = 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform  = 'perspective(1100px) rotateX(0deg) rotateY(0deg)';
      });
    });
  }

  /* ----------------------------------------------------------
   * MOTION: Number count-up on view
   * ---------------------------------------------------------- */
  function animateNumber(el) {
    var raw = el.dataset.countup || '0';
    var target = parseFloat(raw);
    if (isNaN(target)) return;
    var dotIndex = raw.indexOf('.');
    var decimals = dotIndex >= 0 ? raw.length - dotIndex - 1 : 0;
    var useComma = el.dataset.countupComma === '1';
    var duration = parseInt(el.dataset.countupDuration || '1400', 10);
    var start = performance.now();
    function format(v) {
      var s = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
      if (useComma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return s;
    }
    el.textContent = format(0);
    function step(now) {
      var elapsed = now - start;
      var t = Math.min(1, elapsed / duration);
      var eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      el.textContent = format(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCountup() {
    var targets = document.querySelectorAll('[data-countup]');
    if (!targets.length) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateNumber(entry.target);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      targets.forEach(function (el) { io.observe(el); });
    } else {
      targets.forEach(animateNumber);
    }
  }

  /* ----------------------------------------------------------
   * MOTION: Pin-scroll stepper (lg+ only)
   * ---------------------------------------------------------- */
  function initPinSteps() {
    var containers = document.querySelectorAll('[data-pin-steps]');
    if (!containers.length) return;
    if (!window.matchMedia('(min-width: 1024px)').matches) return; // mobile = static grid

    var ticking = false;
    function update() {
      containers.forEach(function (container) {
        var steps = container.querySelectorAll('[data-step-index]');
        if (!steps.length) return;
        var rect = container.getBoundingClientRect();
        var scrollable = container.offsetHeight - window.innerHeight;
        var scrolled = Math.max(0, -rect.top);
        var progress = scrollable > 0 ? Math.max(0, Math.min(1, scrolled / scrollable)) : 0;
        var total = steps.length;
        var activeIdx = Math.min(total - 1, Math.floor(progress * total + 0.0001));

        steps.forEach(function (s, i) {
          s.classList.toggle('is-active', i === activeIdx);
          s.classList.toggle('is-past',   i <  activeIdx);
        });

        var bar = container.querySelector('[data-step-progress]');
        if (bar) {
          var barProgress = Math.min(1, ((activeIdx + 1) / total));
          bar.style.width = (barProgress * 100).toFixed(1) + '%';
        }
      });
      ticking = false;
    }
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ----------------------------------------------------------
   * MOTION: Letter-by-letter fly-in (right → target)
   * ---------------------------------------------------------- */
  function splitLetterFly(root) {
    if (root.dataset.lfApplied) return;
    root.dataset.lfApplied = '1';
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    var node;
    while ((node = walker.nextNode())) textNodes.push(node);
    var idx = 0;
    textNodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      if (!text || !text.trim()) return;
      var frag = document.createDocumentFragment();
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (ch === ' ' || ch === '\u00a0') {
          frag.appendChild(document.createTextNode(ch));
          continue;
        }
        var span = document.createElement('span');
        span.className = 'lf-char';
        span.textContent = ch;
        span.style.transitionDelay = (idx * 35) + 'ms';
        frag.appendChild(span);
        idx++;
      }
      textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  function initLetterFly() {
    var targets = document.querySelectorAll('[data-letter-fly]');
    if (!targets.length) return;
    targets.forEach(splitLetterFly);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('lf-active');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.25 });
      targets.forEach(function (el) { io.observe(el); });
    } else {
      targets.forEach(function (el) { el.classList.add('lf-active'); });
    }
  }

  function init() {
    injectLayout();
    // Defer behavior binding so the freshly injected DOM is queryable.
    setTimeout(function () {
      bindBehaviors();
      initTilt();
      initCountup();
      initPinSteps();
      initLetterFly();
    }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
