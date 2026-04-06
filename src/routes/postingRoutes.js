const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const Posting = require('../models/Posting');
const Content = require('../models/Content');
const { listAccounts, getAccountRaw } = require('../models/Account');
const { requestPublish } = require('../services/pythonBridge');
const telegram = require('../services/telegram');
const { processBody } = require('../services/postingHelper');
const { getPostTypeForTier, daysBetween } = require('../services/scheduler');
const { getSchedulerStatus, restartScheduler } = require('../services/scheduler');

const router = Router();

// GET /api/posting/queue
router.get('/posting/queue', (req, res) => {
  res.json({ success: true, queue: Posting.listPostings() });
});

// POST /api/posting/queue — add to queue
router.post('/posting/queue', (req, res) => {
  const { keyword, accountName, accountId, tone, scheduledTime, contentId } = req.body;
  if (!keyword) {
    return res.status(400).json({ success: false, message: '키워드를 입력하세요.' });
  }
  const item = Posting.createPosting({ keyword, accountName, accountId, tone, scheduledTime, contentId });
  res.status(201).json({ success: true, item });
});

// PATCH /api/posting/queue/:id
router.patch('/posting/queue/:id', (req, res) => {
  const item = Posting.updatePosting(req.params.id, req.body);
  if (!item) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });
  res.json({ success: true, item });
});

// DELETE /api/posting/queue/:id
router.delete('/posting/queue/:id', (req, res) => {
  const ok = Posting.deletePosting(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });
  res.json({ success: true, message: '삭제되었습니다.' });
});

// POST /api/posting/queue/:id/run — 실제 Playwright 발행
router.post('/posting/queue/:id/run', async (req, res) => {
  const posting = Posting.updatePosting(req.params.id, { status: '발행중' });
  if (!posting) return res.status(404).json({ success: false, message: '항목을 찾을 수 없습니다.' });

  res.json({ success: true, item: posting, message: '발행이 시작되었습니다.' });

  // 백그라운드에서 실제 Playwright 발행
  try {
    // 1. 콘텐츠 조회 (제목, 본문, 태그)
    const content = posting.contentId ? Content.getContent(posting.contentId) : null;
    const title = content?.title || posting.keyword;
    const body = content?.body || '';
    const tags = content?.tags || [posting.keyword];

    // 2. 계정 조회 (네이버 ID, 비밀번호)
    let account = null;
    if (posting.accountId) {
      account = getAccountRaw(posting.accountId);
    }
    if (!account) {
      // accountName으로 검색
      const accounts = listAccounts();
      account = accounts.find(a => a.accountName === posting.accountName);
    }

    if (!account) {
      Posting.updatePosting(req.params.id, { status: '실패', error: '계정을 찾을 수 없습니다.' });
      Posting.addError({ accountName: posting.accountName, message: '계정을 찾을 수 없습니다.', severity: '오류' });
      return;
    }

    // 3. Python Playwright 발행 요청
    const result = await requestPublish({
      posting_id: req.params.id,
      account: {
        id: account.id,
        account_name: account.accountName,
        naver_id: account.naverId,
        naver_password: account.naverPassword || '',  // TODO: decrypt
      },
      post_data: {
        title,
        content: processBody(body, content?.contentType),
        keywords: JSON.stringify(Array.isArray(tags) ? tags : [posting.keyword]),
        keyword: posting.keyword,
        post_type: content?.contentType === '광고(대출)' ? 'ad' : 'general',
      },
    });

    if (result.success) {
      Posting.updatePosting(req.params.id, {
        status: '발행완료',
        url: result.url,
        error: null,
      });
      console.log(`[Posting] 발행 성공: ${posting.keyword} → ${result.url}`);
      telegram.notifyPublishSuccess(posting.accountName, posting.keyword, result.url);
    } else {
      Posting.updatePosting(req.params.id, {
        status: '실패',
        error: result.error || '발행 실패',
      });
      Posting.addError({
        accountName: posting.accountName,
        message: result.error || '발행 실패',
        severity: '오류',
      });
      if (result.timedOut) {
        // 타임아웃: 실제로는 성공했을 수 있으므로 "확인 필요" 상태로 남김
        Posting.updatePosting(posting.id, { status: '확인필요', error: '타임아웃 — 실제 발행 여부 확인 필요' });
        console.warn(`[Posting] 발행 타임아웃 (확인필요): ${posting.keyword}`);
      } else {
        console.error(`[Posting] 발행 실패: ${posting.keyword} — ${result.error}`);
        telegram.notifyPublishFail(posting.accountName, posting.keyword, result.error);
      }
    }
  } catch (err) {
    Posting.updatePosting(req.params.id, { status: '실패', error: err.message });
    Posting.addError({ accountName: posting.accountName, message: err.message, severity: '오류' });
    console.error(`[Posting] 발행 예외: ${posting.keyword}`, err.message);
  }
});

