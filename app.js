// Тренажёр по физике: теория (4 варианта) + задачи (численный ответ), подсказки и решения
const $ = s => document.querySelector(s);
const app = $('#app');
const cardTpl = $('#cardTpl');

let mode = 'exam';
let deck = [];        // текущая колода [{type:'t'|'p', item}]
let idx = 0;
let examStats = null; // {done:0, correct:0} в режиме забора

const LS_KEY = 'physTrainerDone';
const done = new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
const saveDone = () => localStorage.setItem(LS_KEY, JSON.stringify([...done]));

const qid = (type, i) => `${type}${i}`;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- сбор колод ----------
function buildTheoryDeck(topic) {
  return THEORY.map((item, i) => ({ type: 't', item, id: qid('t', i) }))
    .filter(d => !topic || d.item.topic === topic);
}
function buildPracticeDeck(topic) {
  return PRACTICE.map((item, i) => ({ type: 'p', item, id: qid('p', i) }))
    .filter(d => !topic || d.item.topic === topic);
}
function buildExamDeck() {
  const t = shuffle([...buildTheoryDeck('')]).slice(0, 10);
  const p = shuffle([...buildPracticeDeck('')]).slice(0, 10);
  return shuffle([...t, ...p]);
}

// ---------- рендер ----------
function topicsOf(list) { return [...new Set(list.map(x => x.topic))]; }

function fillTopicFilter() {
  const sel = $('#topicFilter');
  sel.innerHTML = '<option value="">Все темы</option>';
  const src = mode === 'practice' ? PRACTICE : THEORY;
  topicsOf(src).forEach(t => {
    const o = document.createElement('option'); o.value = t; o.textContent = t; sel.appendChild(o);
  });
}

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

function renderCard(d) {
  const node = cardTpl.content.cloneNode(true);
  const card = node.querySelector('.card');
  card.querySelector('.topic').textContent = d.item.topic;
  card.querySelector('.kind').textContent = d.type === 't' ? 'Теория' : 'Задача';
  card.querySelector('.q').innerHTML = d.item.q;

  const hintBox = card.querySelector('.hint');
  const solBox = card.querySelector('.solution');
  hintBox.textContent = '💡 ' + d.item.hint;

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
    const grade = pct >= 90 ? 'Отлично, забор сдан!' : pct >= 70 ? 'Неплохо, но есть пробелы' : pct >= 50 ? 'Средне — повтори слабые темы' : 'К забору не готов — жми ещё раз';
    app.innerHTML = `<div class="card summary">
      <div>Забор завершён</div>
      <div class="big">${examStats.correct} / ${total}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="grade">${grade}</div>
      <button class="next-btn" style="margin:0" onclick="restart()">Новый забор</button>
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
  if (mode === 'exam') { deck = buildExamDeck(); examStats = { done: 0, correct: 0, answered: new Set() }; }
  else {
    const topic = $('#topicFilter').value;
    deck = shuffle(mode === 'theory' ? buildTheoryDeck(topic) : buildPracticeDeck(topic));
    examStats = null;
  }
  idx = 0;
  deck.length ? renderCard(deck[0]) : (app.innerHTML = '<div class="card">Нет вопросов</div>');
}

function restart() { build(); }
window.restart = restart;

// ---------- события ----------
document.querySelectorAll('.tab').forEach(b => b.onclick = () => {
  document.querySelector('.tab.active').classList.remove('active');
  b.classList.add('active');
  mode = b.dataset.mode;
  $('#topicFilter').style.display = mode === 'exam' ? 'none' : '';
  fillTopicFilter();
  build();
});
$('#topicFilter').onchange = build;
$('#shuffleBtn').onclick = build;
$('#resetBtn').onclick = () => { if (confirm('Сбросить отметки о решённых вопросах?')) { done.clear(); saveDone(); updateCounter(); } };

fillTopicFilter();
build();
