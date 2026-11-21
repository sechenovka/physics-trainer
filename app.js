// Тренажёр по физике: теория + задачи, подсказки, справки, SRS, карточки, план до добора
const $ = s => document.querySelector(s);
const app = $('#app');
const cardTpl = $('#cardTpl');

let mode = 'exam';
let deck = [], queue = [], idx = 0, lastGrade = null;
let examStats = null;
let planTimer = null;

const LS_DONE = 'physTrainerDone';
const LS_TOPICS = 'physTrainerTopics';
const LS_STATS = 'physTrainerStats';
const LS_BLIND = 'physTrainerBlind';
const LS_DEADLINE = 'physTrainerDeadline';
const LS_ACC = 'physTrainerAccount';
let account = localStorage.getItem(LS_ACC) || '';
let syncTimer = null;
function syncPush(){
  if (!account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    fetch('sync/' + encodeURIComponent(account), {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ done: [...done], stats, topics: savedTopics, deadline: localStorage.getItem(LS_DEADLINE) || '' })
    }).catch(() => {});
  }, 800);
}
async function syncLogin(name){
  account = name; localStorage.setItem(LS_ACC, name); updateAccBtn();
  try {
    const remote = await (await fetch('sync/' + encodeURIComponent(name))).json();
    if (remote.done) remote.done.forEach(id => done.add(id));
    if (remote.stats) for (const [t, s] of Object.entries(remote.stats)) {
      const l = stats[t] || (stats[t] = {a:0,c:0});
      l.a = Math.max(l.a, s.a || 0); l.c = Math.max(l.c, s.c || 0);
    }
    if (remote.topics) savedTopics = remote.topics;
    if (remote.deadline) localStorage.setItem(LS_DEADLINE, remote.deadline);
  } catch(e) {}
  saveDone(); saveStats();
  localStorage.setItem(LS_TOPICS, JSON.stringify(savedTopics));
  syncPush();
  buildTopicPanel(); build();
}
function updateAccBtn(){ $('#accBtn').textContent = account ? '👤 ' + account : '👤 Войти'; }

const LEVEL_NAMES = { 1: 'лёгкий', 2: 'средний', 3: 'сложный', 4: 'экзамен' };
const KIND_LABEL = { def: 'Определение', form: 'Формула', p: 'Задача' };

// ---------- банки ----------
const FORMULA_LIGHT = new Set([12,17,22,26,28,31,33,36,40,41,46,51,52,53,54,55,56,57,61,64,65,66,70,71,74,80,81,82,86,98,99,101,103,104,105,106,108,109,110,111,113,115,117,121,123,124,126,128,130,134]);
const FORMULA_HARD = new Set([17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,58,59,60,61,62,63,66,70,86,99,103,107]);
const tag = (arr, level, formSet) => arr.map((x, i) => ({ ...x, level, kind: (x.f || (formSet && formSet.has(i))) ? 'form' : 'def' }));

const ALL_THEORY = [...tag(THEORY,1,FORMULA_LIGHT), ...tag(THEORY_L2,1), ...tag(THEORY_MED,2), ...tag(THEORY_HARD,3,FORMULA_HARD), ...tag(THEORY_H2,3), ...tag(THEORY_EXAM,4)];
const ALL_PRACTICE = [...PRACTICE.map(x=>({...x,level:1})), ...PRACTICE_L2.map(x=>({...x,level:1})), ...PRACTICE_MED.map(x=>({...x,level:2})), ...PRACTICE_HARD.map(x=>({...x,level:3})), ...PRACTICE_H2.map(x=>({...x,level:3})), ...PRACTICE_EXAM.map(x=>({...x,level:4}))];

const OFF_T3 = THEORY.length + THEORY_L2.length + THEORY_MED.length;
const OFF_P3 = PRACTICE.length + PRACTICE_L2.length + PRACTICE_MED.length;
function migrateDone(raw){return raw.map(id=>{const m=id.match(/^([tp])(\d+)_(\d)$/);if(!m)return id;const[,t,ns,lvl]=m;const n=+ns;return lvl==='1'?`${t}${n}`:lvl==='2'?`${t}${n+(t==='t'?OFF_T3:OFF_P3)}`:id;});}

