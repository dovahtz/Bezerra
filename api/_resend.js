// Envio de e-mail pela Resend (compartilhado por contato.js e chatbot.js)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function leadHtml(titulo, campos, origem, siteUrl) {
  const rows = Object.entries(campos).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#6b6f85;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#12142b;font-size:15px">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e7e4dc">
    <div style="background:#151d4d;padding:22px 26px"><img src="${siteUrl}/assets/img/logo-full-white.svg" alt="Bezerra Engenharia" height="40" style="height:40px"></div>
    <div style="padding:26px"><p style="margin:0 0 6px;color:#e52e4b;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700">${esc(origem)}</p>
    <h1 style="margin:0 0 18px;font-size:22px;color:#12142b">${esc(titulo)}</h1>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:10px">${rows}</table>
    <p style="margin:18px 0 0;color:#9a9db0;font-size:12px">Recebido pelo site (versão de apresentação na Vercel).</p></div></div></body></html>`;
}

async function sendMail({ subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY não configurada nas variáveis de ambiente da Vercel' };
  const to = (process.env.MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!to.length) return { ok: false, error: 'MAIL_TO não configurado' };
  const payload = { from: process.env.MAIL_FROM || 'Site Bezerra <onboarding@resend.dev>', to, subject, html };
  if (replyTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo)) payload.reply_to = replyTo;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (r.ok) return { ok: true };
  let msg = `Resend respondeu ${r.status}`; try { const j = await r.json(); msg += ': ' + (j.message || JSON.stringify(j)); } catch {}
  return { ok: false, error: msg };
}

function siteUrlFrom(req) { const host = req.headers['x-forwarded-host'] || req.headers.host || ''; return host ? `https://${host}` : ''; }
function field(body, k, max = 300) { return String((body && body[k]) ?? '').trim().slice(0, max); }

module.exports = { leadHtml, sendMail, siteUrlFrom, field };
