/* Bezerra Engenharia — site.js */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.body;

  // marca a página como pronta: dispara as animações de entrada do hero
  requestAnimationFrame(() => setTimeout(() => body.classList.add('is-ready'), 60));

  /* ---------------------------------------------------------------
     Header: aparece/escurece com o scroll · glow do menu · mobile
  --------------------------------------------------------------- */
  const header = $('#siteHeader');
  const hero = $('.hero');
  const plx = $$('.parallax');
  let lastY = -1;
  function onScroll() {
    const y = window.scrollY;
    if (y === lastY) return;
    lastY = y;
    header && header.classList.toggle('is-scrolled', y > 60);
    if (hero) {
      const h = hero.offsetHeight || window.innerHeight;
      const p = Math.min(Math.max(y / (h * 0.85), 0), 1);
      hero.style.setProperty('--p', p.toFixed(4));
    }
    parallaxTick();
  }
  window.addEventListener('scroll', () => requestAnimationFrame(onScroll), { passive: true });
  onScroll();

  const nav = $('#mainNav');
  if (nav) {
    const glow = $('.nav__glow', nav);
    $$('a', nav).forEach(a => a.addEventListener('mouseenter', () => {
      glow.style.left = a.offsetLeft + 'px';
      glow.style.width = a.offsetWidth + 'px';
    }));
  }

  const burger = $('#burger'), mobile = $('#mobileMenu');
  if (burger && mobile) {
    burger.addEventListener('click', () => {
      const open = !mobile.classList.contains('is-open');
      mobile.classList.toggle('is-open', open);
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      mobile.setAttribute('aria-hidden', String(!open));
      body.style.overflow = open ? 'hidden' : '';
      body.classList.toggle('menu-open', open);
    });
  }

  /* ---------------------------------------------------------------
     Reveal on scroll + split de títulos
  --------------------------------------------------------------- */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    const parts = [];
    let i = 0;
    el.childNodes.forEach(node => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { parts.push(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'word';
          const inner = document.createElement('span'); inner.textContent = tok; inner.style.setProperty('--i', i++);
          w.appendChild(inner); parts.push(w);
        });
      } else if (node.nodeName === 'BR') {
        parts.push(document.createElement('br'));
      } else {
        // elemento (ex.: <span class="accent">)
        const w = document.createElement('span'); w.className = 'word';
        const inner = document.createElement('span'); inner.style.setProperty('--i', i++);
        inner.appendChild(node.cloneNode(true)); w.appendChild(inner); parts.push(w);
      }
    });
    el.textContent = '';
    parts.forEach(p => el.appendChild(p));
  }
  $$('[data-split], .hero__title').forEach(splitWords);

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal], [data-split], .reveal-img, .icard').forEach(el => io.observe(el));

  // listas com itens em cascata
  $$('.icard ul').forEach(ul => $$('li', ul).forEach((li, i) => li.style.setProperty('--i', i)));

  /* ---------------------------------------------------------------
     Cards com luz seguindo o mouse
  --------------------------------------------------------------- */
  $$('.vcard').forEach(card => card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  }));

  /* ---------------------------------------------------------------
     Parallax sutil nas imagens de destaque
  --------------------------------------------------------------- */
  function parallaxTick() {
    if (reduced || !plx.length) return;
    const vh = window.innerHeight;
    plx.forEach(el => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const c = (r.top + r.height / 2 - vh / 2) / vh; // -1..1
      el.style.transform = `translate3d(0, ${(-c * 6).toFixed(2)}%, 0) scale(1.12)`;
    });
  }
  parallaxTick();

  /* ---------------------------------------------------------------
     Contadores (página Sobre)
  --------------------------------------------------------------- */
  const counters = $$('[data-count]');
  if (counters.length) {
    const cio = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      const el = en.target, target = parseFloat(el.dataset.count) || 0, suffix = el.dataset.suffix || '';
      const dur = 1800, t0 = performance.now();
      const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      (function step(t) {
        const p = Math.min((t - t0) / dur, 1), ease = 1 - Math.pow(1 - p, 3);
        el.firstChild.textContent = fmt(Math.round(target * ease));
        if (p < 1) requestAnimationFrame(step); else el.firstChild.textContent = fmt(target);
      })(t0);
      if (suffix && !$('sup', el)) { const s = document.createElement('sup'); s.textContent = suffix; el.appendChild(s); }
    }), { threshold: 0.4 });
    counters.forEach(c => { c.textContent = '0'; cio.observe(c); });
  }

  /* ---------------------------------------------------------------
     Filtros de empreendimentos
  --------------------------------------------------------------- */
  const filters = $('#filters');
  if (filters) {
    const pill = $('.filters__pill', filters);
    const cards = $$('.ecard[data-status]');
    const empty = $('#gridEmpty');
    function movePill(btn) { pill.style.left = btn.offsetLeft + 'px'; pill.style.width = btn.offsetWidth + 'px'; }
    function apply(status, push) {
      $$('button', filters).forEach(b => b.classList.toggle('is-active', b.dataset.filter === status));
      movePill($(`button[data-filter="${status}"]`, filters));
      let shown = 0;
      cards.forEach(c => {
        const match = status === 'todos' || c.dataset.status === status;
        if (match) {
          c.classList.remove('is-hidden');
          c.classList.add('is-leaving');
          requestAnimationFrame(() => setTimeout(() => c.classList.remove('is-leaving'), 30 + shown * 60));
          shown++;
        } else {
          c.classList.add('is-leaving');
          setTimeout(() => c.classList.add('is-hidden'), 320);
        }
      });
      empty && empty.classList.toggle('is-visible', shown === 0);
      if (push) {
        const u = new URL(location.href);
        if (status === 'todos') u.searchParams.delete('status'); else u.searchParams.set('status', status);
        history.replaceState(null, '', u);
      }
    }
    $$('button', filters).forEach(b => b.addEventListener('click', () => apply(b.dataset.filter, true)));
    const initial = new URL(location.href).searchParams.get('status');
    const valid = $(`button[data-filter="${initial}"]`, filters) ? initial : 'todos';
    // sem animação de saída na primeira pintura
    cards.forEach(c => { if (valid !== 'todos' && c.dataset.status !== valid) c.classList.add('is-hidden'); });
    $$('button', filters).forEach(b => b.classList.toggle('is-active', b.dataset.filter === valid));
    requestAnimationFrame(() => movePill($(`button[data-filter="${valid}"]`, filters)));
    window.addEventListener('resize', () => movePill($('button.is-active', filters)));
    empty && empty.classList.toggle('is-visible', cards.every(c => c.classList.contains('is-hidden')));
  }

  /* ---------------------------------------------------------------
     Lightbox (galeria, plantas, obras) — agrupado por data-lightbox
  --------------------------------------------------------------- */
  const lb = $('#lightbox');
  if (lb) {
    const all = $$('[data-lightbox]');
    const img = $('#lbImg'), cap = $('#lbCap'), vid = $('#lbVideo');
    let items = [], idx = 0;
    function stopVideo() { if (vid) { vid.pause(); vid.removeAttribute('src'); vid.load(); vid.hidden = true; } lb.classList.remove('is-video'); }
    function show(i) {
      idx = (i + items.length) % items.length;
      const it = items[idx];
      cap.textContent = it.dataset.caption || '';
      if (it.dataset.video && vid) {
        img.removeAttribute('src'); lb.classList.add('is-video');
        vid.hidden = false; vid.poster = it.dataset.poster || ''; vid.src = it.dataset.video; vid.muted = false; vid.play().catch(() => {});
      } else {
        stopVideo(); img.src = it.href; img.alt = it.dataset.caption || '';
      }
    }
    function open(el) {
      items = all.filter(a => a.dataset.lightbox === el.dataset.lightbox);
      show(items.indexOf(el)); lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); body.style.overflow = 'hidden';
      lb.classList.toggle('lightbox--single', items.length < 2);
    }
    function close() { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); body.style.overflow = ''; stopVideo(); }
    all.forEach(a => a.addEventListener('click', e => { if (a.dataset.noOpen) return; e.preventDefault(); open(a); }));
    $$('[data-open-gallery]').forEach(b => b.addEventListener('click', () => { const first = all.find(a => a.dataset.lightbox === b.dataset.openGallery); if (first) open(first); }));
    $('#lbClose').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', () => show(idx - 1));
    $('#lbNext').addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  /* ---------------------------------------------------------------
     Portrait dos sócios: destaca a legenda do losango sob o mouse
  --------------------------------------------------------------- */
  $$('.founders').forEach(root => {
    const tiles = $$('.founders__tile', root), tip = $('[data-founders-tip]', root);
    tiles.forEach(t => {
      const show = () => { if (!tip) return; $('b', tip).textContent = t.dataset.nome || ''; $('span', tip).textContent = t.dataset.cargo || ''; tip.classList.add('is-on'); };
      const hide = () => tip && tip.classList.remove('is-on');
      t.addEventListener('mouseenter', show); t.addEventListener('focus', show); t.addEventListener('mouseleave', hide); t.addEventListener('blur', hide);
    });
  });

  /* ---------------------------------------------------------------
     Vídeo da galeria: loop silencioso enquanto estiver visível
  --------------------------------------------------------------- */
  const gv = $$('video[data-autoplay]');
  if (gv.length && !reduced) {
    const vio = new IntersectionObserver(entries => entries.forEach(en => {
      const v = en.target, tile = v.closest('.gallery__item');
      if (en.intersectionRatio >= 0.5) { v.play().then(() => tile && tile.classList.add('is-playing')).catch(() => {}); }
      else { v.pause(); tile && tile.classList.remove('is-playing'); }
    }), { threshold: [0, 0.5] });
    gv.forEach(v => vio.observe(v));
  }

  /* ---------------------------------------------------------------
     Carrossel de plantas baixas
  --------------------------------------------------------------- */
  $$('[data-plans]').forEach(root => {
    const track = $('.plans__track', root), slides = $$('.plans__slide', root), thumbs = $$('[data-goto]', root);
    const prev = $('[data-prev]', root), next = $('[data-next]', root), cur = $('[data-current]', root);
    const text = $('[data-text]', root), title = $('[data-title]', root), desc = $('[data-desc]', root);
    let i = 0, n = slides.length, booted = false;
    const list = $('.plans__thumbs', root);
    // rola apenas a lista de miniaturas (nunca a página) para manter a ativa visível
    function revealThumb(t) {
      if (!t || !list) return;
      const l = list.getBoundingClientRect(), r = t.getBoundingClientRect();
      if (r.top < l.top) list.scrollTop -= (l.top - r.top) + 8; else if (r.bottom > l.bottom) list.scrollTop += (r.bottom - l.bottom) + 8;
      if (r.left < l.left) list.scrollLeft -= (l.left - r.left) + 8; else if (r.right > l.right) list.scrollLeft += (r.right - l.right) + 8;
    }
    function go(k, fromDrag) {
      k = Math.max(0, Math.min(n - 1, k));
      const changed = k !== i; i = k;
      track.style.transform = `translateX(${-i * 100}%)`;
      slides.forEach((s, j) => s.classList.toggle('is-active', j === i));
      thumbs.forEach((t, j) => t.classList.toggle('is-active', j === i));
      prev.disabled = i === 0; next.disabled = i === n - 1;
      cur.textContent = String(i + 1).padStart(2, '0');
      if (changed && text) {
        text.classList.add('is-switching');
        setTimeout(() => { title.textContent = thumbs[i].dataset.title; desc.textContent = thumbs[i].dataset.desc; text.classList.remove('is-switching'); }, 220);
      }
      if (booted && !fromDrag) revealThumb(thumbs[i]);
    }
    prev.addEventListener('click', () => go(i - 1));
    next.addEventListener('click', () => go(i + 1));
    thumbs.forEach((t, j) => t.addEventListener('click', () => go(j)));
    root.tabIndex = 0;
    root.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(i - 1); if (e.key === 'ArrowRight') go(i + 1); });
    // arrastar / swipe
    let x0 = null, dx = 0, w = 1;
    const stage = $('.plans__stage', root);
    stage.addEventListener('pointerdown', e => { if (e.button !== 0) return; x0 = e.clientX; dx = 0; w = stage.clientWidth; track.classList.add('is-dragging'); });
    stage.addEventListener('dragstart', e => e.preventDefault());
    stage.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; track.style.transform = `translateX(calc(${-i * 100}% + ${dx}px))`; });
    const end = () => {
      if (x0 === null) return; track.classList.remove('is-dragging');
      const moved = Math.abs(dx) > Math.max(40, w * 0.12);
      if (moved) slides.forEach(s => { const a = $('a', s); a.dataset.noOpen = '1'; setTimeout(() => delete a.dataset.noOpen, 300); });
      go(moved ? (dx < 0 ? i + 1 : i - 1) : i, true); x0 = null; dx = 0;
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end); stage.addEventListener('pointerleave', end);
    // clique curto no slide abre o lightbox (o click nativo cuida disso); um arraste marca noOpen para não abrir
    go(0); booted = true;
  });

  /* ---------------------------------------------------------------
     Vídeo (Sobre): troca o poster pelo iframe ao clicar
  --------------------------------------------------------------- */
  $$('.video[data-embed]').forEach(v => v.addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = v.dataset.embed + (v.dataset.embed.includes('?') ? '&' : '?') + 'autoplay=1';
    f.allow = 'autoplay; fullscreen; picture-in-picture'; f.allowFullscreen = true;
    v.innerHTML = ''; v.appendChild(f);
  }, { once: true }));

  /* ---------------------------------------------------------------
     Formulário de contato (fetch → api/contato.php)
  --------------------------------------------------------------- */
  const form = $('#contactForm');
  if (form) {
    const btn = $('button[type=submit]', form), msg = $('#formMsg'), success = $('#formSuccess');
    const setErr = (name, text) => {
      const f = $(`[name="${name}"]`, form)?.closest('.field');
      if (!f) return; f.classList.toggle('has-error', !!text); const e = $('.error', f); if (e) e.textContent = text || '';
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      let ok = true;
      ['nome', 'email', 'telefone'].forEach(n => setErr(n, ''));
      const fd = new FormData(form);
      if (String(fd.get('nome')).trim().length < 3) { setErr('nome', 'Informe seu nome completo.'); ok = false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(fd.get('email')))) { setErr('email', 'Informe um e-mail válido.'); ok = false; }
      if (String(fd.get('telefone')).replace(/\D/g, '').length < 10) { setErr('telefone', 'Informe um telefone com DDD.'); ok = false; }
      if (!fd.get('consentimento')) { msg.textContent = 'Marque a caixa de consentimento para continuar.'; msg.classList.add('is-error'); ok = false; }
      if (!ok) return;
      msg.textContent = ''; msg.classList.remove('is-error'); btn.classList.add('is-loading');
      try {
        const r = await fetch(form.action, { method: 'POST', body: new URLSearchParams(fd), headers: { 'Accept': 'application/json', 'X-CSRF-Token': window.BZ.csrf } });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'Não foi possível enviar.');
        success.classList.add('is-visible');
      } catch (err) {
        msg.textContent = err.message; msg.classList.add('is-error');
      } finally { btn.classList.remove('is-loading'); }
    });
    // máscara leve de telefone
    const tel = $('[name=telefone]', form);
    tel && tel.addEventListener('input', () => {
      let v = tel.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, v.length > 10 ? 7 : 6)}-${v.slice(v.length > 10 ? 7 : 6)}`;
      else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      tel.value = v;
    });
  }

  /* ---------------------------------------------------------------
     Visualizador 3D (bezerra-3d.js)
  --------------------------------------------------------------- */
  function config3D() {
    if (!window.Bezerra3D) return false;
    window.Bezerra3D.config({ accent: '#e52e4b', dark: '#151d4d', brand: 'Bezerra Engenharia', logoUrl: window.BZ.logo,
      locale: { disclaimer: 'Maquete ilustrativa: apenas uma aproximação visual, pode diferir do projeto e da obra final.' } });
    return true;
  }
  if (!config3D()) { document.addEventListener('DOMContentLoaded', config3D); window.addEventListener('load', config3D); }

  /* ---------------------------------------------------------------
     CHATBOT — roteiro fixo
  --------------------------------------------------------------- */
  const chat = $('#chat');
  if (chat) {
    const fab = $('#chatFab'), panel = $('#chatPanel'), bodyEl = $('#chatBody'), footer = $('#chatFooter');
    let opened = false, state = {}, busy = false;
    const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
    const scroll = () => { bodyEl.scrollTop = bodyEl.scrollHeight; };
    const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function addMsg(html, who = 'bot') {
      const m = document.createElement('div'); m.className = `msg msg--${who}`; m.innerHTML = html; bodyEl.appendChild(m); scroll(); return m;
    }
    async function bot(text, delay = 650) {
      const t = addMsg('<i></i><i></i><i></i>', 'bot msg--typing');
      await wait(delay); t.remove(); return addMsg(text, 'bot');
    }
    function options(list, primaryLast = false) {
      footer.innerHTML = '';
      const wrap = document.createElement('div'); wrap.className = 'chat__options';
      list.forEach((o, i) => {
        const b = document.createElement('button'); b.textContent = o.label; b.style.setProperty('--i', i);
        if (primaryLast && i === list.length - 1) b.classList.add('is-primary');
        b.addEventListener('click', () => { if (busy) return; footer.innerHTML = ''; addMsg(escapeHtml(o.label), 'user'); o.next(o.value ?? o.label); });
        wrap.appendChild(b);
      });
      footer.appendChild(wrap);
    }
    function input(placeholder, onSubmit, { validate, skip, type = 'text' } = {}) {
      footer.innerHTML = '';
      const wrap = document.createElement('form'); wrap.className = 'chat__input';
      wrap.innerHTML = `<input type="${type}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="${escapeHtml(placeholder)}">
        <button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>`;
      const inp = $('input', wrap);
      wrap.addEventListener('submit', e => {
        e.preventDefault();
        const v = inp.value.trim();
        if (validate) { const err = validate(v); if (err) { inp.setCustomValidity(err); inp.reportValidity(); inp.setCustomValidity(''); return; } }
        if (!v) return;
        footer.innerHTML = ''; addMsg(escapeHtml(v), 'user'); onSubmit(v);
      });
      footer.appendChild(wrap);
      if (skip) { const s = document.createElement('button'); s.className = 'chat__skip'; s.type = 'button'; s.textContent = skip.label; s.addEventListener('click', () => { footer.innerHTML = ''; skip.next(); }); footer.appendChild(s); }
      setTimeout(() => inp.focus(), 100);
    }

    /* ---- roteiro ---- */
    async function start() {
      state = {}; bodyEl.innerHTML = ''; footer.innerHTML = '';
      await bot('Olá! 👋 Sou o assistente virtual da <b>Bezerra Engenharia</b>.', 500);
      await bot('Posso te ajudar a encontrar o imóvel ideal e já adiantar tudo para a nossa equipe. Para começar, como posso te chamar?', 700);
      input('Digite seu nome', v => { state.nome = v; stepObjetivo(); }, { validate: v => v.length < 2 ? 'Digite seu nome, por favor.' : '' });
    }
    async function stepObjetivo() {
      const primeiro = state.nome.split(' ')[0];
      await bot(`Prazer, ${escapeHtml(primeiro)}! O que você está buscando hoje?`);
      options([
        { label: 'Comprar para morar', next: v => { state.objetivo = v; stepStatus(); } },
        { label: 'Investir', next: v => { state.objetivo = v; stepStatus(); } },
        { label: 'Conhecer os empreendimentos', next: v => { state.objetivo = v; stepStatus(); } },
        { label: 'Outro assunto', next: v => { state.objetivo = v; stepOutro(); } },
      ]);
    }
    async function stepOutro() {
      await bot('Sem problemas. Me conte em poucas palavras sobre o que você precisa:');
      input('Escreva sua mensagem', v => { state.mensagem = v; stepContato(); });
    }
    async function stepStatus() {
      await bot('Ótimo! Em que estágio você prefere o empreendimento?');
      options([
        { label: 'Lançamento', value: 'lancamento', next: v => { state.status = v; stepQuartos(); } },
        { label: 'Em obras', value: 'em_obras', next: v => { state.status = v; stepQuartos(); } },
        { label: 'Pronto para morar', value: 'entregue', next: v => { state.status = v; stepQuartos(); } },
        { label: 'Tanto faz', value: 'todos', next: v => { state.status = v; stepQuartos(); } },
      ]);
    }
    async function stepQuartos() {
      await bot('Quantos quartos você procura?');
      options(['1 quarto', '2 quartos', '3 quartos', '4 ou mais'].map(l => ({ label: l, next: v => { state.quartos = v; stepFaixa(); } })));
    }
    async function stepFaixa() {
      await bot('E qual faixa de investimento faz sentido para você?');
      options(['Até R$ 500 mil', 'R$ 500 mil a R$ 1 milhão', 'R$ 1 a 2 milhões', 'Acima de R$ 2 milhões', 'Prefiro não informar']
        .map(l => ({ label: l, next: v => { state.faixa = v; stepContato(); } })));
    }
    async function stepContato() {
      await bot('Perfeito, já tenho o essencial. Como a nossa equipe pode falar com você?');
      options([
        { label: 'WhatsApp', next: v => { state.canal = v; askPhone(); } },
        { label: 'Telefone', next: v => { state.canal = v; askPhone(); } },
        { label: 'E-mail', next: v => { state.canal = v; askEmail(); } },
      ]);
    }
    async function askPhone() {
      await bot('Qual o seu número com DDD?');
      input('(00) 00000-0000', v => { state.telefone = v; askEmailOptional(); }, { type: 'tel', validate: v => v.replace(/\D/g, '').length < 10 ? 'Informe o número com DDD.' : '' });
    }
    async function askEmail() {
      await bot('Qual o seu e-mail?');
      input('voce@email.com', v => { state.email = v; stepObs(); }, { type: 'email', validate: v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? '' : 'Informe um e-mail válido.' });
    }
    async function askEmailOptional() {
      await bot('Se quiser, deixe também um e-mail (opcional):');
      input('voce@email.com', v => { state.email = v; stepObs(); }, { type: 'email', validate: v => v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'E-mail inválido.' : '', skip: { label: 'Pular esta etapa', next: stepObs } });
    }
    async function stepObs() {
      if (state.mensagem) return stepResumo();
      await bot('Quer deixar alguma observação para a equipe? (bairro preferido, prazo, dúvidas…)');
      input('Escreva aqui…', v => { state.mensagem = v; stepResumo(); }, { skip: { label: 'Não, pode enviar', next: stepResumo } });
    }
    const labels = { nome: 'Nome', objetivo: 'Objetivo', status: 'Estágio', quartos: 'Quartos', faixa: 'Investimento', canal: 'Contato por', telefone: 'Telefone', email: 'E-mail', mensagem: 'Observação' };
    const statusLabel = { lancamento: 'Lançamento', em_obras: 'Em obras', entregue: 'Pronto para morar', todos: 'Tanto faz' };
    async function stepResumo() {
      const rows = Object.keys(labels).filter(k => state[k]).map(k => `<span>${labels[k]}<b>${escapeHtml(k === 'status' ? statusLabel[state[k]] : state[k])}</b></span>`).join('');
      await bot(`Confere para mim? <div class="msg__summary">${rows}</div>`);
      options([
        { label: 'Recomeçar', next: start },
        { label: 'Enviar para a equipe', next: enviar },
      ], true);
    }
    async function enviar() {
      busy = true;
      const t = addMsg('<i></i><i></i><i></i>', 'bot msg--typing');
      try {
        const r = await fetch(window.BZ.api + '/chatbot.php', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': window.BZ.csrf },
          body: JSON.stringify({ ...state, statusLabel: statusLabel[state.status] || '', pagina: location.href }) });
        const j = await r.json();
        t.remove();
        if (!j.ok) throw new Error(j.error || 'Falha ao enviar');
        await bot(`Pronto, ${escapeHtml(state.nome.split(' ')[0])}! ✅ Nossa equipe recebeu as suas informações e vai entrar em contato em breve.`);
        const link = state.status && state.status !== 'todos' ? `${window.BZ.empreendimentos}?status=${state.status}` : window.BZ.empreendimentos;
        await bot(`Enquanto isso, que tal conhecer <a href="${link}" style="color:#e52e4b;font-weight:600;text-decoration:underline">nossos empreendimentos</a>?`, 500);
        options([{ label: 'Nova conversa', next: start }]);
      } catch (err) {
        t.remove();
        await bot('Ops, não consegui enviar agora. Você pode tentar de novo ou usar a página de <a href="' + window.BZ.base + '/contato" style="color:#e52e4b;text-decoration:underline">contato</a>.');
        options([{ label: 'Tentar novamente', next: enviar }, { label: 'Recomeçar', next: start }]);
      } finally { busy = false; }
    }

    function toggle(open) {
      chat.classList.toggle('is-open', open);
      fab.setAttribute('aria-expanded', String(open));
      panel.setAttribute('aria-hidden', String(!open));
      if (open && !opened) { opened = true; start(); }
    }
    fab.addEventListener('click', () => toggle(!chat.classList.contains('is-open')));
    // botões "Fale com a gente" abrem o chatbot (e fecham o menu do celular, se aberto)
    $$('[data-open-chat]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      if (mobile && mobile.classList.contains('is-open')) burger.click();
      toggle(true);
    }));
    $('#chatRestart').addEventListener('click', start);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && chat.classList.contains('is-open')) toggle(false); });
    // compacta o botão depois de um tempo para não atrapalhar a leitura
    setTimeout(() => chat.classList.add('is-compact'), 9000);
    window.addEventListener('scroll', () => { if (window.scrollY > 400) chat.classList.add('is-compact'); }, { passive: true });
  }
})();
