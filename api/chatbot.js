// Chatbot → e-mail via Resend (versão Vercel)
const { leadHtml, sendMail, siteUrlFrom, field } = require('./_resend.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  const nome = field(b, 'nome', 160), telefone = field(b, 'telefone', 60).replace(/[^0-9+()\-\s]/g, ''); let email = field(b, 'email', 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = '';
  if (!nome || (!telefone && !email)) return res.status(422).json({ ok: false, error: 'Precisamos do seu nome e de um contato (telefone ou e-mail).' });
  const dados = { Objetivo: field(b, 'objetivo'), Estágio: field(b, 'statusLabel'), Quartos: field(b, 'quartos'), Investimento: field(b, 'faixa'), 'Contato por': field(b, 'canal'), Página: field(b, 'pagina', 500) };
  const html = leadHtml('Novo lead pelo chatbot', { Nome: nome, Telefone: telefone, 'E-mail': email, ...dados, Observação: field(b, 'mensagem', 2000) }, 'Assistente virtual', siteUrlFrom(req));
  const r = await sendMail({ subject: `[Site] Lead do chatbot: ${nome}${dados.Estágio ? ' — ' + dados.Estágio : ''}`, html, replyTo: email || undefined });
  if (!r.ok) console.error('Resend:', r.error);
  return res.status(200).json({ ok: true, emailed: r.ok });
};
