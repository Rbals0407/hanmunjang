/* 화면 전환, 오늘의 명언, 즐겨찾기, 기록을 맡는 파일입니다. */

const view = document.getElementById('view');
const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const FAV_KEY = 'hanmunjang.favorites';
const LOG_KEY = 'hanmunjang.history';
const LOG_LIMIT = 100;

let QUOTES = [];
let byId = {};
let current = null; // 지금 보고 있는 추천 결과: { worry, topic, shown: [id...], logTime }

/* ---------- 기기 안 저장소 (localStorage) ---------- */
// 고민과 기록은 이 기기의 브라우저에만 저장됩니다. 서버로 보내는 코드는 없습니다.

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 공간이 막힌 경우 무시 */ }
}

/* ---------- 작은 도구들 ---------- */

function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function dateText(d) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

// 날짜로 오늘의 명언을 정합니다. 같은 날에는 항상 같은 명언이 나옵니다.
function todayQuote() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const index = (Math.imul(seed, 2654435761) >>> 0) % QUOTES.length;
  return QUOTES[index];
}

/* ---------- 명언 한 항목 그리기 ---------- */

function detailHtml(q) {
  const favs = load(FAV_KEY);
  const isFav = favs.includes(q.id);
  const uses = q['활용'].map(u => `<li>${esc(u)}</li>`).join('');
  return `
    <p class="orig">${esc(q['원문'])}</p>
    <p class="src">— ${esc(q['인물'])}, ${esc(q['출처'])}</p>
    <p class="label">풀이</p>
    <p>${esc(q['설명'])}</p>
    <p class="label">활용</p>
    <ol>${uses}</ol>
    <button class="fav-btn" data-fav="${q.id}" aria-pressed="${isFav}">${isFav ? '즐겨찾기에 담음' : '즐겨찾기에 담기'}</button>`;
}

function entryHtml(q, index) {
  const num = index == null ? '' : `<span class="num">${NUMS[index] || index + 1}</span>`;
  return `
    <article class="entry" data-id="${q.id}">
      <button class="entry-head" aria-expanded="false">
        ${num}<span class="word">${esc(q['요점'])}</span>
      </button>
      <div class="entry-body"><div class="inner"><div class="pad">${detailHtml(q)}</div></div></div>
    </article>`;
}

function topicButtons() {
  return `<div class="topics">${TOPICS.map(t => `<button data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
}

/* ---------- 화면: 찾기(첫 화면) ---------- */

function showHome() {
  setTab('home');
  current = null;
  const q = todayQuote();
  view.innerHTML = `
    <section class="today">
      <p class="label">오늘의 명언</p>
      <h1 class="word">${esc(q['요점'])}</h1>
      <p class="orig">${esc(q['원문'])}</p>
      <p class="src">— ${esc(q['인물'])}, ${esc(q['출처'])}</p>
      <article class="entry today-more" data-id="${q.id}">
        <button class="text-btn entry-toggle" aria-expanded="false">풀이와 활용 보기</button>
        <div class="entry-body"><div class="inner">
          <p class="label">풀이</p>
          <p>${esc(q['설명'])}</p>
          <p class="label" style="margin-top:16px">활용</p>
          <ol style="list-style:none">${q['활용'].map(u => `<li>${esc(u)}</li>`).join('')}</ol>
          ${favButton(q.id)}
        </div></div>
      </article>
    </section>
    <form class="ask" id="ask-form" novalidate>
      <label for="worry">지금 고민을 적어주세요</label>
      <textarea id="worry" maxlength="300" placeholder="시험공부 해야 하는데 계속 폰만 봐"></textarea>
      <p class="error" id="ask-error" role="alert"></p>
      <button class="main-btn" type="submit">명언 찾아보기</button>
    </form>`;
}

function favButton(id) {
  const isFav = load(FAV_KEY).includes(id);
  return `<button class="fav-btn" data-fav="${id}" aria-pressed="${isFav}">${isFav ? '즐겨찾기에 담음' : '즐겨찾기에 담기'}</button>`;
}

/* ---------- 화면: 추천 결과 ---------- */

async function runSearch(worry, topic) {
  const result = await recommend(worry, QUOTES, { exclude: [], topic });
  if (result.weak) return showWeak(worry);
  current = { worry, topic: topic || null, shown: result.items.map(q => q.id), logTime: Date.now(), understood: result.understood || [] };
  addLog(current);
  showResult(result.items, false);
}

async function reroll() {
  if (!current) return;
  const result = await recommend(current.worry, QUOTES, { exclude: current.shown, topic: current.topic });
  if (result.items.length === 0) return showResult([], true);
  current.shown.push(...result.items.map(q => q.id));
  updateLog(current);
  showResult(result.items, false);
}

function showResult(items, exhausted) {
  setTab('home');
  const heading = current.topic
    ? `<p class="label">고른 주제</p><p class="text">${esc(current.topic)}</p>`
    : `<p class="label">고민</p><p class="text">${esc(current.worry)}</p>
       ${current.understood.length ? `<p class="read">이렇게 읽었습니다: ${esc(current.understood.join(' · '))}</p>` : ''}`;
  const body = exhausted
    ? `<p class="empty">이 고민으로 보여드릴 명언을 모두 보았습니다. 지난 추천은 기록에서 다시 볼 수 있습니다.</p>`
    : `<div class="entries">${items.map((q, i) => entryHtml(q, i)).join('')}</div>
       <button class="line-btn" id="reroll">다시 뽑기</button>`;
  view.innerHTML = `
    <section class="worry">${heading}</section>
    ${body}
    <button class="text-btn" data-nav="home">새 고민 쓰기</button>`;
  window.scrollTo(0, 0);
}

