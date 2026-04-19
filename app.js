/* ═══════════════════════════════════════════════════════════
   VIRAL STUDIO PRO — app.js v7.0 AI Race Edition
   Semua model dipanggil SERENTAK → yang pertama respond menang
   Multi API Key support
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

/* ── MODEL LIST (tersembunyi dari UI) ──────────────────────── */
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

/* ════════════════════════════════════════════════════════════
   BUILD PROMPT
════════════════════════════════════════════════════════════ */
function buildPrompt(topic, target, platform, style, format) {
  const platformDesc = {
    tiktok:    'TikTok (hook kuat di detik pertama, bahasa gaul, energik, singkat padat)',
    instagram: 'Instagram (aspirasional, storytelling, estetik, caption mendalam)',
    youtube:   'YouTube (edukatif, opening powerful, struktur jelas, engaging)',
  }[platform] || platform;

  const styleDesc = {
    santai:   'santai dan conversational, seperti ngobrol sama teman dekat',
    tegas:    'tegas, no-bullshit, straight to the point, tanpa basa-basi',
    dramatis: 'dramatis dan emosional, bikin audiens tergerak dan relate',
    edukatif: 'edukatif dan informatif, berbasis fakta, membangun kredibilitas',
    humor:    'humor dan relatable, witty, bikin senyum tapi tetap berbobot',
  }[style] || style;

  const bonusInstruction = {
    thread:   'Untuk field "bonus": buat thread 6 tweet terstruktur (awali tiap tweet dengan 1/ 2/ dst, pisahkan dengan newline)',
    carousel: 'Untuk field "bonus": buat 6 slide carousel (tiap slide format: "Slide N: teks", pisahkan dengan newline)',
    short:    'Untuk field "bonus": buat script short-form video 15-30 detik dalam 5 baris (tiap baris = satu scene)',
    standard: '',
  }[format] || '';

  const needBonus = format !== 'standard';

  return `Kamu adalah expert content creator Indonesia, spesialis konten viral social media.

TUGAS: Buat paket konten marketing yang SANGAT SPESIFIK untuk:
- Produk/Topik: "${topic}"
- Target audiens: ${target}
- Platform: ${platformDesc}
- Gaya penulisan: ${styleDesc}

ATURAN WAJIB:
1. Setiap kalimat HARUS menyebut atau berkaitan langsung dengan "${topic}"
2. Sesuaikan dengan karakteristik nyata dari produk/topik tersebut
3. Gunakan Bahasa Indonesia yang natural sesuai platform
4. JANGAN generik — konten harus terasa dibuat khusus untuk "${topic}"

Balas HANYA dengan JSON valid (tidak ada teks, penjelasan, atau markdown di luar JSON):

{
  "hooks": [
    {"type": "⚠️ Fear", "text": "hook spesifik tentang ${topic}"},
    {"type": "💡 Curiosity", "text": "hook spesifik tentang ${topic}"},
    {"type": "⏰ Urgency", "text": "hook spesifik tentang ${topic}"},
    {"type": "🔍 Problem", "text": "hook spesifik tentang ${topic}"},
    {"type": "🌟 Aspiration", "text": "hook spesifik tentang ${topic}"},
    {"type": "👥 Social Proof", "text": "hook spesifik tentang ${topic}"},
    {"type": "🏆 Authority", "text": "hook spesifik tentang ${topic}"},
    {"type": "⚡ Contrast", "text": "hook spesifik tentang ${topic}"},
    {"type": "🔐 Secret", "text": "hook spesifik tentang ${topic}"},
    {"type": "💪 Challenge", "text": "hook spesifik tentang ${topic}"}
  ],
  "script": {
    "opening": "pembuka video kuat dan spesifik tentang ${topic} untuk ${platform}",
    "problem": "masalah nyata ${target} terkait ${topic}",
    "agitation": "pertegas dampak masalah tersebut",
    "solution": "posisikan ${topic} sebagai solusi konkret",
    "cta": "call to action natural untuk ${platform}"
  },
  "caption": "caption lengkap minimal 150 kata dengan storytelling, soft selling ${topic}, dan 8-10 hashtag relevan",
  "ideas": [
    "ide konten 1 spesifik tentang ${topic}",
    "ide konten 2 spesifik tentang ${topic}",
    "ide konten 3 spesifik tentang ${topic}",
    "ide konten 4 spesifik tentang ${topic}",
    "ide konten 5 spesifik tentang ${topic}"
  ]${needBonus ? ',\n  "bonus": "konten bonus di sini"' : ''}
}

${bonusInstruction}`;
}

