import React, { useState } from "react";

const TABS = ["계정 & 카페", "글쓰기 설정", "댓글 설정", "스케줄", "히스토리"];
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

const initialAccounts = [
  { id: 1, username: "blog_master01", password: "••••••••", active: true },
  { id: 2, username: "daily_life02", password: "••••••••", active: true },
  { id: 3, username: "info_share03", password: "••••••••", active: true },
  { id: 4, username: "review_king04", password: "••••••••", active: true },
  { id: 5, username: "happy_user05", password: "••••••••", active: true },
];

const initialBoards = [
  { id: 1, url: "https://cafe.naver.com/example/ArticleList.nhn?search.clubid=123&search.menuid=1", label: "자유게시판" },
  { id: 2, url: "https://cafe.naver.com/example/ArticleList.nhn?search.clubid=123&search.menuid=2", label: "정보공유" },
];

const initialKeywords = [
  { id: 1, text: "맛집 추천", usedCount: 12, lastUsed: "2026-02-18" },
  { id: 2, text: "여행 정보", usedCount: 8, lastUsed: "2026-02-17" },
  { id: 3, text: "부동산 투자", usedCount: 5, lastUsed: "2026-02-15" },
];

const initialCommentTemplates = [
  { id: 1, text: "좋은 정보 감사합니다!", active: true },
  { id: 2, text: "정말 유익한 글이네요 👍", active: true },
  { id: 3, text: "공감합니다~ 저도 비슷한 경험이 있어요", active: true },
  { id: 4, text: "오 이건 몰랐네요, 감사합니다", active: true },
  { id: 5, text: "잘 읽었습니다. 다음 글도 기대할게요!", active: true },
  { id: 6, text: "혹시 더 자세한 정보 있으면 공유해주세요~", active: true },
];

const initialHistory = [
  { id: 1, type: "글", keyword: "맛집 추천", board: "자유게시판", account: "blog_master01", time: "2026-02-18 14:30", status: "성공", comments: [
    { account: "daily_life02", time: "14:32", status: "성공" },
    { account: "info_share03", time: "14:34", status: "성공" },
    { account: "review_king04", time: "14:37", status: "성공" },
    { account: "happy_user05", time: "14:39", status: "실패" },
    { account: "daily_life02", time: "14:41", status: "성공" },
    { account: "info_share03", time: "14:44", status: "성공" },
  ]},
  { id: 2, type: "글", keyword: "여행 정보", board: "정보공유", account: "daily_life02", time: "2026-02-18 10:00", status: "성공", comments: [
    { account: "blog_master01", time: "10:03", status: "성공" },
    { account: "info_share03", time: "10:05", status: "성공" },
    { account: "review_king04", time: "10:08", status: "성공" },
    { account: "happy_user05", time: "10:10", status: "성공" },
    { account: "blog_master01", time: "10:13", status: "성공" },
    { account: "info_share03", time: "10:15", status: "성공" },
  ]},
  { id: 3, type: "글", keyword: "부동산 투자", board: "자유게시판", account: "info_share03", time: "2026-02-17 09:15", status: "실패", comments: [] },
  { id: 4, type: "글", keyword: "맛집 추천", board: "자유게시판", account: "review_king04", time: "2026-02-16 16:45", status: "성공", comments: [
    { account: "blog_master01", time: "16:48", status: "성공" },
    { account: "daily_life02", time: "16:50", status: "성공" },
    { account: "info_share03", time: "16:53", status: "성공" },
    { account: "happy_user05", time: "16:55", status: "성공" },
    { account: "blog_master01", time: "16:58", status: "성공" },
    { account: "daily_life02", time: "17:01", status: "성공" },
  ]},
];

let nextId = 100;
const genId = () => ++nextId;

