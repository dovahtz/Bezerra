// Formulário de contato → e-mail via Resend (versão Vercel)
const { leadHtml, sendMail, siteUrlFrom, field } = require('./_resend.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });
  const b = req.body || {};
  if (field(b, 'site')) return res.status(200).json({ ok: true }); // honeypot
  const nome = field(b, 'nome', 160), email = field(b, 'email', 160), telefone = field(b, 'telefone', 60).replace(/[^0-9+()\-\s]/g, '');
  if (nome.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || telefone.replace(/\D/g, '').length < 10) return res.status(422).json({ ok: false, error: 'Verifique os campos obrigatórios.' });
  if (!field(b, 'consentimento')) return res.status(422).json({ ok: false, error: 'É necessário concordar em receber contato.' });
  const assunto = field(b, 'assunto'), continuar = field(b, 'continuar'), mensagem = field(b, 'mensagem', 3000);
  const html = leadHtml('Novo contato pelo site', { Nome: nome, 'E-mail': email, Telefone: telefone, Assunto: assunto, 'Como prefere continuar': continuar, Mensagem: mensagem }, 'Formulário de contato', siteUrlFrom(req));
  const r = await sendMail({ subject: `[Site] Contato de ${nome} — ${assunto}`, html, replyTo: email });
  if (!r.ok) console.error('Resend:', r.error);
  return res.status(200).json({ ok: true, emailed: r.ok });
};