// ---------- прогресс и статистика ----------
const done = new Set(migrateDone(JSON.parse(localStorage.getItem(LS_DONE) || '[]')));
const saveDone = () => { localStorage.setItem(LS_DONE, JSON.stringify([...done])); syncPush(); };
let stats = {};
try { stats = JSON.parse(localStorage.getItem(LS_STATS) || '{}'); } catch(e){ stats = {}; }
const saveStats = () => { localStorage.setItem(LS_STATS, JSON.stringify(stats)); syncPush(); };
function recordStat(topic, ok){
  const s = stats[topic] || (stats[topic] = {a:0,c:0});
  s.a++; if (ok) s.c++; saveStats();
}

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const qid = (type, i) => `${type}${i}`;

// ---------- фильтры ----------
const selLevels = () => [...document.querySelectorAll('.lvl-cb:checked')].map(c => +c.value);
const selTopics = () => new Set([...document.querySelectorAll('.topic-cb:checked')].map(c => c.value));
const pass = (d, L, T) => L.includes(d.level) && (!T.size || T.has(d.item.topic));

function buildTheoryDeck(kind, L, T){ return ALL_THEORY.map((item,i)=>({type:'t',item,level:item.level,kind:item.kind,id:qid('t',i)})).filter(d=>(!kind||d.kind===kind)&&pass(d,L,T)); }
function buildPracticeDeck(L, T){ return ALL_PRACTICE.map((item,i)=>({type:'p',item,level:item.level,kind:'p',id:qid('p',i)})).filter(d=>pass(d,L,T)); }
function buildExamDeck(L, T){ const t=shuffle([...buildTheoryDeck(null,L,T)]).slice(0,10),p=shuffle([...buildPracticeDeck(L,T)]).slice(0,10);return shuffle([...t,...p]); }

function topicsOf(list){ return [...new Set(list.map(x=>x.topic))]; }
function currentTopics(){
  if (mode === 'practice') return topicsOf(ALL_PRACTICE);
  if (mode === 'all' || mode === 'srs') return topicsOf(ALL_PRACTICE.concat(ALL_THEORY));
  return topicsOf(ALL_THEORY);
}
let savedTopics = {};
try { savedTopics = JSON.parse(localStorage.getItem(LS_TOPICS) || '{}'); } catch(e){ savedTopics = {}; }

function buildTopicPanel(){
  const panel = $('#topicPanel'), topics = currentTopics(), off = new Set(savedTopics[mode] || []);
  panel.innerHTML = `<div class="tp-actions"><button id="tpAll">Все</button><button id="tpNone">Ни одной</button></div>` +
    topics.map(t => `<label class="tp-row"><input type="checkbox" class="topic-cb" value="${t}" ${off.has(t)?'':'checked'}> ${t}</label>`).join('');
  panel.querySelector('#tpAll').onclick = e => { e.preventDefault(); panel.querySelectorAll('.topic-cb').forEach(c=>c.checked=true); onTopicChange(); };
  panel.querySelector('#tpNone').onclick = e => { e.preventDefault(); panel.querySelectorAll('.topic-cb').forEach(c=>c.checked=false); onTopicChange(); };
  panel.querySelectorAll('.topic-cb').forEach(c => c.onchange = onTopicChange);
  updateTopicBtn();
}
function onTopicChange(){
  savedTopics[mode] = currentTopics().filter(t => !selTopics().has(t));
  localStorage.setItem(LS_TOPICS, JSON.stringify(savedTopics)); syncPush();
  updateTopicBtn(); build();
}
function updateTopicBtn(){
  const total = currentTopics().length, on = selTopics().size;
  $('#topicBtn').textContent = on === total ? 'Темы: все ▾' : `Темы: ${on}/${total} ▾`;
}

// ---------- рендер ----------
function updateCounter(){
  const c = $('#counter');
  if (mode === 'exam' || mode === 'retake') c.textContent = examStats ? `Вопрос ${Math.min(idx+1,deck.length)} из ${deck.length} · верно: ${examStats.correct}` : '';
  else if (mode === 'srs' || mode === 'cards') c.textContent = `Осталось: ${queue.length} · выучено: ${learnedCount}`;
  else { const s = deck.filter(d=>done.has(d.id)).length; c.textContent = `Вопрос ${Math.min(idx+1,deck.length)} из ${deck.length} · решено: ${s}`; }
}

