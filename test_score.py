import re
import difflib

def _normalize(text: str) -> str:
    return re.sub(r'[\s,·/\-\.\'\"]+', '', text)

def _calc_match_score(keyword_text: str, board_name: str) -> int:
    score = 0
    kw = _normalize(keyword_text)
    bn = _normalize(board_name)

    if not kw or not bn:
        return 0

    if bn in kw:
        score += len(bn) * 20
        print(f"  [완전포함:bn->kw] +{len(bn)*20}")
    elif kw in bn:
        score += len(kw) * 20
        print(f"  [완전포함:kw->bn] +{len(kw)*20}")

    shorter = bn if len(bn) <= len(kw) else kw
    longer = kw if shorter == bn else bn
    
    max_sub_len = 0
    for length in range(len(shorter), 1, -1):
        for start in range(len(shorter) - length + 1):
            sub = shorter[start:start + length]
            if sub in longer:
                max_sub_len = max(max_sub_len, length)
        if max_sub_len > 0:
            break
            
    if max_sub_len >= 2:
        score += max_sub_len * 5
        print(f"  [최장LCS ({max_sub_len})] +{max_sub_len*5}")

    key_terms = [
        "아파트", "빌라", "오피스텔", "주택", "토지", "상가", 
        "전세", "월세", "신용", "담보", "후순위", "사업자", "직장인", 
        "무직자", "프리랜서", "자동차", "중고차", "대출", "회생", 
        "파산", "정부지원", "갈아타기", "마이너스통장"
    ]
    for term in key_terms:
        if term in keyword_text and term in board_name:
            score += len(term) * 3
            print(f"  [핵심단어 ({term})] +{len(term)*3}")

    similarity = difflib.SequenceMatcher(None, kw, bn).ratio()
    sim_score = int(similarity * 20)
    score += sim_score
    print(f"  [유사도 ({similarity:.2f})] +{sim_score}")

    return score

# DB에서 가져온 활성 게시판 목록이라고 가정
active_boards = [
    {"board_name": "신용대출"},
    {"board_name": "직장인,사업자,프리랜서 대출"},
    {"board_name": "무직자, 주부 대출"},
    {"board_name": "자동차 오토론 대출"},
    {"board_name": "전세, 월세 담보대출"},
    {"board_name": "부동산, 아파트 담보대출"},
    {"board_name": "개인회생대출"},
    {"board_name": "개인파산대출"},
    {"board_name": "신용회복대출"},
]

test_keywords = ['인천아파트담보대출', '신용대출금리', '개인회생대출', '무직자대출', '전세대출', '직장인신용대출', '정부지원대출조건']

for kw in test_keywords:
    print(f"\n==========================================")
    print(f"▶ 키워드: {kw}")
    print(f"==========================================")
    scored = []
    for board in active_boards:
        name = board["board_name"]
        print(f"\n--- 후보 게시판: {name} ---")
        score = _calc_match_score(kw, name)
        print(f"=> 총점: {score}")
        if score >= 15:
            scored.append((board, score))
            
    if not scored:
        print(f"❌ '{kw}' 일치 게시판 없음 (모두 15점 미만)")
    else:
        scored.sort(key=lambda x: x[1], reverse=True)
        best_score = scored[0][1]
        result = [b for b, s in scored if s == best_score]
        names = [b['board_name'] for b in result]
        print(f"\n✓ 최종 선택: {names} (점수: {best_score})")

