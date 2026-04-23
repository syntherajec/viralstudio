/* ═══════════════════════════════════════════════════════════
   VIRAL STUDIO PRO — app.js v9.0 Precision Edition
   Fixes:
   - Speed: AbortController cancel losers, timeout 12s→winner
   - Hook/Caption: prompt hyper-spesifik, anti-generik
   - Script: conversational natural, tidak AIDA robotik
   - Bonus: strict per-format parser (thread/carousel/short)
   - Error rate: abort on first win, smarter fallback
   ═══════════════════════════════════════════════════════════ */

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

/* ── MODEL LIST — diurutkan dari yang paling konsisten & cepat ── */
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

/* ── DOM ───────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── TOAST ─────────────────────────────────────────────────── */
let _tt;
function toast(msg, ms = 2800) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), ms);
}

/* ── ESCAPE HTML ───────────────────────────────────────────── */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── COPY ──────────────────────────────────────────────────── */
async function copyText(text, btn) {
  const ok = () => {
    toast('\u2705 Berhasil disalin!');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '\u2705';
    setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 2000);
  };
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); ok(); return; } catch {}
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); ok(); } catch { toast('\u274c Gagal copy.'); }
  document.body.removeChild(ta);
}

/* ════════════════════════════════════════════════════════════
   MULTI API KEY MANAGEMENT
════════════════════════════════════════════════════════════ */
function getApiKeys() {
  try {
    const raw = localStorage.getItem(APIKEYS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(k => k && k.trim()) : [];
  } catch { return []; }
}

function saveApiKeys(keys) {
  const clean = keys.map(k => k.trim()).filter(k => k.startsWith('sk-or-'));
  localStorage.setItem(APIKEYS_KEY, JSON.stringify(clean));
}

function pickRandomKey(keys) {
  if (!keys.length) return '';
  return keys[Math.floor(Math.random() * keys.length)];
}

function showApiKeyModal() {
  const keys = getApiKeys();
  const ta   = $('apiKeyInput');
  ta.value   = keys.join('\n');
  $('apiKeyModal').style.display = 'flex';
  setTimeout(() => ta.focus(), 100);
}

function hideApiKeyModal() {
  $('apiKeyModal').style.display = 'none';
}

function saveApiKeyFromModal() {
  const raw  = $('apiKeyInput').value;
  const keys = raw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
  const valid   = keys.filter(k => k.startsWith('sk-or-'));
  const invalid = keys.filter(k => k.length > 0 && !k.startsWith('sk-or-'));
  if (valid.length === 0) {
    toast('\u26a0\ufe0f Tidak ada API key valid. Harus diawali "sk-or-"'); return;
  }
  if (invalid.length > 0) toast(`\u26a0\ufe0f ${invalid.length} key diabaikan (format salah)`);
  saveApiKeys(valid);
  hideApiKeyModal();
  updateApiKeyStatus();
  toast(`\u2705 ${valid.length} API key tersimpan!`);
}

function updateApiKeyStatus() {
  const keys = getApiKeys();
  const el   = $('apiKeyStatus');
  if (keys.length > 0) {
    el.textContent = `\uD83D\uDD11 ${keys.length} API key aktif`;
    el.className   = 'api-status has-key';
  } else {
    el.textContent = '\u26a0\ufe0f Belum ada API key';
    el.className   = 'api-status no-key';
  }
}

/* ════════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.nav-tab, .bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-selected', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'tab-' + tab);
  });
  if (tab === 'history') renderHistory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.nav-tab, .bnav-btn').forEach(b => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});

/* ════════════════════════════════════════════════════════════
   PILLS
════════════════════════════════════════════════════════════ */
function initPills(cid, hid) {
  $(cid).querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      $(cid).querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      $(hid).value = p.dataset.value;
    });
  });
}
initPills('platformPills', 'platform');
initPills('stylePills',    'style');
initPills('formatPills',   'format');
initPills('goalPills',     'goal');

