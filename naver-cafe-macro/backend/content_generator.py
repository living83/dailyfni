"""
content_generator.py - 키워드 기반 글 내용 자동 생성

글2 템플릿 구조:
1. 도입부: 인사 + 상황공감 + 키워드 언급 (~10문장, 나눔스퀘어네오)
2. 핵심부: 정보 + 주의사항 + 강조 (~15문장)
   - 강조① 빨강+노란배경+볼드 (핵심 경고)
   - 강조② 보라+밑줄+볼드 (핵심 장점)
3. CTA 테이블: 키워드+상담 (24px, 볼드, 노란배경, 링크)
4. 마무리부: 추가조언 + 인사 (~7문장)
5. 스티커 + 이미지
"""

import random

# ─── 스타일 상수 (publisher에서 서식 적용 시 사용) ─────────

STYLE_NORMAL = "normal"
STYLE_EMPTY = "empty"
STYLE_HIGHLIGHT_RED = "highlight_red"       # bold + color:#ff0010 + bg:#fff8b2
STYLE_HIGHLIGHT_PURPLE = "highlight_purple"  # bold + color:#740060 + underline

FONT_DEFAULT = "nanumsquareneo"


# ─── 제목 템플릿 ─────────────────────────────────────────

TITLE_TEMPLATES = [
    "{keyword} 안 되는 줄 알았는데 가능했어요ㅠ",
    "{keyword} 드디어 해결했습니다 ㅎㅎ",
    "{keyword} 혼자 고민하지 마세요!",
    "{keyword} 이렇게 하면 된다는 거 아셨나요?",
    "{keyword} 후기 남겨봅니다",
    "{keyword} 진짜 가능한 곳 찾았어요",
    "{keyword} 저도 몰랐는데 이게 되더라구요",
    "{keyword} 알아보다가 알게 된 꿀팁 공유",
    "{keyword} 막막했는데 이렇게 해결했어요",
    "{keyword} 고민 중이라면 꼭 읽어보세요",
]


# ─── 스토리 템플릿 ────────────────────────────────────────
# {keyword} → 키워드 삽입

