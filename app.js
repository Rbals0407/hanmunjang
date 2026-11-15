/* 화면 흐름(묻기 → 듣는 중 → 답 하나씩), 즐겨찾기, 기록을 맡는 파일입니다. */

const stage = document.getElementById('stage');
const view = document.getElementById('view');
const dots = document.getElementById('dots');
const scrollBox = document.getElementById('scroll');

const FAV_KEY = 'hanmunjang.favorites';
const LOG_KEY = 'hanmunjang.history';
const LOG_LIMIT = 100;
const MAX_ANSWERS = 5;

// "동작 줄이기"를 켠 기기에서는 기다림과 움직임을 줄입니다.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LISTEN_MS = reduceMotion ? 600 : 1800;
const SINK_MS = reduceMotion ? 300 : 500;

let QUOTES = [];
let byId = {};
let session = null;   // 지금 묻고 있는 고민: { worry, topic, items, index, seenMax, logTime }
let busy = false;     // 연출 중에는 버튼이 겹쳐 눌리지 않게 막습니다.

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
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function dateText(d) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

// 화면 상태를 바꿉니다. (ask: 묻기, listening: 듣는 중, answer: 답, done: 끝, today: 오늘의 한 문장, list: 목록)
function setStage(name) {
  stage.className = 'stage is-' + name;
}
function setTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

// 날짜로 오늘의 명언을 정합니다. 같은 날에는 항상 같은 명언이 나옵니다.
function todayQuote() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return QUOTES[(Math.imul(seed, 2654435761) >>> 0) % QUOTES.length];
}

/* ---------- 그리는 조각들 ---------- */

function favButton(id) {
  const on = load(FAV_KEY).includes(id);
  return `<button class="fav-btn" data-fav="${id}" aria-pressed="${on}">${on ? '즐겨찾기에 담음' : '즐겨찾기에 담기'}</button>`;
}

function moreHtml(q) {
  return `
    <div class="more"><div class="inner"><div class="pad">
      <p class="label">풀이</p>
      <p>${esc(q['설명'])}</p>
      <p class="label">활용</p>
      <ol>${q['활용'].map(u => `<li>${esc(u)}</li>`).join('')}</ol>
    </div></div></div>`;
}

// 답 카드: 요점은 크게, 원문과 출처는 작게. 누르면 풀이와 활용이 펼쳐집니다.
function answerCard(q, motion) {
  return `
    <section class="answer ${motion}" data-id="${q.id}">
      <button class="answer-main" aria-expanded="false">
        <h1 class="word">${esc(q['요점'])}</h1>
        <p class="orig">${esc(q['원문'])}</p>
        <p class="src">${esc(q['인물'])}, ${esc(q['출처'])}</p>
        <span class="hint">눌러서 풀이와 활용 보기</span>
      </button>
      ${moreHtml(q)}
      ${favButton(q.id)}
    </section>`;
}

// 즐겨찾기·기록 목록에서 쓰는 한 줄. 누르면 펼쳐집니다.
function entryHtml(q) {
  return `
    <article class="entry" data-id="${q.id}">
      <button class="entry-head" aria-expanded="false">${esc(q['요점'])}</button>
      <div class="more"><div class="inner">
        <p class="orig">${esc(q['원문'])}</p>
        <p class="src">${esc(q['인물'])}, ${esc(q['출처'])}</p>
        <p class="label" style="margin-top:12px">풀이</p>
        <p>${esc(q['설명'])}</p>
        <p class="label" style="margin-top:12px">활용</p>
        <ol>${q['활용'].map(u => `<li>${esc(u)}</li>`).join('')}</ol>
        ${favButton(q.id)}
      </div></div>
    </article>`;
}

// 오른쪽 위 점: 본 답은 채워지고, 지금 보는 답은 조금 큽니다. 본 답의 점을 누르면 그 답으로 갑니다.
function drawDots() {
  if (!session) { dots.innerHTML = ''; return; }
  dots.innerHTML = session.items.map((q, i) => {
    const seen = i <= session.seenMax;
    const now = i === session.index && stage.classList.contains('is-answer');
    return `<button data-dot="${i}" class="${seen ? 'seen' : ''} ${now ? 'now' : ''}" ${seen ? '' : 'disabled'} aria-label="${i + 1}번째 답${seen ? '' : ' (아직 보지 않음)'}"></button>`;
  }).join('');
}