function showWeak(worry) {
  setTab('home');
  view.innerHTML = `
    <section class="worry"><p class="label">고민</p><p class="text">${esc(worry)}</p></section>
    <p>맞는 명언을 찾지 못했습니다. 고민을 조금 더 구체적으로 써보세요.</p>
    <p class="note">예: 누구와, 언제, 무엇 때문에 힘든지</p>
    <p class="label">주제로 직접 고르기</p>
    ${topicButtons()}
    <button class="text-btn" data-nav="home" style="margin-top:20px">고민 다시 쓰기</button>`;
  window.scrollTo(0, 0);
}

/* ---------- 화면: 즐겨찾기 ---------- */

function showFav() {
  setTab('fav');
  current = null;
  const items = load(FAV_KEY).map(id => byId[id]).filter(Boolean);
  view.innerHTML = `
    <h1 class="page">즐겨찾기</h1>
    <p class="note">${items.length}개</p>
    ${items.length
      ? `<div class="entries">${items.map(q => entryHtml(q, null)).join('')}</div>`
      : `<p class="empty">담아둔 명언이 여기에 모입니다. 명언을 펼친 뒤 '즐겨찾기에 담기'를 누르세요.</p>`}`;
}

/* ---------- 화면: 기록 ---------- */

function addLog(c) {
  const logs = load(LOG_KEY);
  logs.unshift({ t: c.logTime, worry: c.topic ? `주제: ${c.topic}` : c.worry, ids: c.shown.slice() });
  save(LOG_KEY, logs.slice(0, LOG_LIMIT));
}
function updateLog(c) {
  const logs = load(LOG_KEY);
  const item = logs.find(l => l.t === c.logTime);
  if (item) { item.ids = c.shown.slice(); save(LOG_KEY, logs); }
}

function showHistory() {
  setTab('history');
  current = null;
  const logs = load(LOG_KEY);
  const list = logs.map(l => {
    const items = l.ids.map(id => byId[id]).filter(Boolean);
    return `
      <section class="log">
        <div class="log-head"><span>${dateText(new Date(l.t))}</span><button data-del="${l.t}">삭제</button></div>
        <p class="text">${esc(l.worry)}</p>
        <div class="entries">${items.map(q => entryHtml(q, null)).join('')}</div>
      </section>`;
  }).join('');
  view.innerHTML = `
    <h1 class="page">기록</h1>
    <p class="note">이 기기에만 저장됩니다. 다른 사람이나 서버로 전송되지 않습니다.</p>
    ${logs.length
      ? `${list}<button class="line-btn" id="clear-log">기록 전체 삭제</button>`
      : `<p class="empty">고민을 적고 명언을 찾으면 여기에 남습니다.</p>`}`;
}

/* ---------- 메뉴와 누르기 처리 ---------- */

function setTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function go(name) {
  if (name === 'fav') showFav();
  else if (name === 'history') showHistory();
  else showHome();
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.dataset.nav) return go(t.dataset.nav);

  if (t.classList.contains('entry-head') || t.classList.contains('entry-toggle')) {
    const entry = t.closest('.entry');
    const open = entry.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
    if (t.classList.contains('entry-toggle')) t.textContent = open ? '풀이와 활용 접기' : '풀이와 활용 보기';
    return;
  }

  if (t.dataset.fav) {
    const id = t.dataset.fav;
    let favs = load(FAV_KEY);
    const on = !favs.includes(id);
    favs = on ? [id, ...favs] : favs.filter(x => x !== id);
    save(FAV_KEY, favs);
    t.setAttribute('aria-pressed', on);
    t.textContent = on ? '즐겨찾기에 담음' : '즐겨찾기에 담기';
    return;
  }

  if (t.dataset.topic) return runSearch('', t.dataset.topic);
  if (t.id === 'reroll') return reroll();

  if (t.dataset.del) {
    save(LOG_KEY, load(LOG_KEY).filter(l => String(l.t) !== t.dataset.del));
    return showHistory();
  }
  if (t.id === 'clear-log') {
    if (confirm('기록을 모두 지울까요? 되돌릴 수 없습니다.')) { save(LOG_KEY, []); showHistory(); }
  }
});

document.addEventListener('submit', e => {
  if (e.target.id !== 'ask-form') return;
  e.preventDefault();
  const worry = document.getElementById('worry').value.trim();
  if (worry.length < 2) {
    document.getElementById('ask-error').textContent = '고민을 한 줄 적어주세요.';
    return;
  }
  runSearch(worry, null);
});

document.addEventListener('input', e => {
  if (e.target.id === 'worry') document.getElementById('ask-error').textContent = '';
});

/* ---------- 시작 ---------- */

async function start() {
  document.getElementById('today-date').textContent = dateText(new Date());
  try {
    const res = await fetch('quotes.json');
    QUOTES = await res.json();
  } catch (e) {
    view.innerHTML = `<p class="empty">명언을 불러오지 못했습니다. 인터넷에 연결한 뒤 한 번 열어주세요.</p>`;
    return;
  }
  byId = Object.fromEntries(QUOTES.map(q => [q.id, q]));
  showHome();
}

start();

// 서비스 워커 등록: 앱 파일을 기기에 저장해 인터넷 없이도 열리게 합니다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