/* ════════════════════════════════════════════════════════════
   BUILD PROMPT v9 — Hyper-spesifik, anti-generik, anti-AIDA
════════════════════════════════════════════════════════════ */
function randomVariant(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPrompt(topic, target, platform, style, format) {

  const platformCtx = {
    tiktok:    `TikTok — pengguna scroll 0.5 detik per video. Hook harus menghantam di kalimat pertama. Bahasa anak muda Jakarta 2024, pakai singkatan, energi tinggi. Video 15-60 detik. Jangan mulai dengan "Halo" atau salam apapun.`,
    instagram: `Instagram — pengguna lebih selektif, niat beli lebih tinggi. Caption bisa story-driven 150-250 kata. Visual storytelling penting. CTA harus terasa natural bukan jualan. Gunakan paragraf pendek dan line break untuk readability.`,
    youtube:   `YouTube — penonton datang dengan niat. Opening harus jawab "kenapa video ini worth 5 menitku" dalam 10 detik pertama. Struktur boleh lebih panjang tapi harus ada payoff yang jelas. Trust-building melalui kredibilitas dan data.`,
  }[platform] || platform;

  const styleCtx = {
    santai:    `Gaya teman dekat — pakai "lo/gue", nada bercanda tapi sincere. Boleh pakai kata sehari-hari: "seriusan", "eh tapi", "jujur ya". Jangan ada kata kaku atau formal sama sekali.`,
    tegas:     `Langsung, tidak ada basa-basi. Tiap kalimat harus actionable. Gunakan kalimat pendek. Seperti founder yang pitching ke investor — setiap detik berharga.`,
    dramatis:  `Bangun tension dulu sebelum solusi. Pakai contrast: sebelum vs sesudah, salah vs benar. Boleh pakai kalimat emosional yang bikin orang merasa "itu gue banget". Tapi jangan lebay sampai tidak credible.`,
    edukatif:  `Tone mentor yang genuinely mau membantu. Gunakan analogi dari kehidupan sehari-hari Indonesia. Pakai data atau fakta konkret. Audiens harus merasa lebih pintar dan lebih informed setelah baca.`,
    humor:     `Witty, relatable, sedikit absurd tapi tetap nyambung ke topik. Timing humor penting — bangun dulu situasi, baru punchline. Bisa pakai self-deprecation atau ironi yang orang Indonesia relate.`,
  }[style] || style;

  const bonusInstructions = {
    thread: `
INSTRUKSI BONUS — Thread Twitter/X (6 tweet):
WAJIB format: "1/ [teks]\n\n2/ [teks]\n\n3/ [teks]\n\n4/ [teks]\n\n5/ [teks]\n\n6/ [teks]"
- Tweet 1: hook kuat yang bikin orang klik "Show more" — ada angka atau twist
- Tweet 2-5: insight yang makin dalam per tweet, masing-masing bisa berdiri sendiri
- Tweet 6: kesimpulan + soft CTA yang tidak memaksa
- Panjang tiap tweet: 200-260 karakter
- JANGAN mulai semua tweet dengan kata yang sama
- Tulis sebagai string biasa di field "bonus", pisahkan dengan \\n\\n`,

    carousel: `
INSTRUKSI BONUS — Carousel Instagram (6 slide):
WAJIB format tiap baris: "SLIDE N | JUDUL SLIDE | TEKS KONTEN"
- Slide 1: hook dengan angka atau pertanyaan provokatif tentang ${topic}
- Slide 2-4: satu poin utama per slide, progresif makin dalam
- Slide 5: plot twist atau insight paling valuable (supaya orang save/share)
- Slide 6: CTA konkret + ajakan engage
- Tiap slide MAKSIMAL 20 kata
- JANGAN pakai judul generik: "Tips 1", "Poin Penting", dll
- Tulis sebagai string, 6 baris dipisah \\n
Contoh: "SLIDE 1 | Judul kuat | Teks max 20 kata\\nSLIDE 2 | Judul | Teks\\n..."`,

    short: `
INSTRUKSI BONUS — Script Short Video (15-30 detik, 5 scene):
WAJIB format tiap baris: "SCENE N | VISUAL: [deskripsi kamera] | AUDIO: [dialog/narasi]"
- Scene 1 (0-3 dtk): stop-scroll hook visual — spesifik bukan "tampilkan produk"
- Scene 2 (3-8 dtk): problem relatable dengan detail visual konkret
- Scene 3 (8-18 dtk): demo atau bukti nyata — show don't tell
- Scene 4 (18-25 dtk): hasil/transformasi spesifik dan believable
- Scene 5 (25-30 dtk): CTA + text overlay yang jelas
- VISUAL: bisa diproduksi solo dengan smartphone
- Tulis sebagai string, 5 baris dipisah \\n
Contoh: "SCENE 1 | VISUAL: close-up tangan pegang produk | AUDIO: Ini yang gw pakai 3 bulan terakhir\\nSCENE 2 | VISUAL: ... | AUDIO: ..."`,

    standard: ``,
  }[format] || '';

  const needBonus = format !== 'standard';

  const framings = [
    `Kamu senior content strategist di agency digital Jakarta. Klien datang dengan brief ini:`,
    `Kamu kreator konten 500k followers yang diminta bantu campaign baru. Briefnya:`,
    `Kamu growth marketer spesialis konversi organik Indonesia. Brief klien:`,
  ];
  const opening = randomVariant(framings);

  return `${opening}

Produk/Topik: "${topic}"
Target audiens: ${target}
Platform: ${platformCtx}
Tone: ${styleCtx}

═══════════════════════════════════════
STANDAR KUALITAS WAJIB DIIKUTI
═══════════════════════════════════════

HOOKS — tiap hook HARUS punya SALAH SATU dari:
- Angka spesifik: "3 dari 5 orang Jakarta...", "habis 2 juta untuk...", "dalam 7 hari..."
- Situasi konkret: "lagi scroll TikTok jam 2 pagi...", "pas antri kasir Indomaret..."
- Twist counter-intuitive: berlawanan dari ekspektasi umum
- Social proof konkret: bukan "banyak orang bilang" — ada detail nyata

DILARANG di semua output:
- "rahasia tersembunyi" / "solusi ampuh" / "produk terbaik" / "kualitas premium"
- "ubah hidupmu" / "revolusi" / "breakthrough" / "game changer"
- Kalimat pembuka "Halo semuanya!" / "Hai guys!" / "Apa kabar semua?"
- Hook yang bisa dipakai produk lain — harus SPESIFIK ke "${topic}"

SCRIPT — JANGAN struktur AIDA robotik. Harus terasa orang nyata ngobrol.
Opening langsung ke konflik/pertanyaan mengejutkan. Masalah harus sangat spesifik.
Solusi terasa ditemukan bukan dijual. Setiap kalimat harus earn its place.

CAPTION — Kalimat pertama langsung kuat, bukan salam.
Punya "suara" konsisten dari awal-akhir. Soft sell natural.
Tutup dengan pertanyaan genuinely curious.

IDEAS — Format konten spesifik (POV, GRWM, Before-After, dll) + angle yang jelas.
Eksekutable oleh satu orang dengan smartphone.

Output: JSON valid saja. Mulai langsung dari { — tidak ada teks sebelumnya.

{
  "hooks": [
    {"type": "\u26a0\ufe0f Fear", "text": "hook fear SPESIFIK dengan angka atau situasi konkret tentang ${topic}"},
    {"type": "\uD83D\uDCA1 Curiosity", "text": "hook curiosity dengan twist counter-intuitive tentang ${topic}"},
    {"type": "\u23f0 Urgency", "text": "hook urgency dengan waktu atau konteks spesifik tentang ${topic}"},
    {"type": "\uD83D\uDD0D Problem", "text": "hook problem dengan detail sensorik relatable tentang ${topic}"},
    {"type": "\uD83C\uDF1F Aspiration", "text": "hook aspiration dengan gambaran hasil KONKRET tentang ${topic}"},
    {"type": "\uD83D\uDC65 Social Proof", "text": "hook social proof terasa nyata, ada detail spesifik tentang ${topic}"},
    {"type": "\uD83C\uDFC6 Authority", "text": "hook authority dengan data atau fakta menarik tentang ${topic}"},
    {"type": "\u26a1 Contrast", "text": "hook contrast before-after dramatis tapi believable tentang ${topic}"},
    {"type": "\uD83D\uDD10 Secret", "text": "hook secret dengan insight non-obvious spesifik tentang ${topic}"},
    {"type": "\uD83D\uDCAA Challenge", "text": "hook challenge yang challenge asumsi umum tentang ${topic}"}
  ],
  "script": {
    "opening": "kalimat pembuka LANGSUNG ke inti — tidak ada basa-basi, langsung konflik atau fakta mengejutkan tentang ${topic}",
    "problem": "gambarkan masalah dengan detail sensori — bikin ${target} ngangguk karena merasa dipahami, situasi sangat spesifik",
    "agitation": "perbesar dampak nyata kalau masalah dibiarkan — pakai bahasa visual dan emosional tapi tetap credible",
    "solution": "posisikan ${topic} sebagai solusi yang ditemukan bukan dijual — terasa natural seperti rekomendasi teman",
    "cta": "CTA spesifik yang mendesak tapi tidak memaksa — sesuai behavior ${target} di ${platform}"
  },
  "caption": "caption 150-250 kata. Kalimat pertama langsung kuat — bukan salam. Ada mini-story atau insight konkret. Soft sell natural. Tutup dengan pertanyaan genuine. 8-10 hashtag relevan di akhir.",
  "ideas": [
    "FORMAT: [nama format spesifik] | ANGLE: [sudut pandang] | VISUAL HOOK: [deskripsi opening] untuk ${topic}",
    "FORMAT: [nama format spesifik] | ANGLE: [sudut pandang] | VISUAL HOOK: [deskripsi opening] untuk ${topic}",
    "FORMAT: [nama format spesifik] | ANGLE: [sudut pandang] | VISUAL HOOK: [deskripsi opening] untuk ${topic}",
    "FORMAT: [nama format spesifik] | ANGLE: [sudut pandang] | VISUAL HOOK: [deskripsi opening] untuk ${topic}",
    "FORMAT: [nama format spesifik] | ANGLE: [sudut pandang] | VISUAL HOOK: [deskripsi opening] untuk ${topic}"
  ]${',\\n  "bonus": "isi bonus sesuai format di bawah"' if needBonus else ''}
}

${bonusInstructions}
/* ════════════════════════════════════════════════════════════
   VALIDATE
════════════════════════════════════════════════════════════ */
function validateParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const hooks = parsed.hooks;
  if (!Array.isArray(hooks) || hooks.length < 5) return false;
  const validHooks = hooks.filter(h => h?.text && h.text.trim().length > 30);
  if (validHooks.length < 5) return false;
  if (!parsed.script?.opening || parsed.script.opening.trim().length < 30) return false;
  if (!parsed.caption || parsed.caption.trim().length < 100) return false;
  if (!Array.isArray(parsed.ideas) || parsed.ideas.length < 3) return false;
  return true;
}

/* ════════════════════════════════════════════════════════════
   TIMEOUT
════════════════════════════════════════════════════════════ */
function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${ms/1000}s (${label})`)), ms)
  );
  return Promise.race([promise, timer]);
}