/* ---------- 화면: 묻기 ---------- */

function showAsk() {
  session = null;
  setStage('ask');
  setTab('home');
  drawDots();
  view.innerHTML = `
    <form class="ask fade" id="ask-form" novalidate>
      <label for="worry">무엇이 고민인가요</label>
      <textarea id="worry" maxlength="300" placeholder="예시: 시험공부 해야 하는데 계속 폰만 봐"></textarea>
      <p class="error" id="ask-error" role="alert"></p>
      <button class="main-btn" type="submit">소라에게 묻기</button>
    </form>`;
  scrollBox.scrollTop = 0;
}

/* ---------- 흐름: 묻기 → 듣는 중 → 답 ---------- */

// 같은 고민을 전에 물은 적이 있으면, 그때 받은 명언은 빼고 고릅니다.
function seenBefore(worry) {
  const ids = [];
  for (const log of load(LOG_KEY)) if (log.worry === worry) ids.push(...log.ids);
  return ids;
}

async function ask(worry, topic) {
  if (busy) return;
  const key = topic ? `주제: ${topic}` : worry;
  let result = await recommend(worry, QUOTES, { exclude: seenBefore(key), topic });
  if (result.weak) return showWeak(worry);
  // 볼 만한 명언을 이미 다 봤다면 처음부터 다시 고릅니다.
  if (result.items.length === 0) result = await recommend(worry, QUOTES, { exclude: [], topic });
  if (result.items.length === 0) return showWeak(worry);

  session = {
    worry: key,
    items: result.items.slice(0, MAX_ANSWERS),
    index: 0,
    seenMax: -1,
    logTime: Date.now(),
    read: result.understood || []
  };
  // 기록에는 묻는 순간 고민과 고른 명언을 함께 저장합니다.
  const logs = load(LOG_KEY);
  logs.unshift({ t: session.logTime, worry: key, ids: session.items.map(q => q.id), read: session.read });
  save(LOG_KEY, logs.slice(0, LOG_LIMIT));

  await listen();
  showAnswer(0, 'rise');
}

// 소라가 듣는 연출: 화면이 어두워지고 소라가 천천히 흔들리며 빛납니다.
async function listen() {
  busy = true;
  setStage('listening');
  setTab('home');
  drawDots();
  view.innerHTML = `
    <div class="center fade">
      <p class="heard">${esc(session.worry)}</p>
      <p class="status">소라가 듣고 있습니다</p>
    </div>`;
  scrollBox.scrollTop = 0;
  await wait(LISTEN_MS);
  busy = false;
}

function showAnswer(index, motion) {
  session.index = index;
  session.seenMax = Math.max(session.seenMax, index);
  setStage('answer');
  setTab('home');
  drawDots();
  view.innerHTML = `
    ${answerCard(session.items[index], motion)}
    <div class="push ${motion}">
      <button class="line-btn" id="again">다시 묻기</button>
    </div>`;
  scrollBox.scrollTop = 0;
}

// "다시 묻기": 지금 답이 가라앉고, 듣는 연출을 거쳐 다음 답이 나옵니다. 마지막 답 뒤에는 끝 화면.
async function again() {
  if (busy || !session) return;
  busy = true;
  view.querySelectorAll('.answer, .push').forEach(el => { el.classList.remove('rise', 'fade'); el.classList.add('sink'); });
  await wait(SINK_MS);
  busy = false;
  if (session.seenMax >= session.items.length - 1) return showDone();
  const next = session.seenMax + 1;
  await listen();
  showAnswer(next, 'rise');
}

function showDone() {
  setStage('done');
  drawDots();
  view.innerHTML = `
    <div class="center fade">
      <p class="done-title">오늘의 답은 여기까지</p>
      <p class="note" style="margin-top:8px">위의 점을 누르면 지나간 답을 다시 볼 수 있습니다.</p>
    </div>
    <div class="push fade"><button class="main-btn" data-nav="home">다른 고민 묻기</button></div>`;
  scrollBox.scrollTop = 0;
}

