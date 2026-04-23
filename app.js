/* ═══════════════════════════════════════════════════════════
   VIRAL STUDIO PRO — app.js v11.0 Final Clean Edition
   Bug fixes:
   [FIX 1] renderIdeas: defensive access — support plain string & {no,idea}
   [FIX 2] field `description` dibaca & dikirim ke buildPrompt
   [FIX 3] winnerModel di-reset di awal setiap generateContent
   [FIX 4] teks tombol generate selalu konsisten
   [FIX 5] load history: pills UI di-sync dengan data
   [FIX 6] copyBonus & renderBonus: guard scene.n bisa undefined
   [FIX 7] saveHistory: simpan goal
   [FIX 8] mobile: input fontSize >= 16px agar iOS tidak auto-zoom
   ═══════════════════════════════════════════════════════════ */

/* ── SERVICE WORKER ────────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(r => console.log('[SW]', r.scope))
      .catch(e => console.warn('[SW] skip:', e.message));
  });
}

/* ── CONSTANTS ─────────────────────────────────────────────── */
const HIST_KEY    = 'viralstudio_history';
const APIKEYS_KEY = 'viralstudio_apikeys';
const MAX_HIST    = 30;

/* ── MODEL LIST ────────────────────────────────────────────── */
const FREE_MODELS = [
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-coder:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-120b:free',
  'minimax/minimax-m2.5:free',
  'arcee-ai/trinity-large-preview:free',
  'z-ai/glm-4.5-air:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'openrouter/free',
];

/* ── STATE ─────────────────────────────────────────────────── */
let lastResult  = null;
let isLoading   = false;
let winnerModel = '';

/* ── SAFE DOM HELPER ───────────────────────────────────────── */
const $ = id => document.getElementById(id);

function setEl(id, prop, val) {
  const el = $(id);
  if (el) el[prop] = val;
}
function setStyle(id, prop, val) {
  const el = $(id);
  if (el) el.style[prop] = val;
}

/* ── TOAST ─────────────────────────────────────────────────── */
let _tt;
function toast(msg, ms = 2800) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), ms);
}

/* ── ESCAPE HTML ───────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── COPY TO CLIPBOARD (mobile-safe) ───────────────────────── */
async function copyText(text, btn) {
  const ok = () => {
    toast('✅ Berhasil disalin!');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '✅';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 2000);
  };

  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); ok(); return; } catch { /* fallback */ }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    const ok2 = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok2) { ok(); } else { toast('❌ Gagal copy. Tekan & tahan untuk salin manual.'); }
  } catch {
    toast('❌ Copy tidak didukung di browser ini.');
  }
}

/* ════════════════════════════════════════════════════════════
   API KEY MANAGEMENT
════════════════════════════════════════════════════════════ */
function getApiKeys() {
  try {
    const raw = localStorage.getItem(APIKEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(k => k && String(k).trim()) : [];
  } catch { return []; }
}

function saveApiKeys(keys) {
  try {
    const clean = keys.map(k => String(k).trim()).filter(k => k.startsWith('sk-or-'));
    localStorage.setItem(APIKEYS_KEY, JSON.stringify(clean));
  } catch { /* storage penuh / private mode */ }
}

function pickRandomKey(keys) {
  if (!keys.length) return '';
  return keys[Math.floor(Math.random() * keys.length)];
}

function showApiKeyModal() {
  const modal = $('apiKeyModal');
  const ta    = $('apiKeyInput');
  if (!modal || !ta) return;
  ta.value = getApiKeys().join('\n');
  modal.style.display = 'flex';
  setTimeout(() => ta.focus(), 100);
}

function hideApiKeyModal() {
  const modal = $('apiKeyModal');
  if (modal) modal.style.display = 'none';
}

function saveApiKeyFromModal() {
  const ta = $('apiKeyInput');
  if (!ta) return;
  const keys    = ta.value.split('\n').map(k => k.trim()).filter(Boolean);
  const valid   = keys.filter(k => k.startsWith('sk-or-'));
  const invalid = keys.filter(k => k.length > 0 && !k.startsWith('sk-or-'));
  if (valid.length === 0) {
    toast('⚠️ Tidak ada API key valid. Harus diawali "sk-or-"'); return;
  }
  if (invalid.length > 0) toast(`⚠️ ${invalid.length} key diabaikan (format salah)`);
  saveApiKeys(valid);
  hideApiKeyModal();
  updateApiKeyStatus();
  toast(`✅ ${valid.length} API key tersimpan!`);
}

function updateApiKeyStatus() {
  const el = $('apiKeyStatus');
  if (!el) return;
  const keys = getApiKeys();
  if (keys.length > 0) {
    el.textContent = `🔑 ${keys.length} API key aktif`;
    el.className   = 'api-status has-key';
  } else {
    el.textContent = '⚠️ Belum ada API key';
    el.className   = 'api-status no-key';
  }
}

/* ════════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.nav-tab, .bnav-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + tab);
  });
  if (tab === 'history') renderHistory();
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  catch { window.scrollTo(0, 0); }
}

/* ════════════════════════════════════════════════════════════
   PILLS
════════════════════════════════════════════════════════════ */
function initPills(cid, hid) {
  const container = $(cid);
  const hidden    = $(hid);
  if (!container) return;
  container.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      container.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      if (hidden) hidden.value = p.dataset.value || '';
    });
  });
}

/* [FIX 5] Sync pills UI dari nilai yang diketahui (misal: dari history) */
function syncPills(cid, hid, value) {
  const container = $(cid);
  const hidden    = $(hid);
  if (!container) return;
  if (hidden) hidden.value = String(value || '');
  container.querySelectorAll('.pill').forEach(p => {
    p.classList.toggle('active', (p.dataset.value || '') === String(value || ''));
  });
}