function renderInfoBox(d){
  const info = TOPIC_INFO[d.item.topic];
  if (!info) return '<i>Справки по теме пока нет.</i>';
  return `<div class="info-about">${info.about.replace(/\n/g,'<br>')}</div><div class="info-forms"><b>Ключевые формулы:</b><ul>` +
    info.formulas.map(([f,d2])=>`<li><code>${f}</code> — ${d2}</li>`).join('') + '</ul></div>';
}

// ---------- слепой режим и фейнман ----------
const blindOn = () => $('#blindCb').checked;

function addFeynman(card, item){
  const wrap = card.querySelector('.solution');
  if (wrap.dataset.feyn) return;
  wrap.dataset.feyn = '1';
  const div = document.createElement('div');
  div.className = 'feyn';
  div.innerHTML = `<div class="feyn-title">✍️ Объясни сам — своими словами, почему это так:</div>
    <textarea class="feyn-input" rows="2" placeholder="Например: потому что ..."></textarea>
    <button class="feyn-btn ghost">Проверить себя</button><span class="feyn-res"></span>`;
  wrap.appendChild(div);
  const STOP = new Set('что это его её как для или при не по на и в с от до за же бы из со об но то у он она они мы вы ты я так такое такой если когда где куда уже еще ещё все всё был была были быть есть под над без про о а вот ну там тут только просто тоже тогда ведь раз чем кто чему очень'.split(' '));
  const keys = [...new Set(item.why.toLowerCase().replace(/[^а-яёa-z0-9√²³]+/gi,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w)))];
  div.querySelector('.feyn-btn').onclick = () => {
    const txt = div.querySelector('.feyn-input').value.toLowerCase();
    if (txt.trim().length < 10) { div.querySelector('.feyn-res').textContent = 'Напиши чуть подробнее 🙂'; return; }
    const hit = keys.filter(k => txt.includes(k.slice(0, Math.max(4, k.length - 2))));
    const pct = Math.round(hit.length / keys.length * 100);
    const verdict = pct >= 60 ? '✅ Отлично — ключевое есть!' : pct >= 35 ? '🟡 Неплохо, но упустил часть сути' : '🔴 Мало — перечитай объяснение выше';
    div.querySelector('.feyn-res').textContent = ` ${verdict} (${hit.length}/${keys.length} ключевых слов)`;
  };
}

function onAnswered(d, ok){
  recordStat(d.item.topic, ok);
  lastGrade = ok;
  if (ok) { done.add(d.id); saveDone(); if (examStats) examStats.correct++; }
  if (examStats) examStats.done++;
  updateCounter();
}

