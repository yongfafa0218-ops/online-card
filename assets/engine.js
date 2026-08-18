/* ============================================================
   맘풀고 웜업 엔진
   ------------------------------------------------------------
   흐름: 카드 고르기 → 인트로(활동) → 6턴 읽기 → 메모 → 리포트
   ============================================================ */
(function (w) {
  "use strict";

  var CFG   = w.MOMPULGO_CONFIG;
  var CARDS = w.MOMPULGO_CARDS;

  /* ---------- 유틸 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function qp(k, d) {
    var v = new URLSearchParams(w.location.search).get(k);
    return (v === null || v === "") ? d : v;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 상태 ---------- */
  var S = {
    card: null,
    nameA: CFG.DEFAULT_A,
    nameB: CFG.DEFAULT_B,
    turn: 0,
    phase: "name"    // name | pick | intro | play | done
  };

  /* ------------------------------------------------------------
     호칭 처리
     데이터에는 "{{A}}님" 형태로 '님'이 붙어 있다.
     이름(지현, 김철수)이면 "지현님"이 자연스럽지만,
     호칭(엄마, 여보, 아빠)이면 "엄마님"이 어색하므로 '님'을 뗀다.
     ------------------------------------------------------------ */
  var NO_HONORIFIC = [
    /* 가족 */
    "엄마","아빠","어머니","아버지","엄니","아버님","어머님","할머니","할아버지",
    "누나","언니","형","오빠","동생","막내","첫째","둘째","셋째",
    /* 부부·연인 */
    "여보","자기","자기야","달링","허니","그대","임자",
    /* 아이 */
    "아들","딸","우리아들","우리딸","아가","애기",
    /* 기타 */
    "선생님","쌤","사장님","팀장님","대표님","교수님","목사님"
  ];

  /* 이 애칭 뒤에 '님'을 붙일지 판단 */
  function needsHonorific(name) {
    var n = String(name).trim();
    if (!n) return true;
    // 이미 '님'으로 끝나면 중복 방지
    if (/님$/.test(n)) return false;
    // 목록에 있으면 '님' 생략
    for (var i = 0; i < NO_HONORIFIC.length; i++) {
      if (n === NO_HONORIFIC[i]) return false;
    }
    // '우리~', '~야'로 끝나는 애칭도 호칭으로 간주
    if (/^우리/.test(n)) return false;
    if (/야$/.test(n) && n.length <= 4) return false;
    return true;
  }

  /* 화면에 표시할 완성형 호칭 (예: "지현님" / "엄마") */
  function label(who) {
    var n = who === "A" ? S.nameA : S.nameB;
    return n + (needsHonorific(n) ? "님" : "");
  }

  /* 대본 치환: "{{A}}님" → 호칭이면 '님'까지 함께 교체 */
  function fill(t) {
    if (!t) return "";
    var s = String(t);
    ["A", "B"].forEach(function (k) {
      var name = (k === "A") ? S.nameA : S.nameB;
      var tok = "{{" + k + "}}";
      if (needsHonorific(name)) {
        s = s.split(tok).join(name);              // "{{A}}님" → "지현님"
      } else {
        s = s.split(tok + "님").join(name);       // "{{A}}님" → "엄마"
        s = s.split(tok).join(name);              // 남은 토큰 처리
      }
    });
    return s;
  }
  function nameOf(who) { return label(who); }

  /* 받침 유무에 따른 조사 선택 (엄마+가 / 지현님+이) */
  function josa(word, withJong, noJong) {
    var ch = String(word).replace(/[^가-힣a-zA-Z0-9]/g, "").slice(-1);
    if (!ch) return noJong;
    var code = ch.charCodeAt(0);
    // 영문·숫자는 소리 나는 대로 판단하기 어려우므로 받침 없음으로 처리
    if (code < 0xac00 || code > 0xd7a3) return noJong;
    return ((code - 0xac00) % 28) ? withJong : noJong;
  }
  /* 호칭 + 조사 (예: "엄마가" / "지현님이") */
  function withJosa(who, wj, nj) {
    var n = label(who);
    return n + josa(n, wj, nj);
  }

  function findCard(v) {
    for (var i = 0; i < CARDS.length; i++) {
      if (String(CARDS[i].id) === String(v) || String(CARDS[i].no) === String(v)) return CARDS[i];
    }
    return null;
  }

  /* ============================================================
     렌더링
     ============================================================ */
  function render() {
    if (S.phase === "name")  return renderName();
    if (S.phase === "pick")  return renderPick();
    if (S.phase === "intro") return renderIntro();
    if (S.phase === "done")  return renderDone();
    return renderTurn();
  }

  function setHead(title, sub, showStepper) {
    $("#hdTitle").innerHTML = title;
    $("#hdCard").textContent = sub || "";
    var st = "";
    if (showStepper) {
      for (var i = 0; i < CFG.TOTAL_TURNS; i++) {
        st += '<div class="step ' + (i < S.turn ? "done" : (i === S.turn ? "now" : "")) + '"></div>';
      }
    }
    $("#stepper").innerHTML = st;
  }

  /* ============================================================
     이름 입력 — 두 사람이 서로를 부를 이름
     ============================================================ */
  function renderName() {
    $("#app").setAttribute("data-turn", "A");
    setHead("맘풀고 대화 게임카드 <b>웜업</b>", "맛보기", false);
    showFab(false);   // 이름 입력 중엔 버튼이 가리므로 숨김

    $("#body").innerHTML =
      '<div class="nm anim">' +
        '<div class="nm-lead">' +
          '<img class="nm-logo" src="assets/img/logo.png?v=3" alt="맘풀고 · 마음을 프리하게" />' +
          '<h1 class="nm-h">서로를 부를 이름을<br>넣어주세요</h1>' +
          '<p class="nm-p">휴대폰 한 대를 사이에 두고<br>마주 앉아 진행합니다.</p>' +
        '</div>' +
        '<div class="nm-fields">' +
          '<div class="nm-f nm-a">' +
            '<label for="inA">먼저 읽는 사람 <span>A</span></label>' +
            '<input id="inA" type="text" maxlength="10" placeholder="예) 지현, 엄마" autocomplete="off" />' +
          '</div>' +
          '<div class="nm-f nm-b">' +
            '<label for="inB">받아 읽는 사람 <span>B</span></label>' +
            '<input id="inB" type="text" maxlength="10" placeholder="예) 민수, 아들" autocomplete="off" />' +
          '</div>' +
        '</div>' +
        '<div class="nm-err" id="nmErr"></div>' +
        '<div class="nm-tip">실제 이름도, <b>엄마·여보·아들</b> 같은 호칭도 좋아요</div>' +
      '</div>';

    setFoot("시작하기", true, submitName, "");

    var a = $("#inA"), bEl = $("#inB");
    // 이전 입력 복구
    try {
      var sa = sessionStorage.getItem("mpg_a"), sb = sessionStorage.getItem("mpg_b");
      if (sa) a.value = sa;
      if (sb) bEl.value = sb;
    } catch (e) {}
    // URL 파라미터가 있으면 우선 채움
    var qa = qp("userA", ""), qb = qp("userB", "");
    if (qa) a.value = qa;
    if (qb) bEl.value = qb;

    [a, bEl].forEach(function (el) {
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          if (el === a && !bEl.value.trim()) { bEl.focus(); return; }
          submitName();
        }
      });
    });
    setTimeout(function () { if (!a.value) a.focus(); }, 260);
  }

  function submitName() {
    var a = $("#inA").value.trim();
    var b = $("#inB").value.trim();
    var err = $("#nmErr");

    if (!a || !b) {
      err.textContent = "두 분의 이름을 모두 넣어주세요.";
      err.classList.add("on");
      $(a ? "#inB" : "#inA").focus();
      return;
    }
    if (a === b) {
      err.textContent = "서로 다르게 넣어주세요.";
      err.classList.add("on");
      $("#inB").focus();
      return;
    }
    err.classList.remove("on");

    S.nameA = a; S.nameB = b;
    try { sessionStorage.setItem("mpg_a", a); sessionStorage.setItem("mpg_b", b); } catch (e) {}
    S.phase = "pick"; save(); go();
  }

  /* ============================================================
     [개선 3] 카드 고르기 — 실물 카드를 뽑듯이
     ============================================================ */
  function renderPick() {
    showFab(true);
    $("#app").setAttribute("data-turn", "A");
    setHead("맘풀고 대화 게임카드 <b>웜업</b>", "맛보기", false);

    var deck = CARDS.map(function (c, i) {
      return '<button class="dcard deal" style="animation-delay:' + (i * 0.05 + 0.05) + 's" ' +
        'data-id="' + c.id + '">' +
        '<div class="dc-no">' + esc(c.no) + '</div>' +
        '<div class="dc-tt">' + esc(c.title) + '</div>' +
        '<div class="dc-ac">' + esc(c.activity) + '</div>' +
        '<div class="dc-emos"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '</button>';
    }).join("");

    $("#body").innerHTML =
      '<div class="pick-h anim">' +
        '<div class="ph-1">오늘의 훈련카드</div>' +
        '<div class="ph-2">어떤 카드로<br>시작해 볼까요?</div>' +
      '</div>' +
      '<div class="deck">' + deck + '</div>' +
      '<button class="pick-rand anim d3" id="randBtn">🎲 아무거나 뽑아주세요</button>';

    var cards = document.querySelectorAll(".dcard");
    Array.prototype.forEach.call(cards, function (el) {
      el.addEventListener("click", function () {
        S.card = findCard(el.getAttribute("data-id"));
        S.phase = "intro"; S.turn = 0; save(); go();
      });
    });
    $("#randBtn").addEventListener("click", function () {
      S.card = CARDS[Math.floor(Math.random() * CARDS.length)];
      S.phase = "intro"; S.turn = 0; save(); go();
    });

    $("#foot").innerHTML = '<div class="hint">두 분이 함께 골라보세요</div>';
  }

  /* ============================================================
     인트로 — 실물 카드 레이아웃 재현
     ============================================================ */
  function renderIntro() {
    showFab(true);
    $("#app").setAttribute("data-turn", "A");
    setHead("맘풀고 대화 게임카드 <b>웜업</b>", S.card.no + ". " + S.card.title, false);

    $("#body").innerHTML =
      '<div class="intro">' +
        '<div class="intro-top anim">' +
          '<h1 class="intro-title">' + esc(S.card.no) + '. ' + esc(S.card.title) + '</h1>' +
        '</div>' +
        '<div class="intro-band anim d1">' + esc(S.card.activity) + '</div>' +
        '<div class="cuecard anim d1"><p>' + esc(fill(S.card.cue)) + '</p></div>' +
        '<div class="ruleline anim d2"></div>' +
        '<div class="ordertxt anim d2">' +
          '▶ <span class="o1">1번 [상대 감정 읽기]</span> ➡ <span class="o2">2번 [내 감정 말하기]</span>' +
        '</div>' +
        /* 실물 카드의 감정 칩 (읽기 전용 · 오늘 다룰 감정 미리보기) */
        '<div class="emochips anim d2">' +
          '<div class="ec-row">' + S.card.emotions.read.map(function (e) {
            return '<span class="ec ec-a">' + esc(e) + '</span>';
          }).join("") + '</div>' +
          '<div class="ec-row">' + S.card.emotions.mine.map(function (e) {
            return '<span class="ec ec-b">' + esc(e) + '</span>';
          }).join("") + '</div>' +
        '</div>' +
        '<div class="who2 anim d3">' +
          '<div class="w2 w2-a"><span>A</span>' + esc(S.nameA) + '</div>' +
          '<div class="w2-x">&amp;</div>' +
          '<div class="w2 w2-b"><span>B</span>' + esc(S.nameB) + '</div>' +
        '</div>' +
        '<button class="rc-open-inline anim d3" id="rcInline">' +
          '📖 <b>규칙카드</b> 먼저 보기 · 오프라인에선 각자 손에 들고 합니다</button>' +
      '</div>';

    var inl = $("#rcInline");
    if (inl) inl.addEventListener("click", openRuleCard);

    var f = $("#foot");
    f.innerHTML = '<button class="btn" id="mainBtn">활동을 해봤어요, 시작할게요</button>' +
      '<button class="btn btn-ghost" id="backBtn">← 다른 카드 고르기</button>';
    $("#mainBtn").addEventListener("click", function () {
      S.phase = "play"; S.turn = 0; save(); go();
    });
    $("#backBtn").addEventListener("click", function () {
      S.phase = "pick"; save(); go();
    });
  }

  /* ============================================================
     턴 화면
     ============================================================ */
  var timerId = null;

  function renderTurn() {
    showFab(true);
    if (timerId) { clearInterval(timerId); timerId = null; }

    var t = S.card.turns[S.turn];
    $("#app").setAttribute("data-turn", t.who);
    setHead("맘풀고 대화 게임카드 <b>웜업</b>", S.card.no + ". " + S.card.title, true);

    var h = '<div class="turnhead anim">' +
      '<div class="th-dot">' + t.who + '</div>' +
      '<div class="th-name"><b>' + esc(nameOf(t.who)) + '</b>' + josa(nameOf(t.who),"이","가") + ' 읽어주세요</div>' +
      '<div class="th-cnt">' + (S.turn + 1) + '<small>/' + CFG.TOTAL_TURNS + '</small></div>' +
      '</div>';

    /* [개선 2] 직전 상대 발화를 위에 남겨 대화가 이어지는 감각 */
    if (S.turn > 0) {
      var pv = S.card.turns[S.turn - 1];
      h += '<div class="prev anim ' + (pv.who === "A" ? "pa" : "pb") + '">' +
        '<div class="prev-l">방금 ' + esc(withJosa(pv.who,"이","가")) + ' 한 말</div>' +
        '<div class="prev-t">' + esc(fill(pv.mine)) + '</div></div>';
    }

    h += '<div class="script anim d1">';
    if (t.empathy) h += '<p class="sc-line sc-1">' + esc(fill(t.empathy)) + '</p>';
    h += '<p class="sc-line sc-2">' + esc(fill(t.mine)) + '</p>';
    h += '</div>';

    h += '<div class="readtip anim d2">🗣 상대의 눈을 보며, 천천히 소리 내어 읽어주세요</div>';

    $("#body").innerHTML = h;

    /* [개선 1] 읽을 분량에 비례한 대기 시간 → 눈으로만 훑고 넘기는 것 방지 */
    var chars = (t.empathy ? fill(t.empathy).length : 0) + fill(t.mine).length;
    var wait = Math.max(3, Math.min(9, Math.round(chars / 13)));
    var last = (S.turn + 1 >= CFG.TOTAL_TURNS);
    var btnLabel = last ? "다 읽었어요 (마지막)" : "다 읽었어요";

    setFoot(btnLabel, false, null, esc(withJosa(t.who, "이", "가")) + " 읽으신 뒤 눌러주세요");
    startCountdown(wait, btnLabel, next);
  }

  function startCountdown(sec, btnLabel, onDone) {
    var btn = $("#mainBtn");
    var left = sec;
    btn.disabled = true;
    btn.textContent = "천천히 읽어주세요 · " + left;

    timerId = setInterval(function () {
      left--;
      if (left > 0) {
        btn.textContent = "천천히 읽어주세요 · " + left;
      } else {
        clearInterval(timerId); timerId = null;
        btn.disabled = false;
        btn.textContent = btnLabel;
        btn.addEventListener("click", onDone);
      }
    }, 1000);
  }

  /* ---------- 푸터 ---------- */
  function setFoot(btnLabel, enabled, onClick, hint) {
    var f = $("#foot");
    f.innerHTML = '<button class="btn" id="mainBtn"' + (enabled ? "" : " disabled") + '>' +
      esc(btnLabel) + '</button>' + (hint ? '<div class="hint">' + esc(hint) + "</div>" : "");
    if (enabled && onClick) $("#mainBtn").addEventListener("click", onClick);
  }

  /* ---------- 진행 ---------- */
  function go() { render(); $("#body").scrollTop = 0; }

  function next() {
    if (S.turn + 1 >= CFG.TOTAL_TURNS) {
      S.phase = "done";
    } else {
      S.turn++;
    }
    save(); go();
  }

  /* ---------- 완료 화면 ---------- */
  function renderDone() {
    showFab(false);   // 하단 버튼 3개와 겹치므로 숨김
    if (timerId) { clearInterval(timerId); timerId = null; }
    $("#app").setAttribute("data-turn", "A");
    setHead("맘풀고 대화 게임카드 <b>웜업 완료</b>", S.card.no + ". " + S.card.title, true);

    $("#body").innerHTML =
      '<div class="done-wrap anim">' +
        '<img class="done-mark" src="assets/img/mark.png?v=3" alt="" />' +
        '<div class="done-h">6턴, 끝까지 오셨네요</div>' +
        '<div class="done-p">' + esc(withJosa("A","과","와")) + ' ' + esc(label("B")) + ',<br>' +
        '방금 서로의 마음을 여섯 번 주고받으셨습니다.</div>' +
      '</div>' +
      '<div class="done-next anim d2">' +
        '<div class="dn-l">여기까지가 맛보기입니다</div>' +
        '<div class="dn-t">감정을 직접 고르고 내 말로 표현하는 단계는<br>' +
        '<b>맘풀고 오프라인 카드</b>에 담겨 있습니다.</div>' +
      '</div>';

    var f = $("#foot");
    f.innerHTML =
      '<button class="btn" id="homeBtn">맘풀고 홈으로 가기</button>' +
      '<button class="btn btn-ghost" id="againBtn">↻ 다른 카드로 한 번 더</button>' +
      '<button class="btn-text" id="nameBtn">이름 바꾸기</button>';

    $("#homeBtn").addEventListener("click", goHome);
    $("#againBtn").addEventListener("click", function () {
      S.card = null; S.turn = 0; S.phase = "pick";
      try { sessionStorage.removeItem("mompulgo_state"); } catch (e) {}
      go();
    });
    $("#nameBtn").addEventListener("click", function () {
      S.card = null; S.turn = 0; S.phase = "name";
      try {
        sessionStorage.removeItem("mompulgo_state");
        sessionStorage.removeItem("mompulgo_card");
      } catch (e) {}
      go();
    });
  }

  /* ---------- 홈으로 (부모창 전체 이동) ---------- */
  function goHome() {
    var url = CFG.WP_BASE + CFG.HOME_PATH;
    try { w.top.location.href = url; }
    catch (e) {
      try { w.parent.location.href = url; }
      catch (e2) { w.open(url, "_blank"); }
    }
  }

  /* ---------- 세션 저장 ---------- */
  function save() {
    try {
      sessionStorage.setItem("mompulgo_state", JSON.stringify({
        turn: S.turn, phase: S.phase, card: S.card ? S.card.id : null
      }));
    } catch (e) {}
  }
  function restore() {
    try {
      /* 이름 먼저 복구 (새로고침해도 다시 안 물어보도록) */
      var sa = sessionStorage.getItem("mpg_a"), sb = sessionStorage.getItem("mpg_b");
      if (sa && sb) {
        S.nameA = sa; S.nameB = sb;
        if (S.phase === "name") S.phase = "pick";
      }

      var raw = sessionStorage.getItem("mompulgo_state");
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || !o.card) return;
      var c = findCard(o.card);
      if (!c) return;
      if (o.phase === "play" || o.phase === "intro") {
        S.card = c; S.turn = o.turn || 0; S.phase = o.phase;
      }
    } catch (e) {}
  }

  /* ============================================================
     규칙카드 (실물 카드처럼 앞/뒤 뒤집기)
     오프라인에서 각자 손에 들고 하는 카드를 웹에서도 항상 꺼내볼 수 있게.
     ============================================================ */
  var RC = w.MOMPULGO_RULECARD;
  var rcFlipped = false;

  function rcFrontHTML() {
    var f = RC.front;
    var body = f.lines.map(function (ln) {
      return '<div class="rc-block">' +
        '<div class="rc-l1">' + esc(ln.l1) + '</div>' +
        '<div class="rc-l2">' + esc(ln.l2a) +
        '<span class="rc-ph">' + esc(ln.ph) + '</span>' + esc(ln.l2b) + '</div>' +
        '</div>';
    }).join("");
    return '<div class="rc-face rc-front">' +
      rcHead(f.title, f.sub) + body +
      '<div class="rc-hr rc-hr-b"></div>' +
      '<div class="rc-logo">맘풀고</div>' +
      '</div>';
  }
  function rcHead(t, s) {
    return '<div class="rc-head">' +
      '<div class="rc-title">' + esc(t) + '</div>' +
      '<div class="rc-sub">' + esc(s) + '</div>' +
      '<div class="rc-hr"></div></div>';
  }

  function rcBackHTML() {
    var b = RC.back;
    var items = b.items.map(function (it) {
      return '<div class="rc-item rc-' + it.c + '">' +
        '<div class="rc-q">' + esc(it.q) + '</div>' +
        '<div class="rc-a">' + esc(it.a) + '</div>' +
        '</div>';
    }).join("");
    return '<div class="rc-face rc-back">' +
      '<div class="rc-btitle">' + b.title + '</div>' +
      '<div class="rc-items">' + items + '</div>' +
      '</div>';
  }

  function buildRuleCard() {
    if ($("#rcWrap")) return;
    var el = document.createElement("div");
    el.id = "rcWrap";
    el.className = "rc-wrap";
    el.innerHTML =
      '<div class="rc-dim" id="rcDim"></div>' +
      '<div class="rc-stage">' +
        '<div class="rc-card" id="rcCard">' +
          '<div class="rc-inner" id="rcInner">' + rcFrontHTML() + rcBackHTML() + '</div>' +
        '</div>' +
        '<div class="rc-actions">' +
          '<button class="rc-flip" id="rcFlip">🔄 뒤집기 · 감정 찾기</button>' +
          '<button class="rc-close" id="rcClose">닫기</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    $("#rcDim").addEventListener("click", closeRuleCard);
    $("#rcClose").addEventListener("click", closeRuleCard);
    $("#rcCard").addEventListener("click", flipRuleCard);
    $("#rcFlip").addEventListener("click", flipRuleCard);
  }

  function flipRuleCard() {
    rcFlipped = !rcFlipped;
    $("#rcInner").classList.toggle("flipped", rcFlipped);
    $("#rcFlip").textContent = rcFlipped ? "🔄 뒤집기 · 대화법" : "🔄 뒤집기 · 감정 찾기";
  }
  function openRuleCard() {
    buildRuleCard();
    requestAnimationFrame(function () { $("#rcWrap").classList.add("on"); });
  }
  function closeRuleCard() {
    var el = $("#rcWrap");
    if (el) el.classList.remove("on");
  }

  /* FAB 표시/숨김 */
  function showFab(on) {
    var f = $("#rcFab");
    if (f) f.style.display = on ? "" : "none";
  }

  /* 화면 우하단 상시 버튼 */
  function mountRuleFab() {
    if ($("#rcFab")) return;
    var b = document.createElement("button");
    b.id = "rcFab";
    b.className = "rc-fab";
    b.innerHTML = '<span>📖</span>규칙카드';
    b.addEventListener("click", openRuleCard);
    document.body.appendChild(b);
  }

  /* ---------- 시작 ---------- */
  function start() {
    mountRuleFab();

    /* URL에 이름이 둘 다 있으면 입력 화면을 건너뛴다 (워드프레스에서 넘겨줄 때) */
    var qa = qp("userA", ""), qb = qp("userB", "");
    if (qa && qb) {
      S.nameA = qa; S.nameB = qb;
      S.phase = "pick";
      try { sessionStorage.setItem("mpg_a", qa); sessionStorage.setItem("mpg_b", qb); } catch (e) {}
    }

    /* URL로 카드까지 지정되면 인트로부터 */
    var want = qp("card", null);
    if (want && S.phase === "pick") {
      var c = findCard(want);
      if (c) { S.card = c; S.phase = "intro"; }
    }

    if (!S.card) restore();
    go();
  }

  w.MOMPULGO = { start: start, state: S };
})(window);
