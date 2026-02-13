const Tool = require('../core/Tool');

/**
 * 예약 발행 관리 도구
 *
 * - 최적 발행 시간대 분석 (요일별, 시간대별)
 * - 예약 발행 큐 관리
 * - 발행 간격 최적화 (저품질 방지)
 * - 시즌/트렌드 기반 발행 전략
 * - 발행 히스토리 관리
 */
class ScheduleManagerTool extends Tool {
  constructor() {
    super({
      name: 'schedule_manager',
      description: '네이버 블로그 예약 발행 스케줄을 관리하고 최적 발행 시간을 분석합니다.',
      parameters: {
        action: { type: 'string', description: 'analyze | schedule | cancel | list | optimize' },
        keyword: { type: 'string', description: '콘텐츠 키워드' },
        category: { type: 'string', description: '콘텐츠 카테고리' },
        scheduledAt: { type: 'string', description: '예약 시각 (ISO 8601)' },
        postId: { type: 'string', description: '게시물 ID (취소/조회 시)' },
      },
    });

    // 내부 예약 큐 (인메모리)
    this.queue = new Map();

    // 네이버 블로그 최적 발행 데이터
    this.optimalTimes = {
      weekday: {
        best: [
          { hour: 8, label: '출근 시간대', score: 85, reason: '출근길 모바일 검색 피크' },
          { hour: 12, label: '점심 시간대', score: 90, reason: '점심시간 정보 탐색 최고 트래픽' },
          { hour: 18, label: '퇴근 시간대', score: 80, reason: '퇴근 후 쇼핑/정보 검색' },
          { hour: 21, label: '야간 황금시간', score: 95, reason: '저녁 여유 시간. 최고 전환율' },
        ],
        avoid: [
          { hour: 2, label: '새벽', score: 20, reason: '트래픽이 극히 낮습니다' },
          { hour: 4, label: '새벽', score: 15, reason: '트래픽이 극히 낮습니다' },
        ],
      },
      weekend: {
        best: [
          { hour: 10, label: '주말 오전', score: 88, reason: '여유로운 주말 아침 검색' },
          { hour: 14, label: '주말 오후', score: 92, reason: '주말 쇼핑/여가 검색 피크' },
          { hour: 20, label: '주말 저녁', score: 85, reason: '주말 저녁 정보 소비' },
        ],
        avoid: [
          { hour: 3, label: '새벽', score: 18, reason: '주말에도 새벽은 트래픽이 낮습니다' },
        ],
      },
    };

    // 카테고리별 최적 시간 보정
    this.categoryBonus = {
      'IT·컴퓨터': { bestDays: [1, 2, 3], peakHour: 21, bonus: 5 },
      '가전·디지털': { bestDays: [4, 5], peakHour: 12, bonus: 8 },
      '뷰티·미용': { bestDays: [0, 6], peakHour: 14, bonus: 7 },
      '맛집·음식': { bestDays: [4, 5, 6], peakHour: 11, bonus: 10 },
      '여행': { bestDays: [3, 4], peakHour: 20, bonus: 6 },
      '패션·의류': { bestDays: [0, 6], peakHour: 15, bonus: 5 },
      '건강·운동': { bestDays: [0, 1], peakHour: 7, bonus: 4 },
      '육아·교육': { bestDays: [1, 2, 3], peakHour: 22, bonus: 5 },
    };
  }

  async execute({ action = 'analyze', keyword = '', category = '', scheduledAt = null, postId = null, userId = null }) {
    switch (action) {
      case 'analyze':
        return this._analyzeOptimalTime(keyword, category);
      case 'schedule':
        return this._addToQueue(postId, scheduledAt, keyword, userId);
      case 'cancel':
        return this._cancelSchedule(postId, userId);
      case 'list':
        return this._listSchedules(userId);
      case 'optimize':
        return this._optimizeSchedule(userId, category);
      default:
        throw new Error(`"${action}"은(는) 유효하지 않은 액션입니다. (analyze, schedule, cancel, list, optimize)`);
    }
  }

  _analyzeOptimalTime(keyword, category) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=일, 6=토
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const timeData = isWeekend ? this.optimalTimes.weekend : this.optimalTimes.weekday;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    // 카테고리 보정
    const catBonus = this.categoryBonus[category] || null;