/* ════════════════════════════════════════════════════════════
   SINGLE MODEL CALL — dengan AbortController signal
════════════════════════════════════════════════════════════ */
async function callOneModel(model, apiKey, prompt, signal) {
  const shortName = model.split('/').pop().replace(':free','');
  let res;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            content: 'Kamu adalah content strategist Indonesia berpengalaman. Respond HANYA dengan JSON valid. Tidak ada teks sebelum atau sesudah JSON, tidak ada ```json``` wrapper. Mulai langsung dari karakter {. Pastikan JSON ter-close dengan benar.',
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 3500,
        temperature: 0.85,
        top_p: 0.90,
      }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Aborted');
    console.warn(`[${shortName}] fetch error:`, err.message);
    throw err;
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const reason  = errData?.error?.message || `HTTP ${res.status}`;
    console.warn(`[${shortName}] rejected:`, reason);
    throw new Error(reason);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';

  if (text.trim().length < 150) throw new Error('Response terlalu pendek');
  if (!text.includes('"hooks"') || !text.includes('"script"')) throw new Error('Struktur JSON tidak valid');

  console.log(`[${shortName}] sukses (${text.length} chars)`);
  return { text, model };
}

/* ════════════════════════════════════════════════════════════
   RACE ALL — abort loser setelah winner ditemukan
════════════════════════════════════════════════════════════ */
async function raceAllModels(prompt) {
  const keys = getApiKeys();
  if (!keys.length) throw new Error('NO_API_KEY');

  console.log(`[Race] ${FREE_MODELS.length} model serentak...`);
  const controller = new AbortController();

  const promises = FREE_MODELS.map(model => {
    const key = pickRandomKey(keys);
    return withTimeout(
      callOneModel(model, key, prompt, controller.signal),
      12000,
      model.split('/').pop()
    ).catch(err => Promise.reject(new Error(`${model}: ${err.message}`)));
  });

  try {
    const result = await Promise.any(promises);
    controller.abort(); // cancel semua yang masih jalan
    console.log(`[Race] Winner:`, result.model);
    return result;
  } catch {
    console.warn('[Race] Semua gagal, coba sequential...');
    return sequentialFallback(prompt, keys);
  }
}