STORY_TEMPLATES = [

    # ━━━ 스토리 1: 체험 후기형 ━━━
    {
        "intro": [
            ("안녕하세요! 오늘은 제가 직접 경험한 이야기를 해볼까 해요", STYLE_NORMAL),
            ("여러분들에게 도움이 될 만한 꿀팁을 가져와봤거든요", STYLE_NORMAL),
            ("이렇게 짜잔 하고 등장해봤어요ㅎㅎ", STYLE_NORMAL),
            ("", STYLE_EMPTY),
            ("누구나 갑자기 어려운 상황에 처할 때가 있잖아요 그죠?", STYLE_NORMAL),
            ("저도 그랬거든요 진짜 막막했었어요", STYLE_NORMAL),
            ("그럴때 많이들 검색해보는게 바로 {keyword}이에요", STYLE_NORMAL),
            ("이번에는 {keyword}에 대해서 조금 더 자세하게", STYLE_NORMAL),
            ("여러분들이 안전하게 알아볼 수 있는", STYLE_NORMAL),
            ("쉽고 간단한 꿀팁을 가져왔으니 집중해서 봐주세요!", STYLE_NORMAL),
        ],
        "body": [
            ("", STYLE_EMPTY),
            ("자, 대부분 잘 모르는 부분이 있어요", STYLE_NORMAL),
            ("마냥 {keyword} 검색해서 나오는 곳이면", STYLE_NORMAL),
            ("다 괜찮다고 생각하는 분들이 정말 많은데요", STYLE_NORMAL),
            ("이게 가장 위험해요!!!", STYLE_NORMAL),
            ("만약 이상한 곳이면 어쩌려고 그러세요ㅠ", STYLE_NORMAL),
            ("{keyword}을 알아보고 있다면", STYLE_NORMAL),
            ("공식 홈페이지가 있는지 먼저 체크해보고", STYLE_HIGHLIGHT_RED),
            ("정식 업체가 정말 맞는지를 꼭 확인하세요", STYLE_HIGHLIGHT_RED),
            ("요즘은 카페에서도 중개를 많이 하다보니", STYLE_NORMAL),
            ("쉽게 접근하는 분들이 많다고 하는데요", STYLE_NORMAL),
            ("검증된 한 곳에서 제공하는 서비스를 받는게 좋더라구요", STYLE_NORMAL),
            ("후기 확인 + 실제 반응 보기 + 부담없이 알아볼 수 있다는", STYLE_HIGHLIGHT_PURPLE),
            ("장점이 있지만 카페에서만 활동하는 곳은 조심하세요", STYLE_NORMAL),
            ("이런 부분을 잘 따져보는게 {keyword} 과정에서", STYLE_NORMAL),
            ("분명 도움이 될 거에요!", STYLE_NORMAL),
        ],
        "closing": [
            ("그리고 가장 중요한게 하나 더 있어요", STYLE_NORMAL),
            ("아무리 급한 상황이라도 필요 이상은 안 좋아요", STYLE_NORMAL),
            ("{keyword} 잘 활용하면 좋은 결과를 얻을 수 있지만", STYLE_NORMAL),
            ("무리하면 오히려 더 힘들어질 수 있거든요", STYLE_NORMAL),
            ("뭐가 됐든 적당한게 최고입니다", STYLE_NORMAL),
            ("혹시 고민되시면 전문 상담부터 받아보세요!", STYLE_NORMAL),
            ("그럼 오늘도 좋은 하루 보내세용~", STYLE_NORMAL),
        ],
    },

    # ━━━ 스토리 2: 정보 공유형 ━━━
    {
        "intro": [
            ("안녕하세요 여러분~!", STYLE_NORMAL),
            ("오늘은 많은 분들이 궁금해하시는 {keyword}에 대해", STYLE_NORMAL),
            ("제가 직접 알아본 내용을 공유해드릴게요", STYLE_NORMAL),
            ("", STYLE_EMPTY),
            ("사실 저도 처음에는 어디서부터 알아봐야 할지 막막했거든요", STYLE_NORMAL),
            ("인터넷 검색만 며칠을 했는데 정보가 너무 많아서 헷갈리고", STYLE_NORMAL),
            ("뭐가 맞는 정보인지 구분도 안 됐었어요", STYLE_NORMAL),
            ("{keyword} 관련해서 제대로 정리된 곳이 없더라구요", STYLE_NORMAL),
            ("그래서 제가 직접 발품 팔아서 알아본 내용", STYLE_NORMAL),
            ("여기에 정리해볼게요 꼭 끝까지 읽어주세요!", STYLE_NORMAL),
        ],
        "body": [
            ("", STYLE_EMPTY),
            ("우선 가장 먼저 확인해야 할 게 있어요", STYLE_NORMAL),
            ("{keyword} 검색하면 정말 많은 곳이 나오는데", STYLE_NORMAL),
            ("다 같은 조건이 아니라는 거 알고 계셨나요?", STYLE_NORMAL),
            ("저도 처음에 아무 데나 연락했다가 낭패 볼 뻔했어요", STYLE_NORMAL),
            ("반드시 정식 등록된 업체인지 확인하세요!", STYLE_NORMAL),
            ("등록 여부를 먼저 확인하는 게 첫 번째 단계에요", STYLE_HIGHLIGHT_RED),
            ("홈페이지에서 사업자 정보가 공개되어 있는지 보세요", STYLE_HIGHLIGHT_RED),
            ("그리고 {keyword} 조건도 잘 비교해봐야 해요", STYLE_NORMAL),
            ("같은 것 같아도 업체마다 세부 조건이 다르거든요", STYLE_NORMAL),
            ("실제 이용 후기를 꼼꼼히 살펴보는 것도 중요해요", STYLE_NORMAL),
            ("직접 경험한 사람들의 솔직한 후기가 가장 믿을 만하죠", STYLE_HIGHLIGHT_PURPLE),
            ("블로그나 카페 후기 중에서도 광고가 아닌 걸 찾아보세요", STYLE_NORMAL),
            ("{keyword} 이용 전에 이 정도만 체크해도", STYLE_NORMAL),
            ("나쁜 곳에 걸릴 확률이 확 줄어들어요", STYLE_NORMAL),
            ("아는 만큼 보인다고 하잖아요 ㅎㅎ", STYLE_NORMAL),
        ],
        "closing": [
            ("마지막으로 한 가지만 더 말씀드릴게요", STYLE_NORMAL),
            ("급하다고 조급하게 결정하시면 안 돼요", STYLE_NORMAL),
            ("{keyword} 천천히 알아보셔도 늦지 않아요", STYLE_NORMAL),
            ("조급할수록 실수가 생기기 마련이거든요", STYLE_NORMAL),
            ("꼭 비교해보시고 신중하게 결정하세요!", STYLE_NORMAL),
            ("도움이 필요하시면 전문 상담 한번 받아보시는 것도 추천해요", STYLE_NORMAL),
            ("그럼 다들 좋은 결과 있으시길 바랍니다!", STYLE_NORMAL),
        ],
    },

    # ━━━ 스토리 3: 고민 해결형 ━━━
    {
        "intro": [
            ("혹시 저처럼 {keyword} 때문에 고민 중이신 분 계신가요?", STYLE_NORMAL),
            ("저는 한동안 이것 때문에 정말 스트레스를 많이 받았었어요", STYLE_NORMAL),
            ("밤에 잠도 제대로 못 자고 한숨만 쉬었거든요ㅠ", STYLE_NORMAL),
            ("", STYLE_EMPTY),
            ("근데 이제는 어느 정도 정리가 돼서 마음이 좀 편해졌어요", STYLE_NORMAL),
            ("제가 겪은 과정을 공유하면", STYLE_NORMAL),
            ("비슷한 상황에 계신 분들에게 도움이 될 것 같아서 글을 써봅니다", STYLE_NORMAL),
            ("{keyword} 관련해서 진짜 중요한 것만 알려드릴게요", STYLE_NORMAL),
            ("쓸데없는 얘기 빼고 핵심만요!", STYLE_NORMAL),
        ],
        "body": [
            ("", STYLE_EMPTY),
            ("제가 제일 먼저 한 건 믿을 수 있는 곳을 찾는 거였어요", STYLE_NORMAL),
            ("{keyword} 검색하면 솔직히 너무 많이 나오잖아요", STYLE_NORMAL),
            ("어떤 곳은 조건이 너무 좋아 보여서 오히려 의심이 가고", STYLE_NORMAL),
            ("어떤 곳은 후기가 하나도 없고 그래서 불안했거든요", STYLE_NORMAL),
            ("결론부터 말하면 무조건 검증된 곳으로 가세요", STYLE_NORMAL),
            ("사업자등록이 되어 있는 정식 업체인지 확인하세요", STYLE_HIGHLIGHT_RED),
            ("상담받을 때 수수료나 조건을 명확하게 설명해주는 곳이 좋아요", STYLE_HIGHLIGHT_RED),
            ("저는 처음에 카페에서 추천받은 곳으로 갔었는데", STYLE_NORMAL),
            ("알고보니 중간에서 수수료만 떼가는 곳이었어요", STYLE_NORMAL),
            ("그래서 다시 {keyword} 제대로 된 곳을 찾았죠", STYLE_NORMAL),
            ("이번에는 공식 홈페이지가 있는 곳으로 직접 상담받았어요", STYLE_NORMAL),
            ("상담사분이 친절하게 하나하나 설명해주셔서 신뢰가 갔어요", STYLE_HIGHLIGHT_PURPLE),
            ("무엇보다 강제로 진행시키지 않아서 부담이 없었어요", STYLE_NORMAL),
            ("{keyword} 알아볼 때 이런 곳을 찾으셔야 해요", STYLE_NORMAL),
            ("억지로 밀어붙이는 곳은 피하세요 제발요ㅠ", STYLE_NORMAL),
        ],
        "closing": [
            ("아 그리고 하나만 더 말씀드릴게요", STYLE_NORMAL),
            ("상담받는다고 해서 무조건 진행해야 하는 건 아니에요", STYLE_NORMAL),
            ("부담 없이 물어보고 안 맞으면 안 하면 되는 거예요", STYLE_NORMAL),
            ("{keyword} 혼자 끙끙 앓지 마시고", STYLE_NORMAL),
            ("전문가한테 한번 물어보세요 생각보다 길이 있더라구요", STYLE_NORMAL),
            ("저도 그랬으니까요 ㅎㅎ", STYLE_NORMAL),
            ("여러분도 잘 해결되실 거예요 화이팅!", STYLE_NORMAL),
        ],
    },

    # ━━━ 스토리 4: 비교 분석형 ━━━
    {
        "intro": [
            ("안녕하세요~ 요즘 {keyword} 알아보시는 분 많으시죠?", STYLE_NORMAL),
            ("저도 한참 알아보다가 이제 좀 감이 잡혀서", STYLE_NORMAL),
            ("알게 된 내용 정리해서 공유해드리려고 해요!", STYLE_NORMAL),
            ("", STYLE_EMPTY),
            ("솔직히 처음에는 뭐가 뭔지 하나도 모르겠더라구요", STYLE_NORMAL),
            ("용어도 어렵고 조건도 다 다르고", STYLE_NORMAL),
            ("인터넷에 {keyword} 검색하면 정보는 많은데", STYLE_NORMAL),
            ("정작 도움되는 정보를 찾기가 어려웠어요", STYLE_NORMAL),
            ("그래서 제가 직접 비교해보고 정리한 내용 알려드릴게요", STYLE_NORMAL),
        ],
        "body": [
            ("", STYLE_EMPTY),
            ("먼저 제일 중요한 건 업체 선택이에요", STYLE_NORMAL),
            ("{keyword} 다루는 곳이 정말 많은데", STYLE_NORMAL),
            ("크게 두 종류로 나눌 수 있어요", STYLE_NORMAL),
            ("하나는 직접 운영하는 정식 업체", STYLE_NORMAL),
            ("다른 하나는 중간에서 연결만 해주는 중개 업체에요", STYLE_NORMAL),
            ("당연히 직접 운영하는 정식 업체가 훨씬 안전하겠죠?", STYLE_NORMAL),
            ("정식 업체는 홈페이지에 사업자 정보가 공개되어 있어요", STYLE_HIGHLIGHT_RED),
            ("상담 과정에서 모든 조건을 투명하게 안내해줘요", STYLE_HIGHLIGHT_RED),
            ("반면에 중개 업체는 수수료가 추가로 붙는 경우가 많고", STYLE_NORMAL),
            ("나중에 문제가 생겨도 책임을 안 지려고 하는 경우가 있어요", STYLE_NORMAL),
            ("그러니까 {keyword} 알아보실 때는", STYLE_NORMAL),
            ("꼭 직접 운영하는 곳인지 확인하세요!", STYLE_NORMAL),
            ("무료 상담을 제공하고 강제 진행이 없는 곳을 선택하세요", STYLE_HIGHLIGHT_PURPLE),
            ("이것만 기억해도 반은 성공이에요 진짜로요 ㅎㅎ", STYLE_NORMAL),
        ],
        "closing": [
            ("추가로 한 가지 팁을 더 드리자면", STYLE_NORMAL),
            ("급하다고 여러 군데 동시에 연락하는 건 비추예요", STYLE_NORMAL),
            ("오히려 혼란만 커지고 판단이 흐려지거든요", STYLE_NORMAL),
            ("{keyword} 관련 검증된 곳 하나를 골라서", STYLE_NORMAL),
            ("집중적으로 상담받는 게 훨씬 효율적이에요", STYLE_NORMAL),
            ("도움이 되셨으면 좋겠네요!", STYLE_NORMAL),
            ("다들 좋은 결과 있으시길 바랍니다~", STYLE_NORMAL),
        ],
    },

    # ━━━ 스토리 5: 경험담형 ━━━
    {
        "intro": [
            ("이 글을 쓸까 말까 고민을 좀 했는데요", STYLE_NORMAL),
            ("저랑 비슷한 상황인 분들에게 조금이라도 도움이 되고 싶어서", STYLE_NORMAL),
            ("용기 내서 올려봅니다", STYLE_NORMAL),
            ("", STYLE_EMPTY),
            ("몇 달 전에 갑자기 목돈이 필요한 상황이 생겼어요", STYLE_NORMAL),
            ("주변에 도움 요청하기도 어렵고 정말 막막했었거든요", STYLE_NORMAL),
            ("그때 {keyword} 처음 알게 됐어요", STYLE_NORMAL),
            ("처음에는 솔직히 반신반의했는데", STYLE_NORMAL),
            ("직접 알아보니까 생각보다 방법이 있더라구요", STYLE_NORMAL),
        ],
        "body": [
            ("", STYLE_EMPTY),
            ("근데 아무 곳이나 가면 안 돼요 이건 진짜 중요해요", STYLE_NORMAL),
            ("저도 처음에 검색해서 나온 곳에 무작정 전화했다가", STYLE_NORMAL),
            ("이상한 곳에 걸릴 뻔했거든요 ㅠㅠ", STYLE_NORMAL),
            ("{keyword} 알아볼 때 꼭 체크해야 할 것들이 있어요", STYLE_NORMAL),
            ("첫째 정식으로 등록된 업체인지 확인하세요", STYLE_NORMAL),
            ("사업자 등록 여부와 공식 홈페이지를 반드시 확인하세요!", STYLE_HIGHLIGHT_RED),
            ("둘째 상담 시 선입금을 요구하면 무조건 피하세요!", STYLE_HIGHLIGHT_RED),
            ("정상적인 곳은 절대 먼저 돈을 요구하지 않아요", STYLE_NORMAL),
            ("셋째 조건을 꼼꼼히 비교해보세요", STYLE_NORMAL),
            ("같은 {keyword}라도 업체마다 조건이 천차만별이거든요", STYLE_NORMAL),
            ("저는 3군데 정도 상담받아보고 비교한 뒤에 결정했어요", STYLE_NORMAL),
            ("시간은 좀 걸렸지만 덕분에 좋은 조건으로 해결했어요", STYLE_HIGHLIGHT_PURPLE),
            ("급하다고 대충 결정하면 나중에 후회해요 진짜로", STYLE_NORMAL),
            ("저도 첫 번째 곳에서 바로 할 뻔했는데 참길 잘했어요", STYLE_NORMAL),
        ],
        "closing": [
            ("결론적으로 {keyword} 충분히 가능한 거예요", STYLE_NORMAL),
            ("다만 어디서 하느냐가 정말 중요하다는 거죠", STYLE_NORMAL),
            ("혼자 고민하지 마시고 전문 상담 한번 받아보세요", STYLE_NORMAL),
            ("상담은 무료인 곳이 대부분이니까 부담 갖지 마시고요", STYLE_NORMAL),
            ("저처럼 해결하시는 분이 더 많아졌으면 좋겠어요", STYLE_NORMAL),
            ("모두 힘내세요! 저도 응원할게요", STYLE_NORMAL),
        ],
    },
]