function renderCard(d){
  lastGrade = null;
  const node = cardTpl.content.cloneNode(true);
  const card = node.querySelector('.card');
  card.querySelector('.topic').textContent = d.item.topic;
  card.querySelector('.kind').textContent = d.retake ? (d.type === 't' ? 'Задание · экзамен' : 'Задача · экзамен') : KIND_LABEL[d.kind] + ' · ' + LEVEL_NAMES[d.level];
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
    // слепой режим: сначала без вариантов
    if (blindOn() && mode !== 'cards') {
      opts.classList.add('hidden');
      const rb = document.createElement('button');
      rb.className = 'reveal-btn';
      rb.textContent = '👁 Подумай — потом покажи варианты';
      rb.onclick = () => { opts.classList.remove('hidden'); rb.remove(); };
      card.querySelector('.q').after(rb);
    }
    const order = shuffle(d.item.options.map((_, i) => i));
    order.forEach(oi => {
      const b = document.createElement('button');
      b.className = 'opt'; b.innerHTML = d.item.options[oi];
      b.onclick = () => {
        [...opts.children].forEach(x => x.disabled = true);
        const ok = oi === d.item.answer;
        if (ok) b.classList.add('correct');
        else { b.classList.add('wrong'); opts.children[order.indexOf(d.item.answer)].classList.add('correct'); }
        solBox.classList.remove('hidden');
        addFeynman(card, d.item);
        onAnswered(d, ok);
      };
      opts.appendChild(b);
    });
    // режим карточек: перевёртыш с самооценкой
    if (mode === 'cards') {
      opts.classList.add('hidden');
      const wrap = document.createElement('div');
      wrap.className = 'fc-wrap';
      const flip = document.createElement('button');
      flip.className = 'reveal-btn';
      flip.textContent = '🔄 Показать ответ';
      wrap.appendChild(flip);
      card.querySelector('.q').after(wrap);
      flip.onclick = () => {
        flip.remove();
        const ans = document.createElement('div');
        ans.className = 'fc-answer';
        ans.innerHTML = `<b>Ответ:</b> ${d.item.options[d.item.answer]}<br><b>Почему:</b> ${d.item.why}`;
        wrap.appendChild(ans);
        const row = document.createElement('div');
        row.className = 'fc-btns';
        row.innerHTML = '<button class="fc-know">✅ Знаю</button><button class="fc-dunno">❌ Не знаю</button>';
        wrap.appendChild(row);
        row.children[0].onclick = () => { onAnswered(d, true); advance(); };
        row.children[1].onclick = () => { onAnswered(d, false); advance(); };
      };
    }
  } else {
    card.querySelector('.options').classList.add('hidden');
    solBox.innerHTML = `<b>Решение:</b> ${d.item.solution}<br><b>Ответ:</b> ${d.item.answer}`;
    const input = card.querySelector('.ans-input');
    const verdict = card.querySelector('.verdict');
    const check = () => {
      const raw = input.value.trim().replace(',', '.');
      const val = parseFloat(raw);
      if (!d.item.check) { verdict.textContent = 'См. решение →'; lastGrade = true; return; }
      if (isNaN(val)) { verdict.textContent = 'Введи число'; verdict.className = 'verdict bad'; return; }
      const { value, tol, unit } = d.item.check;
      const ok = Math.abs(val - value) <= Math.max(Math.abs(value) * tol, 1e-9);
      verdict.textContent = ok ? `✓ Верно${unit ? ' (' + unit + ')' : ''}` : '✗ Неверно';
      verdict.className = 'verdict ' + (ok ? 'ok' : 'bad');
      if (lastGrade === null) { recordStat(d.item.topic, ok); lastGrade = ok; }
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
  card.querySelector('.next-btn').onclick = advance;

  app.innerHTML = ''; app.appendChild(node);
  updateCounter();
}

// ---------- логика очередей ----------
let learnedCount = 0;
const streak = new Map();

function insertAt(arr, item, pos){ arr.splice(Math.min(pos, arr.length), 0, item); }

function advance(){
  if (mode === 'srs' || mode === 'cards') {
    const d = queue.shift();
    if (lastGrade === false) { streak.set(d.id, 0); insertAt(queue, d, 4); }
    else {
      const s = (streak.get(d.id) || 0) + 1; streak.set(d.id, s);
      if (s >= 2) learnedCount++; else insertAt(queue, d, 8);
    }
    if (queue.length) renderCard(queue[0]); else renderSummary();
    updateCounter();
    return;
  }
  idx++;
  if (idx >= deck.length) return renderSummary();
  renderCard(deck[idx]);
}

function next(){ advance(); }

function renderSummary(){
  updateCounter();
  if (mode === 'srs' || mode === 'cards') {
    app.innerHTML = `<div class="card summary"><div class="big">🎉</div>
      <div class="grade">${mode==='srs'?'Повторение завершено':'Колода пройдена'} — выучено карточек: ${learnedCount}</div>
      <button class="next-btn" style="margin:0" onclick="restart()">Ещё круг</button></div>`;
    return;
  }
  if ((mode === 'exam' || mode === 'retake') && examStats) {
    const total = deck.length, pct = Math.round(examStats.correct / total * 100);
    const grade = mode === 'retake'
      ? (pct === 100 ? 'Идеально — так и сдавай' : pct >= 50 ? 'Есть шансы — добей красные темы' : 'Провал — гони Повторение по этим темам')
      : (pct >= 90 ? 'Отлично, добор сдан!' : pct >= 70 ? 'Неплохо, но есть пробелы' : pct >= 50 ? 'Средне — повтори слабые темы' : 'К добору не готов — жми ещё раз');
    app.innerHTML = `<div class="card summary"><div>${mode === 'retake' ? 'Вариант пересдачи завершён' : 'Добор завершён'}</div><div class="big">${examStats.correct} / ${total}</div>
      <div class="bar"><i style="width:${pct}%"></i></div><div class="grade">${grade}</div>
      <button class="next-btn" style="margin:0" onclick="restart()">${mode === 'retake' ? 'Новый вариант' : 'Новый добор'}</button></div>`;
  } else {
    app.innerHTML = `<div class="card summary"><div class="big">✓</div><div class="grade">Колода пройдена.</div>
      <button class="next-btn" style="margin:0" onclick="restart()">Заново</button></div>`;
  }
}

// ---------- план до добора ----------
function fmtLeft(ms){
  if (ms < 0) ms = 0;
  const h = Math.floor(ms/3600000), m = Math.floor(ms%3600000/60000), s = Math.floor(ms%60000/1000);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function topicRows(){
  const all = currentTopics();
  return all.map(t => {
    const s = stats[t] || {a:0,c:0};
    const pct = s.a ? Math.round(s.c/s.a*100) : null;
    return {t, a:s.a, c:s.c, pct};
  }).sort((a,b) => (a.pct===null?-1:a.pct) - (b.pct===null?-1:b.pct));
}

function renderPlan(){
  const dl = new Date(localStorage.getItem(LS_DEADLINE) || '');
  const dlVal = isNaN(dl) ? '' : dl.toISOString().slice(0,16);
  const rows = topicRows();
  app.innerHTML = `<div class="card plan">
    <div class="plan-head">🎯 План до добора</div>
    <div class="plan-row">Добор в: <input type="datetime-local" id="dlInput" value="${dlVal}"> <button id="dlSet" class="ghost">Установить</button></div>
    <div class="plan-count" id="planCount"></div>
    <div id="planPhases" class="plan-phases"></div>
    <div class="plan-sub">Темы по слабости (красные — в первую очередь):</div>
    <div class="tstat-list">${rows.map(r => `
      <div class="tstat-row">
        <span class="tstat-name">${r.t}</span>
        <span class="tstat-bar"><i style="width:${r.pct===null?0:r.pct}%"></i></span>
        <span class="tstat-pct ${r.pct===null?'':r.pct>=70?'ok':r.pct>=40?'mid':'bad'}">${r.pct===null?'—':r.pct+'%'}</span>
        <button class="ghost tstat-go" data-t="${r.t}">Гонять</button>
      </div>`).join('')}</div>
  </div>`;
  $('#dlSet').onclick = () => {
    const v = $('#dlInput').value;
    if (v) { localStorage.setItem(LS_DEADLINE, new Date(v).toISOString()); syncPush(); renderPlan(); }
  };
  app.querySelectorAll('.tstat-go').forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    document.querySelectorAll('.topic-cb').forEach(c => c.checked = c.value === t);
    savedTopics.srs = currentTopics().filter(x => x !== t);
    switchMode('srs');
  });
  const tick = () => {
    const d2 = new Date(localStorage.getItem(LS_DEADLINE) || '');
    const el = $('#planCount');
    if (!el || isNaN(d2)) { if (el) el.textContent = 'Установи время добора ↑'; if (planTimer) { clearInterval(planTimer); planTimer=null; } return; }
    const left = d2 - Date.now();
    el.textContent = left > 0 ? '⏱ Осталось: ' + fmtLeft(left) : '⏱ Время вышло — иди на добор!';
    const ph = $('#planPhases');
    if (ph && left > 0) {
      const now = Date.now();
      const phs = [
        [0.50,'SRS-повторение красных тем + карточки формул','srs'],
        [0.75,'Прогон задач (вкладка Задачи)','practice'],
        [0.90,'Добор ×2-3 как на экзамене','exam'],
        [1.00,'Чай, выдох, на добор']
      ];
      let prev = now;
      ph.innerHTML = phs.map(([frac,name,m]) => {
        const start = prev, end = now + left*frac; prev = end;
        return `<div class="phase-row"><span class="phase-time">${new Date(start).toTimeString().slice(0,5)}–${new Date(end).toTimeString().slice(0,5)}</span><span>${name}</span>${m?`<button class="ghost phase-go" data-m="${m}">→</button>`:''}</div>`;
      }).join('');
      ph.querySelectorAll('.phase-go').forEach(b => b.onclick = () => switchMode(b.dataset.m));
    }
  };
  if (planTimer) clearInterval(planTimer);
  tick();
  planTimer = setInterval(() => {
    const d3 = new Date(localStorage.getItem(LS_DEADLINE) || '');
    const el2 = $('#planCount');
    if (!el2) { clearInterval(planTimer); planTimer = null; return; }
    if (isNaN(d3)) return;
    const left = d3 - Date.now();
    el2.textContent = left > 0 ? '⏱ Осталось: ' + fmtLeft(left) : '⏱ Время вышло — иди на добор!';
  }, 1000);
}