async function sequentialFallback(prompt, keys) {
  for (const model of FREE_MODELS) {
    const key = pickRandomKey(keys);
    const shortName = model.split('/').pop().replace(':free','');
    try {
      console.log(`[Fallback] ${shortName}...`);
      const result = await withTimeout(callOneModel(model, key, prompt, null), 18000, shortName);
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
  const cleaned = text.trim();
  try { return JSON.parse(cleaned); } catch {}

  const m1 = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch {} }

  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) {
    const slice = cleaned.slice(s, e + 1);
    try { return JSON.parse(slice); } catch {
      const repaired = repairJSON(slice);
      try { return JSON.parse(repaired); } catch {}
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
   BONUS PARSERS — strict per-format
════════════════════════════════════════════════════════════ */
function parseBonusThread(text) {
  // Try "N/ text" pattern
  const re = /(\d+)\/\s*(.+?)(?=\n\d+\/|\n\n\d+\/|$)/gs;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push({ n: parseInt(m[1]), t: m[2].trim() });
  }
  if (found.length >= 4) {
    found.sort((a, b) => a.n - b.n);
    return found.slice(0, 6).map(f => `${f.n}/ ${f.t}`);
  }
  // Fallback: double-newline chunks
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 20);
  if (chunks.length >= 4) {
    return chunks.slice(0, 6).map((c, i) => /^\d+\//.test(c) ? c : `${i + 1}/ ${c}`);
  }
  // Last resort: single newlines
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 20).slice(0, 6)
    .map((l, i) => /^\d+\//.test(l) ? l : `${i + 1}/ ${l}`);
}

function parseBonusCarousel(text) {
  // Try "SLIDE N | title | text"
  const re = /SLIDE\s*(\d+)\s*[|:]\s*([^|\n]+?)\s*\|\s*([^\n]+)/gi;
  const slides = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    slides.push({ label: `Slide ${m[1]}`, title: m[2].trim(), text: m[3].trim() });
  }
  if (slides.length >= 4) return slides.slice(0, 6);

  // Fallback: "N. text" or "N: text"
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fallback = [];
  for (const line of lines) {
    const mL = line.match(/^(?:slide\s*)?(\d+)[|.\-:\s]+(.+)/i);
    if (mL) fallback.push({ label: `Slide ${mL[1]}`, title: '', text: mL[2].trim() });
  }
  if (fallback.length >= 4) return fallback.slice(0, 6);

  // Last resort chunks
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 10);
  return chunks.slice(0, 6).map((c, i) => ({ label: `Slide ${i + 1}`, title: '', text: c }));
}