    // 다음 7일간 추천 슬롯 생성
    const recommendations = [];
    for (let d = 0; d < 7; d++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + d);
      const targetDay = targetDate.getDay();
      const targetIsWeekend = targetDay === 0 || targetDay === 6;
      const targetTimeData = targetIsWeekend ? this.optimalTimes.weekend : this.optimalTimes.weekday;

      targetTimeData.best.forEach(slot => {
        const slotDate = new Date(targetDate);
        slotDate.setHours(slot.hour, 0, 0, 0);

        // 과거 시간 제외
        if (slotDate <= now) return;

        let score = slot.score;
        let notes = [slot.reason];

        // 카테고리 보정
        if (catBonus) {
          if (catBonus.bestDays.includes(targetDay)) {
            score += catBonus.bonus;
            notes.push(`${category} 카테고리 인기 요일`);
          }
          if (slot.hour === catBonus.peakHour) {
            score += 5;
            notes.push(`${category} 피크 시간대`);
          }
        }

        // 발행 직후보다 약간 여유 (인덱싱 시간 고려)
        if (d === 0 && slotDate.getTime() - now.getTime() < 3600000) {
          score -= 10;
          notes.push('발행까지 1시간 미만 (준비 시간 부족 가능)');
        }

        recommendations.push({
          datetime: slotDate.toISOString(),
          displayTime: `${targetDate.getMonth() + 1}/${targetDate.getDate()} (${dayNames[targetDay]}) ${slot.hour}:00`,
          score: Math.min(100, Math.max(0, score)),
          label: slot.label,
          notes,
        });
      });
    }

    // 점수순 정렬
    recommendations.sort((a, b) => b.score - a.score);

    // 저품질 방지 발행 간격 가이드
    const intervalGuide = {
      minInterval: '4시간',
      recommended: '6~12시간',
      maxPerDay: 3,
      note: '하루 3회 이상 발행 시 네이버가 스팸으로 판정할 수 있습니다.',
      weeklyRecommend: '주 5~10개가 최적입니다. 주 15개 이상은 저품질 위험.',
    };

    return {
      action: 'analyze',
      keyword,
      category,
      currentTime: now.toISOString(),
      isWeekend,
      top3: recommendations.slice(0, 3),
      allSlots: recommendations.slice(0, 10),
      intervalGuide,
      categoryTip: catBonus
        ? `${category} 카테고리는 ${catBonus.bestDays.map(d => dayNames[d]).join(', ')}요일 ${catBonus.peakHour}시가 가장 효과적입니다.`
        : '카테고리별 상세 데이터가 없습니다. 일반 최적 시간대를 참고하세요.',
    };
  }

  _addToQueue(postId, scheduledAt, keyword, userId) {
    if (!postId) throw new Error('postId는 필수입니다.');
    if (!scheduledAt) throw new Error('scheduledAt은 필수입니다.');

    const schedDate = new Date(scheduledAt);
    if (isNaN(schedDate.getTime())) {
      throw new Error('scheduledAt 형식이 올바르지 않습니다.');
    }
    if (schedDate <= new Date()) {
      throw new Error('예약 시각은 현재 시각보다 미래여야 합니다.');
    }

    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const entry = {
      scheduleId,
      postId,
      keyword,
      scheduledAt: schedDate.toISOString(),
      status: 'queued',
      createdAt: new Date().toISOString(),
      userId,
    };

    // 사용자별 큐 관리
    const userQueue = this.queue.get(userId) || [];

    // 발행 간격 체크
    const conflict = userQueue.find(q => {
      if (q.status !== 'queued') return false;
      const diff = Math.abs(new Date(q.scheduledAt).getTime() - schedDate.getTime());
      return diff < 4 * 3600 * 1000; // 4시간 이내
    });

    if (conflict) {
      entry.warning = `기존 예약(${conflict.scheduleId})과 4시간 이내입니다. 저품질 위험이 있으니 간격을 넓히세요.`;
    }

    userQueue.push(entry);
    this.queue.set(userId, userQueue);

    return {
      action: 'schedule',
      ...entry,
      message: `${schedDate.toLocaleString('ko-KR')}에 발행이 예약되었습니다.`,
      queueSize: userQueue.filter(q => q.status === 'queued').length,
    };
  }

  _cancelSchedule(postId, userId) {
    if (!postId) throw new Error('postId는 필수입니다.');

    const userQueue = this.queue.get(userId) || [];
    const idx = userQueue.findIndex(q => (q.postId === postId || q.scheduleId === postId) && q.status === 'queued');

    if (idx === -1) {
      return {
        action: 'cancel',
        status: 'not_found',
        message: '해당 예약을 찾을 수 없습니다.',
      };
    }

    userQueue[idx].status = 'cancelled';
    userQueue[idx].cancelledAt = new Date().toISOString();

    return {
      action: 'cancel',
      status: 'cancelled',
      scheduleId: userQueue[idx].scheduleId,
      postId: userQueue[idx].postId,
      message: '예약이 취소되었습니다.',
    };
  }

  _listSchedules(userId) {
    const userQueue = this.queue.get(userId) || [];

    const queued = userQueue.filter(q => q.status === 'queued')
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    const published = userQueue.filter(q => q.status === 'published');
    const cancelled = userQueue.filter(q => q.status === 'cancelled');

    return {
      action: 'list',
      upcoming: queued.map(q => ({
        scheduleId: q.scheduleId,
        postId: q.postId,
        keyword: q.keyword,
        scheduledAt: q.scheduledAt,
        displayTime: new Date(q.scheduledAt).toLocaleString('ko-KR'),
      })),
      counts: {
        queued: queued.length,
        published: published.length,
        cancelled: cancelled.length,
        total: userQueue.length,
      },
    };
  }

  _optimizeSchedule(userId, category) {
    const userQueue = this.queue.get(userId) || [];
    const queued = userQueue.filter(q => q.status === 'queued')
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

    if (queued.length === 0) {
      return {
        action: 'optimize',
        status: 'empty',
        message: '최적화할 예약이 없습니다.',
      };
    }

    const suggestions = [];

    // 간격이 너무 짧은 항목 찾기
    for (let i = 1; i < queued.length; i++) {
      const prev = new Date(queued[i - 1].scheduledAt);
      const curr = new Date(queued[i].scheduledAt);
      const diffHours = (curr - prev) / (3600 * 1000);

      if (diffHours < 4) {
        suggestions.push({
          type: 'interval_too_short',
          severity: 'high',
          postId: queued[i].postId,
          currentTime: queued[i].scheduledAt,
          message: `이전 발행과 ${diffHours.toFixed(1)}시간 간격. 최소 4시간 이상을 권장합니다.`,
          suggestedTime: new Date(prev.getTime() + 6 * 3600 * 1000).toISOString(),
        });
      } else if (diffHours < 6) {
        suggestions.push({
          type: 'interval_short',
          severity: 'medium',
          postId: queued[i].postId,
          currentTime: queued[i].scheduledAt,
          message: `이전 발행과 ${diffHours.toFixed(1)}시간 간격. 6시간 이상이 더 안전합니다.`,
        });
      }
    }

    // 같은 날 발행이 3개 이상인 경우
    const dayCount = {};
    queued.forEach(q => {
      const day = q.scheduledAt.substring(0, 10);
      dayCount[day] = (dayCount[day] || 0) + 1;
    });

    Object.entries(dayCount).forEach(([day, count]) => {
      if (count >= 3) {
        suggestions.push({
          type: 'too_many_per_day',
          severity: count >= 4 ? 'high' : 'medium',
          date: day,
          count,
          message: `${day}에 ${count}개 발행 예정. 하루 2~3개가 적정합니다.`,
        });
      }
    });

    // 피크 시간대 활용 여부
    queued.forEach(q => {
      const hour = new Date(q.scheduledAt).getHours();
      if (hour >= 1 && hour <= 6) {
        suggestions.push({
          type: 'off_peak',
          severity: 'medium',
          postId: q.postId,
          currentTime: q.scheduledAt,
          message: `${hour}시는 트래픽이 매우 낮습니다. 8시, 12시, 21시를 추천합니다.`,
        });
      }
    });

    return {
      action: 'optimize',
      totalScheduled: queued.length,
      suggestions,
      overallHealth: suggestions.filter(s => s.severity === 'high').length === 0 ? 'good' : 'needs_attention',
      message: suggestions.length === 0
        ? '발행 스케줄이 최적 상태입니다.'
        : `${suggestions.length}건의 개선 제안이 있습니다.`,
    };
  }
}

module.exports = ScheduleManagerTool;
