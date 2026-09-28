// DOM overlays: title/species select, HUD, chapter cards, fades, pause, results.
import { FOODS, FOOD_ICONS, dietGuide } from '../species.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'), title: $('title'), hud: $('hud'), card: $('card'), line: $('line'),
      pause: $('pause'), capture: $('capture'), results: $('results'), fade: $('fade'), hurt: $('hurt'), lowair: $('lowair'),
    };
    this.lastDietKey = '';
    this.promptText = '';
    this.fadeValue = 0;
  }

  // ---------------------------------------------------------- loading
  setLoading(p) { const b = document.querySelector('.load-bar i'); if (b) b.style.width = `${Math.round(p * 100)}%`; }
  hideLoading() { this.el.loading.classList.remove('show'); }

  // ---------------------------------------------------------- title
  showTitle(show) { this.el.title.classList.toggle('show', show); }
  setSpecies(sp, idx, total) {
    $('spCount').textContent = `${idx + 1} / ${total}`;
    $('spName').textContent = sp.name;
    $('spLatin').textContent = sp.latin;
    $('spDesc').textContent = sp.desc;
    $('spStats').innerHTML = Object.entries(sp.pips).map(([k, v]) =>
      `<div class="stat"><span>${k}</span><div class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
    const g = dietGuide(sp, 0);
    const g2 = dietGuide(sp, 1);
    let chips = g.full.map((t) => this.chip(t));
    if (sp.id === 'green') chips = [...g2.full.map((t) => this.chip(t)), ...g.full.filter((t) => !g2.full.includes(t)).map((t) => this.chip(t, 'part', ' (young)'))];
    $('spDiet').innerHTML = chips.join('');
    const st = $('spStatus');
    st.textContent = sp.status;
    st.className = 'status' + (sp.status.startsWith('Critically') ? ' cr' : sp.status.startsWith('Least') ? ' lc' : '');
    $('spLocal').textContent = sp.local;
  }
  setName(n) { $('hudName').textContent = n; }
  banner(title, sub, ms = 4200) {
    $('zbTitle').textContent = title;
    $('zbSub').textContent = sub || '';
    const b = $('zoneBanner');
    b.classList.add('show');
    clearTimeout(this.bannerTO);
    this.bannerTO = setTimeout(() => b.classList.remove('show'), ms);
  }
  warn(side) {
    $('warnL').style.opacity = side < 0 ? 1 : 0;
    $('warnR').style.opacity = side > 0 ? 1 : 0;
  }
  lineage(text) { $('resLineage').textContent = text; }
  chip(t, cls = '', suffix = '') {
    return `<span class="chip ${cls}">${FOOD_ICONS[t]}${FOODS[t].name}${suffix}</span>`;
  }

  // ---------------------------------------------------------- hud
  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); }
  setChapter(label) { $('hudChapter').textContent = label; }
  setObjective(text) {
    const o = $('hudObjective');
    if (o.textContent === text) return;
    o.style.opacity = 0;
    setTimeout(() => { o.textContent = text; o.style.opacity = 1; }, 250);
  }
  setZone(text) { const z = $('hudZone'); if (z.textContent !== text) z.textContent = text; }
  setShells(t) { const s = $('hudShells'); if (s.textContent !== t) s.textContent = t; }
  meters(health, air, dash, showHealth, showAir, showDash) {
    const set = (id, v, show) => {
      const m = $(id);
      m.style.display = show ? '' : 'none';
      m.querySelector('i').style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
      m.classList.toggle('low', v < 0.28);
    };
    set('mHealth', health, showHealth);
    set('mAir', air, showAir);
    set('mDash', dash, showDash);
    document.querySelector('#mDash span').textContent = showHealth ? 'Dash' : 'Scramble';
  }
  growth(g, stage, show) {
    $('hudGrowth').classList.toggle('hidden', !show);
    if (!show) return;
    $('growthArc').style.strokeDashoffset = `${264 * (1 - g)}`;
    $('growthStage').textContent = stage;
    $('growthPct').textContent = `${Math.round(g * 100)}%`;
  }
  diet(sp, growth, show) {
    const d = $('hudDiet');
    d.classList.toggle('hidden', !show);
    if (!show) return;
    const g = dietGuide(sp, growth);
    const key = sp.id + g.full.join() + g.part.join();
    if (key === this.lastDietKey) return;
    this.lastDietKey = key;
    d.innerHTML = `<div class="dt">Your diet</div><div class="row">${g.full.map((t) => this.chip(t)).join('')}</div>`
      + (g.part.length ? `<div class="dt">A little</div><div class="row">${g.part.map((t) => this.chip(t, 'part')).join('')}</div>` : '')
      + `<div class="dt">Avoid</div><div class="row">${this.chip('plastic', 'bad')}</div>`;
  }
  prompt(text) {
    const p = $('hudPrompt');
    if (text === this.promptText) return;
    this.promptText = text;
    if (text) { p.textContent = text; p.classList.add('show'); } else p.classList.remove('show');
  }
  hold(progress) {
    const h = $('hudHold');
    if (progress == null) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    $('holdArc').style.strokeDashoffset = `${252 * (1 - progress)}`;
  }
  toast(text, kind = 'good') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    const box = $('toasts');
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), 2700);
  }
  tips(html) { $('tips').innerHTML = html || ''; }
  compass(angle, label) {
    const c = $('hudCompass');
    if (angle == null) { c.classList.add('hidden'); return; }
    c.classList.remove('hidden');
    $('compassNeedle').style.transform = `rotate(${angle}rad)`;
    $('compassLabel').textContent = label;
  }
  harmony(v) {
    const h = $('hudHarmony');
    if (v == null) { h.classList.add('hidden'); return; }
    h.classList.remove('hidden');
    $('harmonyFill').style.width = `${Math.round(v * 100)}%`;
  }
  hurtFlash(a = 1) {
    this.el.hurt.style.opacity = a;
    clearTimeout(this.hurtTO);
    this.hurtTO = setTimeout(() => { this.el.hurt.style.transition = 'opacity 0.8s'; this.el.hurt.style.opacity = 0; setTimeout(() => (this.el.hurt.style.transition = 'opacity 0.12s'), 800); }, 120);
  }
  lowAir(v) { this.el.lowair.style.opacity = v; }

  // ---------------------------------------------------------- cards and fades
  async card(num, title, sub, ms = 3600) {
    $('cardNum').textContent = num;
    $('cardTitle').textContent = title;
    $('cardSub').textContent = sub;
    this.el.card.classList.add('show');
    await wait(ms);
    this.el.card.classList.remove('show');
    await wait(900);
  }
  async line(text, ms = 3200) {
    $('lineText').textContent = text;
    this.el.line.classList.add('show');
    await wait(ms);
    this.el.line.classList.remove('show');
    await wait(900);
  }
  fade(to, ms = 800) {
    const f = this.el.fade;
    f.style.transition = `opacity ${ms}ms ease`;
    // force style flush so the transition runs
    void f.offsetWidth;
    f.style.opacity = to;
    this.fadeValue = to;
    return wait(ms);
  }
  pause(v) { this.el.pause.classList.toggle('show', v); }
  capture(v) { this.el.capture.classList.toggle('show', v); }

  results(stats) {
    $('resTitle').textContent = stats.title;
    $('resSub').textContent = stats.sub;
    $('resGrid').innerHTML = stats.items.map(([k, v]) => `<div class="res"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    this.el.results.classList.add('show');
  }
}

export { wait };