function parseBonusShort(text) {
  // Try "SCENE N | VISUAL: ... | AUDIO: ..."
  const re = /SCENE\s*(\d+)\s*[|:]\s*VISUAL[:\s]+([^|]+?)\s*\|\s*AUDIO[:\s]+([^\n]+)/gi;
  const scenes = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    scenes.push({ n: m[1], visual: m[2].trim(), audio: m[3].trim() });
  }
  if (scenes.length >= 3) return scenes.slice(0, 5);

  // Fallback: "Scene N:" lines
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const fallback = [];
  for (const line of lines) {
    const mL = line.match(/^(?:scene\s*)?(\d+)[|.\-:\s]+(.+)/i);
    if (mL) {
      const content = mL[2];
      const audioPart = content.split(/\|\s*(?:audio|dialog|narasi)[:\s]*/i);
      const visualPart = content.split(/VISUAL[:\s]*/i);
      fallback.push({
        n: mL[1],
        visual: (visualPart[1] || audioPart[0] || content).replace(/\|.*/,'').trim(),
        audio: audioPart[1]?.trim() || '',
      });
    }
  }
  if (fallback.length >= 3) return fallback.slice(0, 5);

  // Last resort: chunks
  const chunks = text.split(/\n\n+/).map(c => c.trim()).filter(c => c.length > 10);
  return chunks.slice(0, 5).map((c, i) => ({ n: String(i+1), visual: `[Scene ${i+1}]`, audio: c }));
}

function buildBonusFromText(text, format) {
  if (format === 'thread') {
    return { type: 'thread', title: 'Thread Twitter/X (6 Tweet)', content: parseBonusThread(text) };
  }
  if (format === 'carousel') {
    return { type: 'carousel', title: 'Carousel Instagram (6 Slide)', content: parseBonusCarousel(text) };
  }
  if (format === 'short') {
    return { type: 'short', title: 'Script Short Video (15-30 detik)', content: parseBonusShort(text) };
  }
  return null;
}