/* ════════════════════════════════════════════════════════════
   BUILD PROMPT v11
════════════════════════════════════════════════════════════ */
function randomVariant(arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/* [FIX 2] Tambah parameter description */
function buildPrompt(topic, target, platform, style, format, description) {
  topic       = String(topic       || '').trim();
  target      = String(target      || '').trim();
  platform    = String(platform    || 'tiktok');
  style       = String(style       || 'santai');
  format      = String(format      || 'standard');
  description = String(description || '').trim();

  const platformCtx = {
    tiktok:    'TikTok — pengguna scroll 0.5 detik per video. Hook harus menghantam di kalimat pertama. Bahasa anak muda Jakarta, pakai singkatan, energi tinggi. Video 15-60 detik. Jangan mulai dengan salam apapun.',
    instagram: 'Instagram — pengguna lebih selektif, niat beli lebih tinggi. Caption bisa story-driven 150-250 kata. Visual storytelling penting. CTA harus terasa natural bukan jualan. Gunakan paragraf pendek dan line break.',
    youtube:   'YouTube — penonton datang dengan niat. Opening harus jawab "kenapa video ini worth 5 menitku" dalam 10 detik pertama. Struktur boleh lebih panjang tapi harus ada payoff yang jelas. Trust-building melalui kredibilitas dan data.',
  }[platform] || platform;

  const styleCtx = {
    santai:   'Gaya teman dekat — pakai "lo/gue", nada bercanda tapi sincere. Boleh pakai kata sehari-hari: "seriusan", "eh tapi", "jujur ya". Jangan ada kata kaku atau formal.',
    tegas:    'Langsung, tidak ada basa-basi. Tiap kalimat harus actionable. Kalimat pendek. Seperti founder yang pitching ke investor.',
    dramatis: 'Bangun tension dulu sebelum solusi. Pakai contrast: sebelum vs sesudah. Boleh pakai kalimat emosional tapi jangan lebay sampai tidak credible.',
    edukatif: 'Tone mentor yang genuinely mau membantu. Gunakan analogi dari kehidupan sehari-hari Indonesia. Pakai data atau fakta konkret.',
    humor:    'Witty, relatable, sedikit absurd tapi tetap nyambung ke topik. Bangun situasi dulu, baru punchline.',
  }[style] || style;

  const bonusInstructions = {
    thread: `
INSTRUKSI BONUS — Thread Twitter/X (6 tweet):
WAJIB format: "1/ [teks]\\n\\n2/ [teks]\\n\\n3/ [teks]\\n\\n4/ [teks]\\n\\n5/ [teks]\\n\\n6/ [teks]"
- Tweet 1: hook kuat ada angka atau twist
- Tweet 2-5: insight makin dalam per tweet
- Tweet 6: kesimpulan + soft CTA
- Panjang tiap tweet: 200-260 karakter
- Tulis sebagai string di field "bonus", pisahkan dengan \\n\\n`,
    carousel: `
INSTRUKSI BONUS — Carousel Instagram (6 slide):
WAJIB format tiap baris: "SLIDE N | JUDUL SLIDE | TEKS KONTEN"
- Slide 1: hook dengan angka atau pertanyaan provokatif
- Slide 2-5: satu poin per slide, progresif
- Slide 6: CTA konkret
- Tiap slide MAKSIMAL 20 kata
- Tulis sebagai string, 6 baris dipisah \\n`,
    short: `
INSTRUKSI BONUS — Script Short Video (15-30 detik, 5 scene):
WAJIB format tiap baris: "SCENE N | VISUAL: [deskripsi] | AUDIO: [dialog]"
- Scene 1 (0-3 dtk): stop-scroll hook visual
- Scene 2 (3-8 dtk): problem relatable
- Scene 3 (8-18 dtk): demo atau bukti
- Scene 4 (18-25 dtk): hasil/transformasi
- Scene 5 (25-30 dtk): CTA + text overlay
- Tulis sebagai string, 5 baris dipisah \\n`,
    standard: '',
  }[format] || '';

  const needBonus = format !== 'standard';

  const opening = randomVariant([
    'Kamu senior content strategist di agency digital Jakarta. Klien datang dengan brief ini:',
    'Kamu kreator konten 500k followers yang diminta bantu campaign baru. Briefnya:',
    'Kamu growth marketer spesialis konversi organik Indonesia. Brief klien:',
  ]);

  const descLine = description ? `Detail Produk: ${description}\n` : '';

  return `${opening}

Produk/Topik: "${topic}"
${descLine}Target audiens: ${target}
Platform: ${platformCtx}
Tone: ${styleCtx}

═══════════════════════════════════════
STANDAR KUALITAS WAJIB DIIKUTI
═══════════════════════════════════════

HOOKS — tiap hook HARUS punya SALAH SATU dari:
- Angka spesifik: "3 dari 5 orang Jakarta...", "habis 2 juta untuk...", "dalam 7 hari..."
- Situasi konkret: "lagi scroll TikTok jam 2 pagi...", "pas antri kasir Indomaret..."
- Twist counter-intuitive
- Social proof konkret dengan detail nyata

DILARANG di semua output:
- "rahasia tersembunyi" / "solusi ampuh" / "produk terbaik" / "kualitas premium"
- "ubah hidupmu" / "revolusi" / "breakthrough" / "game changer"
- Kalimat pembuka "Halo semuanya!" / "Hai guys!"
- Hook generik yang bisa dipakai produk lain

SCRIPT — JANGAN struktur AIDA robotik. Harus terasa orang nyata ngobrol.
CAPTION — Kalimat pertama langsung kuat, bukan salam. Soft sell natural.
IDEAS — Format spesifik + angle jelas. Eksekutable dengan smartphone.

Output: JSON valid saja. Mulai langsung dari { — tidak ada teks sebelumnya.

{
  "hooks": [
    {"type": "⚠️ Fear", "text": "hook fear SPESIFIK dengan angka atau situasi konkret tentang ${topic}"},
    {"type": "💡 Curiosity", "text": "hook curiosity dengan twist counter-intuitive tentang ${topic}"},
    {"type": "⏰ Urgency", "text": "hook urgency dengan waktu atau konteks spesifik tentang ${topic}"},
    {"type": "🔍 Problem", "text": "hook problem dengan detail sensorik relatable tentang ${topic}"},
    {"type": "🌟 Aspiration", "text": "hook aspiration dengan gambaran hasil KONKRET tentang ${topic}"},
    {"type": "👥 Social Proof", "text": "hook social proof terasa nyata, ada detail spesifik tentang ${topic}"},
    {"type": "🏆 Authority", "text": "hook authority dengan data atau fakta menarik tentang ${topic}"},
    {"type": "⚡ Contrast", "text": "hook contrast before-after dramatis tapi believable tentang ${topic}"},
    {"type": "🔐 Secret", "text": "hook secret dengan insight non-obvious spesifik tentang ${topic}"},
    {"type": "💪 Challenge", "text": "hook challenge yang challenge asumsi umum tentang ${topic}"}
  ],
  "script": {
    "opening": "kalimat pembuka LANGSUNG ke inti tentang ${topic}",
    "problem": "gambarkan masalah dengan detail sensori yang dirasakan ${target}",
    "agitation": "perbesar dampak nyata kalau masalah dibiarkan",
    "solution": "posisikan ${topic} sebagai solusi yang ditemukan bukan dijual",
    "cta": "CTA spesifik sesuai behavior ${target} di ${platform}"
  },
  "caption": "caption 150-250 kata. Kalimat pertama langsung kuat. Ada mini-story atau insight. Soft sell natural. Tutup dengan pertanyaan genuine. 8-10 hashtag relevan di akhir.",
  "ideas": [
    "FORMAT: [nama format] | ANGLE: [sudut pandang] | VISUAL HOOK: [opening] untuk ${topic}",
    "FORMAT: [nama format] | ANGLE: [sudut pandang] | VISUAL HOOK: [opening] untuk ${topic}",
    "FORMAT: [nama format] | ANGLE: [sudut pandang] | VISUAL HOOK: [opening] untuk ${topic}",
    "FORMAT: [nama format] | ANGLE: [sudut pandang] | VISUAL HOOK: [opening] untuk ${topic}",
    "FORMAT: [nama format] | ANGLE: [sudut pandang] | VISUAL HOOK: [opening] untuk ${topic}"
  ]${needBonus ? ',\n  "bonus": "isi bonus sesuai instruksi format di bawah"' : ''}
}

${bonusInstructions}`;
}

/* ════════════════════════════════════════════════════════════
   VALIDATE
════════════════════════════════════════════════════════════ */
function validateParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const hooks = parsed.hooks;
  if (!Array.isArray(hooks) || hooks.length < 5) return false;
  const validHooks = hooks.filter(h => h && h.text && String(h.text).trim().length > 20);
  if (validHooks.length < 5) return false;
  if (!parsed.script || !parsed.script.opening || String(parsed.script.opening).trim().length < 20) return false;
  if (!parsed.caption || String(parsed.caption).trim().length < 80) return false;
  if (!Array.isArray(parsed.ideas) || parsed.ideas.length < 3) return false;
  return true;
}

