(() => {
  const $ = (id) => document.getElementById(id);

  const qs = new URLSearchParams(location.search);

  const clean = (s, max = 12) => (s || "")
    .toString()
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

  const a0 = clean(qs.get("a"));
  const b0 = clean(qs.get("b"));
  const topic = (qs.get("topic") || "01").padStart(2, "0");
  const reportBase = clean(qs.get("report"), 300) || ""; // ex) https://yourdomain.com/talk/report

  // 주제 01 데이터(이 구조만 유지하면 02~06도 같은 방식으로 추가 가능)
  const TOPIC_01 = {
    id: "01",
    title: "눈빛 콘택트",
    activity: "상대방의 눈을 3초간 가만히 바라본 뒤, 깊은 숨을 내쉬며 진행해요.",
    opening: "{P}님, 지금 저랑 눈이 딱 마주쳤어요.",
    emotions: {
      partner: ["막막함", "불편함", "재밌는"],
      me: ["답답함", "편안함", "상쾌한"]
    },
    // 6턴 고정: 1턴은 단문(잠금 없음), 2~6턴은 "공감 / 내마음"
    turns: [
      { type: "single", text: "이렇게 마주보고 있으니 감정이고 뭐고 그냥 머리가 멍해지는 것 같아요" },
      { type: "dual", text: "{P}님 말을 들어보니 정말 머리가 멍해서 힘드셨을 것 같아요 / {P}님 말을 듣고 나니 저도 어떻게 해야 될지 막막해지네요" },
      { type: "dual", text: "{P}님 말을 듣고 보니 정말 막막하시겠어요 / {P}님 말을 듣고 있는 저도 뭘 해야 될지 몰라 답답하네요" },
      { type: "dual", text: "{P}님 말을 들어보니 정말 답답해서 불편하실 것 같아요 / 이런 {P}님을 보고 있으니 문득 {P}님도, 저도 편해지면 좋겠다는 생각이 드네요" },
      { type: "dual", text: "{P}님 말을 들어보니 그 생각이 정말 진심으로 다가와요 / 그래서 {P}님 말을 들으니 제 마음이 한결 편안해지네요" },
      { type: "dual", text: "{P}님 말을 들어보니 진짜 점점 편안해 보이세요 / 이런 {P}님 모습을 보니 저도 같이 덩달아 마음이 편안해지네요" }
    ]
  };

  const TOPICS = {
    "01": TOPIC_01
  };

  const topicData = TOPICS[topic] || TOPIC_01;

  $("topicBadge").textContent = topicData.id;
  $("topicTitle").textContent = topicData.title;

  // State
  let A = a0, B = b0;
  let idx = -1; // -1 ready, 0..5 turns
  let phase = "empathy"; // empathy -> self for dual
  let memo = "";

  // Screens
  const screens = {
    setup: $("screenSetup"),
    ready: $("screenReady"),
    turn: $("screenTurn"),
    end: $("screenEnd")
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => el.hidden = (k !== name));
  }

  function renderReady() {
    const opening = topicData.opening.replace("{P}", B);
    $("activityText").textContent = topicData.activity;
    $("openingLine").textContent = opening;
    $("progressText").textContent = "준비";
    showScreen("ready");
  }

  function renderTurn() {
    const turnNo = idx + 1;
    const total = topicData.turns.length;

    const isATurn = (turnNo % 2 === 1); // 1,3,5 => A / 2,4,6 => B (MVP 고정)
    const speaker = isATurn ? A : B;
    const partner = isATurn ? B : A;

    $("turnMeta").textContent = `${turnNo}/${total} · 지금은 ${speaker} 차례`;
    $("progressText").textContent = `${turnNo}/${total}`;

    // reset blocks
    $("blockEmpathy").hidden = true;
    $("blockSelf").hidden = true;
    $("blockSingle").hidden = true;

    const t = topicData.turns[idx];

    if (t.type === "single") {
      $("blockSingle").hidden = false;
      $("singleText").textContent = t.text;
      $("btnPrimary").textContent = "다음 턴";
      phase = "single";
      return;
    }

    // dual
    const replaced = t.text.replaceAll("{P}", partner);
    const parts = replaced.split("/").map(s => s.trim());
    const empathy = parts[0] || "";
    const self = parts[1] || "";

    $("blockEmpathy").hidden = false;
    $("empathyText").textContent = empathy;

    $("blockSelf").hidden = true;
    $("selfText").textContent = self;

    $("btnPrimary").textContent = "소리 내어 읽었어요";
    phase = "empathy";
  }

  function nextPrimary() {
    const t = topicData.turns[idx];

    if (t.type === "single") {
      // go next
      idx++;
      if (idx >= topicData.turns.length) return renderEnd();
      return renderTurn();
    }

    if (phase === "empathy") {
      $("blockSelf").hidden = false;
      $("btnPrimary").textContent = "다음 턴";
      phase = "self";
      return;
    }

    // phase === self => next turn
    idx++;
    if (idx >= topicData.turns.length) return renderEnd();
    renderTurn();
  }

  function renderEnd() {
    $("progressText").textContent = "완료";
    showScreen("end");
  }

  function openSOS() {
    const { partner, me } = topicData.emotions;
    $("chipsPartner").innerHTML = partner.map(x => `<span class="chip">${x}</span>`).join("");
    $("chipsMe").innerHTML = me.map(x => `<span class="chip">${x}</span>`).join("");
    $("sosModal").hidden = false;
  }

  function closeSOS() {
    $("sosModal").hidden = true;
  }

  function buildReportUrl() {
    // reportBase 없으면(아직 연결 안 했으면) fallback: 현재 top으로 링크만 제공
    const base = reportBase || "/talk/report";

    memo = clean($("inputMemo").value, 80);

    const params = new URLSearchParams();
    params.set("topic", topicData.id);
    params.set("level", "1");
    params.set("a", A);
    params.set("b", B);
    if (memo) params.set("memo", memo);

    return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
  }

  function goReport() {
    const url = buildReportUrl();

    try {
      window.top.location.href = url; // iframe 밖(부모 WP)로 이동
    } catch (e) {
      // 일부 환경에서 막히면 대체 링크 노출
      const link = $("linkFallback");
      link.href = url;
      link.hidden = false;
    }
  }

  // Events
  $("btnSetupStart").addEventListener("click", () => {
    A = clean($("inputA").value);
    B = clean($("inputB").value);
    if (!A || !B) return;
    renderReady();
  });

  $("btnBegin").addEventListener("click", () => {
    idx = 0;
    showScreen("turn");
    renderTurn();
  });

  $("btnPrimary").addEventListener("click", nextPrimary);
  $("btnSOS").addEventListener("click", openSOS);
  $("btnCloseSOS").addEventListener("click", closeSOS);
  $("sosModal").addEventListener("click", (e) => { if (e.target === $("sosModal")) closeSOS(); });

  $("btnReport").addEventListener("click", goReport);

  // Init
  if (!a0 || !b0) {
    showScreen("setup");
  } else {
    A = a0; B = b0;
    renderReady();
  }
})();