// POST /api/posting/run-all — 전체 대기중 발행 (없으면 검수완료 콘텐츠로 자동 큐 생성)
router.post('/posting/run-all', async (req, res) => {
  let all = Posting.listPostings();
  let pending = all.filter((p) => p.status === '대기중');

  // 큐에 대기중 항목이 없으면 → 검수완료 콘텐츠 + 활성 계정으로 티어 기반 자동 매칭
  if (pending.length === 0) {
    const readyContents = Content.listContents().filter(c => c.status === '검수완료');
    const activeAccounts = listAccounts().filter(a => a.isActive && a.autoPublish);

    if (readyContents.length === 0) {
      return res.json({ success: true, message: '검수완료된 콘텐츠가 없습니다. 콘텐츠를 먼저 생성하세요.', count: 0 });
    }
    if (activeAccounts.length === 0) {
      return res.json({ success: true, message: '활성 계정이 없습니다. 계정을 먼저 등록하세요.', count: 0 });
    }

    // 티어 기반 매칭: 각 계정의 티어와 오늘 위치에 따라 일반/광고 결정
    const usedContentIds = new Set();
    for (const account of activeAccounts) {
      // 1계정 1일 1포스팅 원칙
      const days = daysBetween(account.createdAt);
      const postType = getPostTypeForTier(account.tier || 1, days);

      // 해당 타입의 검수완료 콘텐츠 중 아직 안 쓴 것 선택
      const matched = readyContents.find(c =>
        c.contentType === postType && !usedContentIds.has(c.id)
      );
      if (!matched) {
        console.log(`[Posting] ${account.accountName} (Tier ${account.tier}, ${postType}): 매칭 콘텐츠 없음`);
        continue;
      }
      usedContentIds.add(matched.id);

      const item = Posting.createPosting({
        keyword: matched.keyword,
        accountName: account.accountName,
        accountId: account.id,
        tone: matched.tone || '친근톤',
        contentId: matched.id,
        scheduledTime: '즉시',
      });
      Content.updateContent(matched.id, { status: '발행중', accountId: account.id });
      pending.push(item);
      console.log(`[Posting] 티어 매칭: ${account.accountName} (Tier ${account.tier}) → ${postType} "${matched.keyword}"`);
    }
    console.log(`[Posting] 자동 큐 생성: ${pending.length}건 (티어 기반)`);
  }

  if (pending.length === 0) {
    return res.json({ success: true, message: '대기 중인 항목이 없습니다.', count: 0 });
  }

  res.json({ success: true, message: `${pending.length}건 발행이 시작되었습니다.`, count: pending.length });

  // 순차 발행 (간격 두고)
  for (const p of pending) {
    Posting.updatePosting(p.id, { status: '발행중' });

    try {
      const content = p.contentId ? Content.getContent(p.contentId) : null;
      const accounts = listAccounts();
      const account = p.accountId
        ? getAccountRaw(p.accountId)
        : accounts.find(a => a.accountName === p.accountName);

      if (!account) {
        Posting.updatePosting(p.id, { status: '실패', error: '계정 없음' });
        Posting.addError({ accountName: p.accountName, message: '계정을 찾을 수 없습니다.', severity: '오류' });
        continue;
      }

      const result = await requestPublish({
        posting_id: p.id,
        account: {
          id: account.id,
          account_name: account.accountName,
          naver_id: account.naverId,
          naver_password: account.naverPassword || '',
        },
        post_data: {
          title: content?.title || p.keyword,
          content: processBody(content?.body || '', content?.contentType),
          keywords: JSON.stringify([p.keyword]),
          keyword: p.keyword,
          post_type: content?.contentType === '광고(대출)' ? 'ad' : 'general',
        },
      });

      if (result.success) {
        Posting.updatePosting(p.id, { status: '발행완료', url: result.url });
        console.log(`[Posting] 발행 성공: ${p.keyword} → ${result.url}`);
      } else {
        Posting.updatePosting(p.id, { status: '실패', error: result.error });
        Posting.addError({ accountName: p.accountName, message: result.error || '발행 실패', severity: '오류' });
      }

      // 다음 발행까지 간격 (5-15초 랜덤)
      if (pending.indexOf(p) < pending.length - 1) {
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 10000));
      }
    } catch (err) {
      Posting.updatePosting(p.id, { status: '실패', error: err.message });
      Posting.addError({ accountName: p.accountName, message: err.message, severity: '오류' });
    }
  }
});

// GET /api/posting/scheduler-status
router.get('/posting/scheduler-status', (req, res) => {
  res.json({ success: true, ...getSchedulerStatus() });
});

// GET /api/posting/settings
router.get('/posting/settings', (req, res) => {
  res.json({ success: true, settings: Posting.getSettings() });
});

// PUT /api/posting/settings
router.put('/posting/settings', (req, res) => {
  const settings = Posting.updateSettings(req.body);
  // 설정 변경 시 스케줄러 재시작
  restartScheduler();
  res.json({ success: true, settings });
});

// GET /api/posting/errors
router.get('/posting/errors', (req, res) => {
  res.json({ success: true, errors: Posting.listErrors() });
});

module.exports = router;