/* ════════════════════════════════════════════════════════════
   TIMEOUT HELPER
════════════════════════════════════════════════════════════ */
function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${ms / 1000}s (${label})`)), ms)
  );
  return Promise.race([promise, timer]);
}

/* ════════════════════════════════════════════════════════════
   SINGLE MODEL CALL
════════════════════════════════════════════════════════════ */
async function callOneModel(model, apiKey, prompt, signal) {
  const shortName = model.split('/').pop().replace(':free', '');
  const fetchOpts = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin : 'https://viralstudio.app',
      'X-Title': 'Viral Studio PRO',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Kamu adalah content strategist Indonesia berpengalaman. Respond HANYA dengan JSON valid. Tidak ada teks sebelum atau sesudah JSON. Mulai langsung dari { dan akhiri dengan }. Pastikan JSON ter-close dengan benar.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3500,
      temperature: 0.85,
      top_p: 0.90,
    }),
  };

  if (signal) fetchOpts.signal = signal;

  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', fetchOpts);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Aborted');
    console.warn(`[${shortName}] fetch error:`, err.message);
    throw err;
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const reason = (errData && errData.error && errData.error.message) || `HTTP ${res.status}`;
    console.warn(`[${shortName}] rejected:`, reason);
    throw new Error(reason);
  }

  const data = await res.json();
  const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';

  if (String(text).trim().length < 100) throw new Error('Response terlalu pendek');
  if (!text.includes('"hooks"') || !text.includes('"script"')) throw new Error('Struktur JSON tidak valid');

  console.log(`[${shortName}] sukses (${text.length} chars)`);
  return { text, model };
}

/* ════════════════════════════════════════════════════════════
   RACE ALL MODELS
════════════════════════════════════════════════════════════ */
async function raceAllModels(prompt) {
  const keys = getApiKeys();
  if (!keys.length) throw new Error('NO_API_KEY');

  if (typeof Promise.any !== 'function') {
    console.warn('[Race] Promise.any tidak tersedia, pakai sequential');
    return sequentialFallback(prompt, keys);
  }

  const hasAbort   = typeof AbortController !== 'undefined';
  const controller = hasAbort ? new AbortController() : null;

  console.log(`[Race] ${FREE_MODELS.length} model serentak...`);

  const promises = FREE_MODELS.map(model => {
    const key    = pickRandomKey(keys);
    const signal = controller ? controller.signal : null;
    return withTimeout(
      callOneModel(model, key, prompt, signal),
      12000,
      model.split('/').pop()
    ).catch(err => Promise.reject(new Error(`${model}: ${err.message}`)));
  });

  try {
    const result = await Promise.any(promises);
    if (controller) controller.abort();
    console.log(`[Race] Winner:`, result.model);
    return result;
  } catch (err) {
    console.warn('[Race] Semua gagal, coba sequential...', err);
    return sequentialFallback(prompt, keys);
  }
}

async function sequentialFallback(prompt, keys) {
  for (const model of FREE_MODELS) {
    const key       = pickRandomKey(keys);
    const shortName = model.split('/').pop().replace(':free', '');
    try {
      console.log(`[Fallback] Mencoba ${shortName}...`);
      const result = await withTimeout(
        callOneModel(model, key, prompt, null),
        20000,
        shortName
      );
      console.log(`[Fallback] OK: ${shortName}`);
      return result;
    } catch (err) {
      console.warn(`[Fallback] ${shortName} gagal:`, err.message);
    }
  }
  throw new Error('ALL_MODELS_FAILED');
}

/* ════════════════════════════════════════════════════════════
   PARSE AI RESPONSE
════════════════════════════════════════════════════════════ */
function parseAIResponse(text) {
  if (!text || typeof text !== 'string') throw new Error('Respons AI kosong');
  const cleaned = text.trim();

  try { return JSON.parse(cleaned); } catch { /* lanjut */ }

  const m1 = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) {
    try { return JSON.parse(m1[1].trim()); } catch { /* lanjut */ }
  }

  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) {
    const slice = cleaned.slice(s, e + 1);
    try { return JSON.parse(slice); } catch {
      try { return JSON.parse(repairJSON(slice)); } catch { /* lanjut */ }
    }
  }

  throw new Error('Tidak bisa parse respons AI sebagai JSON');
}

function repairJSON(str) {
  let fixed = str.replace(/,\s*([\]}])/g, '$1');
  fixed = fixed.replace(/:\s*"([^"]*?)$/gm, ': "$1"');
  const opens  = (fixed.match(/\{/g) || []).length;
  const closes = (fixed.match(/\}/g) || []).length;
  for (let i = 0; i < opens - closes; i++) fixed += '}';
  const opensA  = (fixed.match(/\[/g) || []).length;
  const closesA = (fixed.match(/\]/g) || []).length;
  for (let i = 0; i < opensA - closesA; i++) fixed += ']';
  return fixed;
}

/* ════════════════════════════════════════════════════════════
   BONUS PARSERS
════════════════════════════════════════════════════════════ */
function parseBonusThread(text) {
  if (!text) return [];
  const re    = /(\d+)\/\s*(.+?)(?=\n\d+\/|\n\n\d+\/|$)/gs;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push({ n: parseInt(m[1]), t: m[2].trim() });
  }
  if (found.length >= 4) {
    return found.sort((a, b) => a.n - b.n).slice(0, 6).map(f => `${f.n}/ ${f.t}`);
  }
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 20);
  if (chunks.length >= 4) {
    return chunks.slice(0, 6).map((c, i) => /^\d+\//.test(c) ? c : `${i + 1}/ ${c}`);
  }
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 20).slice(0, 6)
    .map((l, i) => /^\d+\//.test(l) ? l : `${i + 1}/ ${l}`);
}

function parseBonusCarousel(text) {
  if (!text) return [];
  const re     = /SLIDE\s*(\d+)\s*[|:]\s*([^|\n]+?)\s*\|\s*([^\n]+)/gi;
  const slides = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    slides.push({ label: `Slide ${m[1]}`, title: m[2].trim(), text: m[3].trim() });
  }
  if (slides.length >= 4) return slides.slice(0, 6);

  const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fallback = [];
  for (const line of lines) {
    const mL = line.match(/^(?:slide\s*)?(\d+)[|.\-:\s]+(.+)/i);
    if (mL) fallback.push({ label: `Slide ${mL[1]}`, title: '', text: mL[2].trim() });
  }
  if (fallback.length >= 4) return fallback.slice(0, 6);

  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 10);
  return chunks.slice(0, 6).map((c, i) => ({ label: `Slide ${i + 1}`, title: '', text: c }));
}

function parseBonusShort(text) {
  if (!text) return [];
  const re     = /SCENE\s*(\d+)\s*[|:]\s*VISUAL[:\s]+([^|]+?)\s*\|\s*AUDIO[:\s]+([^\n]+)/gi;
  const scenes = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    scenes.push({ n: m[1], visual: m[2].trim(), audio: m[3].trim() });
  }
  if (scenes.length >= 3) return scenes.slice(0, 5);

  const lines    = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fallback = [];
  for (const line of lines) {
    const mL = line.match(/^(?:scene\s*)?(\d+)[|.\-:\s]+(.+)/i);
    if (mL) {
      const content    = mL[2];
      const audioPart  = content.split(/\|\s*(?:audio|dialog|narasi)[:\s]*/i);
      const visualPart = content.split(/VISUAL[:\s]*/i);
      fallback.push({
        n:      mL[1],
        visual: ((visualPart[1] || audioPart[0] || content).replace(/\|.*/, '')).trim(),
        audio:  (audioPart[1] || '').trim(),
      });
    }
  }
  if (fallback.length >= 3) return fallback.slice(0, 5);

  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 10);
  return chunks.slice(0, 5).map((c, i) => ({ n: String(i + 1), visual: `[Scene ${i + 1}]`, audio: c }));
}

function buildBonusFromText(text, format) {
  if (!text || !format) return null;
  if (format === 'thread')   return { type: 'thread',   title: 'Thread Twitter/X (6 Tweet)',       content: parseBonusThread(text)   };
  if (format === 'carousel') return { type: 'carousel', title: 'Carousel Instagram (6 Slide)',     content: parseBonusCarousel(text) };
  if (format === 'short')    return { type: 'short',    title: 'Script Short Video (15-30 detik)', content: parseBonusShort(text)    };
  return null;
}

/* ════════════════════════════════════════════════════════════
   GENERATE HANDLER
════════════════════════════════════════════════════════════ */
async function generateContent() {
  if (isLoading) return;

  const topicEl  = $('topic');
  const targetEl = $('target');
  if (!topicEl || !targetEl) return;

  const topic       = topicEl.value.trim();
  const target      = targetEl.value.trim();
  const platform    = $('platform')    ? ($('platform').value    || 'tiktok')   : 'tiktok';
  const style       = $('style')       ? ($('style').value       || 'santai')   : 'santai';
  const format      = $('format')      ? ($('format').value      || 'standard') : 'standard';
  const goal        = $('goal')        ? ($('goal').value        || 'closing')  : 'closing';
  /* [FIX 2] Baca field description */
  const description = $('description') ? ($('description').value.trim() || '')  : '';

  if (!topic)  { topicEl.focus();  toast('⚠️ Isi topik atau nama produk dulu!'); return; }
  if (!target) { targetEl.focus(); toast('⚠️ Isi target market dulu!'); return; }
  if (!getApiKeys().length) {
    toast('⚠️ Masukkan API key OpenRouter dulu!', 4000);
    showApiKeyModal();
    return;
  }

  isLoading = true;
  /* [FIX 3] Reset winnerModel setiap generate baru */
  winnerModel = '';

  const btnGenerate = $('btnGenerate');
  const btnInner    = $('btnInner');
  const resultsEl   = $('results');
  const statusWrap  = $('modelStatusWrap');
  const modelStatus = $('modelStatus');

  if (btnGenerate) btnGenerate.disabled = true;
  if (btnInner)    btnInner.innerHTML   = '<div class="spinner"></div><span>AI sedang berlomba…</span>';
  if (resultsEl)   resultsEl.style.display = 'none';
  if (statusWrap)  statusWrap.style.display = 'block';
  if (modelStatus) modelStatus.innerHTML = '<span class="ms-racing">⚡ Menghubungi AI — model tercepat yang menang…</span>';

  try {
    /* [FIX 2] Kirim description ke buildPrompt */
    const prompt = buildPrompt(topic, target, platform, style, format, description);
    let { text: rawText, model } = await raceAllModels(prompt);
    winnerModel = model;

    if (modelStatus) modelStatus.innerHTML = '<span class="ms-ok">✓ Memproses konten…</span>';

    let parsed;
    try {
      parsed = parseAIResponse(rawText);
    } catch {
      toast('🔄 Memformat ulang respons AI…', 1500);
      const strictPrompt = buildPrompt(topic, target, platform, style, format, description)
        + '\n\nCRITICAL: Output HARUS dimulai { dan diakhiri }. Tidak ada teks di luar JSON.';
      const retry = await raceAllModels(strictPrompt);
      parsed = parseAIResponse(retry.text);
      winnerModel = retry.model;
    }

    if (!validateParsed(parsed)) {
      toast('🔄 Meningkatkan kualitas output…', 2000);
      const qualityPrompt = buildPrompt(topic, target, platform, style, format, description)
        + `\n\nWAJIB: Setiap hook HARUS ada angka spesifik atau situasi konkret tentang "${topic}". DILARANG hook generik.`;
      const retry2 = await raceAllModels(qualityPrompt);
      parsed = parseAIResponse(retry2.text);
      winnerModel = retry2.model;
    }

    const hooks = (Array.isArray(parsed.hooks) ? parsed.hooks : []).map(h => ({
      type: String(h.type || '💡 Hook'),
      tkey: hookTypeToKey(String(h.type || '')),
      text: String(h.text || ''),
    })).filter(h => h.text.trim().length > 5);

    const script = {
      opening:   String((parsed.script && parsed.script.opening)   || ''),
      problem:   String((parsed.script && parsed.script.problem)   || ''),
      agitation: String((parsed.script && parsed.script.agitation) || ''),
      solution:  String((parsed.script && parsed.script.solution)  || ''),
      cta:       String((parsed.script && parsed.script.cta)       || ''),
    };

    const caption = String(parsed.caption || '');
    /* Ideas selalu disimpan sebagai {no, idea} — tidak pernah plain string */
    const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : [])
      .map((idea, i) => ({ no: i + 1, idea: String(idea) }));
    const bonus = (parsed.bonus && format !== 'standard')
      ? buildBonusFromText(String(parsed.bonus), format) : null;

    const modelShort = String(winnerModel).split('/').pop().replace(':free', '');

    lastResult = {
      meta: { topic, target, platform, style, format, goal,
        generatedAt: new Date().toLocaleString('id-ID'),
        winnerModel: modelShort },
      hooks, script, caption, ideas, bonus, format,
    };

    renderResults(lastResult);
    saveHistory(lastResult);

    if (modelStatus) modelStatus.innerHTML = `<span class="ms-ok">✓ Selesai — ${esc(modelShort)}</span>`;
    toast('🎉 Konten AI berhasil digenerate!');

  } catch (err) {
    console.error('[generate]', err);
    if (modelStatus) modelStatus.innerHTML = '<span class="ms-failed">✗ Generate gagal — coba lagi</span>';
    const msg = String(err.message || '');
    if (msg === 'NO_API_KEY') {
      toast('⚠️ Masukkan API key dulu!', 4000); showApiKeyModal();
    } else if (msg === 'ALL_MODELS_FAILED') {
      toast('❌ Semua model gagal. Periksa API key & koneksi, lalu coba lagi.', 6000);
    } else {
      toast('❌ ' + msg.slice(0, 80), 5000);
    }
  } finally {
    isLoading = false;
    if (btnGenerate) btnGenerate.disabled = false;
    /* [FIX 4] Selalu kembalikan teks tombol ke state awal */
    if (btnInner) btnInner.innerHTML = '<span>⚡</span><span>GENERATE ULANG</span>';
  }
}

function hookTypeToKey(type) {
  const lower = String(type).toLowerCase();
  const map = {
    fear: 'fear', curiosity: 'curiosity', urgency: 'urgency',
    problem: 'problem', aspiration: 'aspiration', social: 'social',
    authority: 'authority', contrast: 'contrast', secret: 'secret', challenge: 'challenge',
  };
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) return v;
  }
  return 'curiosity';
}

/* ════════════════════════════════════════════════════════════
   RENDER
════════════════════════════════════════════════════════════ */
function renderResults(data) {
  if (!data) return;
  renderMeta(data.meta);
  renderAnalysis(data.hooks, data.meta);
  renderHooks(data.hooks);
  renderScript(data.script);
  renderCaption(data.caption);
  renderIdeas(data.ideas);
  if (data.bonus) {
    renderBonus(data.bonus);
  } else {
    const b = $('bonusCard');
    if (b) b.style.display = 'none';
  }
  const res = $('results');
  if (!res) return;
  res.style.display = 'flex';
  res.style.flexDirection = 'column';
  setTimeout(() => {
    try { res.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    catch { try { res.scrollIntoView(true); } catch { /* skip */ } }
  }, 150);
}

function renderMeta(m) {
  const el = $('resultMeta');
  if (!el || !m) return;
  const pL = { tiktok: 'TikTok 🎵', instagram: 'Instagram 📸', youtube: 'YouTube ▶️' };
  const sL = { santai: 'Santai 😊', tegas: 'Tegas 💪', dramatis: 'Dramatis 🔥', edukatif: 'Edukatif 📚', humor: 'Humor 😂' };
  const fL = { standard: 'Standard', thread: 'Thread 🧵', carousel: 'Carousel 🎠', short: 'Short-form ⚡' };
  const modelBadge = m.winnerModel
    ? `<span class="meta-dot">·</span><span class="meta-pill">🤖 ${esc(m.winnerModel)}</span>` : '';
  el.innerHTML =
    `<span class="meta-pill">🎯 <strong>${esc(m.topic)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill">👥 <strong>${esc(m.target)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${esc(pL[m.platform] || m.platform)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${esc(sL[m.style] || m.style)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${esc(fL[m.format] || m.format)}</strong></span>
     ${modelBadge}
     <span class="meta-dot">·</span>
     <span class="meta-pill">🕐 ${esc(m.generatedAt)}</span>`;
}

function renderAnalysis(hooks, meta) {
  const grid = $('analysisGrid');
  if (!grid || !meta) return;
  const pScore    = { tiktok: '🔥 Tinggi', instagram: '⚡ Sedang-Tinggi', youtube: '📈 Sedang' }[meta.platform] || '📊 Standar';
  const hookCount = Array.isArray(hooks) ? hooks.length : 0;
  const avgLen    = hookCount
    ? Math.round(hooks.reduce((s, h) => s + String(h.text || '').length, 0) / hookCount)
    : 0;
  grid.innerHTML = `
    <div class="analysis-item"><div class="analysis-label">Platform Fit</div><div class="analysis-val">${pScore}</div></div>
    <div class="analysis-item"><div class="analysis-label">Hook Dihasilkan</div><div class="analysis-val">${hookCount} hook</div></div>
    <div class="analysis-item"><div class="analysis-label">Rata-rata Panjang Hook</div><div class="analysis-val">${avgLen} karakter</div></div>
    <div class="analysis-item"><div class="analysis-label">Gaya Konten</div><div class="analysis-val">${esc(meta.style || '-')}</div></div>
    <div class="analysis-item"><div class="analysis-label">Format Bonus</div><div class="analysis-val">${esc(meta.format || 'standard')}</div></div>
    <div class="analysis-item"><div class="analysis-label">Tujuan Konten</div><div class="analysis-val">${esc(meta.goal || 'closing')}</div></div>
  `;
}

const HCLS = {
  curiosity: 'tag-curiosity', fear: 'tag-fear',       urgency:   'tag-urgency',
  problem:   'tag-problem',   aspiration: 'tag-aspiration', social: 'tag-social',
  authority: 'tag-authority', contrast:   'tag-contrast',   secret: 'tag-secret', challenge: 'tag-challenge',
};

function renderHooks(hooks) {
  const el = $('hooksList');
  if (!el) return;
  if (!Array.isArray(hooks) || !hooks.length) {
    el.innerHTML = '<div class="empty-state">Tidak ada hook yang dihasilkan.</div>';
    return;
  }
  el.innerHTML = hooks.map((h, i) => `
    <div class="hook-item" data-text="${esc(h.text)}">
      <div class="hook-num">${i + 1}</div>
      <div class="hook-tag ${HCLS[h.tkey] || 'tag-curiosity'}">${esc(h.type)}</div>
      <div class="hook-text">${esc(h.text)}</div>
    </div>`).join('');
  el.querySelectorAll('.hook-item').forEach(item => {
    item.addEventListener('click', () => {
      item.style.borderColor = 'rgba(232,255,71,.4)';
      item.style.background  = 'rgba(232,255,71,.06)';
      setTimeout(() => { item.style.borderColor = ''; item.style.background = ''; }, 1600);
      copyText(item.dataset.text || '', null);
    });
  });
}

function renderScript(s) {
  const el = $('scriptBox');
  if (!el) return;
  const parts = [
    { key: 'opening',   label: '🎬 Opening',   cls: 'tag-opening'   },
    { key: 'problem',   label: '😤 Problem',   cls: 'tag-problem'   },
    { key: 'agitation', label: '🔥 Agitation', cls: 'tag-agitation' },
    { key: 'solution',  label: '✅ Solution',  cls: 'tag-solution'  },
    { key: 'cta',       label: '📣 CTA',       cls: 'tag-cta'       },
  ];
  el.innerHTML = parts.map(p => `
    <div class="script-part">
      <div class="script-tag ${p.cls}">${p.label}</div>
      <div class="script-text">${esc(s ? (s[p.key] || '') : '')}</div>
    </div>`).join('');
}

function renderCaption(c) {
  const el = $('captionText');
  if (el) el.textContent = c || '';
}

/* [FIX 1] Defensive access: support {no, idea} (baru) MAUPUN plain string (data lama) */
function renderIdeas(ideas) {
  const el = $('ideasList');
  if (!el) return;
  if (!Array.isArray(ideas) || !ideas.length) {
    el.innerHTML = '<div class="empty-state">Tidak ada ide yang dihasilkan.</div>';
    return;
  }
  el.innerHTML = ideas.map((d, i) => {
    const no   = (d != null && typeof d === 'object' && d.no   != null) ? d.no   : (i + 1);
    const idea = (d != null && typeof d === 'object' && d.idea != null) ? String(d.idea) : String(d);
    return `<div class="idea-row">
      <div class="idea-no">${no}</div>
      <div>${esc(idea)}</div>
    </div>`;
  }).join('');
}

function renderBonus(bonus) {
  const card      = $('bonusCard');
  const titleEl   = $('bonusTitle');
  const contentEl = $('bonusContent');
  if (!card || !bonus) return;
  card.style.display = '';
  if (titleEl) titleEl.textContent = bonus.title || '';
  if (!contentEl) return;

  const content = bonus.content || [];

  if (bonus.type === 'thread') {
    contentEl.innerHTML = content.map((line, i) => {
      const match  = String(line).match(/^(\d+\/)\s*([\s\S]*)/);
      const prefix = match ? match[1] : `${i + 1}/`;
      const text   = match ? match[2] : String(line);
      return `<div class="bonus-line ${i === 0 ? 'bonus-line-intro' : ''}">
        <span class="thread-num">${prefix}</span><span>${esc(text)}</span>
      </div>`;
    }).join('');

  } else if (bonus.type === 'carousel') {
    contentEl.innerHTML = content.map((s, i) => `
      <div class="carousel-slide">
        <div class="carousel-label">${esc(s.label || `Slide ${i + 1}`)}</div>
        ${s.title ? `<div class="carousel-title">${esc(s.title)}</div>` : ''}
        <div class="carousel-text">${esc(s.text || '')}</div>
      </div>`).join('');

  } else if (bonus.type === 'short') {
    contentEl.innerHTML = content.map((scene, i) => {
      if (typeof scene === 'string') {
        return `<div class="shortform-line"><div class="shortform-num">${i + 1}</div><div>${esc(scene)}</div></div>`;
      }
      /* [FIX 6] Guard scene.n bisa undefined */
      const sceneNum = (scene.n != null) ? scene.n : (i + 1);
      return `<div class="shortform-scene">
        <div class="shortform-num">Scene ${esc(String(sceneNum))}</div>
        <div class="shortform-block">
          <div class="shortform-visual"><span class="shortform-label">📷 VISUAL</span> ${esc(scene.visual || '')}</div>
          <div class="shortform-audio"><span class="shortform-label">🎙️ AUDIO</span> ${esc(scene.audio || '')}</div>
        </div>
      </div>`;
    }).join('');
  }
}

/* ════════════════════════════════════════════════════════════
   COPY ACTIONS
════════════════════════════════════════════════════════════ */
function copyScript() {
  if (!lastResult) return;
  const s   = lastResult.script || {};
  const btn = $('copyScriptBtn');
  copyText(
    `🎬 OPENING\n${s.opening || ''}\n\n😤 PROBLEM\n${s.problem || ''}\n\n🔥 AGITATION\n${s.agitation || ''}\n\n✅ SOLUTION\n${s.solution || ''}\n\n📣 CTA\n${s.cta || ''}`,
    btn
  );
}

function copyCaption() {
  if (!lastResult) return;
  copyText(lastResult.caption || '', $('copyCaptionBtn'));
}

function copyBonus() {
  if (!lastResult || !lastResult.bonus) return;
  const b       = lastResult.bonus;
  const content = b.content || [];
  let text = '';
  if (b.type === 'thread') {
    text = content.map(l => String(l)).join('\n\n');
  } else if (b.type === 'carousel') {
    text = content.map(s => `${s.label || ''}${s.title ? ' — ' + s.title : ''}\n${s.text || ''}`).join('\n\n');
  } else if (b.type === 'short') {
    text = content.map((sc, i) => {
      if (typeof sc === 'string') return sc;
      /* [FIX 6] Guard sc.n */
      const n = (sc.n != null) ? sc.n : (i + 1);
      return `Scene ${n}\n📷 VISUAL: ${sc.visual || ''}\n🎙️ AUDIO: ${sc.audio || ''}`;
    }).join('\n\n');
  }
  copyText(text, $('copyBonusBtn'));
}

function copyAllHooks() {
  if (!lastResult) return;
  const hooks = lastResult.hooks || [];
  copyText(hooks.map((h, i) => `${i + 1}. [${h.type}] ${h.text}`).join('\n\n'), $('copyHooksBtn'));
}

/* ════════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════════ */
function saveHistory(data) {
  if (!data) return;
  try {
    const h = loadHistory();
    h.unshift({
      id:        Date.now(),
      topic:     data.meta.topic,
      target:    data.meta.target,
      platform:  data.meta.platform,
      style:     data.meta.style,
      format:    data.meta.format,
      /* [FIX 7] Simpan goal agar bisa di-restore */
      goal:      data.meta.goal || 'closing',
      time:      data.meta.generatedAt,
      firstHook: (data.hooks && data.hooks[0] && data.hooks[0].text) || '',
      data,
    });
    localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, MAX_HIST)));
  } catch { /* storage penuh */ }
}

function loadHistory() {
  try {
    const raw    = localStorage.getItem(HIST_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  const hist = loadHistory();
  if (!hist.length) {
    list.innerHTML = '<div class="history-empty">📭 Belum ada riwayat.<br>Generate konten pertamamu sekarang!</div>';
    return;
  }
  const pL = { tiktok: 'TikTok 🎵', instagram: 'Instagram 📸', youtube: 'YouTube ▶️' };
  const fL = { standard: '', thread: ' · Thread', carousel: ' · Carousel', short: ' · Short' };
  list.innerHTML = hist.map((h, i) => `
    <div class="history-item" data-i="${i}">
      <div class="history-top">
        <div class="history-topic">${esc(h.topic || '')}</div>
        <div class="history-plat">${esc(pL[h.platform] || h.platform || '')}${esc(fL[h.format] || '')}</div>
      </div>
      <div class="history-time">👥 ${esc(h.target || '')} · 🕐 ${esc(h.time || '')}</div>
      <div class="history-hook">"${esc(h.firstHook || '')}"</div>
    </div>`).join('');

  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx  = parseInt(el.dataset.i, 10);
      const all  = loadHistory();
      const item = all[idx];
      if (!item || !item.data) return;
      switchTab('generator');

      /* Restore input fields */
      const topicEl  = $('topic');
      const targetEl = $('target');
      if (topicEl)  topicEl.value  = item.topic  || '';
      if (targetEl) targetEl.value = item.target || '';

      /* [FIX 5] Sync pills UI dengan data history */
      syncPills('platformPills', 'platform', item.platform || 'tiktok');
      syncPills('stylePills',    'style',    item.style    || 'santai');
      syncPills('formatPills',   'format',   item.format   || 'standard');
      syncPills('goalPills',     'goal',     item.goal     || 'closing');

      lastResult = item.data;
      renderResults(item.data);
      toast('📋 Riwayat dimuat!');
    });
  });
}

function clearHistory() {
  if (!confirm('Hapus semua riwayat?')) return;
  try { localStorage.removeItem(HIST_KEY); } catch { /* skip */ }
  renderHistory();
  toast('🗑️ Riwayat dihapus');
}

/* ════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT
════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    generateContent();
  }
  if (e.key === 'Escape') hideApiKeyModal();
});

/* ════════════════════════════════════════════════════════════
   INIT — semua DOM access hanya setelah DOMContentLoaded
════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  const appScreen = $('appScreen');
  const bottomNav = $('bottomNav');
  if (appScreen) appScreen.style.display = '';
  if (bottomNav) bottomNav.style.display = '';

  /* Init pills */
  initPills('platformPills', 'platform');
  initPills('stylePills',    'style');
  initPills('formatPills',   'format');
  initPills('goalPills',     'goal');

  /* Tab navigation */
  document.querySelectorAll('.nav-tab, .bnav-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  /* Button event listeners (null-guard) */
  const btnGenerate  = $('btnGenerate');
  const btnApiKey    = $('btnApiKey');
  const btnSaveKey   = $('btnSaveKey');
  const btnCancelKey = $('btnCancelKey');
  const apiKeyModal  = $('apiKeyModal');
  const apiKeyInput  = $('apiKeyInput');

  if (btnGenerate)  btnGenerate.addEventListener('click', generateContent);
  if (btnApiKey)    btnApiKey.addEventListener('click', showApiKeyModal);
  if (btnSaveKey)   btnSaveKey.addEventListener('click', saveApiKeyFromModal);
  if (btnCancelKey) btnCancelKey.addEventListener('click', hideApiKeyModal);
  if (apiKeyModal)  apiKeyModal.addEventListener('click', e => {
    if (e.target === apiKeyModal) hideApiKeyModal();
  });
  if (apiKeyInput)  apiKeyInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      saveApiKeyFromModal();
    }
  });

  /* [FIX 8] Mobile: set font-size >= 16px pada semua input agar iOS tidak auto-zoom */
  document.querySelectorAll('input[type="text"], textarea').forEach(inp => {
    const fs = parseFloat(window.getComputedStyle(inp).fontSize);
    if (!isNaN(fs) && fs < 16) inp.style.fontSize = '16px';
  });

  /* Status awal API key */
  updateApiKeyStatus();

  /* Toast sambutan */
  setTimeout(() => {
    const cnt = getApiKeys().length;
    if (cnt > 0) {
      toast(`⚡ Viral Studio PRO siap! ${cnt} API key · ${FREE_MODELS.length} model aktif.`, 4000);
    } else {
      toast('👆 Tap tombol API key untuk mulai.', 4000);
      if (window.innerWidth >= 768) {
        setTimeout(showApiKeyModal, 1000);
      }
    }
  }, 600);
});