function switchMode(m){
  document.querySelector(`.tab[data-mode="${m}"]`).click();
}

// ---------- сбор колод ----------
function build(){
  if (planTimer) { clearInterval(planTimer); planTimer = null; }
  const L = selLevels(), T = selTopics();
  streak.clear(); learnedCount = 0; lastGrade = null;
  if (mode === 'plan') { renderPlan(); return; }
  if (mode === 'exam') { deck = buildExamDeck(L,T); examStats = {done:0,correct:0,answered:new Set()}; }
  else if (mode === 'retake') {
    const retTopics = [...new Set(THEORY_RET.map(x=>x.topic))].filter(t=>!T.size||T.has(t));
    const pool = retTopics.length >= 2 ? retTopics : [...new Set(THEORY_RET.map(x=>x.topic))];
    const tb = shuffle([...pool]).slice(0,2).map(t=>shuffle(THEORY_RET.filter(x=>x.topic===t))[0]);
    const pr = shuffle([...PRACTICE_RET]).slice(0,2);
    deck = [...tb,...pr].map((item,i)=>({type:item.options?'t':'p',item,level:4,kind:item.options?'def':'p',id:'r'+i,retake:true}));
    examStats = {done:0,correct:0,answered:new Set()};
  }
  else {
    let kind = null;
    if (mode === 'defs') kind = 'def';
    else if (mode === 'forms') kind = 'form';
    if (mode === 'practice') deck = shuffle(buildPracticeDeck(L,T));
    else if (mode === 'all') deck = shuffle([...buildTheoryDeck(null,L,T), ...buildPracticeDeck(L,T)]);
    else if (mode === 'srs') queue = shuffle([...buildTheoryDeck(null,L,T), ...buildPracticeDeck(L,T)]);
    else if (mode === 'cards') queue = shuffle(buildTheoryDeck(null,L,T));
    else deck = shuffle(buildTheoryDeck(kind,L,T));
    examStats = null;
  }
  idx = 0;
  if (mode === 'srs' || mode === 'cards') {
    queue.length ? renderCard(queue[0]) : (app.innerHTML = '<div class="card">Нет карточек по выбранным фильтрам</div>');
  } else {
    deck.length ? renderCard(deck[0]) : (app.innerHTML = '<div class="card">Нет вопросов по выбранным фильтрам</div>');
  }
  updateCounter();
}