/* ════════════════════════════════════════════════════════════
   GENERATE HANDLER
════════════════════════════════════════════════════════════ */
async function generateContent() {
  if (isLoading) return;

  const topic    = $('topic').value.trim();
  const target   = $('target').value.trim();
  const platform = $('platform').value;
  const style    = $('style').value;
  const format   = $('format') ? $('format').value : 'standard';

  if (!topic)  { $('topic').focus();  toast('\u26a0\ufe0f Isi topik atau nama produk dulu!'); return; }
  if (!target) { $('target').focus(); toast('\u26a0\ufe0f Isi target market dulu!'); return; }
  if (!getApiKeys().length) {
    toast('\u26a0\ufe0f Masukkan API key OpenRouter dulu!', 4000);
    showApiKeyModal(); return;
  }

  isLoading = true;
  $('btnGenerate').disabled  = true;
  $('btnInner').innerHTML    = '<div class="spinner"></div><span>AI sedang berlomba\u2026</span>';
  $('results').style.display = 'none';

  const statusWrap = $('modelStatusWrap');
  statusWrap.style.display = 'block';
  $('modelStatus').innerHTML = '<span class="ms-racing">\u26a1 Menghubungi AI \u2014 model tercepat yang menang\u2026</span>';

  try {
    const prompt = buildPrompt(topic, target, platform, style, format);
    let { text: rawText, model } = await raceAllModels(prompt);
    winnerModel = model;

    $('modelStatus').innerHTML = '<span class="ms-ok">\u2713 Memproses konten\u2026</span>';

    let parsed;
    try {
      parsed = parseAIResponse(rawText);
    } catch {
      toast('\uD83D\uDD04 Memformat ulang respons AI\u2026', 1500);
      const strictPrompt = buildPrompt(topic, target, platform, style, format)
        + '\n\nCRITICAL: Output HARUS dimulai { dan diakhiri }. Tidak ada teks di luar JSON. Pastikan semua string tertutup.';
      const retry = await raceAllModels(strictPrompt);
      parsed = parseAIResponse(retry.text);
      winnerModel = retry.model;
    }

    if (!validateParsed(parsed)) {
      toast('\uD83D\uDD04 Meningkatkan kualitas output\u2026', 2000);
      const qualityPrompt = buildPrompt(topic, target, platform, style, format)
        + `\n\nWAJIB: Setiap hook HARUS ada angka spesifik atau situasi konkret tentang "${topic}". DILARANG hook generik. Minimal 30 karakter per hook.`;
      const retry2 = await raceAllModels(qualityPrompt);
      parsed = parseAIResponse(retry2.text);
      winnerModel = retry2.model;
    }

    const hooks = (parsed.hooks || []).map(h => ({
      type: h.type || '\uD83D\uDCA1 Hook',
      tkey: hookTypeToKey(h.type || ''),
      text: h.text || '',
    })).filter(h => h.text.trim().length > 5);

    const script = {
      opening:   String(parsed.script?.opening   || ''),
      problem:   String(parsed.script?.problem   || ''),
      agitation: String(parsed.script?.agitation || ''),
      solution:  String(parsed.script?.solution  || ''),
      cta:       String(parsed.script?.cta       || ''),
    };

    const caption = String(parsed.caption || '');
    const ideas   = (parsed.ideas || []).map((idea, i) => ({ no: i + 1, idea: String(idea) }));
    const bonus   = (parsed.bonus && format !== 'standard')
      ? buildBonusFromText(String(parsed.bonus), format) : null;

    const modelShort = winnerModel.split('/').pop().replace(':free','');

    lastResult = {
      meta: { topic, target, platform, style, format,
        generatedAt: new Date().toLocaleString('id-ID'),
        winnerModel: modelShort },
      hooks, script, caption, ideas, bonus, format,
    };

    renderResults(lastResult);
    saveHistory(lastResult);

    $('modelStatus').innerHTML = `<span class="ms-ok">\u2713 Selesai \u2014 ${modelShort}</span>`;
    toast('\uD83C\uDF89 Konten AI berhasil digenerate!');

  } catch (err) {
    console.error('[generate]', err);
    $('modelStatus').innerHTML = '<span class="ms-failed">\u2717 Generate gagal \u2014 coba lagi</span>';
    if (err.message === 'NO_API_KEY') {
      toast('\u26a0\ufe0f Masukkan API key dulu!', 4000); showApiKeyModal();
    } else if (err.message === 'ALL_MODELS_FAILED') {
      toast('\u274c Semua model gagal. Periksa API key & koneksi, lalu coba lagi.', 6000);
    } else if (err.constructor?.name === 'AggregateError') {
      toast('\u274c Semua model gagal respond. Coba lagi dalam beberapa saat.', 6000);
    } else {
      toast('\u274c ' + String(err.message).slice(0, 80), 5000);
    }
  } finally {
    isLoading = false;
    $('btnGenerate').disabled = false;
    $('btnInner').innerHTML   = '<span>\u26a1</span><span>GENERATE ULANG</span>';
  }
}

function hookTypeToKey(type) {
  const lower = type.toLowerCase();
  const map = { fear:'fear', curiosity:'curiosity', urgency:'urgency',
    problem:'problem', aspiration:'aspiration', social:'social',
    authority:'authority', contrast:'contrast', secret:'secret', challenge:'challenge' };
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return 'curiosity';
}

