/* ═══════════════════════════════════════════════════════════
   VIRAL STUDIO PRO — app.js v8.0 Optimized Edition
   - Prompt lebih natural & kontekstual (tidak kaku/generik)
   - AI race lebih reliable dengan smarter retry logic
   - Better JSON extraction & validation
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

/* ── MODEL LIST ────────────────────────────────────────────── */
const FREE_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',
  'z-ai/glm-4.5-air:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'minimax/minimax-m2.5:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-coder:free',
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
    toast('✅ Berhasil disalin!');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '✅';
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
  try { document.execCommand('copy'); ok(); } catch { toast('❌ Gagal copy.'); }
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
  const keys = raw.split('\n')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  const valid   = keys.filter(k => k.startsWith('sk-or-'));
  const invalid = keys.filter(k => k.length > 0 && !k.startsWith('sk-or-'));

  if (valid.length === 0) {
    toast('⚠️ Tidak ada API key valid. Harus diawali "sk-or-"'); return;
  }
  if (invalid.length > 0) {
    toast(`⚠️ ${invalid.length} key diabaikan (format salah)`);
  }

  saveApiKeys(valid);
  hideApiKeyModal();
  updateApiKeyStatus();
  toast(`✅ ${valid.length} API key tersimpan!`);
}

function updateApiKeyStatus() {
  const keys = getApiKeys();
  const el   = $('apiKeyStatus');
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
   BUILD PROMPT — Lebih natural, kontekstual, dan spesifik
════════════════════════════════════════════════════════════ */

/**
 * Menghasilkan variasi kata pembuka agar prompt tidak monoton
 * setiap kali generate (mengurangi output yang terpola/template-ish)
 */
function randomVariant(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildPrompt(topic, target, platform, style, format) {

  /* ── Deskripsi platform yang lebih natural ── */
  const platformCtx = {
    tiktok: `TikTok — audiens scrolling cepat, butuh hook di 1-2 detik pertama. Bahasa santai, anak muda, energi tinggi. Video pendek 15-60 detik. Tren dan sound culture sangat berpengaruh.`,
    instagram: `Instagram — audiens yang lebih aspirasional dan curated. Caption bisa lebih panjang dan story-driven. Estetika visual penting. Cocok untuk soft selling dan brand building jangka panjang.`,
    youtube: `YouTube — audiens datang dengan intent yang lebih tinggi, siap nonton lebih lama. Opening harus langsung menjawab "kenapa harus nonton ini". Struktur konten lebih terorganisir. Trust-building penting.`,
  }[platform] || platform;

  /* ── Deskripsi style yang lebih hidup ── */
  const styleCtx = {
    santai: `Gaya ngobrol, seperti teman dekat yang kasih saran jujur. Pakai "lo/gue", natural, tidak ada kesan jualan. Hindari kata-kata baku atau kaku.`,
    tegas: `Langsung ke inti, no fluff. Setiap kalimat harus punya bobot. Tidak ada basa-basi, tidak ada kata filler. Seperti founder yang ngomong langsung ke market-nya.`,
    dramatis: `Emosional dan theatrical. Bangun ketegangan, pakai contrast (dulu vs sekarang, salah vs benar). Bikin audiens merasa cerita ini tentang mereka.`,
    edukatif: `Tone seperti mentor yang sabar. Gunakan analogi konkret, fakta spesifik, dan struktur yang mudah diikuti. Audiens harus merasa lebih pintar setelah baca/nonton.`,
    humor: `Witty, self-aware, kadang absurd tapi tetap nyambung ke topik. Timing humor penting — jangan dipaksain. Bisa pakai ironi atau exaggeration yang relatable.`,
  }[style] || style;

  /* ── Instruksi bonus format ── */
  const bonusMap = {
    thread: `Untuk field "bonus": Tulis thread Twitter/X terdiri dari 6 tweet. Setiap tweet harus standalone (bisa dimengerti sendiri) tapi mengalir secara narasi. Format: "1/ [teks]\n\n2/ [teks]\n\n..." dst. Jangan mulai semua tweet dengan pola yang sama.`,
    carousel: `Untuk field "bonus": Buat 6 slide carousel Instagram. Slide 1 = hook yang bikin orang mau swipe. Slide 2-5 = isi yang progresif, makin dalam makin menarik. Slide 6 = CTA + cliffhanger. Format tiap slide: "Slide N: [teks slide]". Teks tiap slide maksimal 25 kata — harus bisa dibaca dalam 3 detik.`,
    short: `Untuk field "bonus": Script video pendek 15-30 detik, dibagi 5 baris (1 baris = 1 scene/shot). Tiap baris format: "Scene N: [aksi + dialog/narasi]". Harus ada visual direction singkat di tiap scene.`,
    standard: ``,
  }[format] || '';

  const needBonus = format !== 'standard';

  /* ── Framing variasi agar output tidak terpola ── */
  const framings = [
    `Bayangkan kamu adalah content strategist berpengalaman 8 tahun yang spesialis di pasar Indonesia. Klienmu datang dengan brief ini:`,
    `Kamu sedang brainstorming konten untuk brand baru yang butuh penetrasi market cepat. Briefnya:`,
    `Seorang kreator konten top Indonesia minta bantuanmu untuk campaign baru. Detail brief:`,
  ];
  const opening = randomVariant(framings);

  /* ── Contoh hook konkret sesuai topik (few-shot cue) ── */
  // Ini mendorong model meniru struktur SPESIFIK bukan generik
  const hookExamples = `
Contoh hook yang BAGUS (spesifik, bukan generik):
✅ "Kamu sudah buang uang 200rb/bulan buat skincare yang ternyata bikin kulitmu makin kusam" ← spesifik, ada angka, ada twist
✅ "99% orang Jakarta tidak tahu cara benar pakai sunscreen — termasuk kamu yang baca ini sekarang" ← ada lokasi, ada challenge
✅ "Teman kerjaku nanya kenapa kulitku glowing padahal budget perawatannya cuma 50rb seminggu" ← ada social proof, ada angka, relatable

Contoh hook yang BURUK (generik, jangan ditiru):
❌ "Apakah kamu ingin kulit yang lebih sehat dan bercahaya?"
❌ "Produk ini akan mengubah hidupmu selamanya"
❌ "Inilah rahasia yang tidak ingin diketahui orang lain"`;

  return `${opening}

Produk/Topik: "${topic}"
Target audiens: ${target}
Platform: ${platformCtx}
Tone & Gaya: ${styleCtx}

${hookExamples}

BRIEF LENGKAP:
Buat paket konten marketing yang tajam, spesifik, dan terasa MANUSIAWI untuk "${topic}". 
Konten harus terasa seperti ditulis oleh orang yang benar-benar paham produk/topik ini — bukan template AI.

Aturan yang WAJIB diikuti:
- Setiap hook harus mengandung minimal SATU dari: angka spesifik / nama lokasi / situasi konkret / twist yang tidak terduga
- Script harus flow natural, tidak terasa seperti formula AIDA yang robotik
- Caption harus punya "suara" — pembaca harus bisa merasakan personalitas di balik teks
- Ideas harus eksekutable secara nyata, bukan ide abstrak
- HINDARI frasa generik: "rahasia tersembunyi", "ubah hidupmu", "solusi terbaik", "produk berkualitas", "jangan lewatkan"

Output: JSON valid saja. Tidak ada teks, penjelasan, komentar, atau markdown di luar JSON.
Mulai langsung dari karakter {

{
  "hooks": [
    {"type": "⚠️ Fear", "text": "hook dengan angka atau situasi konkret tentang ${topic}"},
    {"type": "💡 Curiosity", "text": "hook dengan twist atau info counter-intuitive tentang ${topic}"},
    {"type": "⏰ Urgency", "text": "hook dengan deadline atau konteks waktu spesifik tentang ${topic}"},
    {"type": "🔍 Problem", "text": "hook yang gambarkan masalah dengan detail sensorik tentang ${topic}"},
    {"type": "🌟 Aspiration", "text": "hook dengan gambaran hasil konkret/spesifik tentang ${topic}"},
    {"type": "👥 Social Proof", "text": "hook dengan social proof yang terasa nyata dan relatable tentang ${topic}"},
    {"type": "🏆 Authority", "text": "hook berbasis data, riset, atau fakta menarik tentang ${topic}"},
    {"type": "⚡ Contrast", "text": "hook dengan before-after atau perbandingan yang dramatis tentang ${topic}"},
    {"type": "🔐 Secret", "text": "hook yang ungkap insight non-obvious tentang ${topic}"},
    {"type": "💪 Challenge", "text": "hook yang challenge asumsi umum tentang ${topic}"}
  ],
  "script": {
    "opening": "kalimat pembuka yang langsung grab attention — boleh pakai pertanyaan retoris, stat mengejutkan, atau pernyataan berani tentang ${topic}",
    "problem": "gambarkan masalah dengan detail yang bikin ${target} ngangguk-ngangguk karena merasa dipahami",
    "agitation": "perbesar stakes-nya — apa yang terjadi kalau masalah ini dibiarkan? pakai visual language yang kuat",
    "solution": "posisikan ${topic} sebagai solusi dengan cara yang terasa natural dan tidak hard-sell",
    "cta": "CTA yang spesifik dan terasa mendesak tapi tidak memaksa — sesuaikan dengan behavior user di ${platform}"
  },
  "caption": "caption lengkap 150-250 kata. Mulai dengan kalimat pembuka yang kuat (bukan 'Halo semuanya!'). Masukkan mini-story atau satu insight berharga. Soft selling yang terasa natural. Tutup dengan pertanyaan yang invite engagement. Sertakan 8-10 hashtag campuran (niche + medium + trending) yang relevan dengan ${topic} dan ${platform}.",
  "ideas": [
    "ide konten 1: spesifik dengan format dan angle yang jelas untuk ${topic}",
    "ide konten 2: spesifik dengan format dan angle yang jelas untuk ${topic}",
    "ide konten 3: spesifik dengan format dan angle yang jelas untuk ${topic}",
    "ide konten 4: spesifik dengan format dan angle yang jelas untuk ${topic}",
    "ide konten 5: spesifik dengan format dan angle yang jelas untuk ${topic}"
  ]${needBonus ? ',\n  "bonus": "konten bonus sesuai instruksi di bawah"' : ''}
}

${bonusMap}`;
}

/* ════════════════════════════════════════════════════════════
   VALIDATE PARSED RESULT — cek apakah output cukup bermakna
════════════════════════════════════════════════════════════ */
function validateParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const hooks = parsed.hooks;
  if (!Array.isArray(hooks) || hooks.length < 3) return false;
  // Minimal 3 hook harus punya teks yang cukup panjang
  const validHooks = hooks.filter(h => h?.text && h.text.trim().length > 20);
  if (validHooks.length < 3) return false;
  if (!parsed.script?.opening || parsed.script.opening.trim().length < 20) return false;
  if (!parsed.caption || parsed.caption.trim().length < 80) return false;
  return true;
}

/* ════════════════════════════════════════════════════════════
   SINGLE MODEL CALL
════════════════════════════════════════════════════════════ */
function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${ms/1000}s (${label})`)), ms)
  );
  return Promise.race([promise, timer]);
}

async function callOneModel(model, apiKey, prompt) {
  const shortName = model.split('/').pop().replace(':free','');

  const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': (window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : 'https://viralstudio.app',
      'X-Title': 'Viral Studio PRO',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          // System message untuk reinforce JSON-only output
          role: 'system',
          content: 'Kamu adalah content strategist Indonesia yang ahli. Selalu respond HANYA dengan JSON valid — tidak ada teks sebelum atau sesudah JSON. Tidak ada ```json``` wrapper. Mulai langsung dari karakter {',
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 3200,      // Dinaikkan agar caption + bonus tidak terpotong
      temperature: 0.88,     // Sedikit lebih tinggi untuk hasil lebih variatif
      top_p: 0.92,           // Tambah top_p untuk sampling yang lebih beragam
    }),
  });

  let res;
  try {
    res = await withTimeout(fetchPromise, 22000, shortName);
  } catch (err) {
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

  if (text.trim().length < 100) {
    console.warn(`[${shortName}] response terlalu pendek (${text.length} chars)`);
    throw new Error('Response terlalu pendek');
  }

  // Quick sanity check: harus ada struktur JSON dasar
  if (!text.includes('"hooks"') || !text.includes('"script"')) {
    console.warn(`[${shortName}] response tidak mengandung struktur yang diharapkan`);
    throw new Error('Struktur JSON tidak valid');
  }

  console.log(`[${shortName}] ✓ sukses (${text.length} chars)`);
  return { text, model };
}

/* ════════════════════════════════════════════════════════════
   RACE ALL MODELS
════════════════════════════════════════════════════════════ */
async function raceAllModels(prompt) {
  const keys = getApiKeys();
  if (!keys.length) throw new Error('NO_API_KEY');

  console.log(`[Race] Memanggil ${FREE_MODELS.length} model serentak...`);

  const promises = FREE_MODELS.map(model => {
    const key = pickRandomKey(keys);
    return callOneModel(model, key, prompt).catch(err =>
      Promise.reject(new Error(`${model}: ${err.message}`))
    );
  });

  try {
    const result = await Promise.any(promises);
    console.log(`[Race] Winner:`, result.model);
    return result;
  } catch {
    console.warn('[Race] Semua serentak gagal, coba sequential fallback...');
    return sequentialFallback(prompt, keys);
  }
}

async function sequentialFallback(prompt, keys) {
  for (const model of FREE_MODELS) {
    const key = pickRandomKey(keys);
    const shortName = model.split('/').pop().replace(':free','');
    try {
      console.log(`[Fallback] Mencoba ${shortName}...`);
      const result = await withTimeout(callOneModel(model, key, prompt), 32000, shortName);
      console.log(`[Fallback] Berhasil dengan ${shortName}`);
      return result;
    } catch (err) {
      console.warn(`[Fallback] ${shortName} gagal:`, err.message);
    }
  }
  throw new Error('ALL_MODELS_FAILED');
}

/* ════════════════════════════════════════════════════════════
   PARSE AI RESPONSE — lebih robust, multi-strategy
════════════════════════════════════════════════════════════ */
function parseAIResponse(text) {
  const cleaned = text.trim();

  // Strategy 1: Direct parse
  try { return JSON.parse(cleaned); } catch {}

  // Strategy 2: Strip markdown code fences
  const m1 = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch {} }

  // Strategy 3: Extract outermost { ... }
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) {
    const slice = cleaned.slice(s, e + 1);
    try { return JSON.parse(slice); } catch {
      // Strategy 4: Aggressive JSON repair untuk kasus trailing comma atau unclosed string
      const repaired = repairJSON(slice);
      try { return JSON.parse(repaired); } catch {}
    }
  }

  throw new Error('Tidak bisa parse respons AI sebagai JSON');
}

/**
 * Perbaikan ringan untuk JSON yang hampir valid:
 * - Hapus trailing comma sebelum } atau ]
 * - Tutup string yang tidak ter-close (edge case model kepotong)
 */
function repairJSON(str) {
  // Hapus trailing commas
  let fixed = str.replace(/,\s*([\]}])/g, '$1');
  // Jika JSON tidak closed di akhir, coba tutup paksa
  // (hanya untuk kasus output terpotong)
  const opens = (fixed.match(/\{/g) || []).length;
  const closes = (fixed.match(/\}/g) || []).length;
  for (let i = 0; i < opens - closes; i++) fixed += '}';
  const opensArr = (fixed.match(/\[/g) || []).length;
  const closesArr = (fixed.match(/\]/g) || []).length;
  for (let i = 0; i < opensArr - closesArr; i++) fixed += ']';
  return fixed;
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

  if (!topic)  { $('topic').focus();  toast('⚠️ Isi topik atau nama produk dulu!'); return; }
  if (!target) { $('target').focus(); toast('⚠️ Isi target market dulu!'); return; }

  if (!getApiKeys().length) {
    toast('⚠️ Masukkan API key OpenRouter dulu!', 4000);
    showApiKeyModal();
    return;
  }

  isLoading = true;
  $('btnGenerate').disabled  = true;
  $('btnInner').innerHTML    = '<div class="spinner"></div><span>AI sedang berlomba…</span>';
  $('results').style.display = 'none';

  const statusWrap = $('modelStatusWrap');
  statusWrap.style.display = 'block';
  $('modelStatus').innerHTML =
    '<span class="ms-racing">⚡ Menghubungi AI — mohon tunggu 10-30 detik…</span>';

  try {
    const prompt = buildPrompt(topic, target, platform, style, format);
    let { text: rawText, model } = await raceAllModels(prompt);
    winnerModel = model;

    $('modelStatus').innerHTML = '<span class="ms-ok">✓ Memproses konten…</span>';

    let parsed;
    try {
      parsed = parseAIResponse(rawText);
    } catch {
      // Retry dengan prompt yang lebih strict
      toast('🔄 Memformat ulang respons AI…', 1500);
      const strictPrompt = buildPrompt(topic, target, platform, style, format)
        + '\n\n⚠️ PENTING: Output HANYA karakter JSON. Tidak ada teks apapun di luar JSON. Tidak ada komentar. Mulai dengan { dan akhiri dengan }';
      const retry = await raceAllModels(strictPrompt);
      parsed = parseAIResponse(retry.text);
      winnerModel = retry.model;
    }

    // Validasi kualitas — jika output terlalu generik/pendek, retry
    if (!validateParsed(parsed)) {
      console.warn('[Generate] Output tidak lolos validasi kualitas, retry...');
      toast('🔄 Meningkatkan kualitas output…', 2000);
      const qualityPrompt = buildPrompt(topic, target, platform, style, format)
        + `\n\n🚨 PERHATIAN: Generate ulang dengan lebih spesifik. Setiap hook HARUS punya detail konkret (angka, nama tempat, atau situasi nyata) tentang "${topic}". Jangan generik.`;
      const retry2 = await raceAllModels(qualityPrompt);
      parsed = parseAIResponse(retry2.text);
      winnerModel = retry2.model;
    }

    /* Normalisasi data */
    const hooks = (parsed.hooks || []).map(h => ({
      type: h.type || '💡 Hook',
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
    const bonus   = parsed.bonus ? buildBonusFromText(String(parsed.bonus), format) : null;

    lastResult = {
      meta: {
        topic, target, platform, style, format,
        generatedAt: new Date().toLocaleString('id-ID'),
      },
      hooks, script, caption, ideas, bonus, format,
    };

    renderResults(lastResult);
    saveHistory(lastResult);

    $('modelStatus').innerHTML = '<span class="ms-ok">✓ Konten berhasil digenerate</span>';
    toast('🎉 Konten AI berhasil digenerate!');

  } catch (err) {
    console.error('[generate]', err);
    $('modelStatus').innerHTML = '<span class="ms-failed">✗ Generate gagal — coba lagi</span>';

    if (err.message === 'NO_API_KEY') {
      toast('⚠️ Masukkan API key dulu!', 4000);
      showApiKeyModal();
    } else if (err.message === 'ALL_MODELS_FAILED') {
      toast('❌ Semua model gagal. Periksa API key & koneksi internet, lalu coba lagi.', 6000);
    } else if (err.constructor?.name === 'AggregateError') {
      toast('❌ Semua model gagal respond. Coba lagi dalam beberapa saat.', 6000);
    } else {
      toast('❌ ' + String(err.message).slice(0, 80), 5000);
    }
  } finally {
    isLoading = false;
    $('btnGenerate').disabled = false;
    $('btnInner').innerHTML   = '<span>⚡</span><span>GENERATE ULANG</span>';
  }
}

function hookTypeToKey(type) {
  const lower = type.toLowerCase();
  const map = {
    fear: 'fear', curiosity: 'curiosity', urgency: 'urgency',
    problem: 'problem', aspiration: 'aspiration', social: 'social',
    authority: 'authority', contrast: 'contrast', secret: 'secret',
    challenge: 'challenge',
  };
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return 'curiosity';
}

function buildBonusFromText(text, format) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (format === 'thread') {
    return { type: 'thread', title: 'Thread Content', content: lines };
  }
  if (format === 'carousel') {
    const slides = lines.map((l, i) => ({
      label: `Slide ${i + 1}`,
      text: l.replace(/^slide\s*\d+\s*[:\-]\s*/i, ''),
    }));
    return { type: 'carousel', title: 'Carousel Slides (6 slide)', content: slides };
  }
  if (format === 'short') {
    return { type: 'short', title: 'Short-form Script (15-30 detik)', content: lines };
  }
  return null;
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
  res.style.display       = 'flex';
  res.style.flexDirection = 'column';
  setTimeout(() => res.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function renderMeta(m) {
  const pL = { tiktok: 'TikTok 🎵', instagram: 'Instagram 📸', youtube: 'YouTube ▶️' };
  const sL = { santai: 'Santai 😊', tegas: 'Tegas 💪', dramatis: 'Dramatis 🔥', edukatif: 'Edukatif 📚', humor: 'Humor 😂' };
  const fL = { standard: 'Standard', thread: 'Thread 🧵', carousel: 'Carousel 🎠', short: 'Short-form ⚡' };
  $('resultMeta').innerHTML =
    `<span class="meta-pill">🎯 <strong>${esc(m.topic)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill">👥 <strong>${esc(m.target)}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${pL[m.platform] || m.platform}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${sL[m.style] || m.style}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill"><strong>${fL[m.format] || m.format}</strong></span>
     <span class="meta-dot">·</span>
     <span class="meta-pill">🕐 ${esc(m.generatedAt)}</span>`;
}

const HCLS = {
  curiosity: 'tag-curiosity', fear: 'tag-fear', urgency: 'tag-urgency',
  problem: 'tag-problem', aspiration: 'tag-aspiration', social: 'tag-social',
  authority: 'tag-authority', contrast: 'tag-contrast', secret: 'tag-secret',
  challenge: 'tag-challenge',
};

function renderHooks(hooks) {
  $('hooksList').innerHTML = hooks.map((h, i) => `
    <div class="hook-item" data-text="${esc(h.text)}">
      <div class="hook-num">${i + 1}</div>
      <div class="hook-tag ${HCLS[h.tkey] || 'tag-curiosity'}">${esc(h.type)}</div>
      <div class="hook-text">${esc(h.text)}</div>
    </div>`).join('');

  $('hooksList').querySelectorAll('.hook-item').forEach(el => {
    el.addEventListener('click', () => {
      el.style.borderColor = 'rgba(232,255,71,.4)';
      el.style.background  = 'rgba(232,255,71,.06)';
      setTimeout(() => { el.style.borderColor = ''; el.style.background = ''; }, 1600);
      copyText(el.dataset.text, null);
    });
  });
}

function renderScript(s) {
  const parts = [
    { key: 'opening',   label: '🎬 Opening',   cls: 'tag-opening'   },
    { key: 'problem',   label: '😤 Problem',   cls: 'tag-problem'   },
    { key: 'agitation', label: '🔥 Agitation', cls: 'tag-agitation' },
    { key: 'solution',  label: '✅ Solution',  cls: 'tag-solution'  },
    { key: 'cta',       label: '📣 CTA',       cls: 'tag-cta'       },
  ];
  $('scriptBox').innerHTML = parts.map(p => `
    <div class="script-part">
      <div class="script-tag ${p.cls}">${p.label}</div>
      <div class="script-text">${esc(s[p.key] || '')}</div>
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
    $('bonusContent').innerHTML = bonus.content.map((line, i) =>
      `<div class="bonus-line ${i === 0 ? 'bonus-line-intro' : ''}">${esc(line)}</div>`
    ).join('');
  } else if (bonus.type === 'carousel') {
    $('bonusContent').innerHTML = bonus.content.map(s =>
      `<div class="carousel-slide"><div class="carousel-label">${esc(s.label)}</div><div class="carousel-text">${esc(s.text)}</div></div>`
    ).join('');
  } else if (bonus.type === 'short') {
    $('bonusContent').innerHTML = bonus.content.map((line, i) =>
      `<div class="shortform-line"><div class="shortform-num">${i + 1}</div><div>${esc(line)}</div></div>`
    ).join('');
  }
}

