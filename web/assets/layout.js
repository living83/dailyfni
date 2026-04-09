/* Daily F&I — shared layout (nav + footer) injection and behaviors.
 * Each page must include placeholder elements:
 *   <div data-site="nav"></div>
 *   <div data-site="footer"></div>
 * and on <body>: data-page="home|about|business|assets|protect|support|notice|privacy|terms"
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------
   * Brand logo (image, full lockup)
   * ---------------------------------------------------------- */
  var BRAND_MARK    = '<img src="./assets/log.png" alt="DAILY F&amp;I 데일리에프앤아이대부" class="h-10 w-auto select-none" draggable="false" />';
  var BRAND_MARK_LG = '<img src="./assets/log.png" alt="DAILY F&amp;I 데일리에프앤아이대부 주식회사" class="h-12 w-auto select-none" draggable="false" />';

  /* ----------------------------------------------------------
   * Legal modal — 법적 고지 문서 카탈로그
   * 각 key는 footer의 data-legal-open 속성값과 매칭
   * 런타임에 해당 txt 파일을 fetch해서 pre-wrap 텍스트로 렌더
   * ---------------------------------------------------------- */
  var LEGAL_TXT_DIR = './assets/txt/';
  var LEGAL_DOCS = {
    'terms':    { title: '이용약관',              file: '이용약관.txt' },
    'privacy':  { title: '개인정보처리방침',       file: '개인정보처리방침.txt' },
    'cctv':     { title: '영상정보처리운용방침',   file: '영상정보처리운용방침.txt' },
    'credit':   { title: '신용정보활용체제',       file: '신용정보활용체제.txt' },
    'noemail':  { title: '이메일무단수집거부',     file: '이메일무단수집거부.txt' },
    'disclaim': { title: '책임의 한계와 법적고지', file: '책임의 한계와 법적고지.txt' },
    'inquiry':  {
      title: '채권 추심원 조회',
      // 정적 콘텐츠 (파일 없이 inline 표시)
      body: '담당자    백서호\n부서      무담보NPL영업팀\n연락처    02-2138-0749'
    }
  };

  /* ----------------------------------------------------------
   * TOP UTILITY BAR (legal / company info, md+ only)
   * ---------------------------------------------------------- */
  function buildTopBar() {
    return ''
      + '<div id="topUtilityBar" class="hidden lg:block fixed top-0 inset-x-0 z-50 bg-ink-900/90 backdrop-blur-md border-b border-white/[0.05]">'
      +   '<div class="mx-auto max-w-7xl px-6 lg:px-8 h-14 flex items-center text-2xl leading-none tracking-tight">'
      +     '<div class="flex items-center gap-4 text-zinc-300 min-w-0">'
      +       '<span class="text-white font-bold whitespace-nowrap">주식회사 데일리에프앤아이대부</span>'
      +       '<span class="h-6 w-px bg-white/20"></span>'
      +       '<span class="whitespace-nowrap tabular-nums">2024-금감원-2626 <span class="text-zinc-400">(대부업)</span></span>'
      +       '<span class="text-zinc-500">·</span>'
      +       '<span class="whitespace-nowrap tabular-nums">2024-금감원-2626 <span class="text-zinc-400">(매입채권추심업)</span></span>'
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
      +     '<a href="./index.html" class="flex items-center group justify-self-start py-1" aria-label="Daily F&amp;I · 데일리에프앤아이대부 홈">'
      +       BRAND_MARK
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
      +         '<a href="./index.html" class="inline-flex items-center" aria-label="Daily F&amp;I · 데일리에프앤아이대부 주식회사">'
      +           BRAND_MARK_LG
      +         '</a>'
      +         '<p class="mt-5 text-sm text-zinc-400 leading-relaxed max-w-md">합법 등록 매입채권추심업체. 채무자의 권리를 존중하며, 대부업법·채권추심법·신용정보법을 엄격히 준수합니다.</p>'
      +         '<dl class="mt-8 space-y-2.5 text-xs text-zinc-400">'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">상호</dt><dd>주식회사 데일리에프앤아이대부</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">대표자</dt><dd>홍나령</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">사업자등록번호</dt><dd class="tabular-nums">894-86-03385</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">대부업 등록번호</dt><dd class="tabular-nums">2024-금감원-2626</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">매입채권추심업 등록</dt><dd class="tabular-nums">2024-금감원-2626</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">본점 주소</dt><dd>서울특별시 금천구 서부샛길 606 대성디폴리스지식산업센터 비동 2604-1호</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">대표전화 / 팩스</dt><dd class="tabular-nums">02-2138-0750 / 02-2138-0751</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">이메일</dt><dd class="break-all">sean.paek@dailyfni.com</dd></div>'
      +           '<div class="grid grid-cols-[140px_1fr] gap-2"><dt class="text-zinc-500">개인정보보호책임자</dt><dd>백서호 / 감사</dd></div>'
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
      +           '<li><a href="#" data-legal-open="terms"    class="hover:text-white transition">이용약관</a></li>'
      +           '<li><a href="#" data-legal-open="privacy"  class="hover:text-white transition">개인정보처리방침</a></li>'
      +           '<li><a href="#" data-legal-open="cctv"     class="hover:text-white transition">영상정보처리운용방침</a></li>'
      +           '<li><a href="#" data-legal-open="credit"   class="hover:text-white transition">신용정보활용체제</a></li>'
      +           '<li><a href="#" data-legal-open="noemail"  class="hover:text-white transition">이메일무단수집거부</a></li>'
      +           '<li><a href="#" data-legal-open="disclaim" class="hover:text-white transition">책임의 한계와 법적고지</a></li>'
      +           '<li><a href="#" data-legal-open="inquiry"  class="hover:text-white transition">채권 추심원 조회</a></li>'
      +         '</ul>'
      +         '<div class="mt-8 rounded-2xl border border-white/10 bg-white/[0.02] p-5">'
      +           '<p class="text-[11px] tracking-widest uppercase text-zinc-500">불법추심 신고</p>'
      +           '<ul class="mt-3 space-y-1.5 text-xs text-zinc-300">'
      +             '<li class="flex items-center justify-between"><span>금융감독원</span><span class="tabular-nums text-zinc-400">국번없이 1332</span></li>'
      +             '<li class="flex items-center justify-between"><span>경찰청</span><span class="tabular-nums text-zinc-400">112</span></li>'
      +             '<li class="flex items-center justify-between"><span>대한법률구조공단</span><span class="tabular-nums text-zinc-400">132</span></li>'
      +             '<li class="flex items-center justify-between"><span>한국대부금융협회</span><span class="tabular-nums text-zinc-400">02)3487-5800</span></li>'
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
   * LEGAL MODAL — 법적 고지 문서 뷰어 (공용, 동적 로드)
   * 헤더의 타이틀과 본문은 열 때 LEGAL_DOCS[key] 기준으로 채워짐
   * ---------------------------------------------------------- */
  function buildLegalModal() {
    return ''
      + '<div id="legalModal" class="legal-modal" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="legalModalTitle">'
      +   '<div class="legal-modal__backdrop" data-legal-close></div>'
      +   '<div class="legal-modal__panel" role="document">'
      +     '<header class="legal-modal__header">'
      +       '<div class="legal-modal__title-group">'
      +         '<p class="legal-modal__eyebrow">법적 고지</p>'
      +         '<h2 id="legalModalTitle" class="legal-modal__title" data-legal-title>문서</h2>'
      +       '</div>'
      +       '<button type="button" class="legal-modal__close" data-legal-close aria-label="닫기" title="닫기 (ESC)">'
      +         '<iconify-icon icon="solar:close-square-linear" width="22" aria-hidden="true"></iconify-icon>'
      +       '</button>'
      +     '</header>'
      +     '<div class="legal-modal__body" data-legal-body oncontextmenu="return false">'
      +       '<div class="legal-modal__state" data-legal-state="loading">'
      +         '<iconify-icon icon="svg-spinners:ring-resize" width="28" aria-hidden="true"></iconify-icon>'
      +         '<p>문서를 불러오는 중…</p>'
      +       '</div>'
      +       '<div class="legal-modal__state" data-legal-state="error" hidden>'
      +         '<iconify-icon icon="solar:danger-triangle-linear" width="32" aria-hidden="true"></iconify-icon>'
      +         '<p>문서를 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.</p>'
      +       '</div>'
      +       '<article class="legal-modal__article" data-legal-article hidden>'
      +         '<pre class="legal-modal__text" data-legal-text></pre>'
      +         '<div class="legal-modal__footnote">'
      +           '<iconify-icon icon="solar:shield-check-linear" width="14" aria-hidden="true"></iconify-icon>'
      +           '<span>본 문서는 열람용으로만 제공되며, 복제 · 배포를 금지합니다.</span>'
      +         '</div>'
      +       '</article>'
      +     '</div>'
      +   '</div>'
      + '</div>';
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
    if (document.body && !document.getElementById('legalModal')) {
      document.body.insertAdjacentHTML('beforeend', buildLegalModal());
    }
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

    // Legal modal (공용 문서 뷰어)
    bindLegalModal();

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
   * LEGAL MODAL behavior — 공용 뷰어: 동적 로드 + 캐시 + 복사 방지
   * ---------------------------------------------------------- */
  function bindLegalModal() {
    var modal = document.getElementById('legalModal');
    if (!modal) return;

    var bodyEl    = modal.querySelector('[data-legal-body]');
    var articleEl = modal.querySelector('[data-legal-article]');
    var textEl    = modal.querySelector('[data-legal-text]');
    var titleEl   = modal.querySelector('[data-legal-title]');
    var stateLoad = modal.querySelector('[data-legal-state="loading"]');
    var stateErr  = modal.querySelector('[data-legal-state="error"]');

    var lastFocused = null;
    var cache       = {}; // key → body string
    var pending     = {}; // key → Promise (로딩 중 중복 fetch 방지)

    function setState(name) {
      if (stateLoad) stateLoad.hidden = (name !== 'loading');
      if (stateErr)  stateErr.hidden  = (name !== 'error');
      if (articleEl) articleEl.hidden = (name !== 'ready');
    }

    function loadDoc(key) {
      if (cache[key] != null) return Promise.resolve(cache[key]);
      if (pending[key])       return pending[key];
      var doc = LEGAL_DOCS[key];
      if (!doc) return Promise.reject(new Error('unknown legal doc: ' + key));

      // inline body (file 없이 정적 콘텐츠)
      if (typeof doc.body === 'string') {
        cache[key] = doc.body;
        return Promise.resolve(cache[key]);
      }

      // 파일 fetch
      var url = LEGAL_TXT_DIR + encodeURIComponent(doc.file);
      pending[key] = fetch(url, { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (raw) {
          // 윈도우 개행 정규화 + 앞뒤 공백 제거
          var text = raw.replace(/\r\n?/g, '\n').replace(/^\s+|\s+$/g, '');
          cache[key] = text;
          delete pending[key];
          return text;
        })
        .catch(function (err) {
          delete pending[key];
          throw err;
        });
      return pending[key];
    }

    function renderDoc(key) {
      var doc = LEGAL_DOCS[key];
      if (!doc) return;
      if (titleEl) titleEl.textContent = doc.title || '';
      setState('loading');
      if (bodyEl) bodyEl.scrollTop = 0;

      loadDoc(key)
        .then(function (body) {
          if (textEl) textEl.textContent = body || '';
          setState('ready');
          if (bodyEl) bodyEl.scrollTop = 0;
        })
        .catch(function () {
          setState('error');
        });
    }

    function openModal(key, e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!LEGAL_DOCS[key]) return;
      lastFocused = document.activeElement;
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('is-open');
      document.documentElement.classList.add('legal-modal-lock');
      renderDoc(key);

      // 포커스를 닫기 버튼으로
      var closeBtn = modal.querySelector('.legal-modal__close');
      if (closeBtn && closeBtn.focus) {
        setTimeout(function () { closeBtn.focus(); }, 80);
      }
    }

    function closeModal() {
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('is-open');
      document.documentElement.classList.remove('legal-modal-lock');
      if (lastFocused && lastFocused.focus) {
        try { lastFocused.focus(); } catch (_) {}
      }
    }

    // 1) 문서 열기 — data-legal-open="KEY" (이벤트 위임, 모든 페이지 공통)
    document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-legal-open')) {
          openModal(el.getAttribute('data-legal-open'), e);
          return;
        }
        el = el.parentNode;
      }
    });

    // 2) 닫기 (X 버튼, 배경)
    modal.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== modal) {
        if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-legal-close')) {
          closeModal();
          return;
        }
        el = el.parentNode;
      }
    });

    // 3) ESC 키 닫기 + 복사 방지 단축키 차단 (모달 열려 있을 때만)
    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('is-open')) return;
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeModal();
        return;
      }
      // 복사/인쇄/저장/전체선택/잘라내기/소스보기 단축키 차단
      var isMod = e.ctrlKey || e.metaKey;
      if (isMod) {
        var k = (e.key || '').toLowerCase();
        if (k === 'c' || k === 'a' || k === 'p' || k === 's' || k === 'x' || k === 'u') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }, true);

    // 4) 드래그/복사 이벤트 차단 (본문 영역)
    if (bodyEl) {
      bodyEl.addEventListener('copy',        function (e) { e.preventDefault(); });
      bodyEl.addEventListener('cut',         function (e) { e.preventDefault(); });
      bodyEl.addEventListener('dragstart',   function (e) { e.preventDefault(); });
      bodyEl.addEventListener('selectstart', function (e) { e.preventDefault(); });
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
    var padWidth = parseInt(el.dataset.countupPad || '0', 10);
    var duration = parseInt(el.dataset.countupDuration || '1400', 10);
    var start = performance.now();
    function format(v) {
      var s = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
      if (useComma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (padWidth > 0 && s.length < padWidth) {
        s = new Array(padWidth - s.length + 1).join('0') + s;
      }
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
