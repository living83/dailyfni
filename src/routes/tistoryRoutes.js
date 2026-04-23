const { Router } = require('express');
const { requestTistoryPublish } = require('../services/pythonBridge');

const router = Router();

// POST /api/tistory/test-publish — 수동 발행 테스트
router.post('/tistory/test-publish', async (req, res) => {
  const { blogName, kakaoId, kakaoPassword, title, content, keyword, tags } = req.body;

  if (!blogName || !kakaoId || !kakaoPassword) {
    return res.json({ success: false, message: 'blogName, kakaoId, kakaoPassword 필수' });
  }

  try {
    const result = await requestTistoryPublish({
      account: {
        id: 'test-tistory',
        account_name: blogName,
        blog_name: blogName,
        kakao_id: kakaoId,
        kakao_password: kakaoPassword,
      },
      post_data: {
        title: title || '테스트 포스팅',
        content: content || '이것은 DailyFNI 티스토리 자동 발행 테스트입니다.',
        keyword: keyword || '테스트',
        tags: tags || '테스트,자동화',
        post_type: 'general',
      },
    });
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
