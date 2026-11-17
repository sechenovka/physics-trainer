// Тренажёр по физике: теория (4 варианта) + задачи (численный ответ), подсказки и решения
const $ = s => document.querySelector(s);
const app = $('#app');
const cardTpl = $('#cardTpl');

let mode = 'exam';
let deck = [];        // текущая колода [{type:'t'|'p', item, level, kind, id}]
let idx = 0;
let examStats = null; // {done:0, correct:0} в режиме добора

const LS_KEY = 'physTrainerDone';
const TOPICS_KEY = 'physTrainerTopics';

// ---------- уровни и банки ----------
const LEVEL_NAMES = { 1: 'лёгкий', 2: 'средний', 3: 'сложный', 4: 'экзамен' };

// Вопросы-формулы лёгкого и сложного банков (индексы внутри своих массивов).
// У новых банков (L2/MED/H2/EXAM) разметка стоит прямо в данных — поле f:true.
const FORMULA_LIGHT = new Set([12,17,22,26,28,31,33,36,40,41,46,51,52,53,54,55,56,57,61,64,65,66,70,71,74,80,81,82,86,98,99,101,103,104,105,106,108,109,110,111,113,115,117,121,123,124,126,128,130,134]);
const FORMULA_HARD = new Set([17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,58,59,60,61,62,63,66,70,86,99,103,107]);

const tag = (arr, level, formSet) => arr.map((x, i) => ({
  ...x, level, kind: (x.f || (formSet && formSet.has(i))) ? 'form' : 'def'
}));

const ALL_THEORY = [
  ...tag(THEORY, 1, FORMULA_LIGHT),
  ...tag(THEORY_L2, 1),
  ...tag(THEORY_MED, 2),
  ...tag(THEORY_HARD, 3, FORMULA_HARD),
  ...tag(THEORY_H2, 3),
  ...tag(THEORY_EXAM, 4)
];
const ALL_PRACTICE = [
  ...PRACTICE.map(x => ({ ...x, level: 1 })),
  ...PRACTICE_L2.map(x => ({ ...x, level: 1 })),
  ...PRACTICE_MED.map(x => ({ ...x, level: 2 })),
  ...PRACTICE_HARD.map(x => ({ ...x, level: 3 })),
  ...PRACTICE_H2.map(x => ({ ...x, level: 3 })),
  ...PRACTICE_EXAM.map(x => ({ ...x, level: 4 }))
];

// Смещение СЛОЖНОГО банка в общем массиве — нужно для миграции старых id прогресса
const OFF_T3 = THEORY.length + THEORY_L2.length + THEORY_MED.length;
const OFF_P3 = PRACTICE.length + PRACTICE_L2.length + PRACTICE_MED.length;

// ---------- прогресс ----------
function migrateDone(raw) {
  return raw.map(id => {
    const m = id.match(/^([tp])(\d+)_(\d)$/);
    if (!m) return id;
    const [, t, ns, lvl] = m; const n = +ns;
    if (lvl === '1') return `${t}${n}`;                       // лёгкий банк не сдвинулся
    if (lvl === '2') return `${t}${n + (t === 't' ? OFF_T3 : OFF_P3)}`; // старый «сложный» → level 3
    return id;
  });
}
const done = new Set(migrateDone(JSON.parse(localStorage.getItem(LS_KEY) || '[]')));
const saveDone = () => localStorage.setItem(LS_KEY, JSON.stringify([...done]));