/* ════════════════════════════════════════════════════════════
   SINGLE MODEL CALL — return text atau throw
════════════════════════════════════════════════════════════ */
/* ── Timeout wrapper ─────────────────────────────────────── */
function withTimeout(promise, ms, label) {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${ms/1000}s (${label})`)), ms)
  );
  return Promise.race([promise, timer]);
}

/* ── Single model call dengan timeout 20 detik ───────────── */
async function callOneModel(model, apiKey, prompt) {
  const shortName = model.split('/').pop().replace(':free','');

  const fetchPromise = fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://viralstudio.app',
      'X-Title': 'Viral Studio PRO',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2800,
      temperature: 0.85,
    }),
  });

  let res;
  try {
    res = await withTimeout(fetchPromise, 20000, shortName);
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

  if (text.trim().length < 80) {
    console.warn(`[${shortName}] response terlalu pendek (${text.length} chars)`);
    throw new Error('Response terlalu pendek');
  }

  console.log(`[${shortName}] ✓ sukses (${text.length} chars)`);
  return { text, model };
}

/* ════════════════════════════════════════════════════════════
   RACE ALL MODELS — semua dipanggil serentak
   Jika Promise.any gagal semua → fallback sequential satu per satu
════════════════════════════════════════════════════════════ */
async function raceAllModels(prompt) {
  const keys = getApiKeys();
  if (!keys.length) throw new Error('NO_API_KEY');

  console.log(`[Race] Memanggil ${FREE_MODELS.length} model serentak...`);

  /* Tahap 1: Race semua model serentak */
  const promises = FREE_MODELS.map(model => {
    const key = pickRandomKey(keys);
    return callOneModel(model, key, prompt).catch(err => {
      return Promise.reject(new Error(`${model}: ${err.message}`));
    });
  });

  try {
    const result = await Promise.any(promises);
    console.log(`[Race] Winner:`, result.model);
    return result;
  } catch (aggregateErr) {
    /* Semua race gagal → coba sequential dengan timeout lebih panjang */
    console.warn('[Race] Semua serentak gagal, coba sequential fallback...');
    return sequentialFallback(prompt, keys);
  }
}

/* ── Sequential fallback: coba satu per satu jika race gagal ── */
async function sequentialFallback(prompt, keys) {
  for (const model of FREE_MODELS) {
    const key = pickRandomKey(keys);
    const shortName = model.split('/').pop().replace(':free','');
    try {
      console.log(`[Fallback] Mencoba ${shortName}...`);
      /* Timeout lebih panjang untuk fallback: 30 detik */
      const result = await withTimeout(callOneModel(model, key, prompt), 30000, shortName);
      console.log(`[Fallback] Berhasil dengan ${shortName}`);
      return result;
    } catch (err) {
      console.warn(`[Fallback] ${shortName} gagal:`, err.message);
      continue;
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
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch {}
  }

  throw new Error('Tidak bisa parse respons AI sebagai JSON');
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

  /* Tampilkan indikator loading sederhana tanpa nama model */
  const statusWrap = $('modelStatusWrap');
  statusWrap.style.display = 'block';
  $('modelStatus').innerHTML =
    '<span class="ms-racing">⚡ Menghubungi AI — mohon tunggu 10-30 detik…</span>';

  try {
    const prompt = buildPrompt(topic, target, platform, style, format);
    const { text: rawText, model } = await raceAllModels(prompt);
    winnerModel = model;

    /* Update status: selesai tanpa sebut nama model */
    $('modelStatus').innerHTML = '<span class="ms-ok">✓ Konten berhasil digenerate</span>';

    let parsed;
    try {
      parsed = parseAIResponse(rawText);
    } catch {
      /* Retry sekali jika parse gagal */
      toast('🔄 Memproses ulang format…', 1500);
      const retryPrompt = buildPrompt(topic, target, platform, style, format) +
        '\n\nWAJIB: Output HANYA JSON murni. Mulai langsung dari karakter {';
      const retry = await raceAllModels(retryPrompt);
      parsed = parseAIResponse(retry.text);
      winnerModel = retry.model;
    }

    /* Normalisasi data */
    const hooks = (parsed.hooks || []).map(h => ({
      type: h.type || '💡 Hook',
      tkey: hookTypeToKey(h.type || ''),
      text: h.text || '',
    })).filter(h => h.text.trim());

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
    console.error('[Generate] Detail error:', err);
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
  res.style.display      = 'flex';
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

/* Enter di textarea = newline biasa (bukan submit), tapi Ctrl+Enter = submit */
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
