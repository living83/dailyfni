"""
seed_data.py - 초기 키워드 + 댓글 템플릿 시드 데이터
DB가 비어 있을 때 init_db()에서 자동 호출
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "cafe_macro.db"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 키워드 목록
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEYWORDS = [
    "소액대출",
    "무직자대출",
    "신용대출",
    "비상금대출",
    "채무조정",
    "개인회생",
    "정부지원대출",
    "저신용대출",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 댓글 템플릿 그룹
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 공통 (모든 키워드)
COMMON = [
    "오 이거 진짜 유용한 정보네요 감사합니다!",
    "저도 비슷한 상황인데 도움이 많이 됐어요",
    "이런 글 찾고 있었는데 감사해요ㅠㅠ",
    "좋은 정보 공유 감사합니다 바로 알아봐야겠어요",
    "진짜 현실적인 글이라 공감이 많이 되네요",
    "와 몰랐던 부분인데 알려주셔서 감사해요",
    "글 너무 잘 쓰셨어요 저한테 꼭 필요한 정보였어요",
    "혹시 상담받아보셨으면 후기도 올려주세요!",
    "저도 이거 때문에 고민 많았는데 힘이 되는 글이에요",
    "댓글 달고 갑니다 정말 감사해요",
]

# 대출 공통 (소액/무직자/신용/비상금/정부지원/저신용)
LOAN = [
    "저도 은행에서 안 된다고 해서 막막했는데 방법이 있었네요",
    "금리 비교하는게 진짜 중요하더라구요 좋은 팁이에요",
    "급할수록 여러 군데 비교해보는게 맞는 것 같아요",
    "상담 무료인 곳 있으면 알려주세요 저도 알아보고 싶어요",
    "한도랑 금리 잘 따져봐야 한다는 말씀 공감이요",
    "저는 한 곳에서만 알아봤는데 비교해봐야겠네요",
    "조건 되는지 먼저 확인해보는게 좋겠죠?",
    "후기 보니까 되신 분들 많으시네요 저도 해볼게요",
    "정식 업체에서 하는게 안전하다는 거 공감합니다",
    "이자율이 제일 중요한 것 같아요 좋은 글이네요",
    "신용등급 영향 적은 곳으로 알아봐야겠어요",
    "빠른 상담 가능한 곳이면 좋겠는데 추천 있으신가요?",
]

# 소액/비상금 전용
SMALL_LOAN = [
    "소액이라 무시했는데 비교해보면 차이가 크더라구요",
    "급할 때 정말 도움 되는 정보네요 감사해요",
    "당장 필요한 금액이라 빠르게 알아볼 수 있어서 좋네요",
    "소액이어도 조건 잘 보고 해야 한다는 거 맞아요",
    "한도가 작아도 이자 차이가 꽤 나더라구요",
]

# 무직자/저신용 전용
HARD_CASE = [
    "소득증빙 없어도 가능한 곳이 있다니 희망이 보여요",
    "조건이 안 좋아도 방법이 있구나 싶어서 위로가 돼요",
    "저도 거절만 당했는데 이런 방법이 있었네요",
    "서류 간소한 곳 찾고 있었는데 도움이 됐어요",
    "신용점수 낮아서 포기했었는데 다시 알아봐야겠어요",
]

# 정부지원 전용
GOV_LOAN = [
    "정부지원이라 안심되네요 자격 요건 꼭 확인해봐야겠어요",
    "금리가 낮다니까 조건 되면 이게 제일 좋겠네요",
    "신청 방법 자세히 알려주셔서 감사합니다",
    "몰랐는데 이런 제도가 있었군요 좋은 정보 감사해요",
    "서민 금융 진짜 많이 알려져야 할 것 같아요",
]

# 채무조정/개인회생 전용
DEBT = [
    "혼자 고민만 했는데 전문가 상담이 답인 것 같아요",
    "저도 빚 때문에 힘들었는데 방법이 있다니 다행이에요",
    "부끄럽다고 숨기지 말고 빨리 알아보는게 맞는 거 같아요",
    "법적으로 보호받을 수 있는 방법이 있다니 몰랐어요",
    "채권자 연락 때문에 스트레스인데 도움이 됐어요",
    "변제금 줄일 수 있다는게 정말인가요? 더 알아봐야겠네요",
    "가족한테 말 못하고 혼자 끙끙 앓았는데 희망이 생겨요",
    "처음에 상담받는게 제일 어렵지 막상 하면 괜찮더라구요",
    "이자만 내다가 원금을 못 줄이고 있었는데 이 방법이 있었네요",
    "전문가분이 방법 찾아주신다니 한번 상담받아볼게요",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 키워드 → 댓글 그룹 매핑
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

KEYWORD_COMMENT_GROUPS = {
    "소액대출":    [COMMON, LOAN, SMALL_LOAN],
    "비상금대출":  [COMMON, LOAN, SMALL_LOAN],
    "무직자대출":  [COMMON, LOAN, HARD_CASE],
    "저신용대출":  [COMMON, LOAN, HARD_CASE],
    "신용대출":    [COMMON, LOAN],
    "정부지원대출": [COMMON, LOAN, GOV_LOAN],
    "채무조정":    [COMMON, DEBT],
    "개인회생":    [COMMON, DEBT],
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 시드 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def seed(conn: sqlite3.Connection):
    """키워드와 댓글 템플릿이 비어 있을 때만 시드 데이터 삽입"""
    cursor = conn.cursor()

    kw_count = cursor.execute("SELECT COUNT(*) FROM keywords").fetchone()[0]
    ct_count = cursor.execute("SELECT COUNT(*) FROM comment_templates").fetchone()[0]

    if kw_count > 0 or ct_count > 0:
        return  # 이미 데이터 있으면 스킵

    # ── 1) 키워드 삽입 ──
    kw_ids = {}
    for kw in KEYWORDS:
        cursor.execute("INSERT INTO keywords (text) VALUES (?)", (kw,))
        kw_ids[kw] = cursor.lastrowid

    # ── 2) 댓글 템플릿 삽입 (중복 제거) ──
    all_texts = set()
    for groups in KEYWORD_COMMENT_GROUPS.values():
        for group in groups:
            all_texts.update(group)

    tpl_ids = {}
    for text in sorted(all_texts):
        cursor.execute("INSERT INTO comment_templates (text) VALUES (?)", (text,))
        tpl_ids[text] = cursor.lastrowid

    # ── 3) 키워드-댓글 매핑 ──
    for kw, groups in KEYWORD_COMMENT_GROUPS.items():
        kw_id = kw_ids[kw]
        seen = set()
        for group in groups:
            for text in group:
                tid = tpl_ids[text]
                if tid not in seen:
                    cursor.execute(
                        "INSERT INTO keyword_comment_mapping (keyword_id, comment_template_id) VALUES (?, ?)",
                        (kw_id, tid),
                    )
                    seen.add(tid)

    conn.commit()

    total_mappings = cursor.execute("SELECT COUNT(*) FROM keyword_comment_mapping").fetchone()[0]
    print(f"[seed] 키워드 {len(kw_ids)}개, 댓글 {len(tpl_ids)}개, 매핑 {total_mappings}개 삽입 완료")