/* ════════════════════════════════════════════════════════════
   COPY FUNCTIONS
════════════════════════════════════════════════════════════ */
function copyScript() {
  if (!lastResult) return;
  const s = lastResult.script;
  copyText(
    `🎬 OPENING\n${s.opening}\n\n😤 PROBLEM\n${s.problem}\n\n🔥 AGITATION\n${s.agitation}\n\n✅ SOLUTION\n${s.solution}\n\n📣 CTA\n${s.cta}`,
    $('copyScriptBtn')
  );
}
function copyCaption() {
  if (!lastResult) return;
  copyText(lastResult.caption, $('copyCaptionBtn'));
}
function copyBonus() {
  if (!lastResult?.bonus) return;
  const lines = lastResult.bonus.content;
  copyText(
    Array.isArray(lines)
      ? lines.map(l => typeof l === 'string' ? l : `${l.label}\n${l.text}`).join('\n\n')
      : '',
    $('copyBonusBtn')
  );
}
function copyAllHooks() {
  if (!lastResult) return;
  copyText(
    lastResult.hooks.map((h, i) => `${i + 1}. [${h.type}] ${h.text}`).join('\n\n'),
    $('copyHooksBtn')
  );
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
    firstHook: data.hooks[0]?.text || '',
    data,
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
    list.innerHTML = '<div class="history-empty">📭 Belum ada riwayat.<br>Generate konten pertamamu sekarang!</div>';
    return;
  }
  const pL = { tiktok: 'TikTok 🎵', instagram: 'Instagram 📸', youtube: 'YouTube ▶️' };
  const fL = { standard: '', thread: ' · Thread', carousel: ' · Carousel', short: ' · Short' };
  list.innerHTML = hist.map((h, i) => `
    <div class="history-item" data-i="${i}">
      <div class="history-top">
        <div class="history-topic">${esc(h.topic)}</div>
        <div class="history-plat">${pL[h.platform] || h.platform}${fL[h.format] || ''}</div>
      </div>
      <div class="history-time">👥 ${esc(h.target)} · 🕐 ${esc(h.time)}</div>
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
      toast('📋 Riwayat dimuat!');
    });
  });
}

function clearHistory() {
  if (!confirm('Hapus semua riwayat?')) return;
  try { localStorage.removeItem(HIST_KEY); } catch {}
  renderHistory();
  toast('🗑️ Riwayat dihapus');
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
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    saveApiKeyFromModal();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  $('appScreen').style.display = '';
  $('bottomNav').style.display = '';
  updateApiKeyStatus();

  setTimeout(() => {
    const cnt = getApiKeys().length;
    toast(
      cnt > 0
        ? `⚡ Viral Studio PRO siap! ${cnt} API key · ${FREE_MODELS.length} model aktif.`
        : '👋 Masukkan API key OpenRouter untuk mulai.',
      4000
    );
    if (!cnt) setTimeout(showApiKeyModal, 800);
  }, 500);
});
