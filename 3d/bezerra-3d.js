/*!
 * Bezerra 3D — Visualizador de maquetes 3D interativas
 * Bezerra Engenharia · v1.0.0
 *
 * Uso rápido:
 *   <script src="bezerra-3d.js" defer></script>
 *   <button data-bz3d-model="/modelos/apto-101.json">Visualizar em 3D</button>
 *
 * API:
 *   Bezerra3D.open(modeloOuUrl, opcoes)        -> abre o modal
 *   Bezerra3D.mount(elemento, modeloOuUrl, op) -> embute inline em um elemento
 *   Bezerra3D.config({...})                     -> configurações globais
 *   Bezerra3D.init()                            -> re-escaneia a página (SPA)
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Configuração global
  // ---------------------------------------------------------------------------
  var CFG = {
    threeBase: 'https://cdn.jsdelivr.net/npm/three@0.160.0',
    threeUrl: null,   // URL do módulo three (auto se nulo)
    orbitUrl: null,   // URL do módulo OrbitControls (auto se nulo)
    brand: 'Bezerra Engenharia',
    brandShort: 'B',
    logoUrl: null,
    accent: '#c8963e',
    dark: '#0f2233',
    autoRotate: true,
    showLabels: true,
    showFurniture: true,
    lowWallHeight: 1.15,
    locale: {
      loading: 'Montando a maquete…',
      hint: 'Arraste para girar · Role ou pince para zoom · Duplo clique em um cômodo para aproximar',
      rotate: 'Girar', view3d: '3D', top: 'Planta', lowWalls: 'Paredes baixas',
      furniture: 'Mobília', labels: 'Nomes', fullscreen: 'Tela cheia', close: 'Fechar',
      error: 'Não foi possível carregar a maquete.', entrance: 'Entrada',
      allLevels: 'Todos', explode: 'Separar', facade: 'Fachada completa', floorsTitle: 'Pavimentos',
      disclaimer: 'Maquete ilustrativa: apenas uma aproximação visual, pode diferir do projeto e da obra.'
    }
  };

  // ---------------------------------------------------------------------------
  // Carregamento preguiçoso do Three.js (só quando o usuário pede o 3D)
  // ---------------------------------------------------------------------------
  var libPromise = null;
  function loadLibs() {
    if (libPromise) return libPromise;
    var base = String(CFG.threeBase).replace(/\/$/, '');
    var jsd = /cdn\.jsdelivr\.net/.test(base);
    var threeUrl = CFG.threeUrl || (jsd ? base + '/+esm' : base + '/build/three.module.js');
    var orbitUrl = CFG.orbitUrl || (jsd ? base + '/examples/jsm/controls/OrbitControls.js/+esm'
                                        : base + '/examples/jsm/controls/OrbitControls.js');
    libPromise = Promise.all([import(threeUrl), import(orbitUrl)]).then(function (m) {
      return { THREE: m[0], OrbitControls: m[1].OrbitControls };
    });
    libPromise.catch(function () { libPromise = null; });
    return libPromise;
  }

  var modelCache = {};
  function loadModel(src) {
    if (src && typeof src === 'object') return Promise.resolve(src);
    src = String(src || '').trim();
    if (!src) return Promise.reject(new Error('Modelo não informado'));
    if (src.charAt(0) === '#') {
      var el = document.querySelector(src);
      if (!el) return Promise.reject(new Error('Elemento ' + src + ' não encontrado'));
      try { return Promise.resolve(JSON.parse(el.textContent)); }
      catch (e) { return Promise.reject(e); }
    }
    if (!modelCache[src]) {
      modelCache[src] = fetch(src, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function (m) { try { m.__base = new URL(src, location.href).href; } catch (e) {} return m; });
      });
      modelCache[src].catch(function () { delete modelCache[src]; });
    }
    return modelCache[src];
  }

  // ---------------------------------------------------------------------------
  // Estilos (injetados uma única vez)
  // ---------------------------------------------------------------------------
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return; cssInjected = true;
    var css = [
      '.bz3d-root{--bz3d-accent:' + CFG.accent + ';--bz3d-dark:' + CFG.dark + ';font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1d2733;box-sizing:border-box}',
      '.bz3d-root *{box-sizing:border-box}',
      '.bz3d-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(10,20,30,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .35s ease}',
      '.bz3d-overlay.bz3d-in{opacity:1}',
      '.bz3d-modal{position:relative;width:min(1280px,100%);height:min(820px,100%);background:#fff;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.35);transform:translateY(24px) scale(.96);transition:transform .45s cubic-bezier(.2,.9,.25,1.1)}',
      '.bz3d-overlay.bz3d-in .bz3d-modal{transform:none}',
      '.bz3d-inline{position:relative;width:100%;height:100%;min-height:360px;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:#fff}',
      '.bz3d-head{display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bz3d-dark);color:#fff;flex:none}',
      '.bz3d-logo{width:34px;height:34px;border-radius:8px;background:var(--bz3d-accent);color:var(--bz3d-dark);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;flex:none;overflow:hidden}',
      '.bz3d-logo img{width:100%;height:100%;object-fit:contain}',
      '.bz3d-titles{min-width:0;flex:1}',
      '.bz3d-brand{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.7;white-space:nowrap}',
      '.bz3d-title{font-size:16px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bz3d-sub{font-size:12.5px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bz3d-x{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s}',
      '.bz3d-x:hover{background:rgba(255,255,255,.22)}',
      '.bz3d-stage{position:relative;flex:1;min-height:0;background:radial-gradient(120% 90% at 50% 35%,#ffffff 0%,#eef1f4 55%,#dde3e9 100%);overflow:hidden;touch-action:none}',
      '.bz3d-stage canvas{display:block;width:100%!important;height:100%!important;outline:none;cursor:grab}',
      '.bz3d-stage canvas:active{cursor:grabbing}',
      '.bz3d-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}',
      '.bz3d-label{position:absolute;left:0;top:0;transform:translate(-50%,-50%);padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.92);color:#1d2733;font-size:11.5px;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(15,34,51,.18);border:1px solid rgba(15,34,51,.08);transition:opacity .25s;will-change:transform}',
      '.bz3d-label small{font-weight:500;opacity:.65;margin-left:4px}',
      '.bz3d-label.bz3d-entr{background:var(--bz3d-accent);color:var(--bz3d-dark)}',
      '.bz3d-labels.bz3d-off{display:none}',
      '.bz3d-label.bz3d-bld{background:rgba(15,34,51,.86);color:#fff;border-color:transparent}',
      '.bz3d-floors{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:2px;padding:6px;background:rgba(255,255,255,.95);border-radius:14px;box-shadow:0 8px 28px rgba(15,34,51,.2);max-height:calc(100% - 96px);overflow:auto;min-width:190px}',
      '.bz3d-floors h4{margin:3px 6px 5px 8px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#6b7784;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;user-select:none}',
      '.bz3d-floors h4 i{font-style:normal;font-size:13px;line-height:1;transition:transform .2s}',
      '.bz3d-floors.bz3d-min .bz3d-fl:not(.bz3d-on){display:none}',
      '.bz3d-floors.bz3d-min h4 i{transform:rotate(180deg)}',
      '.bz3d-fl{display:flex;align-items:center;gap:9px;border:0;background:transparent;text-align:left;padding:6px 9px;border-radius:9px;font:inherit;font-size:12px;font-weight:600;color:#2b3947;cursor:pointer;white-space:nowrap}',
      '.bz3d-fl:hover{background:#eef1f4}',
      '.bz3d-fl b{min-width:34px;font-size:11px;color:var(--bz3d-accent);font-variant-numeric:tabular-nums}',
      '.bz3d-fl.bz3d-on{background:var(--bz3d-dark);color:#fff}',
      '.bz3d-fl.bz3d-on b{color:#fff}',
      '@media (max-width:720px){.bz3d-floors{left:8px;right:8px;top:8px;flex-direction:row;overflow-x:auto;min-width:0;max-height:none;padding:4px}.bz3d-floors h4{display:none}.bz3d-floors.bz3d-min .bz3d-fl:not(.bz3d-on){display:flex}.bz3d-fl{padding:6px 9px;font-size:11.5px}.bz3d-hint{display:none}}',
      '.bz3d-loader{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#4a5968;font-size:14px;background:inherit;transition:opacity .4s}',
      '.bz3d-spin{width:42px;height:42px;border-radius:50%;border:3px solid rgba(15,34,51,.12);border-top-color:var(--bz3d-accent);animation:bz3dspin .9s linear infinite}',
      '@keyframes bz3dspin{to{transform:rotate(360deg)}}',
      '.bz3d-disc{position:absolute;left:12px;bottom:72px;z-index:3;max-width:min(360px,calc(100% - 24px));padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.88);color:#3d4a57;font-size:11px;line-height:1.35;box-shadow:0 2px 10px rgba(15,34,51,.12);pointer-events:none}',
      '.bz3d-disc b{color:var(--bz3d-dark);font-weight:700}',
      '@media (max-width:720px){.bz3d-disc{left:8px;right:8px;bottom:62px;max-width:none;font-size:10.5px;text-align:center}}',
      '.bz3d-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(15,34,51,.82);color:#fff;font-size:12.5px;padding:8px 14px;border-radius:999px;white-space:nowrap;transition:opacity .6s;pointer-events:none;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}',
      '.bz3d-bar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;padding:5px;background:rgba(255,255,255,.94);border-radius:14px;box-shadow:0 8px 28px rgba(15,34,51,.2);max-width:calc(100% - 20px);overflow-x:auto;scrollbar-width:none}',
      '.bz3d-bar::-webkit-scrollbar{display:none}',
      '.bz3d-btn{flex:none;display:flex;align-items:center;gap:6px;height:36px;padding:0 11px;border:0;border-radius:10px;background:transparent;color:#2b3947;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap}',
      '.bz3d-btn:hover{background:#eef1f4}',
      '.bz3d-btn.bz3d-on{background:var(--bz3d-dark);color:#fff}',
      '.bz3d-btn svg{width:17px;height:17px;flex:none}',
      '.bz3d-sep{width:1px;background:#e1e6eb;margin:6px 2px;flex:none}',
      '.bz3d-err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8a2b2b;font-size:14px;padding:20px;text-align:center}',
      '.bz3d-overlay:fullscreen{padding:0}.bz3d-overlay:fullscreen .bz3d-modal{width:100%;height:100%;border-radius:0}',
      '@media (max-width:720px){.bz3d-overlay{padding:0}.bz3d-modal{width:100%;height:100%;border-radius:0}.bz3d-btn span{display:none}.bz3d-btn{padding:0 10px}.bz3d-hint{font-size:11.5px;top:10px}.bz3d-brand{display:none}}',
      /* botão padrão opcional para os anúncios */
      '.bz3d-trigger{display:inline-flex;align-items:center;gap:10px;padding:13px 22px;border:0;border-radius:12px;background:' + CFG.dark + ';color:#fff;font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 22px rgba(15,34,51,.25);transition:transform .15s,box-shadow .15s}',
      '.bz3d-trigger:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,34,51,.32)}',
      '.bz3d-trigger svg{width:20px;height:20px;color:' + CFG.accent + '}',
      '.bz3d-trigger.bz3d-busy{opacity:.75;cursor:progress}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'bz3d-styles';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var ICONS = {
    rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 12h8v9M11 3v5M15 12h6M15 12v4"/></svg>',
    walls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 20h18M5 20V10h14v10M9 10V6h6v4"/></svg>',
    sofa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 18v2M19 18v2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    floor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 8l9-5 9 5-9 5z"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 8l9-5 9 5-9 5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5"/></svg>',
    explode: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6l9-4 9 4-9 4z"/><path d="M3 17l9 4 9-4-9-4z"/><path d="M12 10v3"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    trigger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>'
  };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------------------------------------------------------------------------
  // Texturas procedurais (sem arquivos externos)
  // ---------------------------------------------------------------------------
  function rnd(seed) { var s = seed || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  function makeTexture(THREE, kind) {
    var c = document.createElement('canvas'); var N = 512; c.width = c.height = N;
    var g = c.getContext('2d'); var r = rnd(kind.length * 977 + 13); var meters = 1.2;
    if (kind === 'wood' || kind === 'deck') {
      var base = kind === 'wood' ? [205, 170, 128] : [150, 110, 78];
      var planks = kind === 'wood' ? 6 : 8; var pw = N / planks;
      for (var i = 0; i < planks; i++) {
        var off = r() * N;
        for (var k = -1; k < 2; k++) {
          var v = (r() - 0.5) * 26;
          g.fillStyle = 'rgb(' + (base[0] + v | 0) + ',' + (base[1] + v * 0.9 | 0) + ',' + (base[2] + v * 0.8 | 0) + ')';
          var len = N * (0.55 + r() * 0.4);
          g.fillRect(i * pw, off + k * len, pw, len);
          g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(i * pw, off + k * len, pw, 1.5);
        }
        g.fillStyle = 'rgba(70,45,25,.28)'; g.fillRect(i * pw, 0, 1.5, N);
        for (var j = 0; j < 14; j++) {
          g.strokeStyle = 'rgba(90,60,30,' + (0.04 + r() * 0.07) + ')'; g.lineWidth = 1;
          var x = i * pw + r() * pw; g.beginPath(); g.moveTo(x, 0);
          g.bezierCurveTo(x + (r() - .5) * 8, N * .33, x + (r() - .5) * 8, N * .66, x + (r() - .5) * 6, N); g.stroke();
        }
      }
      meters = kind === 'wood' ? 1.1 : 1.2;
    } else if (kind === 'marble') {
      g.fillStyle = '#eeebe5'; g.fillRect(0, 0, N, N);
      for (var mv = 0; mv < 18; mv++) {
        g.strokeStyle = 'rgba(128,122,114,' + (0.08 + r() * 0.22) + ')'; g.lineWidth = 0.6 + r() * 2.2;
        var sx = r() * N, sy = r() * N; g.beginPath(); g.moveTo(sx, sy);
        g.bezierCurveTo(sx + (r() - .5) * 300, sy + (r() - .5) * 300, sx + (r() - .5) * 400, sy + (r() - .5) * 400, sx + (r() - .5) * 520, sy + (r() - .5) * 520); g.stroke();
      }
      g.fillStyle = 'rgba(170,165,158,.35)'; g.fillRect(0, N / 2 - 0.5, N, 1); g.fillRect(N / 2 - 0.5, 0, 1, N);
      meters = 2.4;
    } else if (kind === 'tile') {
      var n = 2; var tw = N / n;
      for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) {
        var t = 226 + (r() - .5) * 10; g.fillStyle = 'rgb(' + (t | 0) + ',' + (t - 2 | 0) + ',' + (t - 6 | 0) + ')';
        g.fillRect(a * tw, b * tw, tw, tw);
        for (var q = 0; q < 40; q++) { g.fillStyle = 'rgba(160,150,140,' + r() * 0.06 + ')'; g.fillRect(a * tw + r() * tw, b * tw + r() * tw, 2 + r() * 6, 1 + r() * 3); }
      }
      g.fillStyle = 'rgba(150,145,138,.9)';
      for (var z = 0; z <= n; z++) { g.fillRect(z * tw - 1.5, 0, 3, N); g.fillRect(0, z * tw - 1.5, N, 3); }
      meters = 1.2;
    } else {
      g.fillStyle = '#d9d6d0'; g.fillRect(0, 0, N, N);
      for (var p = 0; p < 900; p++) { g.fillStyle = 'rgba(120,115,110,' + r() * 0.08 + ')'; g.fillRect(r() * N, r() * N, 2, 2); }
      meters = 2;
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / meters, 1 / meters);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Construção da maquete a partir do JSON
  // ---------------------------------------------------------------------------
  var SLAB = 0.12;

  // Um modelo pode ter vários pavimentos (`levels`) ou ser de pavimento único (walls/rooms/furniture na raiz)
  function levelsOf(model) {
    if (Array.isArray(model.levels) && model.levels.length) return model.levels;
    return [{ name: '', elevation: 0, walls: model.walls, rooms: model.rooms, furniture: model.furniture }];
  }

  function prepare(model) {
    var unit = model.unit || 'px';
    var s = model.scale || (unit === 'm' ? 1 : unit === 'cm' ? 0.01 : unit === 'mm' ? 0.001 : 0.03);
    var H0 = model.wallHeight || 2.8, top = H0;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function acc(p) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    levelsOf(model).forEach(function (lv) {
      (lv.walls || []).forEach(function (w) { acc(w.a); acc(w.b); });
      (lv.rooms || []).forEach(function (r) { (r.poly || []).forEach(acc); });
      top = Math.max(top, (lv.elevation || 0) + (lv.height || H0));
    });
    if (model.building) {
      (model.building.blocks || []).forEach(function (b) { (b.outline || []).forEach(acc); top = Math.max(top, b.to || 0); });
      (model.building.extras || []).forEach(function (e) { top = Math.max(top, e.to || (e.bar ? Math.max(e.bar[2], e.bar[5]) : 0)); });
    }
    if (model.bounds) { minX = model.bounds[0]; minY = model.bounds[1]; maxX = model.bounds[2]; maxY = model.bounds[3]; }
    if (model.building && model.building.top) top = Math.max(top, model.building.top);
    if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return {
      s: s, cx: cx, cy: cy, top: top,
      H: H0,
      defT: model.wallThickness != null ? model.wallThickness : 0.15 / s,
      sizeX: (maxX - minX) * s, sizeZ: (maxY - minY) * s,
      P: function (p) { return { x: (p[0] - cx) * s, z: (p[1] - cy) * s }; }
    };
  }

  function makeMaterials(THREE) {
    function std(color, o) { var m = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0 }, o || {})); return m; }
    return {
      wall: std(0xf6f3ee, { roughness: 0.95 }),
      cap: std(0x2a2d31, { roughness: 0.7 }),
      sill: std(0xe4e0d8, { roughness: 0.6 }),
      frame: std(0xfbfaf8, { roughness: 0.6 }),
      door: std(0xb89572, { roughness: 0.65 }),
      doorMain: std(0x6f4e37, { roughness: 0.55 }),
      metal: std(0xb8bcc2, { roughness: 0.3, metalness: 0.8 }),
      alu: std(0x3b4046, { roughness: 0.45, metalness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xa9cfe6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
      slab: std(0xcfd3d8, { roughness: 0.9 }),
      // mobiliário
      fabric: std(0x9aa1a9), fabricLight: std(0xe7e2d9), fabricAccent: std(0x7d93aa),
      white: std(0xf7f7f5, { roughness: 0.5 }), wood: std(0xa98260, { roughness: 0.6 }), woodDark: std(0x6d5140, { roughness: 0.6 }),
      stone: std(0x3d3f42, { roughness: 0.35 }), ceramic: std(0xffffff, { roughness: 0.2 }), water: std(0xbfe0f0, { roughness: 0.1 }),
      rug: std(0xd8d0c3, { roughness: 1 }), plant: std(0x5f8f5a), pot: std(0xc9b8a3), black: std(0x1c1c1e, { roughness: 0.3 }),
      linen: std(0xfbfaf7, { roughness: 0.9 }),
      coping: std(0xe2ddd3, { roughness: 0.7 }),
      pool: new THREE.MeshStandardMaterial({ color: 0x2fb3c6, roughness: 0.08, metalness: 0.05, emissive: 0x0a4a55, emissiveIntensity: 0.35 })
    };
  }

  function buildWalls(THREE, model, ctx, M, cut) {
    var group = new THREE.Group(); group.name = 'walls';
    var H = model.height || ctx.H, labels = [];
    var geo = new THREE.BoxGeometry(1, 1, 1);

    (model.walls || []).forEach(function (w) {
      var A = ctx.P(w.a), B = ctx.P(w.b);
      var dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
      if (L < 1e-6) return;
      var ux = dx / L, uz = dz / L, rot = Math.atan2(-uz, ux);
      var nx = -uz, nz = ux; // normal no plano
      var t = (w.t != null ? w.t : ctx.defT) * ctx.s;
      var ext = w.extend === false ? 0 : t / 2;
      var horiz = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1]);
      var ai = horiz ? 0 : 1, a0 = w.a[ai], b0 = w.b[ai];
      var wallH = w.height || H;

      function put(s0, s1, y0, y1, o) {
        o = o || {};
        var base = y0 <= 0 ? -SLAB : y0;
        var top = Math.min(y1, cut);
        if (s1 - s0 < 0.002 || top - base < 0.002) return null;
        var clipped = top < y1 - 1e-4;
        var depth = o.depth != null ? o.depth : t;
        var mat;
        if (o.mat) mat = clipped ? [o.mat, o.mat, M.cap, o.mat, o.mat, o.mat] : o.mat;
        else {
          var tm = (clipped || y1 >= wallH - 1e-4) ? M.cap : (o.topMat || M.wall);
          mat = [M.wall, M.wall, tm, M.wall, M.wall, M.wall];
        }
        var m = new THREE.Mesh(geo, mat);
        m.scale.set(s1 - s0, top - base, depth);
        var sm = (s0 + s1) / 2, off = o.off || 0;
        m.position.set(A.x + ux * sm + nx * off, (base + top) / 2, A.z + uz * sm + nz * off);
        m.rotation.y = rot;
        var isGlass = o.mat === M.glass;
        m.castShadow = !isGlass && !o.noShadow; m.receiveShadow = !isGlass;
        if (isGlass) m.renderOrder = 2;
        group.add(m);
        return m;
      }

      function frameRect(s0, s1, y0, y1, fw, fd, panels) {
        put(s0, s1, y0, y0 + fw, { mat: M.alu, depth: fd });
        put(s0, s1, y1 - fw, y1, { mat: M.alu, depth: fd });
        put(s0, s0 + fw, y0, y1, { mat: M.alu, depth: fd });
        put(s1 - fw, s1, y0, y1, { mat: M.alu, depth: fd });
        for (var k = 1; k < panels; k++) {
          var c = s0 + (s1 - s0) * k / panels;
          put(c - fw / 2, c + fw / 2, y0, y1, { mat: M.alu, depth: fd });
        }
        // caixilhos altos (pé-direito duplo) ganham travessa horizontal
        var rows = Math.round((y1 - y0) / 2.6);
        for (var q = 1; q < rows; q++) {
          var yy = y0 + (y1 - y0) * q / rows;
          put(s0, s1, yy - fw / 2, yy + fw / 2, { mat: M.alu, depth: fd });
        }
      }

      function opening(o) {
        var s0 = o.s0, s1 = o.s1, w2 = s1 - s0, type = o.type || 'opening';
        if (type === 'door' || type === 'sliding') {
          var dh = o.height || 2.1, j = 0.05;
          put(s0, s1, dh, wallH, {});
          put(s0, s0 + j, 0, dh, { mat: M.frame, depth: t + 0.02 });
          put(s1 - j, s1, 0, dh, { mat: M.frame, depth: t + 0.02 });
          put(s0, s1, dh - j, dh, { mat: M.frame, depth: t + 0.02 });
          var leafMat = o.glass ? M.glass : (o.entrance ? M.doorMain : M.door);
          if (type === 'door') {
            put(s0 + j, s1 - j, 0.01, dh - j, { mat: leafMat, depth: 0.045 });
            var hs = o.hinge === 'end' ? s0 + j + 0.09 : s1 - j - 0.09;
            put(hs - 0.07, hs + 0.07, 0.98, 1.02, { mat: M.metal, depth: 0.12, noShadow: true });
          } else {
            var mid = (s0 + s1) / 2;
            put(s0 + j, mid + 0.03, 0.01, dh - j, { mat: leafMat, depth: 0.025, off: 0.015 });
            put(mid - 0.03, s1 - j, 0.01, dh - j, { mat: leafMat, depth: 0.025, off: -0.015 });
          }
          if (o.entrance) {
            var em = (s0 + s1) / 2, side = o.entranceSide === 'right' ? -1 : 1;
            labels.push({ text: CFG.locale.entrance, entrance: true,
              x: A.x + ux * em + nx * side * 0.9, y: 0.6, z: A.z + uz * em + nz * side * 0.9 });
          }
        } else if (type === 'window' || type === 'glass') {
          var sill = type === 'glass' ? 0 : (o.sill != null ? o.sill : 1.0);
          var top = o.top != null ? o.top : (type === 'glass' ? 2.3 : 2.2);
          if (top <= sill + 0.2) top = Math.min(wallH, sill + 0.8);
          if (sill > 0) put(s0, s1, 0, sill, { topMat: M.sill });
          put(s0, s1, top, wallH, {});
          var panels = Math.max(1, Math.round(w2 / (type === 'glass' ? 1.1 : 0.9)));
          frameRect(s0, s1, sill, top, 0.05, 0.08, panels);
          put(s0, s1, sill, top, { mat: M.glass, depth: 0.015 });
        } else if (type === 'railing') {
          var rh = o.height || 1.05;
          put(s0, s1, 0, 0.08, { topMat: M.sill });
          put(s0, s1, 0.08, rh, { mat: M.glass, depth: 0.015 });
          put(s0, s1, rh - 0.04, rh + 0.02, { mat: M.alu, depth: 0.06 });
          var posts = Math.max(1, Math.round(w2 / 1.5));
          for (var k = 0; k <= posts; k++) {
            var c = s0 + 0.025 + (w2 - 0.05) * k / posts;
            put(c - 0.025, c + 0.025, 0, rh, { mat: M.alu, depth: 0.05 });
          }
        } else { // 'opening' / vão livre
          if (!o.full) put(s0, s1, o.top != null ? o.top : 2.2, wallH, {});
        }
      }

      // parede inteira como guarda-corpo (mezaninos, terraços, vazios)
      if (w.railing) {
        opening({ type: 'railing', s0: 0, s1: L, height: w.railingHeight });
        return;
      }

      var ops = (w.openings || []).map(function (o) {
        var s0, s1;
        if (o.offset != null) { s0 = o.offset; s1 = o.offset + (o.width || 0.8); }
        else { s0 = (o.from - a0) / (b0 - a0) * L; s1 = (o.to - a0) / (b0 - a0) * L; }
        if (s0 > s1) { var tmp = s0; s0 = s1; s1 = tmp; }
        return Object.assign({}, o, { s0: Math.max(0, s0), s1: Math.min(L, s1) });
      }).filter(function (o) { return o.s1 - o.s0 > 0.01; })
        .sort(function (p, q) { return p.s0 - q.s0; });

      var cur = -ext;
      ops.forEach(function (o) {
        if (o.s0 > cur + 0.001) put(cur, o.s0, 0, wallH, {});
        opening(o);
        cur = Math.max(cur, o.s1);
      });
      if (L + ext > cur + 0.001) put(cur, L + ext, 0, wallH, {});
    });
    return { group: group, labels: labels, geo: geo };
  }

  function pointInPoly(x, z, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if (((pts[i].z > z) !== (pts[j].z > z)) && (x < (pts[j].x - pts[i].x) * (z - pts[i].z) / (pts[j].z - pts[i].z) + pts[i].x)) inside = !inside;
    }
    return inside;
  }

  function polyCentroid(pts) {
    var a = 0, x = 0, z = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var f = pts[j].x * pts[i].z - pts[i].x * pts[j].z;
      a += f; x += (pts[j].x + pts[i].x) * f; z += (pts[j].z + pts[i].z) * f;
    }
    if (Math.abs(a) < 1e-9) return { x: pts[0].x, z: pts[0].z, area: 0 };
    return { x: x / (3 * a), z: z / (3 * a), area: Math.abs(a / 2) };
  }

  function buildFloors(THREE, model, ctx, M, tex) {
    var group = new THREE.Group(); group.name = 'floors';
    var rooms = [];
    var slab = model.slab || (model.elevation ? 0.2 : SLAB);
    var floorMats = {};
    function floorMat(r) {
      var key = r.color ? 'c' + r.color : (r.floor || 'wood');
      if (!floorMats[key]) {
        if (r.color) floorMats[key] = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.8 });
        else {
          var k = r.floor || 'wood';
          if (!tex[k]) tex[k] = makeTexture(THREE, k);
          floorMats[key] = new THREE.MeshStandardMaterial({ map: tex[k], roughness: k === 'tile' ? 0.35 : k === 'marble' ? 0.18 : 0.7 });
        }
      }
      return floorMats[key];
    }
    (model.rooms || []).forEach(function (r) {
      if (!r.poly || r.poly.length < 3) return;
      var pts = r.poly.map(ctx.P);
      var shape = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
      var g = new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false });
      var mesh = new THREE.Mesh(g, [floorMat(r), M.slab]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -slab + (r.raise || 0);
      mesh.castShadow = !!model.elevation;
      mesh.receiveShadow = true;
      var c = polyCentroid(pts);
      var lp = r.label ? ctx.P(r.label) : c;
      var xs = pts.map(function (p) { return p.x; }), zs = pts.map(function (p) { return p.z; });
      var info = { name: r.name || '', area: r.area, cx: lp.x, cz: lp.z, pts: pts,
        size: Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, zs) - Math.min.apply(null, zs)),
        center: { x: c.x, z: c.z } };
      mesh.userData.room = info;
      rooms.push(info);
      group.add(mesh);
    });
    return { group: group, rooms: rooms };
  }

  // Mobiliário simplificado (blocos) — ajuda a entender escala e uso dos cômodos
  function buildFurniture(THREE, model, ctx, M, cut) {
    var group = new THREE.Group(); group.name = 'furniture';
    var box = new THREE.BoxGeometry(1, 1, 1);
    var cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 40);
    var sph = new THREE.SphereGeometry(0.5, 24, 16);

    function mk(parent, geom, mat, sx, sy, sz, x, y0, z) {
      if (y0 >= cut) return;
      var h = Math.min(sy, cut - y0);
      var mm = mat;
      if (h < sy - 1e-4 && geom === box) mm = [mat, mat, M.cap, mat, mat, mat];
      var m = new THREE.Mesh(geom, mm);
      m.scale.set(sx, h, sz); m.position.set(x, y0 + h / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    }
    function B(p, w, h, d, x, y0, z, mat) { return mk(p, box, mat, w, h, d, x, y0, z); }
    function C(p, w, h, d, x, y0, z, mat) { return mk(p, cyl, mat, w, h, d, x, y0, z); }
    function S(p, w, h, d, x, y0, z, mat) { return mk(p, sph, mat, w, h, d, x, y0, z); }

    // Cada peça é modelada em coordenadas locais: largura W (eixo X), profundidade D (eixo Z),
    // "costas" voltadas para -Z. Depois é rotacionada conforme `facing`.
    var builders = {
      bed: function (g, W, D, f) {
        B(g, W, 0.28, D, 0, 0, 0, M.woodDark);
        B(g, W - 0.04, 0.24, D - 0.08, 0, 0.28, 0.02, M.linen);
        B(g, W + 0.02, 1.05, 0.08, 0, 0, -D / 2 + 0.04, M.fabric);
        B(g, W + 0.03, 0.06, D * 0.55, 0, 0.5, D / 2 - D * 0.275 - 0.02, M.fabricAccent);
        var n = W > 1.2 ? 2 : 1, pw = (W - 0.2) / n;
        for (var i = 0; i < n; i++) B(g, pw - 0.06, 0.13, 0.36, -W / 2 + 0.1 + pw * (i + 0.5), 0.52, -D / 2 + 0.3, M.white);
      },
      sofa: function (g, W, D, f) {
        var col = f.color ? new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.9 }) : M.fabric;
        B(g, W, 0.42, D, 0, 0, 0, col);
        if (f.back !== false) {
          B(g, W, 0.42, 0.2, 0, 0.42, -D / 2 + 0.1, col);
          if (f.arms !== false) { B(g, 0.16, 0.22, D, -W / 2 + 0.08, 0.42, 0, col); B(g, 0.16, 0.22, D, W / 2 - 0.08, 0.42, 0, col); }
        }
      },
      armchair: function (g, W, D, f) {
        B(g, W, 0.42, D, 0, 0, 0, M.fabricLight);
        B(g, W, 0.38, 0.14, 0, 0.42, -D / 2 + 0.07, M.fabricLight);
        B(g, 0.12, 0.18, D, -W / 2 + 0.06, 0.42, 0, M.fabricLight);
        B(g, 0.12, 0.18, D, W / 2 - 0.06, 0.42, 0, M.fabricLight);
      },
      chair: function (g, W, D, f) {
        B(g, W * 0.9, 0.46, D * 0.9, 0, 0, 0, M.fabricLight);
        B(g, W * 0.9, 0.42, 0.06, 0, 0.46, -D / 2 + 0.06, M.fabricLight);
      },
      table: function (g, W, D, f) {
        var h = f.h || 0.75, m = f.material === 'white' ? M.white : M.wood;
        if (f.shape === 'round' || f.shape === 'oval') {
          C(g, W, 0.04, D, 0, h - 0.04, 0, m);
          C(g, Math.min(W, D) * 0.12 + 0.04, h - 0.04, Math.min(W, D) * 0.12 + 0.04, 0, 0, 0, M.woodDark);
          C(g, Math.min(W, D) * 0.45, 0.03, Math.min(W, D) * 0.45, 0, 0, 0, M.woodDark);
        } else {
          B(g, W, 0.04, D, 0, h - 0.04, 0, m);
          var lx = W / 2 - 0.05, lz = D / 2 - 0.05;
          [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(function (q) { B(g, 0.05, h - 0.04, 0.05, q[0], 0, q[1], M.woodDark); });
        }
      },
      desk: function (g, W, D, f) { builders.table(g, W, D, Object.assign({ h: 0.75 }, f, { material: 'white' })); },
      counter: function (g, W, D, f) {
        var h = f.h || 0.9;
        B(g, W, h - 0.04, D, 0, 0, 0, M.white);
        B(g, W + 0.02, 0.04, D + 0.02, 0, h - 0.04, 0, M.stone);
        if (f.sink) B(g, Math.min(0.7, W * 0.5), 0.012, Math.min(0.4, D * 0.7), 0, h, 0, M.metal);
      },
      cooktop: function (g, W, D, f) { B(g, W * 0.95, 0.015, D * 0.95, 0, (f.h || 0.9) + 0.004, 0, M.black); },
      stool: function (g, W, D, f) { C(g, 0.05, (f.h || 0.72), 0.05, 0, 0, 0, M.alu); C(g, W, 0.06, D, 0, (f.h || 0.72), 0, M.fabricAccent); },
      wardrobe: function (g, W, D, f) {
        var h = f.h || 2.3;
        B(g, W, h, D, 0, 0, 0, f.color ? new THREE.MeshStandardMaterial({ color: f.color }) : M.fabricLight);
      },
      cabinet: function (g, W, D, f) { B(g, W, f.h || 0.55, D, 0, 0, 0, M.wood); },
      toilet: function (g, W, D, f) {
        B(g, W * 0.9, 0.75, 0.18, 0, 0, -D / 2 + 0.09, M.ceramic);
        C(g, W * 0.8, 0.4, D * 0.72, 0, 0, 0.1 * D, M.ceramic);
      },
      sink: function (g, W, D, f) {
        B(g, W, 0.82, D, 0, 0, 0, M.wood);
        B(g, W, 0.04, D, 0, 0.82, 0, M.ceramic);
        C(g, W * 0.5, 0.012, D * 0.55, 0, 0.86, 0.02, M.metal);
      },
      bathtub: function (g, W, D, f) {
        B(g, W, 0.55, D, 0, 0, 0, M.ceramic);
        B(g, W - 0.14, 0.02, D - 0.14, 0, 0.5, 0, M.water);
      },
      shower: function (g, W, D, f) {
        B(g, W, 0.04, D, 0, 0, 0, M.ceramic);
        var gm = M.glass;
        [[W, 0.01, 0, D / 2], [0.01, D, -W / 2, 0], [0.01, D, W / 2, 0]].forEach(function (p) {
          var m = B(g, p[0], 2.0, p[1], p[2], 0.04, p[3], gm); if (m) { m.castShadow = false; m.renderOrder = 2; }
        });
      },
      rug: function (g, W, D, f) { var m = B(g, W, 0.012, D, 0, 0, 0, f.color ? new THREE.MeshStandardMaterial({ color: f.color, roughness: 1 }) : M.rug); if (m) m.castShadow = false; },
      plant: function (g, W, D, f) {
        C(g, W * 0.6, 0.4, D * 0.6, 0, 0, 0, M.pot);
        S(g, W, Math.max(W, D) * 1.3, D, 0, 0.35, 0, M.plant);
      },
      stairs: function (g, W, D, f) {
        var rise = f.rise || 3.2, n = Math.max(4, Math.round(rise / 0.18)), rh = rise / n;
        var tm = f.tread === 'stone' ? M.coping : M.wood;
        function glassPanel(x, y0, z, len) { var m = B(g, 0.015, 0.95, len, x, y0, z, M.glass); if (m) { m.castShadow = false; m.renderOrder = 2; } }
        if (f.shape === 'u') {
          var n1 = Math.ceil(n / 2), n2 = n - n1, hw = W / 2, land = Math.min(hw, D * 0.4), run = D - land;
          var t1 = run / n1, t2 = run / n2, i;
          for (i = 0; i < n1; i++) {
            var z1 = D / 2 - t1 * (i + 0.5);
            B(g, hw - 0.06, 0.06, t1 + 0.02, hw / 2, (i + 1) * rh - 0.06, z1, tm);
            if (f.guard !== false) glassPanel(W / 2 - 0.02, (i + 1) * rh, z1, t1);
          }
          B(g, W, 0.16, land, 0, n1 * rh - 0.16, -D / 2 + land / 2, M.coping);
          for (i = 0; i < n2; i++) {
            var z2 = -D / 2 + land + t2 * (i + 0.5);
            B(g, hw - 0.06, 0.06, t2 + 0.02, -hw / 2, (n1 + i + 1) * rh - 0.06, z2, tm);
          }
          B(g, 0.1, rise, run, 0, 0, D / 2 - run / 2, M.wall); // parede central
        } else {
          var t = D / n;
          for (var k = 0; k < n; k++) {
            var z = D / 2 - t * (k + 0.5);
            B(g, W, 0.06, t + 0.02, 0, (k + 1) * rh - 0.06, z, tm);
            if (f.guard !== false) glassPanel(W / 2 - 0.02, (k + 1) * rh, z, t);
          }
          B(g, 0.08, 0.1, D, W / 2, 0, 0, M.alu);
        }
      },
      pool: function (g, W, D, f) {
        var h = f.h || 0.45, b = 0.28;
        B(g, W, h, b, 0, 0, -D / 2 + b / 2, M.coping); B(g, W, h, b, 0, 0, D / 2 - b / 2, M.coping);
        B(g, b, h, D - 2 * b, -W / 2 + b / 2, 0, 0, M.coping); B(g, b, h, D - 2 * b, W / 2 - b / 2, 0, 0, M.coping);
        var m = B(g, W - 2 * b, h - 0.07, D - 2 * b, 0, 0, 0, M.pool); if (m) m.castShadow = false;
      },
      lounger: function (g, W, D, f) {
        B(g, W, 0.3, D * 0.68, 0, 0, D * 0.16, M.fabricLight);
        var m = B(g, W, 0.6, 0.08, 0, 0.22, -D / 2 + 0.26, M.fabricLight); if (m) m.rotation.x = -0.55;
      },
      piano: function (g, W, D, f) {
        B(g, W, 0.32, D, 0, 0.62, 0, M.black);
        [[-W / 2 + 0.1, D / 2 - 0.15], [W / 2 - 0.1, D / 2 - 0.15], [0, -D / 2 + 0.2]].forEach(function (q) { B(g, 0.08, 0.62, 0.08, q[0], 0, q[1], M.black); });
        B(g, W * 0.92, 0.04, 0.16, 0, 0.72, D / 2 + 0.06, M.white);
        var lid = B(g, W * 0.96, 0.02, D * 0.9, W * 0.18, 1.2, 0, M.black); if (lid) lid.rotation.z = 0.6;
        B(g, 0.5, 0.48, 0.34, 0, 0, D / 2 + 0.5, M.black);
      },
      tv: function (g, W, D, f) {
        if (f.rack !== false) B(g, W, 0.42, D, 0, 0, 0, M.woodDark);
        B(g, Math.min(W * 0.8, 2.0), Math.min(W * 0.8, 2.0) * 0.56, 0.05, 0, f.y || 1.0, -D / 2 + 0.03, M.black);
      },
      wine: function (g, W, D, f) {
        var h = f.h || 2.3;
        B(g, W, h, D, 0, 0, 0, M.woodDark);
        var m = B(g, W * 0.94, h - 0.12, 0.02, 0, 0.06, D / 2 + 0.01, M.glass); if (m) { m.castShadow = false; m.renderOrder = 2; }
      },
      bbq: function (g, W, D, f) {
        builders.counter(g, W, D, { h: 0.9 });
        B(g, Math.min(0.8, W * 0.4), 0.03, D * 0.8, W / 2 - Math.min(0.8, W * 0.4) / 2 - 0.1, 0.9, 0, M.black);
      },
      washer: function (g, W, D, f) { B(g, W, 0.85, D, 0, 0, 0, M.white); C(g, W * 0.6, 0.02, 0.02, 0, 0.45, D / 2, M.metal); },
      box: function (g, W, D, f) {
        B(g, W, f.h || 0.8, D, 0, f.y || 0, 0, f.color ? new THREE.MeshStandardMaterial({ color: f.color }) : M.white);
      }
    };

    (model.furniture || []).forEach(function (f) {
      var b = f.box; if (!b) return;
      var p1 = ctx.P([b[0], b[1]]), p2 = ctx.P([b[2], b[3]]);
      var x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x), z1 = Math.min(p1.z, p2.z), z2 = Math.max(p1.z, p2.z);
      var bw = x2 - x1, bd = z2 - z1;
      var facing = f.facing || 'n', rot = 0, W = bw, D = bd;
      if (facing === 's') rot = Math.PI;
      else if (facing === 'e') { rot = -Math.PI / 2; W = bd; D = bw; }
      else if (facing === 'w') { rot = Math.PI / 2; W = bd; D = bw; }
      var g = new THREE.Group();
      var fn = builders[f.type] || builders.box;
      fn(g, W, D, f);
      g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
      g.rotation.y = rot;
      group.add(g);
    });
    return { group: group, geos: [box, cyl, sph] };
  }

  // ---------------------------------------------------------------------------
  // Viewer
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Edifício: fachadas por bloco de pavimentos (texturas procedurais) + elementos extras
  // ---------------------------------------------------------------------------
  function facadeTexture(THREE, style) {
    // Cada textura = 1 pavimento de altura (v) × 1 módulo de fachada (u). O topo do canvas é o topo do pavimento.
    var N = 512, c = document.createElement('canvas'); c.width = N; c.height = N; var g = c.getContext('2d');
    function R(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x * N, y * N, w * N, h * N); }
    function grad(y0, y1, a, b) { var q = g.createLinearGradient(0, y0 * N, 0, y1 * N); q.addColorStop(0, a); q.addColorStop(1, b); return q; }
    function tiles(col, step) { g.strokeStyle = col; g.lineWidth = 1; for (var t = step; t < N; t += step) { g.beginPath(); g.moveTo(0, t); g.lineTo(N, t); g.stroke(); } }
    function win(x, y, w, h, lit) {
      R(x - 0.012, y - 0.012, w + 0.024, h + 0.024, '#9aa1a8');
      g.fillStyle = lit ? grad(y, y + h, '#f3c27a', '#b9773f') : grad(y, y + h, '#6f8da6', '#2c3d4d'); g.fillRect(x * N, y * N, w * N, h * N);
      R(x + w / 2 - 0.004, y, 0.008, h, '#8f979e');
    }
    var W = '#efece6';
    if (style === 'glass') {            // pele de vidro: módulo 1,5 m, peitoril escuro e caixilhos finos
      g.fillStyle = grad(0, 1, '#6f93b3', '#2d4a66'); g.fillRect(0, 0, N, N);
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(0.06 * N, 0, 0.3 * N, 0.82 * N);
      R(0, 0.82, 1, 0.18, '#233447'); R(0, 0.815, 1, 0.012, '#8d99a4');
      R(0, 0, 0.012, 1, '#8d99a4'); R(0.988, 0, 0.012, 1, '#8d99a4'); R(0, 0.32, 1, 0.006, 'rgba(160,175,190,.6)');
    } else if (style === 'whitewin') {  // porcelanato branco com uma janela pequena por módulo
      R(0, 0, 1, 1, W); tiles('rgba(0,0,0,.035)', 16);
      win(0.39, 0.3, 0.22, 0.38, false); R(0, 0.985, 1, 0.015, '#dcd7cf');
    } else if (style === 'bands') {     // faixa branca por laje + revestimento grafite + janelas
      R(0, 0, 1, 1, '#454b52'); tiles('rgba(255,255,255,.035)', 10);
      win(0.1, 0.2, 0.34, 0.5, false); win(0.56, 0.2, 0.34, 0.5, true);
      R(0, 0.86, 1, 0.14, '#f1eee8'); R(0, 0.86, 1, 0.01, '#c9c4bb');
    } else if (style === 'dark') {      // fundo dos rasgos: grafite com janelas iluminadas
      R(0, 0, 1, 1, '#3f444a'); tiles('rgba(255,255,255,.03)', 10);
      win(0.3, 0.22, 0.4, 0.5, true); R(0, 0.9, 1, 0.1, '#2f3338');
    } else if (style === 'white') {
      R(0, 0, 1, 1, W); tiles('rgba(0,0,0,.035)', 16);
    } else if (style === 'red') {
      R(0, 0, 1, 1, '#c8102e'); tiles('rgba(0,0,0,.08)', 32);
      g.strokeStyle = 'rgba(0,0,0,.08)'; for (var t = 32; t < N; t += 32) { g.beginPath(); g.moveTo(t, 0); g.lineTo(t, N); g.stroke(); }
    } else if (style === 'store') {     // lojas em pé-direito duplo: vidro, interior iluminado, faixa de letreiro
      g.fillStyle = grad(0, 1, '#d9a36c', '#8a5a3a'); g.fillRect(0, 0, N, N);
      g.fillStyle = 'rgba(255,240,210,.25)'; g.fillRect(0.1 * N, 0.62 * N, 0.25 * N, 0.3 * N); g.fillRect(0.6 * N, 0.65 * N, 0.3 * N, 0.27 * N);
      R(0, 0, 1, 0.07, '#f1eee8'); R(0, 0.36, 1, 0.1, '#4b4e52'); R(0.08, 0.395, 0.3, 0.03, '#d9d4cc');
      R(0, 0, 0.018, 1, '#2d3034'); R(0.5, 0.46, 0.012, 0.54, '#2d3034'); R(0.982, 0, 0.018, 1, '#2d3034'); R(0, 0.97, 1, 0.03, '#3a3d41');
    } else if (style === 'cobogo') {    // garagem: faixa branca (laje), cobogó e painel vermelho
      R(0, 0, 1, 1, W);
      R(0.04, 0.2, 0.58, 0.72, '#2a2622');
      for (var yy = 0; yy < 8; yy++) for (var xx = 0; xx < 12; xx++) {
        var bw = [0.03, 0.045, 0.06][(xx * 5 + yy * 3) % 3];
        R(0.05 + xx * 0.048, 0.21 + yy * 0.089, bw, 0.07, '#d8d2c8');
        if ((xx + yy) % 5 === 0) R(0.05 + xx * 0.048 + 0.004, 0.225 + yy * 0.089, bw - 0.008, 0.04, 'rgba(240,170,90,.8)');
      }
      R(0.66, 0.2, 0.3, 0.72, '#c8102e');
      R(0, 0, 1, 0.18, '#f4f1ec'); R(0, 0.18, 1, 0.012, '#bdb7ae');
    } else if (style === 'terrace') {   // varanda: testeira vermelha, forro de madeira, guarda-corpo de vidro
      g.fillStyle = grad(0, 1, '#a8703f', '#3b3a3d'); g.fillRect(0, 0, N, N);
      R(0, 0, 1, 0.1, '#c8102e'); R(0, 0.1, 1, 0.12, '#c98c55');
      R(0.2, 0.3, 0.6, 0.35, '#e5b073'); R(0, 0.62, 1, 0.38, 'rgba(150,190,215,.55)'); R(0, 0.62, 1, 0.01, '#d6e4ec');
    } else {                            // compatibilidade: garage / punched / wall
      return facadeTexture(THREE, style === 'garage' ? 'cobogo' : style === 'punched' ? 'whitewin' : 'white');
    }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }

  function buildBuilding(THREE, model, ctx, M, clip, ghostClip) {
    var B = model.building, group = new THREE.Group(); group.name = 'building';
    var mats = {}, periods = { glass: 1.5, punched: 3.2, whitewin: 3.2, bands: 3.2, dark: 3.0, white: 3, store: 4.5, cobogo: 7.5, garage: 7.5, red: 3, wall: 3, terrace: 3 };
    function styleMat(st) {
      if (!mats[st]) {
        var o = { map: facadeTexture(THREE, st), roughness: st === 'glass' ? 0.2 : 0.85, metalness: st === 'glass' ? 0.4 : 0, side: THREE.DoubleSide, clippingPlanes: [clip], clipShadows: true };
        mats[st] = new THREE.MeshStandardMaterial(o);
      }
      return mats[st];
    }
    var capMat = new THREE.MeshStandardMaterial({ color: 0xd9d6d0, roughness: 0.9, clippingPlanes: [clip], clipShadows: true, side: THREE.DoubleSide });
    var colorMats = {};
    function colorMat(c, op) {
      var k = c + '|' + (op || 1);
      if (!colorMats[k]) colorMats[k] = new THREE.MeshStandardMaterial(op && op < 1 ?
        { color: c, roughness: 0.1, metalness: 0.2, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [clip] } :
        { color: c, roughness: 0.6, clippingPlanes: [clip], clipShadows: true });
      return colorMats[k];
    }
    var ghostPts = [];

    (B.blocks || []).forEach(function (b) {
      var pts = b.outline.map(ctx.P), n = pts.length, y0 = b.from, y1 = b.to, fh = b.floorHeight || (y1 - y0);
      for (var i = 0; i < n; i++) {
        var p = pts[i], q = pts[(i + 1) % n];
        var dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz); if (L < 0.05) continue;
        var nx = -dz / L, nz = dx / L;
        var mx = (p.x + q.x) / 2 + nx * 0.05, mz = (p.z + q.z) / 2 + nz * 0.05;
        if (pointInPoly(mx, mz, pts)) { var tmp = p; p = q; q = tmp; nx = -nx; nz = -nz; }
        var key = Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'e' : 'w') : (nz > 0 ? 's' : 'n');
        var st = (b.edges && b.edges[i]) || (b.faces && b.faces[key]) || b.style || 'whitewin', per = periods[st] || 2;
        if (st === 'none') continue;
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([p.x, y0, p.z, q.x, y0, q.z, q.x, y1, q.z, p.x, y1, p.z], 3));
        var u1 = L / per, v1 = (y1 - y0) / fh;
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u1, 0, u1, v1, 0, v1], 2));
        geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
        var m = new THREE.Mesh(geo, styleMat(st)); m.castShadow = true; m.receiveShadow = true; group.add(m);
      }
      var shape = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
      if (b.cap !== false) { var cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), capMat); cap.rotation.x = -Math.PI / 2; cap.position.y = y1 - 0.06; cap.receiveShadow = true; group.add(cap); } // levemente abaixo do topo: não disputa com o piso de pavimentos externos
      if (b.bottom) { var bc = new THREE.Mesh(new THREE.ShapeGeometry(shape), capMat); bc.rotation.x = -Math.PI / 2; bc.position.y = y0 + 0.02; group.add(bc); }
      // linhas-fantasma (pavimentos acima do corte)
      for (var yy = y0; yy <= y1 + 1e-3; yy += fh) for (var k = 0; k < n; k++) { var a = pts[k], c = pts[(k + 1) % n]; ghostPts.push(a.x, yy, a.z, c.x, yy, c.z); }
      pts.forEach(function (a) { ghostPts.push(a.x, y0, a.z, a.x, y1, a.z); });
    });

    (B.extras || []).forEach(function (e) {
      var mat = e.style ? styleMat(e.style) : colorMat(e.color || '#c4161c', e.opacity), m;
      if (e.poly) {
        var pts = e.poly.map(ctx.P);
        var shape = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
        m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: e.to - e.from, bevelEnabled: false }), mat);
        m.rotation.x = -Math.PI / 2; m.position.y = e.from;
      } else if (e.bar) {
        var a = ctx.P([e.bar[0], e.bar[1]]), c = ctx.P([e.bar[3], e.bar[4]]);
        var va = new THREE.Vector3(a.x, e.bar[2], a.z), vc = new THREE.Vector3(c.x, e.bar[5], c.z);
        var len = va.distanceTo(vc), sz = e.size || [0.5, 0.5];
        m = new THREE.Mesh(new THREE.BoxGeometry(len, sz[1], sz[0]), mat);
        m.position.copy(va).add(vc).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), vc.clone().sub(va).normalize());
      }
      if (m) { m.castShadow = !(e.opacity < 1); m.receiveShadow = true; group.add(m); }
    });

    if (B.site) {
      var sp = B.site.poly.map(ctx.P);
      var ss = new THREE.Shape(sp.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
      var site = new THREE.Mesh(new THREE.ShapeGeometry(ss), new THREE.MeshStandardMaterial({ color: B.site.color || 0xcfd2d4, roughness: 1 }));
      site.rotation.x = -Math.PI / 2; site.position.y = -0.14; site.receiveShadow = true; group.add(site);
    }

    var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(ghostPts, 3));
    var ghost = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x5d6b78, transparent: true, opacity: 0.28, clippingPlanes: [ghostClip] }));
    ghost.visible = false;
    var labels = (B.labels || []).map(function (l) { var p = ctx.P(l.at); return { text: l.text, x: p.x, y: l.z || 0, z: p.z }; });
    return { group: group, ghost: ghost, labels: labels, mats: mats };
  }

  // ---------------------------------------------------------------------------
  // KIT — primitivas genéricas em coordenadas de planta (metros; x = leste, y = sul, z = altura).
  // Permite descrever fachadas, estruturas e paisagismo com fidelidade, em um JSON compacto:
  //   ['W', m, x1,y1,x2,y2, z0,z1, t, off, capM]     caixa ao longo de um segmento (parede, faixa, peitoril, verga)
  //   ['P', m, z0,z1, pts, holes, sideM, capM, botM]  prisma extrudado (pts = [x,y,x,y,...]); sideM número ou lista por aresta (-1 = sem face)
  //   ['B', m, x1,y1,z1, x2,y2,z2, w, h]              viga entre dois pontos 3D (pergolados, montantes, tubos)
  //   ['Q', m, x1,y1,x2,y2, z0,z1]                     painel vertical (pele de vidro, cobogó, guarda-corpo)
  //   ['H', m, z, pts, holes, down]                    polígono horizontal (piso, forro, água, gramado)
  //   ['C', m, x,y, z0,z1, r, seg]                     cilindro vertical (pilares, postes)
  //   ['F', m, [x,y,z, ...]]                            polígono 3D (rampas, ruas em declive)
  //   ['T', kind, x,y,z, h, seed, trunkM, leafM]      árvore ('palm' | 'tree' | 'bush')
  //   ['S', x1,y1,x2,y2, z0,z1, d, text, bg, fg]      letreiro com texto (painel com textura própria)
  // Materiais: kit.materials = [{c, r, m, o, t, s:[w,h], of:[u,v], e, ei, ds, cast}]  (t = textura procedural)
  // ---------------------------------------------------------------------------
  function kitCanvasTexture(THREE, kind, spec) {
    var c = document.createElement('canvas'), N = spec.px || 256; c.width = N; c.height = spec.pxh || N;
    var H = c.height, g = c.getContext('2d'), r = rnd((kind.length * 7919 + (spec.seed || 1) * 31) | 0);
    function fill(col) { g.fillStyle = col; g.fillRect(0, 0, N, H); }
    function speck(n, a, sz) { for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (r() * a) + ')'; g.fillRect(r() * N, r() * H, sz || 2, sz || 2); } }
    var base = spec.c || '#ffffff';
    if (kind === 'tile') {                       // porcelanato em réguas/placas: 1 placa por repetição
      fill(base); speck(260, 0.035, 2);
      var gr = spec.g || 'rgba(0,0,0,.14)'; g.fillStyle = gr;
      g.fillRect(0, 0, N, Math.max(1, H * 0.02)); g.fillRect(0, 0, Math.max(1, N * 0.012), H);
    } else if (kind === 'cw') {                  // pele de vidro: 1 módulo (largura) × 1 pavimento (altura)
      var gg = g.createLinearGradient(0, 0, N * 0.3, H); gg.addColorStop(0, '#4f7597'); gg.addColorStop(0.55, '#2c4c6b'); gg.addColorStop(1, '#213a52');
      g.fillStyle = gg; g.fillRect(0, 0, N, H);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(N * 0.08, 0, N * 0.22, H);
      g.fillStyle = 'rgba(20,30,40,.55)'; g.fillRect(0, H * 0.86, N, H * 0.14);            // faixa da laje (vidro opaco)
      g.fillStyle = spec.mul || '#8d98a2';
      g.fillRect(0, 0, N * 0.02, H); g.fillRect(N * 0.98, 0, N * 0.02, H);                 // montantes
      g.fillRect(0, H * 0.855, N, H * 0.012); g.fillRect(0, 0, N, H * 0.01);               // travessas
      g.fillRect(0, H * 0.34, N, H * 0.006);
    } else if (kind === 'glass') {               // vidro de janela escuro com reflexo suave
      var gl = g.createLinearGradient(0, 0, N, H); gl.addColorStop(0, '#6d8ea9'); gl.addColorStop(1, '#2b4054');
      g.fillStyle = gl; g.fillRect(0, 0, N, H); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(N * 0.1, 0, N * 0.25, H);
    } else if (kind === 'cobogo') {              // cobogó de concreto com luz quente atrás
      fill('#2b2622');
      var cols = 6, rows = 6, cw = N / cols, ch = H / rows;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var ww = cw * [0.35, 0.55, 0.7, 0.45][(x * 3 + y * 5) % 4], hh = ch * [0.55, 0.35, 0.7][(x + y * 2) % 3];
        g.fillStyle = r() < 0.55 ? 'rgba(236,168,92,' + (0.55 + r() * 0.4) + ')' : 'rgba(210,200,185,.25)';
        g.fillRect(x * cw + (cw - ww) / 2, y * ch + (ch - hh) / 2, ww, hh);
      }
      g.strokeStyle = '#d9d2c6'; g.lineWidth = N * 0.03;
      for (var i = 0; i <= cols; i++) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, H); g.stroke(); }
      for (var j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, j * ch); g.lineTo(N, j * ch); g.stroke(); }
    } else if (kind === 'cobogo2') {             // cobogó escuro de furos circulares (garagem escura atrás, pouca luz)
      fill(spec.c || '#4a4642');
      var cols2 = 8, rows2 = 8, cw2 = N / cols2, ch2 = H / rows2;
      for (var y2 = 0; y2 < rows2; y2++) for (var x2 = 0; x2 < cols2; x2++) {
        g.beginPath(); g.arc(x2 * cw2 + cw2 / 2, y2 * ch2 + ch2 / 2, cw2 * 0.3, 0, Math.PI * 2);
        g.fillStyle = r() < 0.3 ? 'rgba(224,150,80,' + (0.5 + r() * 0.4) + ')' : 'rgba(25,22,20,' + (0.85 + r() * 0.15) + ')'; g.fill();
      }
      speck(200, 0.06, 2);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = Math.max(1, N * 0.006);
      for (var i2 = 0; i2 <= cols2; i2++) { g.beginPath(); g.moveTo(i2 * cw2, 0); g.lineTo(i2 * cw2, H); g.stroke(); }
      for (var j2 = 0; j2 <= rows2; j2++) { g.beginPath(); g.moveTo(0, j2 * ch2); g.lineTo(N, j2 * ch2); g.stroke(); }
    } else if (kind === 'wood') {                // forro/deck de madeira em réguas
      fill(base);
      var nPl = 8, pw = H / nPl;
      for (var k = 0; k < nPl; k++) {
        var v = (r() - 0.5) * 30; g.fillStyle = 'rgba(' + (v > 0 ? '255,230,200,' : '60,30,10,') + Math.abs(v) / 120 + ')'; g.fillRect(0, k * pw, N, pw);
        g.fillStyle = 'rgba(40,20,5,.35)'; g.fillRect(0, k * pw, N, Math.max(1, pw * 0.08));
        for (var q = 0; q < 6; q++) { g.fillStyle = 'rgba(70,40,15,' + r() * 0.12 + ')'; g.fillRect(r() * N, k * pw + r() * pw, N * (0.2 + r() * 0.5), 1); }
      }
    } else if (kind === 'concrete') {
      fill(base); speck(900, 0.07, 2); speck(120, 0.05, 5);
    } else if (kind === 'asphalt') {
      fill(base); speck(2400, 0.12, 1.5);
    } else if (kind === 'paver') {               // calçada em placas
      fill(base); speck(500, 0.06, 2); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, N, 2); g.fillRect(0, 0, 2, H);
      g.fillRect(N / 2, 0, 2, H); g.fillRect(0, H / 2, N, 2);
    } else if (kind === 'grasspaver') {          // piso drenante (concregrama)
      fill('#7c9a4e'); speck(900, 0.1, 2);
      g.fillStyle = '#bdb8ad'; var cells = 4, s2 = N / cells;
      for (var a = 0; a < cells; a++) for (var b = 0; b < cells; b++) { g.fillRect(a * s2 + s2 * 0.12, b * s2 + s2 * 0.12, s2 * 0.76, s2 * 0.18); g.fillRect(a * s2 + s2 * 0.12, b * s2 + s2 * 0.12, s2 * 0.18, s2 * 0.76); }
    } else if (kind === 'grass') {
      fill(base); for (var i2 = 0; i2 < 3000; i2++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '40,70,20,' : '160,200,90,') + (r() * 0.25) + ')'; g.fillRect(r() * N, r() * H, 1, 2 + r() * 3); }
    } else if (kind === 'water') {
      var wg = g.createLinearGradient(0, 0, N, H); wg.addColorStop(0, '#46b7cf'); wg.addColorStop(1, '#2a93b3'); g.fillStyle = wg; g.fillRect(0, 0, N, H);
      for (var w2 = 0; w2 < 40; w2++) { g.strokeStyle = 'rgba(255,255,255,' + (0.05 + r() * 0.12) + ')'; g.lineWidth = 1 + r() * 2; var sx = r() * N, sy = r() * H; g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx + 20, sy - 8, sx + 40, sy + 8, sx + 60, sy); g.stroke(); }
    } else if (kind === 'shutter') {             // porta de enrolar
      fill('#4a4d51'); for (var s3 = 0; s3 < H; s3 += H / 32) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, s3, N, 1); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, s3 + 2, N, 1); }
    } else if (kind === 'store') {               // vitrine de loja: vidro com interior iluminado
      var sg = g.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, spec.c2 || '#f3c48a'); sg.addColorStop(1, spec.c || '#9a6440');
      g.fillStyle = sg; g.fillRect(0, 0, N, H);
      for (var s4 = 0; s4 < 7; s4++) { g.fillStyle = 'rgba(255,245,225,' + (0.12 + r() * 0.25) + ')'; g.fillRect(r() * N, H * (0.35 + r() * 0.4), N * (0.08 + r() * 0.2), H * (0.1 + r() * 0.35)); }
      g.fillStyle = 'rgba(40,30,25,.35)'; for (var s5 = 0; s5 < 5; s5++) g.fillRect(r() * N, H * (0.55 + r() * 0.3), N * 0.03, H * 0.3);
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(N * 0.1, 0, N * 0.2, H);
    } else if (kind === 'window') {              // janela vista de fora: vidro escuro ou aceso
      var lit = spec.lit;
      var wg2 = g.createLinearGradient(0, 0, 0, H);
      if (lit) { wg2.addColorStop(0, '#f5c98f'); wg2.addColorStop(1, '#b77a44'); } else { wg2.addColorStop(0, '#7894ab'); wg2.addColorStop(1, '#2f4152'); }
      g.fillStyle = wg2; g.fillRect(0, 0, N, H); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(N * 0.1, 0, N * 0.2, H);
    } else if (kind === 'court') {               // quadra poliesportiva
      fill('#a8433e'); g.fillStyle = '#c8c3b8'; g.fillRect(N * 0.12, H * 0.08, N * 0.76, H * 0.84);
      g.strokeStyle = '#ffffff'; g.lineWidth = N * 0.01; g.strokeRect(N * 0.12, H * 0.08, N * 0.76, H * 0.84);
      g.beginPath(); g.moveTo(N * 0.12, H / 2); g.lineTo(N * 0.88, H / 2); g.stroke(); g.beginPath(); g.arc(N / 2, H / 2, N * 0.12, 0, 7); g.stroke();
      g.fillStyle = '#a8433e'; g.fillRect(N * 0.35, H * 0.08, N * 0.3, H * 0.16); g.fillRect(N * 0.35, H * 0.76, N * 0.3, H * 0.16);
    } else if (kind === 'coffer') {             // forro em grelha (caixotões) — academia do lazer
      fill('#2a0b0d');
      var cg = g.createRadialGradient(N / 2, H / 2, N * 0.05, N / 2, H / 2, N * 0.45); cg.addColorStop(0, 'rgba(120,20,25,.35)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cg; g.fillRect(0, 0, N, H);
      var bw = N * 0.16; g.fillStyle = spec.c || '#8f1c22';
      g.fillRect(0, 0, N, bw / 2); g.fillRect(0, H - bw / 2, N, bw / 2); g.fillRect(0, 0, bw / 2, H); g.fillRect(N - bw / 2, 0, bw / 2, H);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, bw / 2, N, 3); g.fillRect(bw / 2, 0, 3, H);
    } else if (kind === 'leaf') {
      fill(base); speck(700, 0.18, 3);
    } else if (kind === 'road') {                // rua com faixa central
      fill('#3b3d40'); speck(2600, 0.1, 1.5); g.fillStyle = 'rgba(235,235,225,.85)'; g.fillRect(0, H * 0.48, N * 0.5, H * 0.04);
    } else { fill(base); speck(400, 0.05, 2); }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  function kitMaterials(THREE, specs, clip) {
    var cache = {};
    var list = (specs || []).map(function (s) {
      var o = { color: s.t ? 0xffffff : (s.c || '#ffffff'), roughness: s.r != null ? s.r : 0.85, metalness: s.m || 0 };
      if (s.t) {
        var key = s.t + '|' + (s.c || '') + '|' + (s.c2 || '') + '|' + (s.lit ? 1 : 0) + '|' + (s.g || '') + '|' + (s.mul || '') + '|' + (s.seed || 0);
        var base = cache[key] || (cache[key] = kitCanvasTexture(THREE, s.t, s));
        var tex = base.clone(); tex.needsUpdate = true;
        var sz = s.s || [1, 1]; tex.repeat.set(1 / sz[0], 1 / sz[1]);
        if (s.of) tex.offset.set(-(s.of[0] || 0) / sz[0], -(s.of[1] || 0) / sz[1]);
        o.map = tex;
        if (s.tint) o.color = new THREE.Color(s.tint);
      }
      if (s.o != null && s.o < 1) { o.transparent = true; o.opacity = s.o; o.depthWrite = false; }
      if (s.e) { o.emissive = new THREE.Color(s.e); o.emissiveIntensity = s.ei != null ? s.ei : 1; if (o.map && s.em) o.emissiveMap = o.map; }
      if (s.ds || (s.o != null && s.o < 1)) o.side = THREE.DoubleSide;
      if (s.env != null) o.envMapIntensity = s.env;
      if (clip && !s.nc) { o.clippingPlanes = [clip]; o.clipShadows = true; }   // nc: não cortar (terreno, ruas, árvores)
      var m = new THREE.MeshStandardMaterial(o);
      m.userData.kit = { cast: s.cast !== false && !(s.o != null && s.o < 1), recv: s.recv !== false, order: s.ro || ((s.o != null && s.o < 1) ? 2 : 0) };
      return m;
    });
    list.__clip = clip || null;
    return list;
  }

  function KitBuilder(THREE, ctx) { this.T = THREE; this.ctx = ctx; this.buf = {}; this.extra = []; }
  KitBuilder.prototype.B = function (mi) { var b = this.buf[mi]; if (!b) b = this.buf[mi] = { p: [], n: [], u: [] }; return b; };
  // ponto da planta -> espaço three
  KitBuilder.prototype.X = function (x) { return (x - this.ctx.cx) * this.ctx.s; };
  KitBuilder.prototype.Z = function (y) { return (y - this.ctx.cy) * this.ctx.s; };
  // triângulo com normal plana e UV em metros (planar por face)
  KitBuilder.prototype.tri = function (mi, a, b, c) {
    if (mi == null || mi < 0) return;
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-10) return;
    nx /= l; ny /= l; nz /= l;
    var buf = this.B(mi), s = this.ctx.s || 1, cx = this.ctx.cx, cy = this.ctx.cy;
    var pts = [a, b, c];
    for (var i = 0; i < 3; i++) {
      var p = pts[i]; buf.p.push(p[0], p[1], p[2]); buf.n.push(nx, ny, nz);
      var X = p[0] / s + cx, Y = p[2] / s + cy;
      if (Math.abs(ny) > 0.6) buf.u.push(X, -Y);
      else { var tl = Math.hypot(nz, nx) || 1; buf.u.push((X * nz - Y * nx) / tl, p[1]); }
    }
  };
  // quadrilátero garantindo que a face aponte para 'out' (vetor three)
  KitBuilder.prototype.quad = function (mi, a, b, c, d, out) {
    if (mi == null || mi < 0) return;
    if (out) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { var t = b; b = d; d = t; }
    }
    this.tri(mi, a, b, c); this.tri(mi, a, c, d);
  };
  // caixa orientada: centro, eixos (u, v, w) já escalados pelas meias-dimensões
  KitBuilder.prototype.obox = function (m, c, u, v, w, mats) {
    var self = this;
    function P(su, sv, sw) { return [c[0] + u[0] * su + v[0] * sv + w[0] * sw, c[1] + u[1] * su + v[1] * sv + w[1] * sw, c[2] + u[2] * su + v[2] * sv + w[2] * sw]; }
    var faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    faces.forEach(function (f, k) {
      var mi = mats ? (mats[k] != null ? mats[k] : m) : m; if (mi == null || mi < 0) return;
      var a, b, cc, d;
      if (f[0]) { a = P(f[0], -1, -1); b = P(f[0], 1, -1); cc = P(f[0], 1, 1); d = P(f[0], -1, 1); }
      else if (f[1]) { a = P(-1, f[1], -1); b = P(1, f[1], -1); cc = P(1, f[1], 1); d = P(-1, f[1], 1); }
      else { a = P(-1, -1, f[2]); b = P(1, -1, f[2]); cc = P(1, 1, f[2]); d = P(-1, 1, f[2]); }
      var o = [u[0] * f[0] + v[0] * f[1] + w[0] * f[2], u[1] * f[0] + v[1] * f[1] + w[1] * f[2], u[2] * f[0] + v[2] * f[1] + w[2] * f[2]];
      self.quad(mi, a, b, cc, d, o);
    });
  };
  KitBuilder.prototype.prim = function (p, dz, cut) {
    var T = this.T, self = this, s = this.ctx.s || 1, k = p[0];
    dz = dz || 0; if (cut == null) cut = 1e9;
    if (k === 'W') {   // ['W', m, x1,y1,x2,y2, z0,z1, t, off, capM, flags]
      var z0 = p[6] + dz, z1 = Math.min(p[7] + dz, dz + cut); if (z1 - z0 < 1e-4) return;
      var ax = this.X(p[2]), az = this.Z(p[3]), bx = this.X(p[4]), bz = this.Z(p[5]);
      var dx = bx - ax, dzz = bz - az, L = Math.hypot(dx, dzz); if (L < 1e-5) return;
      var ux = dx / L, uz = dzz / L, t = (p[8] || 0.15) * s, off = (p[9] || 0) * s;
      var nx = -uz, nz = ux;   // normal "à esquerda" no espaço three (= (-dy, dx) na planta)
      var c = [(ax + bx) / 2 + nx * off, (z0 + z1) / 2, (az + bz) / 2 + nz * off];
      var capM = (p[7] + dz > dz + cut + 1e-4 && p[10] != null) ? p[10] : (p[10] != null ? p[10] : p[1]);
      var fl = p[11] || 0; // 1 = sem tampa inferior, 2 = sem tampa superior, 4 = sem faces das pontas
      this.obox(p[1], c, [ux * L / 2, 0, uz * L / 2], [0, (z1 - z0) / 2, 0], [nx * t / 2, 0, nz * t / 2],
        [fl & 4 ? -1 : p[1], fl & 4 ? -1 : p[1], fl & 2 ? -1 : capM, fl & 1 ? -1 : p[1], p[1], p[1]]);
    } else if (k === 'P') {   // ['P', m, z0,z1, pts, holes, sideM, capM, botM]
      var pz0 = p[2] + dz, pz1 = Math.min(p[3] + dz, dz + cut); if (pz1 - pz0 < 1e-4) return;
      var rings = [p[4]].concat(p[5] || []);
      var sideM = p[6] != null ? p[6] : p[1], capM2 = p[7] != null ? p[7] : p[1], botM = p[8] != null ? p[8] : p[1];
      var eidx = 0;
      var contour = null, holes = [];
      rings.forEach(function (flat, ri) {
        var pts = []; for (var i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
        var A = 0; for (var j = 0; j < pts.length; j++) { var q1 = pts[j], q2 = pts[(j + 1) % pts.length]; A += q1[0] * q2[1] - q2[0] * q1[1]; }
        // orientação: anel externo com área positiva em (x, y-planta); furos negativos
        var n = pts.length;
        for (var e = 0; e < n; e++) {
          var a = pts[e], b = pts[(e + 1) % n];
          var mi = Array.isArray(sideM) ? sideM[eidx] : sideM; eidx++;
          if (mi == null || mi < 0) continue;
          var ex = b[0] - a[0], ey = b[1] - a[1], el = Math.hypot(ex, ey); if (el < 1e-6) continue;
          // normal externa na planta: para anel com A>0 (horário visto de cima com y p/ sul) a externa é (ey, -ex)
          var sgn = (A > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
          var onx = ey / el * sgn, ony = -ex / el * sgn;
          self.quad(mi, [self.X(a[0]), pz0, self.Z(a[1])], [self.X(b[0]), pz0, self.Z(b[1])], [self.X(b[0]), pz1, self.Z(b[1])], [self.X(a[0]), pz1, self.Z(a[1])], [onx, 0, ony]);
        }
        var v2 = pts.map(function (q) { return new T.Vector2(q[0], q[1]); });
        if (ri === 0) contour = v2; else holes.push(v2);
      });
      if ((capM2 != null && capM2 >= 0) || (botM != null && botM >= 0)) {
        var tris = T.ShapeUtils.triangulateShape(contour, holes);
        var all = contour.concat.apply(contour, holes);
        tris.forEach(function (t3) {
          var A3 = all[t3[0]], B3 = all[t3[1]], C3 = all[t3[2]];
          if (capM2 != null && capM2 >= 0) self.quadTri(capM2, A3, B3, C3, pz1, 1);
          if (botM != null && botM >= 0) self.quadTri(botM, A3, B3, C3, pz0, -1);
        });
      }
    } else if (k === 'B') {   // ['B', m, x1,y1,z1, x2,y2,z2, w, h]
      var A1 = [this.X(p[2]), p[4] + dz, this.Z(p[3])], B1 = [this.X(p[5]), p[7] + dz, this.Z(p[6])];
      if (Math.min(A1[1], B1[1]) > dz + cut) return;
      var d = [B1[0] - A1[0], B1[1] - A1[1], B1[2] - A1[2]], Lb = Math.hypot(d[0], d[1], d[2]); if (Lb < 1e-5) return;
      d = [d[0] / Lb, d[1] / Lb, d[2] / Lb];
      var sd = Math.abs(d[1]) > 0.98 ? [1, 0, 0] : [-d[2], 0, d[0]]; var sl = Math.hypot(sd[0], sd[2]); sd = [sd[0] / sl, 0, sd[2] / sl];
      var up = [sd[1] * d[2] - sd[2] * d[1], sd[2] * d[0] - sd[0] * d[2], sd[0] * d[1] - sd[1] * d[0]];
      var w2 = (p[8] || 0.1) * s / 2, h2 = (p[9] || p[8] || 0.1) * s / 2;
      this.obox(p[1], [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2, (A1[2] + B1[2]) / 2], [d[0] * Lb / 2, d[1] * Lb / 2, d[2] * Lb / 2], [up[0] * h2, up[1] * h2, up[2] * h2], [sd[0] * w2, 0, sd[2] * w2]);
    } else if (k === 'Q') {   // ['Q', m, x1,y1,x2,y2, z0,z1]
      var qz0 = p[6] + dz, qz1 = Math.min(p[7] + dz, dz + cut); if (qz1 - qz0 < 1e-4) return;
      var qa = [this.X(p[2]), qz0, this.Z(p[3])], qb = [this.X(p[4]), qz0, this.Z(p[5])];
      var qdx = qb[0] - qa[0], qdz = qb[2] - qa[2];
      this.quad(p[1], qa, qb, [qb[0], qz1, qb[2]], [qa[0], qz1, qa[2]], [-qdz, 0, qdx]);
    } else if (k === 'H') {   // ['H', m, z, pts, holes, down]
      var hz = p[2] + dz; if (hz > dz + cut + 1e-4) return;
      var ring = [], hl = [];
      for (var i = 0; i < p[3].length; i += 2) ring.push(new T.Vector2(p[3][i], p[3][i + 1]));
      (p[4] || []).forEach(function (h) { var r2 = []; for (var i2 = 0; i2 < h.length; i2 += 2) r2.push(new T.Vector2(h[i2], h[i2 + 1])); hl.push(r2); });
      var trs = T.ShapeUtils.triangulateShape(ring, hl), all2 = ring.concat.apply(ring, hl), dn = p[5] ? -1 : 1;
      trs.forEach(function (t3) { self.quadTri(p[1], all2[t3[0]], all2[t3[1]], all2[t3[2]], hz, dn); });
    } else if (k === 'F') {   // ['F', m, [x,y,z, x,y,z, ...]] polígono 3D (rampas, ruas em declive) — triangulado pela projeção em planta
      var fl = p[2], ring = [], v3 = [];
      for (var fi = 0; fi < fl.length; fi += 3) { ring.push(new T.Vector2(fl[fi], fl[fi + 1])); v3.push([this.X(fl[fi]), fl[fi + 2] + dz, this.Z(fl[fi + 1])]); }
      var ftr = T.ShapeUtils.triangulateShape(ring, []);
      ftr.forEach(function (t3) {
        var a = v3[t3[0]], b = v3[t3[1]], c = v3[t3[2]];
        var ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (ny >= 0) self.tri(p[1], a, b, c); else self.tri(p[1], a, c, b);
      });
    } else if (k === 'C') {   // ['C', m, x,y, z0,z1, r, seg]
      var cz0 = p[4] + dz, cz1 = Math.min(p[5] + dz, dz + cut); if (cz1 - cz0 < 1e-4) return;
      var cxx = this.X(p[2]), czz = this.Z(p[3]), rr = p[6] * s, sg = p[7] || 10;
      for (var q = 0; q < sg; q++) {
        var a0 = q / sg * Math.PI * 2, a1 = (q + 1) / sg * Math.PI * 2;
        var P0 = [cxx + Math.cos(a0) * rr, cz0, czz + Math.sin(a0) * rr], P1 = [cxx + Math.cos(a1) * rr, cz0, czz + Math.sin(a1) * rr];
        var am = (a0 + a1) / 2;
        this.quad(p[1], P0, P1, [P1[0], cz1, P1[2]], [P0[0], cz1, P0[2]], [Math.cos(am), 0, Math.sin(am)]);
        this.tri(p[1], [cxx, cz1, czz], [P1[0], cz1, P1[2]], [P0[0], cz1, P0[2]]);
      }
    } else if (k === 'T') {   // ['T', kind, x,y,z, h, seed, trunkM, leafM]
      this.tree(p[1], p[2], p[3], p[4] + dz, p[5], p[6] || 1, p[7], p[8]);
    } else if (k === 'S') {   // letreiro: vai para 'extra' (textura própria)
      this.extra.push({ p: p, dz: dz });
    }
  };
  // triângulo horizontal (tampa) com normal para cima (dir=1) ou para baixo (dir=-1)
  KitBuilder.prototype.quadTri = function (mi, A, B, C, z, dir) {
    var a = [this.X(A.x), z, this.Z(A.y)], b = [this.X(B.x), z, this.Z(B.y)], c = [this.X(C.x), z, this.Z(C.y)];
    var ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    var ny = uz * vx - ux * vz;
    if ((ny > 0) !== (dir > 0)) { var t = b; b = c; c = t; }
    this.tri(mi, a, b, c);
  };
  KitBuilder.prototype.tree = function (kind, x, y, z, h, seed, tm, lm) {
    var r = rnd((seed * 7717 + 3) | 0), self = this, s = this.ctx.s || 1;
    var cx = this.X(x), cz = this.Z(y);
    if (kind === 'palm') {
      var seg = 7, top = z + h, lean = [(r() - 0.5) * 0.08 * h, (r() - 0.5) * 0.08 * h];
      for (var i = 0; i < seg; i++) {
        var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, r0 = 0.24 * s, r1 = 0.16 * s;
        var b0 = [cx + Math.cos(a0) * r0, z, cz + Math.sin(a0) * r0], b1 = [cx + Math.cos(a1) * r0, z, cz + Math.sin(a1) * r0];
        var t0 = [cx + lean[0] + Math.cos(a0) * r1, top, cz + lean[1] + Math.sin(a0) * r1], t1 = [cx + lean[0] + Math.cos(a1) * r1, top, cz + lean[1] + Math.sin(a1) * r1];
        var am = (a0 + a1) / 2; this.quad(tm, b0, b1, t1, t0, [Math.cos(am), 0, Math.sin(am)]);
      }
      var fr = 14, hx = cx + lean[0], hz = cz + lean[1];
      for (var f = 0; f < fr; f++) {
        var ang = f / fr * Math.PI * 2 + r() * 0.4, len = (2.4 + r() * 1.2) * s * Math.min(1.3, h / 8), droop = 0.5 + r() * 0.5;
        var dx = Math.cos(ang), dz2 = Math.sin(ang), px = -dz2, pz = dx, prev = null;
        for (var k = 0; k <= 4; k++) {
          var t = k / 4, dd = t * len, yy = top + 0.35 * s + Math.sin(t * Math.PI * 0.8) * 0.9 * s - t * t * droop * 2.2 * s;
          var wdt = (0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05)) + 0.05) * s;
          var L = [hx + dx * dd + px * wdt, yy, hz + dz2 * dd + pz * wdt], Rr = [hx + dx * dd - px * wdt, yy, hz + dz2 * dd - pz * wdt];
          if (prev) this.quad(lm, prev[0], prev[1], Rr, L, [0, 1, 0]);
          prev = [L, Rr];
        }
      }
    } else {
      var th = h * (kind === 'bush' ? 0.1 : 0.42);
      if (kind !== 'bush') for (var j = 0; j < 6; j++) {
        var a2 = j / 6 * Math.PI * 2, a3 = (j + 1) / 6 * Math.PI * 2, rt = 0.16 * s * Math.max(1, h / 7);
        this.quad(tm, [cx + Math.cos(a2) * rt, z, cz + Math.sin(a2) * rt], [cx + Math.cos(a3) * rt, z, cz + Math.sin(a3) * rt],
          [cx + Math.cos(a3) * rt * 0.7, z + th + 0.5, cz + Math.sin(a3) * rt * 0.7], [cx + Math.cos(a2) * rt * 0.7, z + th + 0.5, cz + Math.sin(a2) * rt * 0.7], [Math.cos((a2 + a3) / 2), 0, Math.sin((a2 + a3) / 2)]);
      }
      var blobs = kind === 'bush' ? 2 : 4, R0 = (kind === 'bush' ? 0.45 : 0.3) * h * s;
      for (var b2 = 0; b2 < blobs; b2++) {
        var bx = cx + (r() - 0.5) * R0 * 0.9, bz = cz + (r() - 0.5) * R0 * 0.9, by = z + th + R0 * (0.7 + r() * 0.5), br = R0 * (0.6 + r() * 0.35);
        this.blob(lm, [bx, by, bz], br, r);
      }
    }
  };
  KitBuilder.prototype.blob = function (mi, c, R, r) {   // esfera facetada (copa)
    var rows = 4, cols = 7, pts = [];
    for (var i = 0; i <= rows; i++) {
      var row = [], ph = i / rows * Math.PI;
      for (var j = 0; j < cols; j++) {
        var th = j / cols * Math.PI * 2 + (i % 2) * 0.4, k = 1 + (r() - 0.5) * 0.25;
        row.push([c[0] + Math.sin(ph) * Math.cos(th) * R * k, c[1] + Math.cos(ph) * R * 0.8 * k, c[2] + Math.sin(ph) * Math.sin(th) * R * k]);
      }
      pts.push(row);
    }
    for (var i2 = 0; i2 < rows; i2++) for (var j2 = 0; j2 < cols; j2++) {
      var a = pts[i2][j2], b = pts[i2][(j2 + 1) % cols], cc = pts[i2 + 1][(j2 + 1) % cols], d = pts[i2 + 1][j2];
      var m = [(a[0] + cc[0]) / 2 - c[0], (a[1] + cc[1]) / 2 - c[1], (a[2] + cc[2]) / 2 - c[2]];
      this.quad(mi, a, b, cc, d, m);
    }
  };
  KitBuilder.prototype.build = function (group, mats, noShadow) {
    var T = this.T, self = this;
    Object.keys(this.buf).forEach(function (mi) {
      var b = self.buf[mi]; if (!b.p.length) return;
      var geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(b.u, 2));
      geo.computeBoundingSphere();
      var mat = mats[mi]; if (!mat) return;
      var m = new T.Mesh(geo, mat), kd = mat.userData.kit || {};
      m.castShadow = !noShadow && kd.cast !== false; m.receiveShadow = kd.recv !== false; m.renderOrder = kd.order || 0;
      m.userData.keep = true;
      group.add(m);
    });
    // letreiros (textura de texto própria)
    this.extra.forEach(function (it) {
      var p = it.p, dz = it.dz;
      var ax = self.X(p[1]), az = self.Z(p[2]), bx = self.X(p[3]), bz = self.Z(p[4]), z0 = p[5] + dz, z1 = p[6] + dz, d = p[7] || 0.05;
      var L = Math.hypot(bx - ax, bz - az), hgt = z1 - z0; if (L < 1e-3) return;
      var cv = document.createElement('canvas'), W = 1024, Hc = Math.max(64, Math.round(1024 * hgt / L)); cv.width = W; cv.height = Math.min(1024, Hc);
      var g = cv.getContext('2d'); g.fillStyle = p[9] || '#4b4e52'; g.fillRect(0, 0, W, cv.height);
      g.fillStyle = p[10] || '#e9e4da'; var fs = Math.round(cv.height * 0.5); g.font = '600 ' + fs + 'px "Montserrat","Helvetica Neue",Arial,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      var parts = String(p[8] || '').split('|');
      parts.forEach(function (t, i) { g.fillText(t, W * (i + 0.5) / parts.length, cv.height * 0.54); });
      var tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
      var side = new T.MeshStandardMaterial({ color: p[9] || '#4b4e52', roughness: 0.8 });
      var front = new T.MeshStandardMaterial({ map: tex, roughness: 0.7 });
      if (mats.__clip) { side.clippingPlanes = front.clippingPlanes = [mats.__clip]; }
      var geo = new T.BoxGeometry(L, hgt, d);
      var mesh = new T.Mesh(geo, [side, side, side, side, front, side]);
      var nx = -(bz - az) / L, nz = (bx - ax) / L;   // frente = normal à esquerda do segmento
      mesh.position.set((ax + bx) / 2 + nx * d / 2, (z0 + z1) / 2, (az + bz) / 2 + nz * d / 2);
      var target = new T.Vector3(mesh.position.x + nx, mesh.position.y, mesh.position.z + nz);
      mesh.lookAt(target);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.keep = true;
      group.add(mesh);
    });
  };
  function buildKit(THREE, ctx, mats, prims, instances, parts, cut) {
    var kb = new KitBuilder(THREE, ctx), g = new THREE.Group(); g.name = 'kit';
    (prims || []).forEach(function (p) { kb.prim(p, 0, cut); });
    (instances || []).forEach(function (ins) {
      var part = parts && parts[ins[0]]; if (!part) return;
      var zs = Array.isArray(ins[1]) ? ins[1] : [ins[1]];
      zs.forEach(function (z) { part.forEach(function (p) { kb.prim(p, z, cut); }); });
    });
    kb.build(g, mats);
    return g;
  }

  // Céu procedural (gradiente) — usado como ambiente de reflexo (vidros) e, opcionalmente, como fundo
  function skyTexture(THREE, spec) {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256; var g = c.getContext('2d');
    var s = spec || {};
    var gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, s.top || '#5f8fbf'); gr.addColorStop(0.42, s.mid || '#a9c6de'); gr.addColorStop(0.5, s.horizon || '#e9eef0');
    gr.addColorStop(0.52, s.ground || '#9a9f9f'); gr.addColorStop(1, s.bottom || '#5d6163');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    // nuvens suaves
    var r = rnd(42);
    for (var i = 0; i < 26; i++) {
      var x = r() * 512, y = 40 + r() * 70, rw = 30 + r() * 70;
      var cg = g.createRadialGradient(x, y, 1, x, y, rw); cg.addColorStop(0, 'rgba(255,255,255,' + (0.18 + r() * 0.2) + ')'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cg; g.fillRect(x - rw, y - rw, rw * 2, rw * 2);
    }
    var t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildBuildingKit(THREE, model, ctx, clip, ghostClip) {
    var B = model.building, K = B.kit;
    var mats = kitMaterials(THREE, model.materials || K.materials, clip);
    var group = buildKit(THREE, ctx, mats, K.prims, K.instances, K.parts);
    group.name = 'building';
    var gp = [];
    (B.ghosts || []).forEach(function (gh) {
      var pts = []; for (var i = 0; i < gh.poly.length; i += 2) pts.push(ctx.P([gh.poly[i], gh.poly[i + 1]]));
      (gh.z || []).forEach(function (z) { for (var k = 0; k < pts.length; k++) { var a = pts[k], c = pts[(k + 1) % pts.length]; gp.push(a.x, z, a.z, c.x, z, c.z); } });
      if (gh.z && gh.z.length > 1) { var z0 = gh.z[0], z1 = gh.z[gh.z.length - 1]; pts.forEach(function (a) { gp.push(a.x, z0, a.z, a.x, z1, a.z); }); }
    });
    var gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    var ghost = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x5d6b78, transparent: true, opacity: 0.3, clippingPlanes: [ghostClip] }));
    ghost.visible = false;
    var labels = (B.labels || []).map(function (l) { var p = ctx.P(l.at); return { text: l.text, x: p.x, y: l.z || 0, z: p.z }; });
    return { group: group, ghost: ghost, labels: labels, mats: mats };
  }

  // Planta humanizada aplicada como piso do pavimento (recortada no contorno)
  function buildUnderlay(THREE, def, ctx, M, base) {
    var u = def.underlay, g = new THREE.Group();
    var bb = u.bounds;
    var outline = def.outline || [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]];
    var pts = outline.map(ctx.P);
    var shape = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
    var slab = def.slab || 0.15;
    if (!u.noSlab) {
      var sm = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false }), [M.slab, M.slab]);
      sm.rotation.x = -Math.PI / 2; sm.position.y = -slab - 0.004; sm.receiveShadow = true; sm.castShadow = true; g.add(sm);
    }
    var geo = new THREE.ShapeGeometry(shape), pos = geo.attributes.position, uv = geo.attributes.uv;
    var b0 = ctx.P([bb[0], bb[1]]), b1 = ctx.P([bb[2], bb[3]]);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = -pos.getY(i);
      uv.setXY(i, (x - b0.x) / (b1.x - b0.x), 1 - (z - b0.z) / (b1.z - b0.z));
    }
    var src = u.src; try { if (base && !/^data:/.test(src)) src = new URL(src, base).href; } catch (e) {}
    // polygonOffset: a planta fica "colada" na laje sem disputar o z-buffer (evita cintilação a distância)
    var mat = new THREE.MeshStandardMaterial({ roughness: 0.85, color: 0xe8e4dc, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    var tex = new THREE.TextureLoader().load(src, function () { mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; }, undefined, function () {
      console.warn('[Bezerra3D] Imagem de piso não encontrada: ' + src + ' — envie as imagens ul_*.jpg para a mesma pasta do JSON, informe assetsBase ou use o JSON "completo" (imagens embutidas).');
    });
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    var m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2; m.position.y = u.lift != null ? u.lift : 0.03; m.receiveShadow = true; m.renderOrder = 1;
    var xs = pts.map(function (p) { return p.x; }), zs = pts.map(function (p) { return p.z; });
    var c = polyCentroid(pts);
    m.userData.room = { name: def.name || '', cx: c.x, cz: c.z, pts: pts, center: { x: c.x, z: c.z },
      size: Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, zs) - Math.min.apply(null, zs)) };
    g.add(m);
    return { group: g, mesh: m };
  }

  // Junta malhas estáticas por material (milhares de peças viram poucas chamadas de desenho)
  function mergeStatic(THREE, root) {
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    var m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), n = new THREE.Vector3();
    var buckets = {}, order = [], removed = [], geos = [];
    root.traverse(function (o) {
      if (!o.isMesh || o.userData.keep || o === root) return;
      var g = o.geometry, pos = g && g.attributes.position; if (!pos) return;
      var mats = Array.isArray(o.material) ? o.material : null;
      var nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
      m4.multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(m4);
      var groups = mats && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
      groups.forEach(function (gr) {
        var mat = mats ? mats[gr.materialIndex] : o.material; if (!mat) return;
        var key = mat.uuid + (o.castShadow ? '|s' : '') + (o.receiveShadow ? '|r' : '');
        var b = buckets[key];
        if (!b) { b = buckets[key] = { mat: mat, p: [], n: [], u: [], cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder }; order.push(key); }
        var end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
        for (var k = gr.start; k < end; k++) {
          var i = idx ? idx.getX(k) : k;
          v.fromBufferAttribute(pos, i).applyMatrix4(m4); b.p.push(v.x, v.y, v.z);
          if (nor) { n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); b.n.push(n.x, n.y, n.z); } else b.n.push(0, 1, 0);
          if (uv) b.u.push(uv.getX(i), uv.getY(i)); else b.u.push(0, 0);
        }
      });
      removed.push(o); if (geos.indexOf(g) < 0) geos.push(g);
    });
    removed.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    // remove grupos vazios
    var empty = []; root.traverse(function (o) { if (o !== root && o.isGroup && !o.children.length) empty.push(o); });
    empty.forEach(function (o) { if (o.parent) o.parent.remove(o); });
    geos.forEach(function (g) { g.dispose(); });
    order.forEach(function (key) {
      var b = buckets[key], geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      var m = new THREE.Mesh(geo, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.ro || 0;
      root.add(m);
    });
  }

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function Viewer(libs, model, host, opts) {
    var THREE = libs.THREE, self = this;
    this.THREE = THREE; this.model = model; this.opts = opts || {};
    this.ctx = prepare(model);
    this.M = makeMaterials(THREE);
    this.tex = {};
    this.state = { lowWalls: false, furniture: CFG.showFurniture, labels: CFG.showLabels, auto: this.opts.autoRotate != null ? this.opts.autoRotate : CFG.autoRotate };
    this.stage = host.stage; this.labelLayer = host.labels;

    var w = this.stage.clientWidth || 800, h = this.stage.clientHeight || 600;
    var r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    r.setSize(w, h, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    var rs = model.render || {};
    if (rs.tone === 'aces') { r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = rs.exposure || 1; }
    this.stage.insertBefore(r.domElement, this.stage.firstChild);

    var scene = this.scene = new THREE.Scene();
    // near maior em maquetes grandes (edifícios): melhora a precisão do z-buffer e evita cintilação
    var cam = this.camera = new THREE.PerspectiveCamera(38, w / h, model.building ? 0.6 : 0.1, 2000);

    var R = this.R = Math.max(this.ctx.sizeX, this.ctx.sizeZ, model.building ? this.ctx.top * 0.8 : 0, 4);
    if (rs.env || (model.building && rs.env !== false)) {
      try {
        var pm = new THREE.PMREMGenerator(r), skyT = skyTexture(THREE, rs.sky);
        scene.environment = pm.fromEquirectangular(skyT).texture; pm.dispose();
        if (rs.skyBg) scene.background = skyT;
      } catch (e) { }
    }
    if (rs.fog) scene.fog = new THREE.Fog(rs.fog[2] || 0xdde6ec, rs.fog[0], rs.fog[1]);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b8, rs.hemi != null ? rs.hemi : 1.35));
    var sun = new THREE.DirectionalLight(rs.sunColor || 0xfff6ea, rs.sunI != null ? rs.sunI : 2.1);
    var tall = !!model.building;
    if (rs.sun) { var sl = Math.hypot(rs.sun[0], rs.sun[1], rs.sun[2]) || 1; sun.position.set(rs.sun[0] / sl * R * 1.6, rs.sun[2] / sl * R * 1.6, rs.sun[1] / sl * R * 1.6); }
    else sun.position.set(-R * 0.45, R * (tall ? 1.4 : 0.9), R * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(tall ? 4096 : 2048, tall ? 4096 : 2048);
    var sc = sun.shadow.camera, ext = R * (tall ? 1.1 : 0.75); sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.near = 0.5; sc.far = R * (tall ? 5 : 3);
    if (tall) sun.target.position.set(0, this.ctx.top * 0.3, 0);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    scene.add(sun); scene.add(sun.target);
    var fill = new THREE.DirectionalLight(0xdfe8ff, rs.fillI != null ? rs.fillI : 0.45); fill.position.set(-sun.position.x, R * 0.5, -sun.position.z); scene.add(fill);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 6, R * 6), new THREE.ShadowMaterial({ opacity: rs.groundShadow != null ? rs.groundShadow : 0.13 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -SLAB - 0.001; ground.receiveShadow = true;
    scene.add(ground);

    this.root = new THREE.Group(); scene.add(this.root);
    var matSpecs = model.materials || (model.building && model.building.kit && model.building.kit.materials);
    this.levelMats = matSpecs ? kitMaterials(THREE, matSpecs, null) : null;
    this.kitParts = (model.building && model.building.kit && model.building.kit.parts) || model.parts || {};
    var ctxv = this.ctx, Mv = this.M, texv = this.tex, rootv = this.root;
    this.state.level = -1; this.state.explode = false; this.explode = 0;
    // pasta das imagens de piso: opção assetsBase (página) > assetsBase do modelo > pasta do próprio JSON
    var assetBase = model.__base || null;
    try {
      var ab = this.opts.assetsBase || model.assetsBase;
      if (ab) assetBase = new URL(String(ab).replace(/\/?$/, '/'), model.__base || location.href).href;
    } catch (e) { }
    this.levels = levelsOf(model).map(function (def, i) {
      var g = new THREE.Group(); g.name = 'level-' + i;
      var elev = def.elevation || 0;
      g.position.y = elev; rootv.add(g);
      var floors = buildFloors(THREE, def, ctxv, Mv, texv);
      floors.rooms.forEach(function (rm) { rm.level = i; });
      g.add(floors.group);
      var size = null;
      if (def.underlay) {
        var ul = buildUnderlay(THREE, def, ctxv, Mv, assetBase);
        ul.mesh.userData.room.level = i;
        g.add(ul.group);
        floors.group.add(ul.mesh); // o raycast (duplo clique) usa os filhos diretos do grupo de pisos
        size = ul.mesh.userData.room;
      }
      return { def: def, group: g, floors: floors, elev: elev, drop: 0, walls: null, furn: null, info: size };
    });
    if (model.building) {
      r.localClippingEnabled = true;
      this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
      this.ghostClip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      if (model.building.kit) this.building = buildBuildingKit(THREE, model, ctxv, this.clip, this.ghostClip);
      else { this.building = buildBuilding(THREE, model, ctxv, Mv, this.clip, this.ghostClip); mergeStatic(THREE, this.building.group); }
      rootv.add(this.building.group); rootv.add(this.building.ghost);
      this.levels.forEach(function (L) { L.group.visible = !!L.def.exterior; });
    }
    this.rebuildWalls(); this.rebuildFurniture();
    this.makeLabels();

    var ctl = this.controls = new libs.OrbitControls(cam, r.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.minDistance = 2; ctl.maxDistance = Math.max(R * 3.5, this.fitDistance(R, 2));
    ctl.maxPolarAngle = Math.PI / 2 - 0.04;
    ctl.screenSpacePanning = true;
    ctl.autoRotateSpeed = 0.7;
    ctl.target.set(0, 0, 0);
    ctl.addEventListener('start', function () { self.tween = null; if (self.state.auto) self.setAuto(false); });

    this.raycaster = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this._dbl = function (e) { self.focusAt(e.clientX, e.clientY); };
    r.domElement.addEventListener('dblclick', this._dbl);
    var lastTap = 0;
    this._touch = function (e) {
      if (e.changedTouches.length !== 1 || e.touches.length) return;
      var now = Date.now(); var t = e.changedTouches[0];
      if (now - lastTap < 300) self.focusAt(t.clientX, t.clientY);
      lastTap = now;
    };
    r.domElement.addEventListener('touchend', this._touch);

    // Maquete de um pavimento só (lockLevel): abre já cortada nesse pavimento
    if (this.building && model.lockLevel != null && this.levels[model.lockLevel]) this.applyLevel(model.lockLevel);

    // Intro: vista de cima girando até a perspectiva, paredes "subindo"
    this.setSpherical(this.topView().r * 1.25, 0.12, -1.1, new THREE.Vector3(0, 0, 0));
    this.levels.forEach(function (L) { L.walls.group.scale.y = 0.001; L.furn.group.scale.y = 0.001; if (L.kitg) L.kitg.scale.y = 0.001; });
    this.labelLayer.style.opacity = '0';
    this.intro = { t0: performance.now(), dur: 2300 };
    this.flyTo(this.defaultView(), 2300, function () { if (self.state.auto) self.setAuto(true); });

    this.ro = new ResizeObserver(function () { self.resize(); });
    this.ro.observe(this.stage);
    this._v = new THREE.Vector3();
    var loop = function (now) { self.raf = requestAnimationFrame(loop); self.frame(now); };
    this.raf = requestAnimationFrame(loop);
  }

  // Distância que enquadra a maquete inteira, considerando a proporção da tela (retrato/paisagem)
  Viewer.prototype.fitDistance = function (size, margin) {
    var vf = this.camera.fov * Math.PI / 180, asp = this.camera.aspect || 1;
    var hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    return (size / 2) * (margin || 1.15) / Math.tan(Math.min(vf, hf) / 2);
  };
  // Altura do ponto de mira: centro do pavimento selecionado ou do conjunto
  Viewer.prototype.focusY = function () {
    var s = this.state;
    if (s.level >= 0) return this.levels[s.level].elev + (this.building ? 1 : 0);
    if (this.building) return this.ctx.top * 0.46;
    return this.levels.length > 1 ? (this.ctx.top + this.explode * 4.2 * (this.levels.length - 1)) * 0.35 : 0;
  };
  Viewer.prototype.defaultView = function () {
    var diag = Math.hypot(this.ctx.sizeX, this.ctx.sizeZ);
    if (this.building) {
      var st = this.state, L = st.level >= 0 ? this.levels[st.level] : null, tg = new this.THREE.Vector3(0, this.focusY(), 0);
      var rv = (this.model.render && this.model.render.view) || {};
      var lm = rv.levelMargin || 1.6, lphi = rv.levelPhi || 0.85, lth = rv.levelTheta != null ? rv.levelTheta : 0.5;   // enquadramento de um pavimento (opcional no JSON)
      if (L && L.info) { tg.x = L.info.center.x; tg.z = L.info.center.z; return { r: Math.max(8, this.fitDistance(L.info.size * lm, 1.0)), phi: lphi, theta: lth, target: tg }; }
      if (L) return { r: Math.max(8, this.fitDistance(diag * 1.25, 1.0)), phi: lphi, theta: lth, target: tg };
      return { r: this.fitDistance(Math.max(this.ctx.top * 1.1, diag), rv.margin || 1.35), phi: rv.phi || 1.2, theta: rv.theta != null ? rv.theta : 0.62, target: tg };
    }
    var extra = this.levels.length > 1 && this.state.level < 0 ? 1.12 : 1.0;
    return { r: Math.max(6, this.fitDistance(diag, extra)), phi: 0.95, theta: 0.55, target: new this.THREE.Vector3(0, this.focusY(), 0) };
  };
  Viewer.prototype.topView = function () {
    var vf = this.camera.fov * Math.PI / 180, asp = this.camera.aspect || 1;
    var hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    var d = Math.max((this.ctx.sizeZ / 2) / Math.tan(vf / 2), (this.ctx.sizeX / 2) / Math.tan(hf / 2)) * 1.12 + this.ctx.H;
    var y = this.state.level >= 0 ? this.levels[this.state.level].elev : 0;
    var L = this.state.level >= 0 ? this.levels[this.state.level] : null;
    if (this.building && L && L.info) {
      var sz = L.info.size * 1.15;
      return { r: Math.max(8, sz / 2 / Math.tan(Math.min(vf, hf) / 2) + 3), phi: 0.0001, theta: 0, target: new this.THREE.Vector3(L.info.center.x, y, L.info.center.z) };
    }
    if (this.building && !L) d += this.ctx.top;
    return { r: Math.max(6, d), phi: 0.0001, theta: 0, target: new this.THREE.Vector3(0, y, 0) };
  };
  Viewer.prototype.setSpherical = function (r, phi, theta, target) {
    var c = this.camera, sp = Math.sin(phi);
    c.position.set(target.x + r * sp * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * sp * Math.cos(theta));
    c.lookAt(target);
    if (this.controls) this.controls.target.copy(target);
  };
  Viewer.prototype.flyTo = function (v, dur, done) {
    var THREE = this.THREE, c = this.camera, tg = this.controls ? this.controls.target.clone() : new THREE.Vector3();
    var off = c.position.clone().sub(tg), sph = new THREE.Spherical().setFromVector3(off);
    var dt = v.theta - sph.theta; dt = Math.atan2(Math.sin(dt), Math.cos(dt));
    this.tween = { t0: performance.now(), dur: dur || 900, from: { r: sph.radius, phi: sph.phi, theta: sph.theta, tg: tg },
      to: { r: v.r, phi: v.phi, theta: sph.theta + dt, tg: v.target.clone() }, done: done };
  };
  Viewer.prototype.frame = function (now) {
    var tw = this.tween;
    if (tw) {
      var k = Math.min(1, (now - tw.t0) / tw.dur), e = ease(k), f = tw.from, t = tw.to;
      var tg = f.tg.clone().lerp(t.tg, e);
      this.setSpherical(f.r + (t.r - f.r) * e, f.phi + (t.phi - f.phi) * e, f.theta + (t.theta - f.theta) * e, tg);
      if (k >= 1) { this.tween = null; if (tw.done) tw.done(); }
    }
    if (this.intro) {
      var q = Math.min(1, (now - this.intro.t0) / this.intro.dur);
      var wq = ease(Math.min(1, Math.max(0, (q - 0.15) / 0.6)));
      var fq = ease(Math.min(1, Math.max(0, (q - 0.45) / 0.5)));
      var lq = ease(Math.min(1, Math.max(0, (q - 0.25) / 0.6)));
      var bld = !!this.building;
      this.levels.forEach(function (L, i) {
        L.walls.group.scale.y = Math.max(0.001, wq); if (L.kitg) L.kitg.scale.y = Math.max(0.001, wq);
        L.furn.group.scale.y = Math.max(0.001, fq);
        L.drop = (i > 0 && !bld) ? (1 - lq) * 6 : 0;   // pavimentos superiores "pousam" sobre o inferior
      });
      if (this.building) this.building.group.scale.y = Math.max(0.001, ease(Math.min(1, Math.max(0, (q - 0.05) / 0.75))));
      this.labelLayer.style.opacity = String(Math.max(0, (q - 0.7) / 0.3));
      if (q >= 1) { this.intro = null; this.labelLayer.style.opacity = ''; }
    }
    var ex = this.state.explode && this.state.level < 0 ? 1 : 0;
    this.explode += (ex - this.explode) * 0.12;
    if (Math.abs(ex - this.explode) < 0.001) this.explode = ex;
    for (var li = 0; li < this.levels.length; li++) {
      var L = this.levels[li];
      L.group.position.y = L.elev + L.drop + this.explode * 4.2 * li;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  };
  Viewer.prototype.resize = function () {
    var w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };
  Viewer.prototype.rebuildWalls = function () {
    var self = this, cut = this.state.lowWalls ? CFG.lowWallHeight : 1e9;
    this.levels.forEach(function (L) {
      if ((L.def.kit || L.def.kitInstances) && self.levelMats) {
        var ksy = L.kitg ? L.kitg.scale.y : 1;
        if (L.kitg) { L.group.remove(L.kitg); L.kitg.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
        L.kitg = buildKit(self.THREE, self.ctx, self.levelMats, L.def.kit, L.def.kitInstances, self.kitParts, cut);
        L.kitg.scale.y = ksy; L.group.add(L.kitg);
      }
      var sy = L.walls ? L.walls.group.scale.y : 1;
      if (L.walls) { L.group.remove(L.walls.group); L.walls.geo.dispose(); }
      L.walls = buildWalls(self.THREE, L.def, self.ctx, self.M, cut);
      mergeStatic(self.THREE, L.walls.group);
      L.walls.group.scale.y = sy;
      L.group.add(L.walls.group);
    });
  };
  Viewer.prototype.rebuildFurniture = function () {
    var self = this, cut = this.state.lowWalls ? CFG.lowWallHeight + 0.4 : 1e9;
    this.levels.forEach(function (L) {
      var sy = L.furn ? L.furn.group.scale.y : 1;
      if (L.furn) { L.group.remove(L.furn.group); L.furn.geos.forEach(function (g) { g.dispose(); }); }
      L.furn = buildFurniture(self.THREE, L.def, self.ctx, self.M, cut);
      mergeStatic(self.THREE, L.furn.group);
      L.furn.group.scale.y = sy;
      L.furn.group.visible = self.state.furniture;
      L.group.add(L.furn.group);
    });
  };
  Viewer.prototype.makeLabels = function () {
    var self = this;
    var layer = this.labelLayer; layer.innerHTML = '';
    var items = [];
    var levels = this.levels;
    // um rótulo fica "coberto" quando há piso de um pavimento acima sobre ele
    function covered(li, x, z) {
      for (var k = li + 1; k < levels.length; k++) {
        var rs = levels[k].floors.rooms;
        for (var q = 0; q < rs.length; q++) if (pointInPoly(x, z, rs[q].pts)) return true;
      }
      return false;
    }
    this.levels.forEach(function (L, li) {
      L.floors.rooms.forEach(function (r) {
        if (!r.name) return;
        var d = el('div', 'bz3d-label', esc(r.name) + (r.area ? '<small>' + esc(r.area) + (typeof r.area === 'number' ? ' m²' : '') + '</small>' : ''));
        layer.appendChild(d); items.push({ el: d, x: r.cx, y: 0.9, z: r.cz, L: L, cov: covered(li, r.cx, r.cz) });
      });
      L.walls.labels.forEach(function (l) {
        var d = el('div', 'bz3d-label bz3d-entr', esc(l.text));
        layer.appendChild(d); items.push({ el: d, x: l.x, y: l.y, z: l.z, L: L, cov: covered(li, l.x, l.z) });
      });
      (L.def.labels || []).forEach(function (l) {
        var p = self.ctx.P(l.at);
        var d = el('div', 'bz3d-label' + (l.accent ? ' bz3d-entr' : ''), esc(l.text) + (l.sub ? '<small>' + esc(l.sub) + '</small>' : ''));
        layer.appendChild(d); items.push({ el: d, x: p.x, y: 1.2, z: p.z, L: L, cov: false, only: !!self.building });
      });
    });
    if (this.building) this.building.labels.forEach(function (l) {
      var d = el('div', 'bz3d-label bz3d-bld', esc(l.text));
      layer.appendChild(d); items.push({ el: d, x: l.x, y: l.y, z: l.z, L: { group: self.building.group }, bld: true });
    });
    this.labelItems = items;
  };
  Viewer.prototype.updateLabels = function () {
    if (!this.state.labels) return;
    var w = this.stage.clientWidth, h = this.stage.clientHeight, v = this._v, cam = this.camera;
    for (var i = 0; i < this.labelItems.length; i++) {
      var it = this.labelItems[i];
      if (!it.L.group.visible || (it.cov && this.state.level < 0 && this.explode < 0.5) ||
          (it.bld && this.state.level >= 0) || (this.building && !it.bld && this.state.level >= 0 && it.L !== this.levels[this.state.level]) || (this.building && !it.bld && this.state.level < 0 && it.L.def && !it.L.def.labelsInFacade)) { it.el.style.display = 'none'; continue; }
      v.set(it.x, it.y + it.L.group.position.y, it.z).project(cam);
      if (v.z > 1 || v.z < -1) { it.el.style.display = 'none'; continue; }
      it.el.style.display = '';
      it.el.style.transform = 'translate(' + ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-50%)';
    }
  };
  Viewer.prototype.focusAt = function (cx, cy) {
    var rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    var objs = [];
    this.levels.forEach(function (L) { if (L.group.visible) objs = objs.concat(L.floors.group.children); });
    var hits = this.raycaster.intersectObjects(objs, false);
    if (!hits.length) return;
    var room = hits[0].object.userData.room;
    var ry = this.levels[room.level].group.position.y;
    var THREE = this.THREE;
    var sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    this.setAuto(false);
    this.flyTo({ r: Math.max(4.5, room.size * 1.9), phi: Math.min(sph.phi, 0.9), theta: sph.theta,
      target: new THREE.Vector3(room.center.x, ry, room.center.z) }, 1000);
  };
  Viewer.prototype.setAuto = function (on) {
    this.state.auto = on; this.controls.autoRotate = on;
    if (this.onState) this.onState();
  };
  Viewer.prototype.toggle = function (what) {
    var s = this.state;
    if (what === 'auto') this.setAuto(!s.auto);
    else if (what === 'lowWalls') { s.lowWalls = !s.lowWalls; this.rebuildWalls(); this.rebuildFurniture(); if (this.building && s.level >= 0) this.clip.constant = this.cutFor(this.levels[s.level]); }
    else if (what === 'furniture') { s.furniture = !s.furniture; this.levels.forEach(function (L) { L.furn.group.visible = s.furniture; }); }
    else if (what === 'explode') { s.explode = !s.explode; if (s.explode && s.level >= 0) this.setLevel(-1); else { this.setAuto(false); this.flyTo(this.keepAngles(), 900); } }
    else if (what === 'labels') { s.labels = !s.labels; this.labelLayer.classList.toggle('bz3d-off', !s.labels); }
    if (this.onState) this.onState();
  };
  // Mantém o ângulo atual da câmera, reenquadrando o alvo (usado ao trocar de pavimento)
  Viewer.prototype.keepAngles = function () {
    var THREE = this.THREE, sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    var d = this.defaultView();
    return { r: Math.max(d.r * 0.85, Math.min(sph.radius, d.r * 1.3)), phi: Math.min(Math.max(sph.phi, 0.35), 1.2), theta: sph.theta, target: d.target };
  };
  // Altura do corte do edifício ao mostrar um pavimento (tudo acima some; paredes baixas cortam mais embaixo)
  Viewer.prototype.cutFor = function (L) {
    if (this.state.lowWalls) return L.elev + CFG.lowWallHeight;
    return L.def.cut != null ? L.def.cut : L.elev + 0.01;
  };
  // Aplica o corte do edifício para mostrar o pavimento i (sem animar a câmera)
  Viewer.prototype.applyLevel = function (i) {
    var s = this.state; s.level = i;
    var L = i >= 0 ? this.levels[i] : null;
    this.clip.constant = L ? this.cutFor(L) : 1e6;
    this.building.ghost.visible = !!L && this.model.lockLevel == null;
    if (L) this.ghostClip.constant = -(L.elev + (L.def.height || this.ctx.H) + 0.05);
    this.levels.forEach(function (K, k) { K.group.visible = L ? (k === i || (!!K.def.exterior && K.elev < L.elev)) : !!K.def.exterior; });
  };
  Viewer.prototype.setLevel = function (i) {
    var s = this.state; s.level = i;
    if (this.building) {
      if (this.model.lockLevel != null) i = this.model.lockLevel;   // maquete de um pavimento só
      this.applyLevel(i);
      this.setAuto(false);
      this.flyTo(this.defaultView(), 1300);
      if (this.onState) this.onState();
      return;
    }
    if (i >= 0) s.explode = false;
    this.levels.forEach(function (L, k) { L.group.visible = i < 0 || k === i; });
    this.setAuto(false);
    this.flyTo(this.keepAngles(), 900);
    if (this.onState) this.onState();
  };
  Viewer.prototype.view = function (name) {
    this.setAuto(false);
    this.flyTo(name === 'top' ? this.topView() : this.defaultView(), 1100);
  };
  Viewer.prototype.dispose = function () {
    cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    this.controls.dispose();
    var M = this.M, tex = this.tex;
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    });
    Object.keys(M).forEach(function (k) { M[k].dispose(); });
    Object.keys(tex).forEach(function (k) { tex[k].dispose(); });
    this.renderer.dispose();
    if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
    var cv = this.renderer.domElement; if (cv.parentNode) cv.parentNode.removeChild(cv);
  };

  // ---------------------------------------------------------------------------
  // UI (modal e inline)
  // ---------------------------------------------------------------------------
  function buildShell(container, model, opts, isModal) {
    var L = CFG.locale;
    var wrap = el('div', 'bz3d-root ' + (isModal ? 'bz3d-modal' : 'bz3d-inline'));
    wrap.style.setProperty('--bz3d-accent', CFG.accent); wrap.style.setProperty('--bz3d-dark', CFG.dark);
    var head = el('div', 'bz3d-head');
    var logo = el('div', 'bz3d-logo', CFG.logoUrl ? '<img alt="" src="' + esc(CFG.logoUrl) + '">' : esc(CFG.brandShort));
    var titles = el('div', 'bz3d-titles',
      '<div class="bz3d-brand">' + esc(CFG.brand) + '</div>' +
      '<div class="bz3d-title">' + esc(opts.title || model.title || 'Maquete 3D') + '</div>' +
      ((opts.subtitle || model.subtitle) ? '<div class="bz3d-sub">' + esc(opts.subtitle || model.subtitle) + '</div>' : ''));
    head.appendChild(logo); head.appendChild(titles);
    var closeBtn = null;
    if (isModal) { closeBtn = el('button', 'bz3d-x', ICONS.close); closeBtn.setAttribute('aria-label', L.close); closeBtn.type = 'button'; head.appendChild(closeBtn); }
    var stage = el('div', 'bz3d-stage');
    var labels = el('div', 'bz3d-labels');
    var loader = el('div', 'bz3d-loader', '<div class="bz3d-spin"></div><div>' + esc(L.loading) + '</div>');
    stage.appendChild(labels); stage.appendChild(loader);
    if (L.disclaimer && opts.disclaimer !== false) {
      var dt = String(L.disclaimer), ix = dt.indexOf(':');
      stage.appendChild(el('div', 'bz3d-disc', ix > 0 ? '<b>' + esc(dt.slice(0, ix + 1)) + '</b>' + esc(dt.slice(ix + 1)) : esc(dt)));
    }
    wrap.appendChild(head); wrap.appendChild(stage);
    if (opts.header === false) head.style.display = 'none';
    container.appendChild(wrap);
    return { wrap: wrap, stage: stage, labels: labels, loader: loader, closeBtn: closeBtn };
  }

  function buildToolbar(shell, viewer, fullscreenTarget) {
    var L = CFG.locale;
    var bar = el('div', 'bz3d-bar');
    function btn(key, icon, label, fn) {
      var b = el('button', 'bz3d-btn', ICONS[icon] + '<span>' + esc(label) + '</span>');
      b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      b.addEventListener('click', fn); bar.appendChild(b); b._key = key; return b;
    }
    var bs = [];
    bs.push(btn('auto', 'rotate', L.rotate, function () { viewer.toggle('auto'); }));
    bar.appendChild(el('div', 'bz3d-sep'));
    btn(null, 'cube', L.view3d, function () { viewer.view('3d'); });
    btn(null, 'plan', L.top, function () { viewer.view('top'); });
    bar.appendChild(el('div', 'bz3d-sep'));
    var inner = viewer.levels.filter(function (lv) { return !lv.def.exterior; }).length;
    var onlyOutside = !!viewer.building && !inner;                    // maquete só da fachada
    var locked = !!viewer.building && viewer.model.lockLevel != null; // maquete de um pavimento
    if (!onlyOutside) {
      bs.push(btn('lowWalls', 'walls', L.lowWalls, function () { viewer.toggle('lowWalls'); }));
      bs.push(btn('furniture', 'sofa', L.furniture, function () { viewer.toggle('furniture'); }));
    }
    bs.push(btn('labels', 'tag', L.labels, function () { viewer.toggle('labels'); }));
    if (viewer.building && !onlyOutside && !locked) {
      var panel = el('div', 'bz3d-floors', '<h4 title="Mostrar/ocultar a lista">' + esc(L.floorsTitle) + '<i>▾</i></h4>');
      panel.querySelector('h4').addEventListener('click', function () { panel.classList.toggle('bz3d-min'); });
      var mk = function (i, tag, label, full) {
        var b = el('button', 'bz3d-fl', '<b>' + esc(tag || '') + '</b><span>' + esc(label) + '</span>');
        if (full && full !== label) b.title = full;
        b.type = 'button'; b.addEventListener('click', function () { viewer.setLevel(i); });
        b._on = function () { return viewer.state.level === i; }; bs.push(b); panel.appendChild(b);
      };
      mk(-1, '360°', L.facade);
      viewer.levels.map(function (lv, i) { return i; }).sort(function (a, b) { return viewer.levels[b].elev - viewer.levels[a].elev; })
        .forEach(function (i) { var d = viewer.levels[i].def, nm = d.name || ('Pavimento ' + (i + 1)); mk(i, d.tag, d.short || nm, nm); });
      shell.stage.appendChild(panel);
    } else if (!viewer.building && viewer.levels.length > 1) {
      bar.appendChild(el('div', 'bz3d-sep'));
      viewer.levels.forEach(function (lv, i) {
        var b = btn(null, 'floor', lv.def.name || ('Pavimento ' + (i + 1)), function () { viewer.setLevel(viewer.state.level === i ? -1 : i); });
        b._on = function () { return viewer.state.level === i; }; bs.push(b);
      });
      var ball = btn(null, 'layers', L.allLevels, function () { viewer.setLevel(-1); });
      ball._on = function () { return viewer.state.level < 0; }; bs.push(ball);
      bs.push(btn('explode', 'explode', L.explode, function () { viewer.toggle('explode'); }));
    }
    if (fullscreenTarget && fullscreenTarget.requestFullscreen) {
      bar.appendChild(el('div', 'bz3d-sep'));
      btn(null, 'full', L.fullscreen, function () {
        if (document.fullscreenElement) document.exitFullscreen(); else fullscreenTarget.requestFullscreen().catch(function () {});
      });
    }
    viewer.onState = function () { bs.forEach(function (b) { b.classList.toggle('bz3d-on', b._on ? b._on() : !!viewer.state[b._key]); }); };
    viewer.onState();
    shell.stage.appendChild(bar);
    var hint = el('div', 'bz3d-hint', esc(L.hint));
    shell.stage.appendChild(hint);
    setTimeout(function () { hint.style.opacity = '0'; }, 6500);
    setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 7300);
  }

  function start(shell, src, opts, fsTarget) {
    return Promise.all([loadLibs(), loadModel(src)]).then(function (res) {
      var model = res[1];
      if (!opts.title && model.title) {
        var t = shell.wrap.querySelector('.bz3d-title'); if (t) t.textContent = model.title;
      }
      var v = new Viewer(res[0], model, shell, opts);
      buildToolbar(shell, v, fsTarget);
      shell.loader.style.opacity = '0';
      setTimeout(function () { if (shell.loader.parentNode) shell.loader.parentNode.removeChild(shell.loader); }, 450);
      return v;
    }).catch(function (err) {
      console.error('[Bezerra3D]', err);
      shell.loader.innerHTML = '';
      shell.stage.appendChild(el('div', 'bz3d-err', esc(CFG.locale.error) + '<br><small>' + esc(err && err.message) + '</small>'));
      throw err;
    });
  }

  var openModal = null;
  function open(src, opts) {
    opts = opts || {};
    injectCSS();
    if (openModal) openModal.close();
    var prevFocus = document.activeElement;
    var overlay = el('div', 'bz3d-root bz3d-overlay');
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
    var peek = src && typeof src === 'object' ? src : {};
    var shell = buildShell(overlay, peek, opts, true);
    document.body.appendChild(overlay);
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () { requestAnimationFrame(function () { overlay.classList.add('bz3d-in'); }); });

    var viewer = null, closed = false;
    var api = {
      close: function () {
        if (closed) return; closed = true;
        document.removeEventListener('keydown', onKey);
        if (document.fullscreenElement === overlay) document.exitFullscreen().catch(function () {});
        overlay.classList.remove('bz3d-in');
        setTimeout(function () {
          if (viewer) viewer.dispose();
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          document.documentElement.style.overflow = prevOverflow;
          if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {}
        }, 350);
        if (openModal === api) openModal = null;
        if (opts.onClose) opts.onClose();
      },
      get viewer() { return viewer; }
    };
    function onKey(e) { if (e.key === 'Escape') api.close(); }
    document.addEventListener('keydown', onKey);
    shell.closeBtn.addEventListener('click', api.close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) api.close(); });
    shell.closeBtn.focus({ preventScroll: true });
    openModal = api;
    api.ready = start(shell, src, opts, overlay).then(function (v) {
      if (closed) { v.dispose(); return null; }
      viewer = v; return v;
    });
    return api;
  }

  function mount(target, src, opts) {
    opts = opts || {};
    injectCSS();
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target) throw new Error('[Bezerra3D] elemento não encontrado');
    if (target._bz3d) target._bz3d.destroy();
    if (!target.style.height && target.clientHeight < 200) target.style.height = opts.height || '520px';
    var shell = buildShell(target, typeof src === 'object' ? src : {}, opts, false);
    var viewer = null, dead = false;
    var api = {
      destroy: function () { dead = true; if (viewer) viewer.dispose(); if (shell.wrap.parentNode) shell.wrap.parentNode.removeChild(shell.wrap); target._bz3d = null; },
      get viewer() { return viewer; }
    };
    api.ready = start(shell, src, opts, shell.wrap).then(function (v) { if (dead) { v.dispose(); return null; } viewer = v; return v; });
    target._bz3d = api;
    return api;
  }

  // ---------------------------------------------------------------------------
  // Integração automática com a página
  // ---------------------------------------------------------------------------
  function optsFromEl(t) {
    return {
      title: t.getAttribute('data-bz3d-title') || undefined,
      subtitle: t.getAttribute('data-bz3d-subtitle') || undefined,
      autoRotate: t.hasAttribute('data-bz3d-autorotate') ? t.getAttribute('data-bz3d-autorotate') !== 'false' : undefined,
      header: t.getAttribute('data-bz3d-header') === 'false' ? false : undefined,
      height: t.getAttribute('data-bz3d-height') || undefined,
      assetsBase: t.getAttribute('data-bz3d-assets-base') || undefined
    };
  }

  function init(root) {
    injectCSS();
    (root || document).querySelectorAll('[data-bz3d-inline]').forEach(function (t) {
      if (t._bz3d) return;
      var go = function () { mount(t, t.getAttribute('data-bz3d-inline'), optsFromEl(t)); };
      if ('IntersectionObserver' in global) {
        var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); go(); } }, { rootMargin: '200px' });
        io.observe(t);
      } else go();
    });
    (root || document).querySelectorAll('[data-bz3d-model]:not([data-bz3d-ready])').forEach(function (t) {
      t.setAttribute('data-bz3d-ready', '');
      if (t.classList.contains('bz3d-trigger') && !t.querySelector('svg')) t.insertAdjacentHTML('afterbegin', ICONS.trigger);
    });
  }

  // Delegação: funciona também para botões inseridos depois (filtros, AJAX, SPA)
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-bz3d-model]') : null;
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-bz3d-model'), optsFromEl(t));
  });
  // Pré-carrega o Three.js quando o usuário se aproxima do botão
  document.addEventListener('pointerover', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-bz3d-model]') : null;
    if (!t) return;
    loadLibs().catch(function () {});
    var src = t.getAttribute('data-bz3d-model'); if (src && src.charAt(0) !== '#') loadModel(src).catch(function () {});
  }, { passive: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); });
  else init();

  global.Bezerra3D = {
    version: VERSION,
    open: open,
    mount: mount,
    init: init,
    config: function (o) { o = o || {}; var loc = CFG.locale; Object.assign(CFG, o); CFG.locale = Object.assign({}, loc, o.locale || {}); return CFG; },
    preload: function () { return loadLibs(); },
    _internals: { prepare: prepare, buildWalls: buildWalls, buildFloors: buildFloors, buildFurniture: buildFurniture, buildBuilding: buildBuilding, buildUnderlay: buildUnderlay, buildKit: buildKit, kitMaterials: kitMaterials }
  };
})(window);
