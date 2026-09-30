/* Painel admin — Bezerra Engenharia */
(function () {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  // confirmação em formulários destrutivos
  $$('form[data-confirm]').forEach(f => f.addEventListener('submit', e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));

  // slug automático
  const nome = $('#nomeInput'), slug = $('#slugInput'), prev = $('#slugPreview');
  const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (nome && slug) {
    let manual = slug.value !== '';
    slug.addEventListener('input', () => { manual = slug.value !== ''; prev.textContent = slugify(slug.value) || 'nome-do-empreendimento'; });
    nome.addEventListener('input', () => { if (!manual) prev.textContent = slugify(nome.value) || 'nome-do-empreendimento'; });
  }

  // % vendido
  const range = $('#pctRange'), lbl = $('#pctLabel');
  range && range.addEventListener('input', () => lbl.textContent = range.value + '%');

  // previews de upload
  $$('[data-preview]').forEach(drop => {
    const input = $('input[type=file]', drop);
    const show = file => {
      if (!file || !file.type.startsWith('image/')) return;
      let img = $('img', drop); if (!img) { img = document.createElement('img'); drop.prepend(img); }
      img.src = URL.createObjectURL(file);
    };
    input.addEventListener('change', () => show(input.files[0]));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  });
  $$('[data-preview-multi]').forEach(drop => {
    const input = $('input[type=file]', drop), thumbs = $('.upload__thumbs', drop);
    input.addEventListener('change', () => {
      thumbs.innerHTML = '';
      Array.from(input.files).slice(0, 30).forEach(f => { if (!f.type.startsWith('image/')) return; const i = document.createElement('img'); i.src = URL.createObjectURL(f); thumbs.appendChild(i); });
    });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  });

  // drag & drop genérico para reordenar
  function sortable(container, itemSel, onDrop) {
    if (!container) return;
    let dragging = null;
    container.addEventListener('dragstart', e => { const it = e.target.closest(itemSel); if (!it) return; dragging = it; it.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
    container.addEventListener('dragend', () => { dragging && dragging.classList.remove('is-dragging'); dragging = null; $$(itemSel, container).forEach(i => i.classList.remove('is-over')); });
    container.addEventListener('dragover', e => {
      e.preventDefault(); const over = e.target.closest(itemSel); if (!over || over === dragging) return;
      $$(itemSel, container).forEach(i => i.classList.remove('is-over')); over.classList.add('is-over');
      const r = over.getBoundingClientRect();
      const before = (container.classList.contains('gallery-admin')) ? (e.clientX < r.left + r.width / 2) : (e.clientY < r.top + r.height / 2);
      over.parentNode.insertBefore(dragging, before ? over : over.nextSibling);
    });
    container.addEventListener('drop', e => { e.preventDefault(); onDrop && onDrop(); });
  }
  sortable($('#galleryAdmin'), 'li');
  sortable($('#plantasAdmin'), 'li');
  const empTable = $('#empTable tbody');
  sortable(empTable, 'tr', async () => {
    const fd = new FormData(); fd.append('_csrf', window.BZ_ADMIN.csrf); fd.append('acao', 'ordem');
    $$('tr', empTable).forEach(tr => fd.append('ordem[]', tr.dataset.id));
    await fetch(location.pathname, { method: 'POST', body: fd });
  });

  // ações auxiliares (excluir foto / maquete, editar maquete)
  const aux = $('#auxForm');
  function auxSubmit(acao, fields) {
    if (!aux) return;
    aux.querySelector('[name=acao]').value = acao;
    Object.entries(fields).forEach(([k, v]) => { const i = aux.querySelector(`[name=${k}]`); if (i) i.value = v; });
    aux.submit();
  }
  $$('[data-del-foto]').forEach(b => b.addEventListener('click', () => confirm('Remover esta foto da galeria?') && auxSubmit('foto_excluir', { foto_id: b.dataset.delFoto })));
  $$('[data-del-sobre-foto]').forEach(b => b.addEventListener('click', () => confirm('Remover esta foto?') && auxSubmit('sobre_foto_excluir', { foto_id: b.dataset.delSobreFoto })));
  $$('[data-del-video]').forEach(b => b.addEventListener('click', () => confirm('Remover o vídeo da galeria?') && auxSubmit('video_remover', {})));
  $$('[data-del-planta]').forEach(b => b.addEventListener('click', () => confirm('Remover esta planta?') && auxSubmit('planta_excluir', { planta_id: b.dataset.delPlanta })));
  $$('[data-del-maquete]').forEach(b => b.addEventListener('click', () => confirm('Excluir esta maquete e seus arquivos?') && auxSubmit('maquete_excluir', { maquete_id: b.dataset.delMaquete })));
  $$('[data-subsubmit]').forEach(b => b.addEventListener('click', () => {
    const box = b.closest('[data-subform]');
    const fd = new FormData();
    fd.append('_csrf', window.BZ_ADMIN.csrf); fd.append('id', $('#empForm [name=id]').value);
    fd.append('acao', box.dataset.action); fd.append('maquete_id', box.dataset.maquete);
    $$('input', box).forEach(i => { if (i.type === 'file') Array.from(i.files).forEach(f => fd.append(i.name, f)); else fd.append(i.name, i.value); });
    b.disabled = true; b.textContent = 'Salvando…';
    fetch(location.href, { method: 'POST', body: fd }).then(() => location.reload());
  }));

  // ---------------------------------------------------------------
  // Plantas baixas: leitura automática do texto da imagem (OCR no navegador)
  // ---------------------------------------------------------------
  const pendingBox = $('#plantasPending');
  const plantasInput = $('[data-ocr-plantas] input[type=file]');
  function pendingMeta(input, i) {
    if (input !== plantasInput || !pendingBox) return null;
    const item = pendingBox.children[i]; if (!item) return null;
    return { titulo: $('[name="plantas_titulo[]"]', item).value.trim(), descricao: $('[name="plantas_desc[]"]', item).value.trim() };
  }
  let tessPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tessPromise) tessPromise = new Promise((res, rej) => {
      const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      sc.onload = res; sc.onerror = () => rej(new Error('Não foi possível carregar o leitor de texto (sem internet?)')); document.head.appendChild(sc);
    });
    return tessPromise;
  }
  const cap = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  function cleanLine(t) {
    return String(t).replace(/[|=+&“”"*_~<>{}\[\]]+/g, ' ').replace(/\s+/g, ' ')
      .replace(/^[\s\-–—:,.;]+|[\s\-–—:,.;]+$/g, '')
      .replace(/\s[^\d\s]$/, '')            // sobra de 1 letra no fim ("À", "s")
      .replace(/^[^\d\s]\s(?=[A-Za-zÀ-ú])/, '') // sobra de 1 letra no início ("nm estacionamento")
      .trim();
  }
  const GENERIC = /^(plantas?\s+baixas?|(o\s+)?edif[ií]cio|planta\s+humanizada)\s*[-–—:,]*\s*/i;
  /** Extrai metragens de uma lista de textos: "T3-02. 128,20m²" → "T3-02 · 128,20 m²" */
  function extractAreas(texts) {
    const areas = [];
    const re = /(?:([A-Z]{1,2}\d{1,2}\s*[-–]\s*\d{1,2})\.?\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*m{1,2}\s*(?:[²2?°º]|\b)/gi;
    for (const t of texts) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(t))) {
        const num = m[2].replace('.', ','); const val = parseFloat(num.replace(',', '.'));
        if (val < 10 || val > 5000) continue;
        const code = m[1] ? m[1].replace(/\s/g, '').toUpperCase() + ' · ' : '';
        const item = code + num + ' m²'; if (!areas.some(x => x.endsWith(num + ' m²'))) areas.push(item);
      }
    }
    return areas;
  }
  /** Recebe as linhas do OCR e devolve {titulo, descricao} */
  function interpretPlan(lines, W, H) {
    const all = lines.map(l => ({ t: cleanLine(l.text), c: l.confidence, y: l.bbox.y0 / H, x: l.bbox.x0 / W, h: l.bbox.y1 - l.bbox.y0 }))
      .filter(l => l.c >= 40 && /[A-Za-zÀ-ú0-9]{2,}/.test(l.t) && l.x < 0.8); // ignora logos no canto direito
    const rows = all.filter(l => l.c >= 55);
    const top = rows.filter(l => l.y < 0.4).sort((a, b) => a.y - b.y);
    let titulo = '', extra = '';
    for (const l of top) {
      const t = l.t.replace(GENERIC, '').trim();
      if (!t || /^[\d\s.,]+$/.test(t)) continue;
      if (!titulo) titulo = cap(t);
      else if (!extra && t.length > 8 && /[a-zà-ú]{3,}\s+\S*[a-zà-ú]{3,}/i.test(t) && !/^[A-Z]\d/.test(t)) extra = cap(t); // só o subtítulo (frase real)
    }
    const areas = extractAreas(all.filter(l => l.y > 0.6 || /m{1,2}\s*[²2?°º]/i.test(l.t)).sort((a, b) => a.y - b.y).map(l => l.t));
    let descricao = [...areas, extra].filter(Boolean).join(' · ');
    if (descricao.length > 255) descricao = descricao.slice(0, 252) + '…';
    return { titulo, descricao };
  }
  window.BZ_interpretPlan = interpretPlan; // exposto para testes
  async function ocrFile(file) {
    await loadTesseract();
    if (!window.__bzWorker) window.__bzWorker = await window.Tesseract.createWorker('por', 1, { logger: () => {} });
    const worker = window.__bzWorker;
    const { data } = await worker.recognize(file);
    const W = Math.max(1, ...data.lines.map(l => l.bbox.x1)), H = Math.max(1, ...data.lines.map(l => l.bbox.y1));
    const r = interpretPlan(data.lines, W, H);
    // 2ª passada: a metragem costuma ser pequena no canto inferior esquerdo — recorta e amplia 2x
    if (!/m²/.test(r.descricao) && window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(file);
        const sy = Math.round(bmp.height * 0.68), sw = Math.round(bmp.width * 0.55), sh = bmp.height - sy;
        const c = document.createElement('canvas'); c.width = sw * 2; c.height = sh * 2;
        const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, sy, sw, sh, 0, 0, c.width, c.height);
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        const { data: d2 } = await worker.recognize(blob);
        const areas = extractAreas(d2.lines.filter(l => l.confidence >= 35).map(l => cleanLine(l.text)));
        if (areas.length) r.descricao = [areas.join(' · '), r.descricao].filter(Boolean).join(' · ').slice(0, 255);
      } catch (e) { /* segue sem metragem */ }
    }
    return r;
  }
  if (plantasInput && pendingBox) {
    plantasInput.addEventListener('change', async () => {
      pendingBox.innerHTML = '';
      const files = Array.from(plantasInput.files);
      files.forEach(f => {
        const item = document.createElement('div'); item.className = 'pending__item';
        item.innerHTML = `<img alt=""><div class="pending__fields">
          <input type="text" name="plantas_titulo[]" placeholder="Título (ex.: Apartamento T3-02)" value="${escapeAttr(f.name.replace(/\.[^.]+$/, ''))}">
          <input type="text" name="plantas_desc[]" placeholder="Descrição (ex.: 128,20 m²)">
          <small class="pending__status"><i></i> Lendo o texto da imagem…</small></div>`;
        $('img', item).src = URL.createObjectURL(f);
        $$('input', item).forEach(i => i.addEventListener('input', () => i.dataset.touched = '1'));
        pendingBox.appendChild(item);
      });
      for (let i = 0; i < files.length; i++) {
        const item = pendingBox.children[i]; if (!item) break;
        const st = $('.pending__status', item);
        try {
          const r = await ocrFile(files[i]);
          const ti = $('[name="plantas_titulo[]"]', item), de = $('[name="plantas_desc[]"]', item);
          if (r.titulo && !ti.dataset.touched) ti.value = r.titulo;
          if (r.descricao && !de.dataset.touched) de.value = r.descricao;
          st.className = 'pending__status ' + (r.titulo ? 'is-ok' : 'is-err');
          st.textContent = r.titulo ? 'Texto lido da imagem — confira antes de salvar.' : 'Não encontrei um título na imagem; preencha manualmente.';
        } catch (err) {
          st.className = 'pending__status is-err'; st.textContent = 'Leitura automática indisponível (' + err.message + '). Preencha manualmente.';
        }
      }
    });
  }
  function escapeAttr(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------------------------------------------------------------
  // Envio otimizado: comprime imagens no navegador e manda as fotos
  // da galeria uma por vez (o servidor de testes do PHP no Windows
  // trava com POSTs muito grandes; na Hostinger também fica mais rápido).
  // ---------------------------------------------------------------
  const overlay = document.createElement('div');
  overlay.className = 'saving';
  overlay.innerHTML = '<div class="saving__box"><b id="savingTitle">Salvando…</b><small id="savingSub"></small><div class="saving__bar"><i id="savingBar"></i></div></div>';
  document.body.appendChild(overlay);
  const showSaving = (title, sub, pct) => { overlay.classList.add('is-on'); $('#savingTitle').textContent = title; $('#savingSub').textContent = sub || ''; $('#savingBar').style.width = (pct ?? 0) + '%'; };
  const hideSaving = () => overlay.classList.remove('is-on');

  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(() => loadViaImg(file));
    return loadViaImg(file);
  }
  function loadViaImg(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
  }
  async function compressImage(file, opts = {}) {
    const { maxSide = 2200, quality = 0.86, keepPng = false } = opts;
    if (!file || !file.type.startsWith('image/') || /svg|gif/.test(file.type)) return file;
    try {
      const bmp = await loadBitmap(file);
      const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      if (scale === 1 && file.size < 700 * 1024) return file; // já é pequena
      const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const png = keepPng && file.type === 'image/png';
      const blob = await new Promise(r => png ? c.toBlob(r, 'image/png') : c.toBlob(r, 'image/jpeg', quality));
      if (!blob || blob.size >= file.size) return file;
      const ext = png ? '.png' : '.jpg';
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, { type: png ? 'image/png' : 'image/jpeg', lastModified: Date.now() });
    } catch (e) { return file; }
  }
  const isMaqueteInput = i => /maquete/.test(i.name);
  // plantas baixas: linhas finas pedem mais resolução e sem perdas quando for PNG
  const optsFor = input => /planta/.test(input.name) ? { maxSide: 3000, quality: 0.92, keepPng: true } : {};

  async function uploadOneByOne(input, form) {
    const files = Array.from(input.files);
    for (let i = 0; i < files.length; i++) {
      showSaving('Enviando fotos…', `Foto ${i + 1} de ${files.length}: ${files[i].name}`, Math.round(i / files.length * 100));
      const fd = new FormData();
      fd.append('_csrf', window.BZ_ADMIN.csrf);
      const idInput = form.querySelector('[name=id]'); if (idInput) fd.append('id', idInput.value);
      fd.append('acao', input.dataset.uploadAction);
      fd.append(input.name, files[i], files[i].name);
      const meta = pendingMeta(input, i); // título/descrição lidos da imagem (plantas)
      if (meta) { fd.append('titulo', meta.titulo); fd.append('descricao', meta.descricao); }
      const r = await fetch(location.href, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      let j = null; try { j = await r.json(); } catch (e) {}
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || `Falha ao enviar ${files[i].name} (HTTP ${r.status})`);
    }
    input.value = ''; // já foram salvas; não reenviar no formulário principal
  }

  // ---- vídeo da galeria: prévia, captura de capa e envio com progresso ----
  const videoInput = $('[data-video-drop] input[type=file]');
  if (videoInput) {
    videoInput.addEventListener('change', () => {
      const box = $('[data-video-preview]'); box.innerHTML = '';
      const f = videoInput.files[0]; if (!f) return;
      if (f.size > 80 * 1024 * 1024) { alert('O vídeo tem ' + Math.round(f.size / 1048576) + ' MB; o limite é 80 MB. Reduza a resolução ou a duração.'); videoInput.value = ''; return; }
      const v = document.createElement('video'); v.src = URL.createObjectURL(f); v.muted = true; v.controls = true; v.style.cssText = 'width:260px;border-radius:10px;background:#000'; box.appendChild(v);
      const info = document.createElement('small'); info.className = 'muted'; info.textContent = f.name + ' · ' + (f.size / 1048576).toFixed(1) + ' MB'; box.appendChild(info);
    });
  }
  function capturePoster(file) {
    return new Promise(resolve => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = URL.createObjectURL(file);
      const done = blob => { URL.revokeObjectURL(v.src); resolve(blob); };
      const timer = setTimeout(() => done(null), 8000);
      v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(1.5, Math.max(0.1, v.duration * 0.15)); });
      v.addEventListener('seeked', () => {
        try {
          const scale = Math.min(1, 1280 / v.videoWidth); const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => { clearTimeout(timer); done(b); }, 'image/jpeg', 0.85);
        } catch (e) { clearTimeout(timer); done(null); }
      });
      v.addEventListener('error', () => { clearTimeout(timer); done(null); });
    });
  }
  function uploadVideo(file, form) {
    return new Promise(async (resolve, reject) => {
      showSaving('Preparando o vídeo…', 'Capturando a capa a partir de um quadro do vídeo.', 0);
      const poster = await capturePoster(file);
      const fd = new FormData();
      fd.append('_csrf', window.BZ_ADMIN.csrf); fd.append('id', $('[name=id]', form).value); fd.append('acao', 'video_enviar');
      fd.append('video', file, file.name); if (poster) fd.append('video_poster', poster, 'poster.jpg');
      const xhr = new XMLHttpRequest(); xhr.open('POST', location.href); xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.upload.onprogress = ev => { if (ev.lengthComputable) showSaving('Enviando o vídeo…', (ev.loaded / 1048576).toFixed(1) + ' de ' + (ev.total / 1048576).toFixed(1) + ' MB', Math.round(ev.loaded / ev.total * 100)); };
      xhr.onload = () => { let j = null; try { j = JSON.parse(xhr.responseText); } catch (e) {} (xhr.status < 400 && j && j.ok) ? resolve() : reject(new Error((j && j.error) || 'Falha ao enviar o vídeo (HTTP ' + xhr.status + ')')); };
      xhr.onerror = () => reject(new Error('Falha de conexão ao enviar o vídeo.'));
      xhr.send(fd);
    });
  }

  $$('form.form--edit').forEach(form => form.addEventListener('submit', async e => {
    if (form.dataset.ready) return; // segunda passagem: envio nativo
    e.preventDefault();
    const submitter = e.submitter;
    // validação nativa antes de cobrir a tela (senão o aviso do navegador fica escondido)
    if (!form.checkValidity()) { form.reportValidity(); return; }
    try {
      const inputs = $$('input[type=file]', form).filter(i => i.files.length && !isMaqueteInput(i) && i.name !== 'video');
      // 0) vídeo da galeria em requisição própria (arquivo grande, com progresso)
      if (videoInput && videoInput.files.length && form.contains(videoInput)) { await uploadVideo(videoInput.files[0], form); videoInput.value = ''; }
      // 1) comprime todas as imagens
      let total = inputs.reduce((n, i) => n + i.files.length, 0), done = 0;
      for (const input of inputs) {
        const dt = new DataTransfer();
        for (const f of Array.from(input.files)) {
          showSaving('Otimizando imagens…', `${done + 1} de ${total}: ${f.name}`, Math.round(done / Math.max(total, 1) * 100));
          dt.items.add(await compressImage(f, optsFor(input))); done++;
        }
        try { input.files = dt.files; } catch (err) { /* navegador antigo: segue com os originais */ }
      }
      // 2) galeria: uma foto por requisição
      for (const input of inputs.filter(i => i.dataset.uploadAction && i.files.length)) await uploadOneByOne(input, form);
      // 3) envia o restante do formulário normalmente
      showSaving('Salvando…', 'Gravando as informações.', 100);
      form.dataset.ready = '1';
      // precisa sair do evento de submit atual antes de reenviar: um requestSubmit()
      // chamado de forma síncrona dentro do próprio evento é ignorado pelo navegador
      await new Promise(r => setTimeout(r, 0));
      if (form.requestSubmit && submitter && submitter.form === form) form.requestSubmit(submitter);
      else if (form.requestSubmit) form.requestSubmit();
      else form.submit();
      // segurança: se em 25 s a página não mudou, libera a tela e permite tentar de novo
      setTimeout(() => { if (document.body.contains(form)) { hideSaving(); delete form.dataset.ready; alert('O servidor demorou para responder. Verifique a janela do servidor local e tente salvar novamente.'); } }, 25000);
    } catch (err) {
      delete form.dataset.ready;
      hideSaving();
      alert(err.message || 'Não foi possível enviar. Tente novamente.');
    }
  }));

  // visualizador 3D no admin
  function cfg3d() { if (window.Bezerra3D) { window.Bezerra3D.config({ accent: '#e52e4b', dark: '#151d4d', brand: 'Bezerra Engenharia', logoUrl: window.BZ_ADMIN.logo }); return true; } return false; }
  if (!cfg3d()) window.addEventListener('load', cfg3d);
})();