/* ════════════════════════════════════════════════════════════
   RENDER
════════════════════════════════════════════════════════════ */
function renderResults(data) {
  renderMeta(data.meta);
  renderHooks(data.hooks);
  renderScript(data.script);
  renderCaption(data.caption);
  renderIdeas(data.ideas);
  if (data.bonus) renderBonus(data.bonus);
  else { const b = $('bonusCard'); if (b) b.style.display = 'none'; }
  const res = $('results');
  res.style.display = 'flex';
  res.style.flexDirection = 'column';
  setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function renderMeta(m) {
  const pL = { tiktok:'TikTok \uD83C\uDFB5', instagram:'Instagram \uD83D\uDCF8', youtube:'YouTube \u25B6\uFE0F' };
  const sL = { santai:'Santai \uD83D\uDE0A', tegas:'Tegas \uD83D\uDCAA', dramatis:'Dramatis \uD83D\uDD25', edukatif:'Edukatif \uD83D\uDCDA', humor:'Humor \uD83D\uDE02' };
  const fL = { standard:'Standard', thread:'Thread \uD83E\uDDF5', carousel:'Carousel \uD83C\uDFA0', short:'Short-form \u26A1' };
  const modelBadge = m.winnerModel
    ? `<span class="meta-dot">\u00B7</span><span class="meta-pill">\uD83E\uDD16 ${esc(m.winnerModel)}</span>` : '';
  $('resultMeta').innerHTML =
    `<span class="meta-pill">\uD83C\uDFAF <strong>${esc(m.topic)}</strong></span>
     <span class="meta-dot">\u00B7</span>
     <span class="meta-pill">\uD83D\uDC65 <strong>${esc(m.target)}</strong></span>
     <span class="meta-dot">\u00B7</span>
     <span class="meta-pill"><strong>${pL[m.platform]||m.platform}</strong></span>
     <span class="meta-dot">\u00B7</span>
     <span class="meta-pill"><strong>${sL[m.style]||m.style}</strong></span>
     <span class="meta-dot">\u00B7</span>
     <span class="meta-pill"><strong>${fL[m.format]||m.format}</strong></span>
     ${modelBadge}
     <span class="meta-dot">\u00B7</span>
     <span class="meta-pill">\uD83D\uDD50 ${esc(m.generatedAt)}</span>`;
}

const HCLS = {
  curiosity:'tag-curiosity', fear:'tag-fear', urgency:'tag-urgency',
  problem:'tag-problem', aspiration:'tag-aspiration', social:'tag-social',
  authority:'tag-authority', contrast:'tag-contrast', secret:'tag-secret', challenge:'tag-challenge',
};

function renderHooks(hooks) {
  $('hooksList').innerHTML = hooks.map((h, i) => `
    <div class="hook-item" data-text="${esc(h.text)}">
      <div class="hook-num">${i + 1}</div>
      <div class="hook-tag ${HCLS[h.tkey]||'tag-curiosity'}">${esc(h.type)}</div>
      <div class="hook-text">${esc(h.text)}</div>
    </div>`).join('');
  $('hooksList').querySelectorAll('.hook-item').forEach(el => {
    el.addEventListener('click', () => {
      el.style.borderColor = 'rgba(232,255,71,.4)';
      el.style.background  = 'rgba(232,255,71,.06)';
      setTimeout(() => { el.style.borderColor=''; el.style.background=''; }, 1600);
      copyText(el.dataset.text, null);
    });
  });
}

function renderScript(s) {
  const parts = [
    { key:'opening',   label:'\uD83C\uDFAC Opening',   cls:'tag-opening'   },
    { key:'problem',   label:'\uD83D\uDE24 Problem',   cls:'tag-problem'   },
    { key:'agitation', label:'\uD83D\uDD25 Agitation', cls:'tag-agitation' },
    { key:'solution',  label:'\u2705 Solution',        cls:'tag-solution'  },
    { key:'cta',       label:'\uD83D\uDCE3 CTA',       cls:'tag-cta'       },
  ];
  $('scriptBox').innerHTML = parts.map(p => `
    <div class="script-part">
      <div class="script-tag ${p.cls}">${p.label}</div>
      <div class="script-text">${esc(s[p.key]||'')}</div>
    </div>`).join('');
}

function renderCaption(c) { $('captionText').textContent = c || ''; }

function renderIdeas(ideas) {
  $('ideasList').innerHTML = ideas.map(d => `
    <div class="idea-row">
      <div class="idea-no">${d.no}</div>
      <div>${esc(d.idea)}</div>
    </div>`).join('');
}

function renderBonus(bonus) {
  const card = $('bonusCard');
  if (!card) return;
  card.style.display = '';
  $('bonusTitle').textContent = bonus.title;

  if (bonus.type === 'thread') {
    $('bonusContent').innerHTML = bonus.content.map((line, i) => {
      const match = String(line).match(/^(\d+\/)\s*([\s\S]*)/);
      const prefix = match ? match[1] : `${i+1}/`;
      const text   = match ? match[2] : line;
      return `<div class="bonus-line ${i===0?'bonus-line-intro':''}">
        <span class="thread-num">${prefix}</span><span>${esc(text)}</span>
      </div>`;
    }).join('');

  } else if (bonus.type === 'carousel') {
    $('bonusContent').innerHTML = bonus.content.map((s, i) => `
      <div class="carousel-slide">
        <div class="carousel-label">${esc(s.label||`Slide ${i+1}`)}</div>
        ${s.title ? `<div class="carousel-title">${esc(s.title)}</div>` : ''}
        <div class="carousel-text">${esc(s.text)}</div>
      </div>`).join('');

  } else if (bonus.type === 'short') {
    $('bonusContent').innerHTML = bonus.content.map((scene, i) => {
      if (typeof scene === 'string') {
        return `<div class="shortform-line"><div class="shortform-num">${i+1}</div><div>${esc(scene)}</div></div>`;
      }
      return `<div class="shortform-scene">
        <div class="shortform-num">Scene ${esc(scene.n||i+1)}</div>
        <div class="shortform-block">
          <div class="shortform-visual"><span class="shortform-label">\uD83D\uDCF7 VISUAL</span> ${esc(scene.visual)}</div>
          <div class="shortform-audio"><span class="shortform-label">\uD83C\uDF99\uFE0F AUDIO</span> ${esc(scene.audio)}</div>
        </div>
      </div>`;
    }).join('');
  }
}

/* ════════════════════════════════════════════════════════════
   COPY
════════════════════════════════════════════════════════════ */
function copyScript() {
  if (!lastResult) return;
  const s = lastResult.script;
  copyText(`\uD83C\uDFAC OPENING\n${s.opening}\n\n\uD83D\uDE24 PROBLEM\n${s.problem}\n\n\uD83D\uDD25 AGITATION\n${s.agitation}\n\n\u2705 SOLUTION\n${s.solution}\n\n\uD83D\uDCE3 CTA\n${s.cta}`, $('copyScriptBtn'));
}
function copyCaption() {
  if (!lastResult) return;
  copyText(lastResult.caption, $('copyCaptionBtn'));
}
function copyBonus() {
  if (!lastResult?.bonus) return;
  const b = lastResult.bonus;
  let text = '';
  if (b.type === 'thread') {
    text = b.content.map(l => String(l)).join('\n\n');
  } else if (b.type === 'carousel') {
    text = b.content.map(s => `${s.label}${s.title?' \u2014 '+s.title:''}\n${s.text}`).join('\n\n');
  } else if (b.type === 'short') {
    text = b.content.map(sc =>
      typeof sc === 'string' ? sc
        : `Scene ${sc.n}\n\uD83D\uDCF7 VISUAL: ${sc.visual}\n\uD83C\uDF99\uFE0F AUDIO: ${sc.audio}`
    ).join('\n\n');
  }
  copyText(text, $('copyBonusBtn'));
}
function copyAllHooks() {
  if (!lastResult) return;
  copyText(lastResult.hooks.map((h,i) => `${i+1}. [${h.type}] ${h.text}`).join('\n\n'), $('copyHooksBtn'));
}

/* ════════════════════════════════════════════════════════════
   HISTORY
════════════════════════════════════════════════════════════ */
function saveHistory(data) {
  let h = loadHistory();
  h.unshift({
    id: Date.now(),
    topic: data.meta.topic, target: data.meta.target,
    platform: data.meta.platform, style: data.meta.style,
    format: data.meta.format, time: data.meta.generatedAt,
    firstHook: data.hooks[0]?.text || '', data,
  });
  try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, MAX_HIST))); } catch {}
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}
function renderHistory() {
  const list = $('historyList');
  const hist = loadHistory();
  if (!hist.length) {
    list.innerHTML = '<div class="history-empty">\uD83D\uDCED Belum ada riwayat.<br>Generate konten pertamamu sekarang!</div>';
    return;
  }
  const pL = { tiktok:'TikTok \uD83C\uDFB5', instagram:'Instagram \uD83D\uDCF8', youtube:'YouTube \u25B6\uFE0F' };
  const fL = { standard:'', thread:' \u00B7 Thread', carousel:' \u00B7 Carousel', short:' \u00B7 Short' };
  list.innerHTML = hist.map((h, i) => `
    <div class="history-item" data-i="${i}">
      <div class="history-top">
        <div class="history-topic">${esc(h.topic)}</div>
        <div class="history-plat">${pL[h.platform]||h.platform}${fL[h.format]||''}</div>
      </div>
      <div class="history-time">\uD83D\uDC65 ${esc(h.target)} \u00B7 \uD83D\uDD50 ${esc(h.time)}</div>
      <div class="history-hook">"${esc(h.firstHook)}"</div>
    </div>`).join('');
  list.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = loadHistory()[parseInt(el.dataset.i)];
      if (!item?.data) return;
      switchTab('generator');
      $('topic').value  = item.topic;
      $('target').value = item.target;
      lastResult = item.data;
      renderResults(item.data);
      toast('\uD83D\uDCCB Riwayat dimuat!');
    });
  });
}
function clearHistory() {
  if (!confirm('Hapus semua riwayat?')) return;
  try { localStorage.removeItem(HIST_KEY); } catch {}
  renderHistory();
  toast('\uD83D\uDDD1\uFE0F Riwayat dihapus');
}

/* ════════════════════════════════════════════════════════════
   KEYBOARD & INIT
════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generateContent(); }
  if (e.key === 'Escape') hideApiKeyModal();
});

$('btnGenerate').addEventListener('click', generateContent);
$('btnApiKey').addEventListener('click', showApiKeyModal);
$('btnSaveKey').addEventListener('click', saveApiKeyFromModal);
$('btnCancelKey').addEventListener('click', hideApiKeyModal);
$('apiKeyModal').addEventListener('click', e => {
  if (e.target === $('apiKeyModal')) hideApiKeyModal();
});
$('apiKeyInput').addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveApiKeyFromModal(); }
});

window.addEventListener('DOMContentLoaded', () => {
  $('appScreen').style.display = '';
  $('bottomNav').style.display = '';
  updateApiKeyStatus();
  setTimeout(() => {
    const cnt = getApiKeys().length;
    toast(cnt > 0
      ? `\u26a1 Viral Studio PRO siap! ${cnt} API key \u00B7 ${FREE_MODELS.length} model aktif.`
      : '\uD83D\uDC4B Masukkan API key OpenRouter untuk mulai.',
      4000
    );
    if (!cnt) setTimeout(showApiKeyModal, 800);
  }, 500);
});