export default function NaverCafeMacro() {
  const [activeTab, setActiveTab] = useState(0);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [boards, setBoards] = useState(initialBoards);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [commentTemplates, setCommentTemplates] = useState(initialCommentTemplates);
  const [history, setHistory] = useState(initialHistory);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newBoardUrl, setNewBoardUrl] = useState("");
  const [newBoardLabel, setNewBoardLabel] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newComment, setNewComment] = useState("");

  const [commentEnabled, setCommentEnabled] = useState(true);
  const [commentsPerPost, setCommentsPerPost] = useState(6);
  const [commentDelayMin, setCommentDelayMin] = useState(60);
  const [commentDelayMax, setCommentDelayMax] = useState(300);
  const [excludeAuthor, setExcludeAuthor] = useState(true);
  const [commentOrder, setCommentOrder] = useState("random");

  const [schedDays, setSchedDays] = useState([true, true, true, true, true, false, false]);
  const [schedTimes, setSchedTimes] = useState(["09:00", "14:00", "19:00"]);
  const [intervalMin, setIntervalMin] = useState(30);
  const [randomDelayMin, setRandomDelayMin] = useState(10);
  const [randomDelayMax, setRandomDelayMax] = useState(120);
  const [historyFilter, setHistoryFilter] = useState("all");

  const toggleDay = (i) => { const n = [...schedDays]; n[i] = !n[i]; setSchedDays(n); };
  const addAccount = () => { if (!newUser.trim()) return; setAccounts([...accounts, { id: genId(), username: newUser, password: newPass, active: true }]); setNewUser(""); setNewPass(""); };
  const removeAccount = (id) => setAccounts(accounts.filter((a) => a.id !== id));
  const toggleAccount = (id) => setAccounts(accounts.map(a => a.id === id ? {...a, active: !a.active} : a));
  const addBoard = () => { if (!newBoardUrl.trim()) return; setBoards([...boards, { id: genId(), url: newBoardUrl, label: newBoardLabel || "게시판" }]); setNewBoardUrl(""); setNewBoardLabel(""); };
  const removeBoard = (id) => setBoards(boards.filter((b) => b.id !== id));
  const addKeyword = () => { if (!newKeyword.trim()) return; setKeywords([...keywords, { id: genId(), text: newKeyword, usedCount: 0, lastUsed: "-" }]); setNewKeyword(""); };
  const removeKeyword = (id) => setKeywords(keywords.filter((k) => k.id !== id));
  const addComment = () => { if (!newComment.trim()) return; setCommentTemplates([...commentTemplates, { id: genId(), text: newComment, active: true }]); setNewComment(""); };
  const removeComment = (id) => setCommentTemplates(commentTemplates.filter(c => c.id !== id));
  const toggleComment = (id) => setCommentTemplates(commentTemplates.map(c => c.id === id ? {...c, active: !c.active} : c));
  const addSchedTime = () => setSchedTimes([...schedTimes, "12:00"]);
  const removeSchedTime = (i) => setSchedTimes(schedTimes.filter((_, idx) => idx !== i));
  const updateSchedTime = (i, val) => { const n = [...schedTimes]; n[i] = val; setSchedTimes(n); };

  const setCommentDelayMinSafe = (val) => {
    const v = Math.max(10, val);
    setCommentDelayMin(v);
    if (v > commentDelayMax) setCommentDelayMax(v);
  };
  const setCommentDelayMaxSafe = (val) => {
    const v = Math.max(10, val);
    setCommentDelayMax(v);
    if (v < commentDelayMin) setCommentDelayMin(v);
  };
  const setRandomDelayMinSafe = (val) => {
    const v = Math.max(0, val);
    setRandomDelayMin(v);
    if (v > randomDelayMax) setRandomDelayMax(v);
  };
  const setRandomDelayMaxSafe = (val) => {
    const v = Math.max(0, val);
    setRandomDelayMax(v);
    if (v < randomDelayMin) setRandomDelayMin(v);
  };

  const activeCount = accounts.filter(a=>a.active).length;
  const totalComments = history.reduce((sum, h) => sum + h.comments.filter(c => c.status === "성공").length, 0);
  const failedComments = history.reduce((sum, h) => sum + h.comments.filter(c => c.status === "실패").length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #0a0f1c 0%, #101829 40%, #0d1420 100%)", fontFamily: "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif", color: "#c8d6e5", padding: 0 }}>
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2d44; border-radius: 3px; }
        .macro-card { background: rgba(16,24,42,0.7); border: 1px solid rgba(56,189,148,0.08); border-radius: 14px; padding: 24px; backdrop-filter: blur(12px); transition: border-color 0.3s ease, box-shadow 0.3s ease; }
        .macro-card:hover { border-color: rgba(56,189,148,0.2); box-shadow: 0 0 30px rgba(56,189,148,0.04); }
        .input-field { width: 100%; background: rgba(8,12,24,0.6); border: 1px solid rgba(56,189,148,0.12); border-radius: 10px; padding: 12px 16px; color: #e0e8f0; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.25s ease, box-shadow 0.25s ease; }
        .input-field:focus { border-color: rgba(56,189,148,0.4); box-shadow: 0 0 0 3px rgba(56,189,148,0.08); }
        .input-field::placeholder { color: #3a4a60; }
        .btn-primary { background: linear-gradient(135deg, #1a9d6f 0%, #38bd94 100%); color: #fff; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.25s ease; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(56,189,148,0.25); }
        .btn-primary:active { transform: translateY(0); }
        .btn-danger { background: rgba(220,60,60,0.15); color: #e05555; border: 1px solid rgba(220,60,60,0.2); border-radius: 8px; padding: 6px 14px; font-size: 12px; font-family: inherit; cursor: pointer; transition: background 0.2s ease; }
        .btn-danger:hover { background: rgba(220,60,60,0.25); }
        .btn-ghost { background: rgba(56,189,148,0.08); color: #38bd94; border: 1px solid rgba(56,189,148,0.15); border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; transition: background 0.2s ease; }
        .btn-ghost:hover { background: rgba(56,189,148,0.15); }
        .tab-btn { padding: 12px 20px; background: transparent; border: none; color: #4a5a70; font-size: 13.5px; font-weight: 500; font-family: inherit; cursor: pointer; position: relative; transition: color 0.25s ease; white-space: nowrap; }
        .tab-btn.active { color: #38bd94; }
        .tab-btn.active::after { content: ''; position: absolute; bottom: -1px; left: 14px; right: 14px; height: 2px; background: #38bd94; border-radius: 1px; }
        .tab-btn:hover { color: #8aa0b8; }
        .day-chip { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px solid rgba(56,189,148,0.15); background: rgba(8,12,24,0.5); color: #4a5a70; transition: all 0.2s ease; font-family: inherit; }
        .day-chip.active { background: rgba(56,189,148,0.15); border-color: #38bd94; color: #38bd94; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .status-success { background: rgba(56,189,148,0.12); color: #38bd94; }
        .status-fail { background: rgba(220,60,60,0.12); color: #e05555; }
        .status-skip { background: rgba(120,120,140,0.12); color: #7a7a90; }
        .keyword-tag { display: inline-flex; align-items: center; gap: 8px; background: rgba(56,189,148,0.06); border: 1px solid rgba(56,189,148,0.12); border-radius: 20px; padding: 8px 16px; font-size: 13px; color: #a0b8cc; transition: border-color 0.2s ease; }
        .keyword-tag:hover { border-color: rgba(56,189,148,0.3); }
        .list-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(8,12,24,0.4); border-radius: 10px; margin-bottom: 8px; transition: opacity 0.2s ease; }
        .toggle-sw { position: relative; width: 44px; height: 24px; border-radius: 12px; background: rgba(60,70,90,0.5); border: none; cursor: pointer; transition: background 0.25s ease; padding: 0; flex-shrink: 0; }
        .toggle-sw.on { background: rgba(56,189,148,0.4); }
        .toggle-sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #4a5a70; transition: transform 0.25s ease, background 0.25s ease; }
        .toggle-sw.on::after { transform: translateX(20px); background: #38bd94; }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .pulse-dot.running { background: #38bd94; animation: pulse 1.5s ease infinite; }
        .pulse-dot.stopped { background: #4a5a70; }
        .expand-row { cursor: pointer; transition: background 0.15s ease; }
        .expand-row:hover { background: rgba(56,189,148,0.03); }
        .filter-chip { padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; border: 1px solid rgba(56,189,148,0.1); background: transparent; color: #5a6a80; cursor: pointer; font-family: inherit; transition: all 0.2s ease; }
        .filter-chip.active { background: rgba(56,189,148,0.12); border-color: rgba(56,189,148,0.3); color: #38bd94; }
        .info-box { background: rgba(56,189,148,0.05); border: 1px solid rgba(56,189,148,0.12); border-radius: 10px; padding: 16px 20px; font-size: 13px; color: #7a9aaa; line-height: 1.7; }
        .info-box strong { color: #38bd94; font-weight: 600; }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(56,189,148,0.4); } 50% { box-shadow: 0 0 0 6px rgba(56,189,148,0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.35s ease forwards; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "28px 40px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, background: "linear-gradient(135deg, #1a9d6f, #38bd94)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: "#fff", boxShadow: "0 4px 16px rgba(56,189,148,0.2)" }}>N</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8f0f8", letterSpacing: "-0.3px" }}>네이버 카페 매크로</h1>
            <p style={{ fontSize: 12, color: "#4a5a70", marginTop: 2 }}>Auto Posting & Comment Manager v2.0</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "right", fontSize: 12, color: "#4a5a70" }}>
            <div>등록 계정 <span style={{ color: "#a0b8cc", fontWeight: 600 }}>{accounts.length}개</span></div>
            <div style={{ marginTop: 2 }}>활성 <span style={{ color: "#38bd94", fontWeight: 600 }}>{activeCount}개</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6a7a90" }}>
            <span className={`pulse-dot ${isRunning ? "running" : "stopped"}`}></span>
            {isRunning ? "실행 중" : "대기 중"}
          </div>
          <button className="btn-primary" style={{ background: isRunning ? "linear-gradient(135deg, #c03030, #e05555)" : "linear-gradient(135deg, #1a9d6f, #38bd94)", minWidth: 120 }} onClick={() => setIsRunning(!isRunning)}>
            {isRunning ? "■ 중지" : "▶ 시작"}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ padding: "20px 40px 0", borderBottom: "1px solid rgba(56,189,148,0.06)", display: "flex", gap: 4 }}>
        {TABS.map((tab, i) => (
          <button key={tab} className={`tab-btn ${activeTab === i ? "active" : ""}`} onClick={() => setActiveTab(i)}>
            {tab}
            {i === 2 && commentEnabled && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: "50%", background: "#38bd94", display: "inline-block", verticalAlign: "middle" }}></span>}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding: "28px 40px 40px", maxWidth: 1040 }} className="fade-in" key={activeTab}>

        {/* Tab 0: 계정 & 카페 */}
        {activeTab === 0 && (<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="macro-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0" }}>네이버 로그인 계정</h2>
              <span style={{ fontSize: 12, color: "#4a5a70" }}>총 {accounts.length}개 · 활성 {activeCount}개</span>
            </div>
            <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>글 작성 및 댓글에 사용할 네이버 계정을 등록하세요. 30개 이상 등록 시 댓글 풀이 넓어집니다.</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input className="input-field" placeholder="아이디" value={newUser} onChange={(e) => setNewUser(e.target.value)} style={{ flex: 1 }} />
              <input className="input-field" type="password" placeholder="비밀번호" value={newPass} onChange={(e) => setNewPass(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={addAccount} style={{ whiteSpace: "nowrap" }}>+ 추가</button>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {accounts.map((acc, idx) => (
                <div key={acc.id} className="list-row" style={{ opacity: acc.active ? 1 : 0.4 }}>
                  <span style={{ fontSize: 12, color: "#3a4a60", width: 28, textAlign: "center" }}>#{idx+1}</span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: acc.active ? "rgba(56,189,148,0.1)" : "rgba(60,70,90,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: acc.active ? "#38bd94" : "#4a5a70", fontSize: 14, fontWeight: 700 }}>{acc.username[0].toUpperCase()}</div>
                  <span style={{ fontSize: 14, color: "#c0d0e0", flex: 1 }}>{acc.username}</span>
                  <span style={{ fontSize: 12, color: "#3a4a60" }}>••••••••</span>
                  <button className={`toggle-sw ${acc.active ? "on" : ""}`} onClick={() => toggleAccount(acc.id)} />
                  <button className="btn-danger" onClick={() => removeAccount(acc.id)}>삭제</button>
                </div>
              ))}
            </div>
          </div>
          <div className="macro-card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>카페 게시판</h2>
            <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>글을 올릴 카페 게시판 URL을 등록하세요.</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input className="input-field" placeholder="게시판 URL" value={newBoardUrl} onChange={(e) => setNewBoardUrl(e.target.value)} style={{ flex: 2 }} />
              <input className="input-field" placeholder="별칭 (선택)" value={newBoardLabel} onChange={(e) => setNewBoardLabel(e.target.value)} style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={addBoard} style={{ whiteSpace: "nowrap" }}>+ 추가</button>
            </div>
            {boards.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(8,12,24,0.4)", borderRadius: 10, marginBottom: 8 }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#a0c0d8", marginBottom: 2 }}>{b.label}</div>
                  <div style={{ fontSize: 12, color: "#3a4a60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 560 }}>{b.url}</div>
                </div>
                <button className="btn-danger" onClick={() => removeBoard(b.id)}>삭제</button>
              </div>
            ))}
          </div>
        </div>)}

        {/* Tab 1: 글쓰기 설정 */}
        {activeTab === 1 && (<div className="macro-card">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>키워드 관리</h2>
          <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>글 작성에 사용할 키워드를 등록하세요.</p>
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            <input className="input-field" placeholder="키워드 입력 (예: 맛집 추천)" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addKeyword()} />
            <button className="btn-ghost" onClick={addKeyword} style={{ whiteSpace: "nowrap" }}>+ 추가</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {keywords.map((kw) => (
              <div key={kw.id} className="keyword-tag">
                <span style={{ color: "#c8dce8", fontWeight: 500 }}>{kw.text}</span>
                <span style={{ fontSize: 11, color: "#4a5a70" }}>사용 {kw.usedCount}회</span>
                <button style={{ background: "none", border: "none", color: "#5a6a7a", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }} onClick={() => removeKeyword(kw.id)}>×</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(56,189,148,0.06)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#d0dce8", marginBottom: 16 }}>글쓰기 옵션</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>글 제목 형식</label><select className="input-field" defaultValue="keyword"><option value="keyword">[키워드] 기반 자동 생성</option><option value="custom">직접 입력</option></select></div>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>키워드 순환 방식</label><select className="input-field" defaultValue="round"><option value="round">순차 반복</option><option value="random">랜덤</option><option value="least">최소 사용 우선</option></select></div>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>글 길이</label><select className="input-field" defaultValue="medium"><option value="short">짧게 (200~500자)</option><option value="medium">보통 (500~1000자)</option><option value="long">길게 (1000~2000자)</option></select></div>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>게시판 선택</label><select className="input-field" defaultValue="all"><option value="all">전체 게시판 순환</option><option value="random">랜덤 게시판</option></select></div>
            </div>
          </div>
        </div>)}

        {/* Tab 2: 댓글 설정 */}
        {activeTab === 2 && (<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* 마스터 토글 */}
          <div className="macro-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>자동 댓글</h2>
                <p style={{ fontSize: 13, color: "#4a5a70" }}>글 작성 후 다른 아이디로 자동 댓글을 남깁니다.</p>
              </div>
              <button className={`toggle-sw ${commentEnabled ? "on" : ""}`} onClick={() => setCommentEnabled(!commentEnabled)} />
            </div>
            {commentEnabled && (
              <div className="info-box">
                <strong>동작 방식:</strong> 글 작성 후, <strong>글쓴 아이디를 제외</strong>한 나머지 활성 계정 중에서 랜덤으로 <strong>{commentsPerPost}개</strong>의 댓글을 남깁니다.
                현재 활성 계정 {activeCount}개 기준, 글 1개당 최대 {Math.min(commentsPerPost, activeCount - 1)}개의 고유 아이디가 댓글을 작성합니다.
                {activeCount - 1 < commentsPerPost && (
                  <span style={{ display: "block", marginTop: 8, color: "#e0a040" }}>
                    댓글 {commentsPerPost}개를 위해 최소 {commentsPerPost + 1}개의 활성 계정이 필요합니다. (현재 {activeCount}개) 부족 시 일부 아이디가 중복 사용됩니다.
                  </span>
                )}
              </div>
            )}
          </div>

          {commentEnabled && (<>
            {/* 댓글 규칙 */}
            <div className="macro-card">
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#d0dce8", marginBottom: 16 }}>댓글 규칙</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>글당 댓글 수</label><input type="number" className="input-field" value={commentsPerPost} onChange={e => setCommentsPerPost(Math.max(1, Number(e.target.value)))} min={1} max={50} /></div>
                <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>아이디 배정 방식</label><select className="input-field" value={commentOrder} onChange={e => setCommentOrder(e.target.value)}><option value="random">랜덤 (글쓴이 제외 후 셔플)</option><option value="round">순환 (순서대로 돌아가며)</option><option value="least">최소 사용 아이디 우선</option></select></div>
                <div>
                  <label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>댓글 간 딜레이 (초)</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" className="input-field" value={commentDelayMin} onChange={e => setCommentDelayMinSafe(Number(e.target.value))} min={10} />
                    <span style={{ color: "#4a5a70", flexShrink: 0 }}>~</span>
                    <input type="number" className="input-field" value={commentDelayMax} onChange={e => setCommentDelayMaxSafe(Number(e.target.value))} min={10} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>글쓴이 댓글 제외</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 46 }}>
                    <button className={`toggle-sw ${excludeAuthor ? "on" : ""}`} onClick={() => setExcludeAuthor(!excludeAuthor)} />
                    <span style={{ fontSize: 13, color: excludeAuthor ? "#38bd94" : "#5a6a80" }}>{excludeAuthor ? "글쓴 아이디는 댓글에서 제외" : "글쓴 아이디도 댓글 참여 가능"}</span>
                  </div>
                </div>
              </div>

              {/* 시뮬레이션 */}
              <div style={{ marginTop: 20, padding: "16px 20px", background: "rgba(8,12,24,0.5)", borderRadius: 10, display: "flex", gap: 24 }}>
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#4a5a70", marginBottom: 4 }}>하루 글 30개 기준</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#38bd94" }}>{30 * commentsPerPost}</div>
                  <div style={{ fontSize: 11, color: "#5a6a80" }}>일일 총 댓글</div>
                </div>
                <div style={{ width: 1, background: "rgba(56,189,148,0.08)" }} />
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#4a5a70", marginBottom: 4 }}>계정당 평균</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#a0c0d8" }}>{activeCount > 1 ? Math.round(30 * commentsPerPost / (activeCount - 1)) : "—"}</div>
                  <div style={{ fontSize: 11, color: "#5a6a80" }}>일일 댓글 수</div>
                </div>
                <div style={{ width: 1, background: "rgba(56,189,148,0.08)" }} />
                <div style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#4a5a70", marginBottom: 4 }}>예상 소요</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#c0a860" }}>{Math.round(30 * commentsPerPost * (commentDelayMin + commentDelayMax) / 2 / 60)}분</div>
                  <div style={{ fontSize: 11, color: "#5a6a80" }}>전체 댓글 작성</div>
                </div>
              </div>
            </div>

            {/* 댓글 템플릿 */}
            <div className="macro-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#d0dce8" }}>댓글 템플릿</h3>
                <span style={{ fontSize: 12, color: "#4a5a70" }}>활성 {commentTemplates.filter(c=>c.active).length} / 전체 {commentTemplates.length}</span>
              </div>
              <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>댓글에 사용할 문구를 등록하세요. 랜덤으로 선택됩니다.</p>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <input className="input-field" placeholder="댓글 문구 입력 (예: 좋은 정보 감사합니다!)" value={newComment} onChange={(e) => setNewComment(e.target.value)} style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && addComment()} />
                <button className="btn-ghost" onClick={addComment} style={{ whiteSpace: "nowrap" }}>+ 추가</button>
              </div>
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                {commentTemplates.map((c, idx) => (
                  <div key={c.id} className="list-row" style={{ opacity: c.active ? 1 : 0.4 }}>
                    <span style={{ fontSize: 12, color: "#3a4a60", width: 24 }}>{idx+1}</span>
                    <span style={{ fontSize: 14, color: c.active ? "#b8cce0" : "#4a5a70", flex: 1 }}>{c.text}</span>
                    <button className={`toggle-sw ${c.active ? "on" : ""}`} onClick={() => toggleComment(c.id)} />
                    <button className="btn-danger" onClick={() => removeComment(c.id)}>삭제</button>
                  </div>
                ))}
              </div>
            </div>
          </>)}
        </div>)}

        {/* Tab 3: 스케줄 */}
        {activeTab === 3 && (<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="macro-card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>요일 설정</h2>
            <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>글을 올릴 요일을 선택하세요.</p>
            <div style={{ display: "flex", gap: 12 }}>
              {DAYS.map((d, i) => (<button key={d} className={`day-chip ${schedDays[i] ? "active" : ""}`} onClick={() => toggleDay(i)}>{d}</button>))}
            </div>
          </div>
          <div className="macro-card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>업로드 시간</h2>
            <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>각 요일에 글이 올라갈 시간을 설정하세요.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {schedTimes.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "#5a6a80", width: 60 }}>시간 {i+1}</span>
                  <input type="time" className="input-field" value={t} onChange={(e) => updateSchedTime(i, e.target.value)} style={{ width: 160 }} />
                  {schedTimes.length > 1 && <button className="btn-danger" onClick={() => removeSchedTime(i)}>삭제</button>}
                </div>
              ))}
            </div>
            <button className="btn-ghost" onClick={addSchedTime} style={{ fontSize: 13, padding: "8px 18px" }}>+ 시간 추가</button>
          </div>
          <div className="macro-card">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>추가 설정</h2>
            <p style={{ fontSize: 13, color: "#4a5a70", marginBottom: 20 }}>업로드 간격과 랜덤 딜레이를 설정합니다.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>최소 업로드 간격 (분)</label><input type="number" className="input-field" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} min={1} /></div>
              <div><label style={{ fontSize: 12, color: "#5a6a80", display: "block", marginBottom: 6 }}>랜덤 딜레이 범위 (초)</label><div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" className="input-field" value={randomDelayMin} onChange={e => setRandomDelayMinSafe(Number(e.target.value))} min={0} style={{ width: "100%" }} /><span style={{ color: "#4a5a70" }}>~</span><input type="number" className="input-field" value={randomDelayMax} onChange={e => setRandomDelayMaxSafe(Number(e.target.value))} min={0} style={{ width: "100%" }} /></div></div>
            </div>
          </div>
        </div>)}

        {/* Tab 4: 히스토리 */}
        {activeTab === 4 && (<div className="macro-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "24px 24px 16px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e0e8f0", marginBottom: 4 }}>작업 히스토리</h2>
            <p style={{ fontSize: 13, color: "#4a5a70" }}>글 작성 및 댓글 기록을 확인하세요. 행을 클릭하면 댓글 상세를 볼 수 있습니다.</p>
          </div>
          <div style={{ display: "flex", gap: 12, padding: "0 24px 16px" }}>
            {[
              { label: "전체 글", value: history.length, color: "#38bd94" },
              { label: "글 성공", value: history.filter(h => h.status === "성공").length, color: "#38bd94" },
              { label: "글 실패", value: history.filter(h => h.status === "실패").length, color: "#e05555" },
              { label: "댓글 성공", value: totalComments, color: "#60a0e0" },
              { label: "댓글 실패", value: failedComments, color: "#e0a040" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: "rgba(8,12,24,0.5)", borderRadius: 10, padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#4a5a70", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "0 24px 16px", display: "flex", gap: 8 }}>
            {["all", "성공", "실패"].map(f => (
              <button key={f} className={`filter-chip ${historyFilter === f ? "active" : ""}`} onClick={() => setHistoryFilter(f)}>{f === "all" ? "전체" : f}</button>
            ))}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderTop: "1px solid rgba(56,189,148,0.06)" }}>
                  {["", "키워드", "게시판", "작성자", "시간", "상태", "댓글"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#4a5a70", letterSpacing: "0.04em", background: "rgba(8,12,24,0.3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.filter(h => historyFilter === "all" || h.status === historyFilter).map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="expand-row" onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)} style={{ borderTop: "1px solid rgba(56,189,148,0.04)" }}>
                      <td style={{ padding: "14px 16px", fontSize: 16, color: "#4a5a70", width: 36 }}>
                        <span style={{ display: "inline-block", transition: "transform 0.2s ease", transform: expandedRow === row.id ? "rotate(90deg)" : "rotate(0)" }}>▸</span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#c0d0e0", fontWeight: 500 }}>{row.keyword}</td>
                      <td style={{ padding: "14px 16px", color: "#7a8a9a" }}>{row.board}</td>
                      <td style={{ padding: "14px 16px", color: "#8aaccc", fontFamily: "monospace", fontSize: 13 }}>{row.account}</td>
                      <td style={{ padding: "14px 16px", color: "#5a6a7a", fontFamily: "monospace", fontSize: 13 }}>{row.time}</td>
                      <td style={{ padding: "14px 16px" }}><span className={`status-badge ${row.status === "성공" ? "status-success" : "status-fail"}`}>{row.status}</span></td>
                      <td style={{ padding: "14px 16px" }}>
                        {row.comments.length > 0
                          ? <span style={{ fontSize: 12, color: "#60a0e0", fontWeight: 600 }}>{row.comments.filter(c=>c.status==="성공").length}/{row.comments.length}</span>
                          : <span style={{ fontSize: 12, color: "#3a4a60" }}>—</span>}
                      </td>
                    </tr>
                    {expandedRow === row.id && row.comments.length > 0 && (<>
                      <tr style={{ background: "rgba(8,12,24,0.3)", borderTop: "1px solid rgba(56,189,148,0.03)" }}>
                        <td colSpan={7} style={{ padding: "10px 16px 6px 56px", fontSize: 11, color: "#3a4a60", fontWeight: 600, letterSpacing: "0.05em" }}>
                          댓글 상세 — 글쓴이: <span style={{ color: "#8aaccc" }}>{row.account}</span> (제외됨)
                        </td>
                      </tr>
                      {row.comments.map((c, ci) => (
                        <tr key={ci} style={{ background: "rgba(8,12,24,0.25)", borderTop: "1px solid rgba(56,189,148,0.02)" }}>
                          <td></td>
                          <td style={{ padding: "8px 16px", fontSize: 12, color: "#5a6a80" }}>댓글 #{ci+1}</td>
                          <td></td>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 12, color: c.account === row.account ? "#5a5a70" : "#8aaccc" }}>
                            {c.account}
                          </td>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 12, color: "#4a5a70" }}>{c.time}</td>
                          <td style={{ padding: "8px 16px" }}>
                            <span className={`status-badge ${c.status === "성공" ? "status-success" : c.status === "실패" ? "status-fail" : "status-skip"}`} style={{ fontSize: 11, padding: "2px 10px" }}>{c.status}</span>
                          </td>
                          <td></td>
                        </tr>
                      ))}
                    </>)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>)}
      </div>
    </div>
  );
}