function showWeak(worry) {
  session = null;
  setStage('ask');
  drawDots();
  view.innerHTML = `
    <div class="center fade">
      <p>소라가 답을 찾지 못했습니다.</p>
      <p class="note" style="margin-top:6px">고민을 조금 더 구체적으로 써보세요. 누구와, 언제, 무엇 때문에 힘든지.</p>
      <p class="label" style="margin-top:22px">주제로 직접 고르기</p>
      <div class="topics">${TOPICS.map(t => `<button data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <button class="text-btn" data-nav="home" style="margin-top:14px">고민 다시 쓰기</button>
    </div>`;
  scrollBox.scrollTop = 0;
}

/* ---------- 화면: 오늘의 한 문장 ---------- */

function showToday() {
  session = null;
  setStage('today');
  setTab('home');
  drawDots();
  view.innerHTML = `
    <p class="label center fade">오늘의 한 문장 · ${dateText(new Date())}</p>
    ${answerCard(todayQuote(), 'rise')}
    <div class="push fade"><button class="line-btn" data-nav="home">고민 물으러 가기</button></div>`;
  scrollBox.scrollTop = 0;
}

/* ---------- 화면: 즐겨찾기, 기록 ---------- */

function showFav() {
  session = null;
  setStage('list');
  setTab('fav');
  drawDots();
  const items = load(FAV_KEY).map(id => byId[id]).filter(Boolean);
  view.innerHTML = `
    <div class="fade">
      <h1 class="page">즐겨찾기</h1>
      <p class="note">${items.length}개</p>
      ${items.length
        ? `<div class="entries">${items.map(entryHtml).join('')}</div>`
        : `<p class="empty">담아둔 명언이 여기에 모입니다. 답 화면에서 '즐겨찾기에 담기'를 누르세요.</p>`}
    </div>`;
  scrollBox.scrollTop = 0;
}

function showHistory() {
  session = null;
  setStage('list');
  setTab('history');
  drawDots();
  const logs = load(LOG_KEY);
  const list = logs.map(l => {
    const items = l.ids.map(id => byId[id]).filter(Boolean);
    return `
      <section class="log">
        <div class="log-head"><span>${dateText(new Date(l.t))}</span><button data-del="${l.t}">삭제</button></div>
        <p class="text">${esc(l.worry)}</p>
        <div class="entries">${items.map(entryHtml).join('')}</div>
      </section>`;
  }).join('');
  view.innerHTML = `
    <div class="fade">
      <h1 class="page">기록</h1>
      <p class="note">이 기기에만 저장됩니다. 다른 사람이나 서버로 전송되지 않습니다.</p>
      ${logs.length
        ? `${list}<button class="line-btn" id="clear-log" style="margin-top:28px">기록 전체 삭제</button>`
        : `<p class="empty">소라에게 고민을 물으면 여기에 남습니다.</p>`}
    </div>`;
  scrollBox.scrollTop = 0;
}

/* ---------- 누르기 처리 ---------- */

document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t || busy) return;

  if (t.id === 'today-btn') return showToday();
  if (t.dataset.nav) {
    if (t.dataset.nav === 'fav') return showFav();
    if (t.dataset.nav === 'history') return showHistory();
    return showAsk();
  }

  // 답 카드나 목록의 한 줄을 누르면 풀이와 활용이 펼쳐집니다.
  if (t.classList.contains('answer-main') || t.classList.contains('entry-head')) {
    const box = t.parentElement;
    const open = box.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
    const hint = t.querySelector('.hint');
    if (hint) hint.textContent = open ? '눌러서 접기' : '눌러서 풀이와 활용 보기';
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

  if (t.dataset.dot && session) return showAnswer(Number(t.dataset.dot), 'fade');
  if (t.id === 'again') return again();
  if (t.dataset.topic) return ask('', t.dataset.topic);

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
  ask(worry, null);
});

document.addEventListener('input', e => {
  if (e.target.id === 'worry') document.getElementById('ask-error').textContent = '';
});

/* ---------- 시작 ---------- */

async function start() {
  try {
    const res = await fetch('quotes.json');
    QUOTES = await res.json();
  } catch (e) {
    view.innerHTML = `<p class="empty center">명언을 불러오지 못했습니다. 인터넷에 연결한 뒤 한 번 열어주세요.</p>`;
    return;
  }
  byId = Object.fromEntries(QUOTES.map(q => [q.id, q]));
  showAsk();
}

start();

// 서비스 워커 등록: 앱 파일을 기기에 저장해 인터넷 없이도 열리게 합니다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