# ─── CTA 텍스트 템플릿 ───────────────────────────────────

CTA_TEMPLATES = [
    "{keyword} 상담",
    "{keyword} 무료상담",
    "{keyword} 알아보기",
    "{keyword} 상담받기",
]


# ─── 스티커 목록 ─────────────────────────────────────────

STICKER_OPTIONS = [
    {"pack": "cafe_012", "seq": "19"},
    {"pack": "cafe_012", "seq": "1"},
    {"pack": "cafe_012", "seq": "5"},
    {"pack": "cafe_012", "seq": "10"},
    {"pack": "cafe_012", "seq": "15"},
]


# ─── 생성 함수 ───────────────────────────────────────────

def generate_content(keyword: str, cta_link: str = "") -> dict:
    """
    키워드 기반으로 네이버 카페 글 구조 생성

    Returns:
        {
            "title": str,
            "sections": [
                {
                    "type": "text",
                    "font": "nanumsquareneo",
                    "lines": [{"text": str, "style": str}, ...]
                },
                {
                    "type": "cta_table",
                    "text": str,
                    "link": str
                },
                {
                    "type": "text",
                    "font": "nanumsquareneo",
                    "lines": [...]
                },
                {"type": "sticker", "pack": str, "seq": str},
                {"type": "image"}
            ]
        }
    """
    # 제목 선택
    title = random.choice(TITLE_TEMPLATES).format(keyword=keyword)

    # 스토리 선택
    story = random.choice(STORY_TEMPLATES)

    # 키워드 삽입
    def apply_keyword(lines):
        return [
            {"text": text.format(keyword=keyword), "style": style}
            for text, style in lines
        ]

    intro_lines = apply_keyword(story["intro"])
    body_lines = apply_keyword(story["body"])
    closing_lines = apply_keyword(story["closing"])

    # CTA
    cta_text = random.choice(CTA_TEMPLATES).format(keyword=keyword)

    # 스티커
    sticker = random.choice(STICKER_OPTIONS)

    sections = [
        {"type": "text", "font": FONT_DEFAULT, "lines": intro_lines},
        {"type": "text", "font": FONT_DEFAULT, "lines": body_lines},
        {"type": "cta_table", "text": cta_text, "link": cta_link},
        {"type": "text", "font": FONT_DEFAULT, "lines": closing_lines},
        {"type": "sticker", "pack": sticker["pack"], "seq": sticker["seq"]},
        {"type": "image"},
    ]

    return {"title": title, "sections": sections}


def content_to_plain_text(content: dict) -> tuple:
    """
    구조화된 콘텐츠를 단순 텍스트로 변환 (기존 publisher 호환용)
    나중에 SE ONE 에디터 서식 적용이 구현되면 이 함수 대신 직접 사용

    Returns: (title, body_text)
    """
    title = content["title"]
    lines = []

    for section in content["sections"]:
        if section["type"] == "text":
            for line in section["lines"]:
                if line["style"] == STYLE_EMPTY:
                    lines.append("")
                else:
                    lines.append(line["text"])
        elif section["type"] == "cta_table":
            lines.append("")
            lines.append(section["text"])
            lines.append("")

    return title, "\n".join(lines)