const qid = (type, i) => `${type}${i}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- фильтры ----------
const selLevels = () => [...document.querySelectorAll('.lvl-cb:checked')].map(c => +c.value);
const selTopics = () => new Set([...document.querySelectorAll('.topic-cb:checked')].map(c => c.value));

function passFilters(d, levels, topics) {
  return levels.includes(d.level) && (!topics.size || topics.has(d.item.topic));
}

function buildTheoryDeck(kind, levels, topics) {
  return ALL_THEORY.map((item, i) => ({ type: 't', item, level: item.level, kind: item.kind, id: qid('t', i) }))
    .filter(d => (!kind || d.kind === kind) && passFilters(d, levels, topics));
}
function buildPracticeDeck(levels, topics) {
  return ALL_PRACTICE.map((item, i) => ({ type: 'p', item, level: item.level, kind: 'p', id: qid('p', i) }))
    .filter(d => passFilters(d, levels, topics));
}
function buildExamDeck(levels, topics) {
  const t = shuffle([...buildTheoryDeck(null, levels, topics)]).slice(0, 10);
  const p = shuffle([...buildPracticeDeck(levels, topics)]).slice(0, 10);
  return shuffle([...t, ...p]);
}

// ---------- рендер фильтра тем ----------
function topicsOf(list) { return [...new Set(list.map(x => x.topic))]; }

function currentTopics() {
  if (mode === 'practice') return topicsOf(ALL_PRACTICE);
  if (mode === 'all') return topicsOf(ALL_PRACTICE.concat(ALL_THEORY));
  return topicsOf(ALL_THEORY);
}

let savedTopics = {};
try { savedTopics = JSON.parse(localStorage.getItem(TOPICS_KEY) || '{}'); } catch (e) { savedTopics = {}; }

function buildTopicPanel() {
  const panel = $('#topicPanel');
  const topics = currentTopics();
  const off = new Set(savedTopics[mode] || []);
  panel.innerHTML =
    `<div class="tp-actions"><button id="tpAll">Все</button><button id="tpNone">Ни одной</button></div>` +
    topics.map(t => `<label class="tp-row"><input type="checkbox" class="topic-cb" value="${t}" ${off.has(t) ? '' : 'checked'}> ${t}</label>`).join('');
  panel.querySelector('#tpAll').onclick = e => { e.preventDefault(); panel.querySelectorAll('.topic-cb').forEach(c => c.checked = true); onTopicChange(); };
  panel.querySelector('#tpNone').onclick = e => { e.preventDefault(); panel.querySelectorAll('.topic-cb').forEach(c => c.checked = false); onTopicChange(); };
  panel.querySelectorAll('.topic-cb').forEach(c => c.onchange = onTopicChange);
  updateTopicBtn();
}

function onTopicChange() {
  const off = currentTopics().filter(t => !selTopics().has(t));
  savedTopics[mode] = off;
  localStorage.setItem(TOPICS_KEY, JSON.stringify(savedTopics));
  updateTopicBtn();
  build();
}

function updateTopicBtn() {
  const total = currentTopics().length;
  const on = selTopics().size;
  $('#topicBtn').textContent = on === total ? 'Темы: все ▾' : `Темы: ${on}/${total} ▾`;
}

// ---------- рендер карточки ----------
const KIND_LABEL = { def: 'Определение', form: 'Формула', p: 'Задача' };

function updateCounter() {
  const c = $('#counter');
  if (mode === 'exam') {
    c.textContent = examStats ? `Вопрос ${Math.min(idx + 1, deck.length)} из ${deck.length} · верно: ${examStats.correct}` : '';
  } else {
    const total = deck.length;
    const solved = deck.filter(d => done.has(d.id)).length;
    c.textContent = `Вопрос ${Math.min(idx + 1, total)} из ${total} · решено: ${solved}`;
  }
}

function renderInfoBox(d) {
  const info = TOPIC_INFO[d.item.topic];
  if (!info) return '<i>Справки по теме пока нет.</i>';
  return `<div class="info-about">${info.about.replace(/\n/g, '<br>')}</div>
    <div class="info-forms"><b>Ключевые формулы:</b><ul>` +
    info.formulas.map(([f, d2]) => `<li><code>${f}</code> — ${d2}</li>`).join('') +
    '</ul></div>';
}

function renderCard(d) {
  const node = cardTpl.content.cloneNode(true);
  const card = node.querySelector('.card');
  card.querySelector('.topic').textContent = d.item.topic;
  card.querySelector('.kind').textContent = KIND_LABEL[d.kind] + ' · ' + LEVEL_NAMES[d.level];
  card.querySelector('.q').innerHTML = d.item.q;

  const hintBox = card.querySelector('.hint');
  const solBox = card.querySelector('.solution');
  const infoBox = card.querySelector('.info');
  hintBox.textContent = '💡 ' + d.item.hint;
  infoBox.innerHTML = renderInfoBox(d);

  if (d.type === 't') {
    card.querySelector('.answer-row').classList.add('hidden');
    solBox.innerHTML = `<b>Ответ:</b> ${d.item.options[d.item.answer]}<br><b>Почему:</b> ${d.item.why}`;
    const opts = card.querySelector('.options');
    const order = shuffle(d.item.options.map((_, i) => i));
    order.forEach(oi => {
      const b = document.createElement('button');
      b.className = 'opt'; b.innerHTML = d.item.options[oi];
      b.onclick = () => {
        [...opts.children].forEach(x => x.disabled = true);
        if (oi === d.item.answer) {
          b.classList.add('correct'); done.add(d.id); saveDone();
          if (examStats) examStats.correct++;
        } else {
          b.classList.add('wrong');
          opts.children[order.indexOf(d.item.answer)].classList.add('correct');
        }
        solBox.classList.remove('hidden');
        if (examStats) examStats.done++;
        updateCounter();
      };
      opts.appendChild(b);
    });
  } else {
    card.querySelector('.options').classList.add('hidden');
    solBox.innerHTML = `<b>Решение:</b> ${d.item.solution}<br><b>Ответ:</b> ${d.item.answer}`;
    const input = card.querySelector('.ans-input');
    const verdict = card.querySelector('.verdict');
    const check = () => {
      const raw = input.value.trim().replace(',', '.');
      const val = parseFloat(raw);
      if (!d.item.check) { verdict.textContent = 'См. решение →'; return; }
      if (isNaN(val)) { verdict.textContent = 'Введи число'; verdict.className = 'verdict bad'; return; }
      const { value, tol, unit } = d.item.check;
      const ok = Math.abs(val - value) <= Math.max(Math.abs(value) * tol, 1e-9);
      verdict.textContent = ok ? `✓ Верно${unit ? ' (' + unit + ')' : ''}` : '✗ Неверно';
      verdict.className = 'verdict ' + (ok ? 'ok' : 'bad');
      if (ok) { done.add(d.id); saveDone(); if (examStats) examStats.correct++; }
      if (examStats && !examStats.answered.has(d.id)) { examStats.done++; examStats.answered.add(d.id); }
      updateCounter();
    };
    card.querySelector('.check-btn').onclick = check;
    input.onkeydown = e => { if (e.key === 'Enter') check(); };
    if (!d.item.check) input.placeholder = 'Без числового ответа';
  }

  card.querySelector('.hint-btn').onclick = () => hintBox.classList.toggle('hidden');
  card.querySelector('.info-btn').onclick = () => infoBox.classList.toggle('hidden');
  card.querySelector('.sol-btn').onclick = () => solBox.classList.toggle('hidden');
  card.querySelector('.next-btn').onclick = next;

  app.innerHTML = ''; app.appendChild(node);
  updateCounter();
}

function next() {
  idx++;
  if (idx >= deck.length) return renderSummary();
  renderCard(deck[idx]);
}

function renderSummary() {
  updateCounter();
  if (mode === 'exam' && examStats) {
    const total = deck.length;
    const pct = Math.round(examStats.correct / total * 100);
    const grade = pct >= 90 ? 'Отлично, добор сдан!' : pct >= 70 ? 'Неплохо, но есть пробелы' : pct >= 50 ? 'Средне — повтори слабые темы' : 'К добору не готов — жми ещё раз';
    app.innerHTML = `<div class="card summary">
      <div>Добор завершён</div>
      <div class="big">${examStats.correct} / ${total}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="grade">${grade}</div>
      <button class="next-btn" style="margin:0" onclick="restart()">Новый добор</button>
    </div>`;
  } else {
    app.innerHTML = `<div class="card summary">
      <div class="big">✓</div>
      <div class="grade">Колода пройдена. Перемешай или выбери другую тему.</div>
      <button class="next-btn" style="margin:0" onclick="restart()">Заново</button>
    </div>`;
  }
}

function build() {
  const levels = selLevels();
  const topics = selTopics();
  if (mode === 'exam') { deck = buildExamDeck(levels, topics); examStats = { done: 0, correct: 0, answered: new Set() }; }
  else {
    let kind = null;
    if (mode === 'defs') kind = 'def';
    else if (mode === 'forms') kind = 'form';
    if (mode === 'practice') deck = shuffle(buildPracticeDeck(levels, topics));
    else if (mode === 'all') deck = shuffle([...buildTheoryDeck(null, levels, topics), ...buildPracticeDeck(levels, topics)]);
    else deck = shuffle(buildTheoryDeck(kind, levels, topics));
    examStats = null;
  }
  idx = 0;
  deck.length ? renderCard(deck[0]) : (app.innerHTML = '<div class="card">Нет вопросов по выбранным фильтрам</div>');
  updateCounter();
}

function restart() { build(); }
window.restart = restart;

// ---------- шпаргалка ----------
function buildCheatsheet() {
  const el = $('#cheatsheet');
  el.innerHTML = Object.entries(TOPIC_INFO).map(([topic, info]) => `
    <details class="cs-topic"><summary>${topic}</summary>
      <div class="info-about">${info.about.replace(/\n/g, '<br>')}</div>
      <div class="info-forms"><b>Ключевые формулы:</b><ul>` +
      info.formulas.map(([f, d2]) => `<li><code>${f}</code> — ${d2}</li>`).join('') +
      `</ul></div>
    </details>`).join('');
}

// ---------- события ----------
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelector('.tab.active').classList.remove('active');
  b.classList.add('active');
  mode = b.dataset.mode;
  buildTopicPanel();
  build();
});
document.querySelectorAll('.lvl-cb').forEach(c => c.onchange = build);
$('#topicBtn').onclick = e => { e.stopPropagation(); $('#topicPanel').classList.toggle('hidden'); };
document.addEventListener('click', e => { if (!e.target.closest('#topicWrap')) $('#topicPanel').classList.add('hidden'); });
$('#shuffleBtn').onclick = build;
$('#resetBtn').onclick = () => { if (confirm('Сбросить отметки о решённых вопросах?')) { done.clear(); saveDone(); updateCounter(); } };
$('#cheatsheetBtn').onclick = () => $('#cheatsheet').classList.toggle('hidden');

buildTopicPanel();
buildCheatsheet();
build();