function restart(){ build(); }
window.restart = restart;

// ---------- шпаргалка ----------
function buildCheatsheet(){
  $('#cheatsheet').innerHTML = Object.entries(TOPIC_INFO).map(([topic, info]) => `
    <details class="cs-topic"><summary>${topic}</summary>
      <div class="info-about">${info.about.replace(/\n/g,'<br>')}</div>
      <div class="info-forms"><b>Ключевые формулы:</b><ul>` +
      info.formulas.map(([f,d2])=>`<li><code>${f}</code> — ${d2}</li>`).join('') + `</ul></div>
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
$('#blindCb').checked = localStorage.getItem(LS_BLIND) === '1';
$('#blindCb').onchange = () => { localStorage.setItem(LS_BLIND, $('#blindCb').checked ? '1' : '0'); };
$('#resetBtn').onclick = () => { if (confirm('Сбросить прогресс и статистику?')) { done.clear(); saveDone(); stats = {}; saveStats(); updateCounter(); } };
$('#cheatsheetBtn').onclick = () => $('#cheatsheet').classList.toggle('hidden');
$('#accBtn').onclick = () => {
  const n = prompt('Логин (одно слово — введёшь его же на телефоне, прогресс общий):', account);
  if (n && n.trim()) syncLogin(n.trim());
};
updateAccBtn();
if (account) syncLogin(account);

buildTopicPanel();
buildCheatsheet();
build();
