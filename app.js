/* ═══════════════════════════════════════════════════════════
   VIRAL STUDIO PRO — app.js v8.0 AI Race Edition
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
   BUILD PROMPT — ADVANCED PROMPT ENGINEERING v2
════════════════════════════════════════════════════════════ */
function buildPrompt(topic, target, platform, style, format, isRetry = false) {
  const platformDesc = {
    tiktok:    'TikTok (hook scroll-stopping di 1.5 detik pertama, bahasa Gen-Z Indonesia, energi tinggi, punchline tajam, durasi script 30-60 detik)',
    instagram: 'Instagram (visual storytelling, aspirasional namun relatable, caption yang bikin audiens berhenti scroll dan simpan postingan)',
    youtube:   'YouTube (opening pattern-interrupt kuat di 8 detik pertama, struktur problem-agitate-solve-payoff, durasi script 2-4 menit)',
  }[platform] || platform;

  const styleDesc = {
    santai:   'santai dan conversational seperti curhat ke bestie — pakai "lo/gue", slang kekinian, tapi tetap ada punch di setiap kalimat',
    tegas:    'tegas, no-nonsense, zero fluff — setiap kata harus bayar, gaya copywriter senior yang charge ratusan juta per project',
    dramatis: 'dramatis dengan arc emosional — bangun tension, patah hati dulu, baru heal — bikin audiens merasa "ini gue banget"',
    edukatif: 'edukatif berbasis data + storytelling — sajikan fakta mengejutkan dulu, baru explain, berakhir dengan insight yang bikin audiens merasa lebih pintar',
    humor:    'humor yang cerdas dan unexpected — bukan receh, tapi witty dengan twist di akhir yang bikin audiens tag teman mereka',
  }[style] || style;

  const bonusInstruction = {
    thread:   `Untuk field "bonus": buat thread Twitter/X 6 tweet yang saling sambung dan viral-worthy. Format tiap tweet: "1/ [teks tweet pertama]\\n2/ [teks tweet kedua]\\n..." — pisahkan dengan newline. Tweet 1 harus hook kuat, tweet 6 harus CTA. Setiap tweet max 280 karakter. Sebut "${topic}" minimal 3x di seluruh thread.`,
    carousel: `Untuk field "bonus": buat 6 slide carousel Instagram yang save-worthy. Format tiap slide: "Slide N: [judul slide]\\n[body teks slide]" — pisahkan dengan newline. Slide 1 = hook yang bikin orang swipe, Slide 6 = CTA. Setiap slide harus menyebut "${topic}" secara natural.`,
    short:    `Untuk field "bonus": buat script short-form video 15-30 detik yang rewatch-worthy dalam 5 baris. Tiap baris = satu scene/cut dengan blocking action dan dialog. Format: "Scene N: [aksi] + [dialog/VO]". Hook di Scene 1 harus bikin orang batal skip.`,
    standard: '',
  }[format] || '';

  const needBonus = format !== 'standard';

  const psychTriggers = `
PSYCHOLOGICAL TRIGGERS YANG WAJIB DIPAKAI (pilih yang paling relevan per konten):
- FEAR OF MISSING OUT: "Orang-orang yang belum tahu ${topic} ini sedang kehilangan X setiap hari"
- CURIOSITY GAP: Mulai dengan pernyataan yang tidak lengkap, paksa audiens lanjut baca
- SOCIAL PROOF + SPECIFICITY: Bukan "banyak orang" tapi "27.000 orang di Indonesia sudah X"
- EGO TRIGGER: Buat audiens merasa lebih pintar/eksklusif karena mengetahui ${topic}
- URGENCY REAL: Bukan fake countdown, tapi urgency berbasis konsekuensi nyata
- PATTERN INTERRUPT: Mulai dengan sesuatu yang berlawanan dengan ekspektasi audiens`;

  const antiGenericRules = `
LARANGAN KERAS — OUTPUT AKAN DITOLAK JIKA:
❌ Menggunakan frasa: "produk ini sangat bagus", "sangat bermanfaat", "kualitas terjamin", "harga terjangkau", "cocok untuk semua"
❌ Hook yang dimulai dengan: "Hei", "Hai teman-teman", "Assalamu'alaikum", "Perkenalkan"  
❌ CTA generik: "follow akun kami", "kunjungi website kami", "hubungi kami sekarang"
❌ Kalimat tanpa ${topic} — minimal 60% kalimat harus menyebut atau merujuk langsung ke "${topic}"
❌ Ide konten yang bisa dipakai untuk produk/topik lain (harus hyper-specific ke "${topic}")
❌ Caption yang terasa seperti template AI — harus punya voice, persona, dan sudut pandang`;

  const fewShotExample = `
CONTOH OUTPUT BERKUALITAS TINGGI (untuk referensi tone dan specificity):
Hook Fear: "Di Jakarta, setiap orang yang belum pakai ${topic} rata-rata rugi 2 jam produktivitas per hari — dan mereka bahkan tidak sadar."
Hook Curiosity: "Satu hal tentang ${topic} yang tidak diajarkan di kelas manapun — tapi semua orang sukses yang gue kenal tahu ini."
Script Opening: "[ACTION: ambil kamera, tatap langsung] Gue mau jujur sama lo soal ${topic}. Ini bukan review biasa. Ini tentang keputusan yang gue sesali 3 tahun karena gue tidak tahu ini lebih awal."
Caption opening: "Tiga tahun lalu gue hampir nyerah. Bukan karena tidak usaha — tapi karena gue belum ketemu ${topic}. [lanjutkan dengan story spesifik...]"`;

  const retryHardener = isRetry ? `

🚨 RETRY MODE — PROMPT INI DIULANG KARENA OUTPUT SEBELUMNYA KURANG BERKUALITAS 🚨
Kali ini: LEBIH BERANI, LEBIH SPESIFIK, LEBIH EMOSIONAL. Tidak ada ruang untuk generic.
Bayangkan kamu adalah copywriter terbaik Indonesia yang dibayar Rp 50 juta untuk konten ini.
SETIAP KATA HARUS PUNYA FUNGSI. Hapus semua filler. Jangan ada kalimat yang tidak powerful.` : '';

  const systemContext = `Kamu adalah Arya Wibisono — copywriter dan content strategist Indonesia dengan 12 tahun pengalaman, mantan head of content di unicorn startup, yang sekarang freelance dengan rate Rp 50 juta per project. Kamu terkenal karena konten kamu SELALU viral dan TIDAK PERNAH generik. Kamu benci template. Setiap kata yang kamu tulis punya tujuan: stop the scroll, trigger emotion, drive action.`;

  return `${systemContext}

BRIEF KONTEN:
- Produk/Topik: "${topic}"
- Target Audiens Spesifik: ${target}
- Platform: ${platformDesc}
- Tone of Voice: ${styleDesc}
${psychTriggers}
${antiGenericRules}
${fewShotExample}
${retryHardener}

INSTRUKSI TEKNIS:
1. Keyword "${topic}" WAJIB muncul di: setiap hook, opening script, solution script, dan caption (natural, tidak kaku)
2. Hooks harus ada pattern interrupt — jangan mulai dengan pertanyaan biasa
3. Script harus punya micro-story (konflik → turning point → resolusi) dalam format problem-agitation-solution
4. Caption harus punya: opening hook kuat → story/fakta menarik → soft sell → CTA spesifik → 8-10 hashtag relevan (minimal 150 kata total)
5. Content ideas harus hyper-specific — tidak boleh bisa dipakai untuk topik lain
6. Setiap elemen harus terasa ditulis oleh manusia berpengalaman, bukan AI

STRICT JSON OUTPUT FORMAT:
Balas HANYA dengan JSON valid. TIDAK ADA teks sebelum atau sesudah JSON. TIDAK ADA markdown. MULAI LANGSUNG dari karakter {

{
  "hooks": [
    {"type": "⚠️ Fear", "tkey": "fear", "text": "hook fear scroll-stopping spesifik tentang ${topic} — bukan generic"},
    {"type": "💡 Curiosity", "tkey": "curiosity", "text": "hook curiosity gap yang bikin audiens HARUS lanjut baca tentang ${topic}"},
    {"type": "⏰ Urgency", "tkey": "urgency", "text": "hook urgency berbasis konsekuensi nyata tentang ${topic}"},
    {"type": "🔍 Problem", "tkey": "problem", "text": "hook problem yang bikin ${target} merasa 'ini gue banget' terkait ${topic}"},
    {"type": "🌟 Aspiration", "tkey": "aspiration", "text": "hook aspiration yang paint a picture kehidupan setelah pakai ${topic}"},
    {"type": "👥 Social Proof", "tkey": "social", "text": "hook social proof dengan angka/data spesifik tentang ${topic}"},
    {"type": "🏆 Authority", "tkey": "authority", "text": "hook authority yang establish kredibilitas ${topic} secara mengejutkan"},
    {"type": "⚡ Contrast", "tkey": "contrast", "text": "hook before/after contrast yang dramatis antara yang pakai vs tidak pakai ${topic}"},
    {"type": "🔐 Secret", "tkey": "secret", "text": "hook insider secret tentang ${topic} yang belum diketahui banyak orang"},
    {"type": "💪 Challenge", "tkey": "challenge", "text": "hook challenge yang trigger ego audiens untuk buktikan diri terkait ${topic}"}
  ],
  "script": {
    "opening": "pattern-interrupt opening yang bikin audiens berhenti scroll — spesifik tentang ${topic}, dengan action direction jika perlu",
    "problem": "masalah emosional dan fungsional yang SANGAT DIRASAKAN ${target} terkait ${topic} — bukan masalah generic",
    "agitation": "pertegas dampak masalah tersebut dengan konsekuensi nyata yang painful — buat audiens merasa urgensi",
    "solution": "posisikan ${topic} sebagai solusi dengan mekanisme yang jelas + bukti atau story singkat yang credible",
    "cta": "call to action spesifik dan conversational untuk ${platform} — bukan 'follow kami' tapi action yang natural"
  },
  "caption": "caption 150-250 kata dengan: opening hook kuat (bukan 'Halo!') → micro-story personal atau insight mengejutkan → soft sell ${topic} yang terasa organic → CTA spesifik → newline → 8-10 hashtag relevan dan spesifik",
  "ideas": [
    "ide konten 1: format spesifik + angle unik yang HANYA bisa untuk ${topic}",
    "ide konten 2: format spesifik + angle unik yang HANYA bisa untuk ${topic}",
    "ide konten 3: format spesifik + angle unik yang HANYA bisa untuk ${topic}",
    "ide konten 4: format spesifik + angle unik yang HANYA bisa untuk ${topic}",
    "ide konten 5: format spesifik + angle unik yang HANYA bisa untuk ${topic}"
  ]${needBonus ? ',\n  "bonus": "placeholder"' : ''}
}

${bonusInstruction}`;
}

/* ════════════════════════════════════════════════════════════
   VALIDATOR — cek kualitas output AI
════════════════════════════════════════════════════════════ */
const GENERIC_PHRASES = [
  'produk ini sangat bagus', 'sangat bermanfaat', 'kualitas terjamin',
  'harga terjangkau', 'cocok untuk semua', 'follow akun kami',
  'kunjungi website kami', 'hubungi kami', 'hei teman', 'hai teman',
  'perkenalkan produk', 'kami hadir untuk',
];

function countTopicMentions(text, topic) {
  if (!topic || !text) return 0;
  const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.toLowerCase().match(new RegExp(escaped.toLowerCase(), 'g')) || []).length;
}

function validateOutput(parsed, topic) {
  const issues = [];

  if (!parsed.hooks || parsed.hooks.length < 8) {
    issues.push('hooks kurang dari 8');
  }

  const hooksText = (parsed.hooks || []).map(h => h.text || '').join(' ');
  if (countTopicMentions(hooksText, topic) < 5) {
    issues.push('hooks tidak cukup menyebut topik');
  }

  const firstHook = parsed.hooks?.[0]?.text?.toLowerCase() || '';
  if (firstHook.startsWith('hei') || firstHook.startsWith('hai') || firstHook.startsWith('halo') || firstHook.startsWith('apakah kamu') || firstHook.startsWith('apakah anda') || firstHook.length < 30) {
    issues.push('hook pertama terlalu generik atau terlalu pendek');
  }

  const caption = String(parsed.caption || '');
  const captionWords = caption.split(/\s+/).filter(Boolean).length;
  if (captionWords < 120) {
    issues.push(`caption terlalu pendek (${captionWords} kata, minimum 120)`);
  }
  if (countTopicMentions(caption, topic) < 2) {
    issues.push('caption tidak menyebut topik');
  }

  const captionLower = caption.toLowerCase();
  const genericFound = GENERIC_PHRASES.filter(p => captionLower.includes(p));
  if (genericFound.length > 0) {
    issues.push(`caption mengandung frasa generik: "${genericFound[0]}"`);
  }

  const scriptText = Object.values(parsed.script || {}).join(' ');
  if (countTopicMentions(scriptText, topic) < 2) {
    issues.push('script tidak cukup menyebut topik');
  }

  const scriptParts = ['opening', 'problem', 'agitation', 'solution', 'cta'];
  const missingParts = scriptParts.filter(p => !parsed.script?.[p] || String(parsed.script[p]).length < 20);
  if (missingParts.length > 0) {
    issues.push(`script bagian terlalu pendek atau kosong: ${missingParts.join(', ')}`);
  }

  const ideas = parsed.ideas || [];
  if (ideas.length < 4) {
    issues.push('content ideas kurang dari 4');
  }

  return issues;
}

/* ════════════════════════════════════════════════════════════
   SINGLE MODEL CALL — return text atau throw
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
      'HTTP-Referer': (window.location.origin && window.location.origin !== 'null') ? window.location.origin : 'https://viralstudio.app',
      'X-Title': 'Viral Studio PRO',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Kamu adalah copywriter viral Indonesia terbaik. Kamu HANYA merespons dengan JSON valid murni — tidak ada teks, penjelasan, atau markdown di luar JSON. Output kamu selalu dimulai dengan karakter { dan diakhiri dengan karakter }. Kamu tidak pernah menulis kalimat generik atau template.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3200,
      temperature: 0.92,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
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
  let cleaned = text.trim();

  cleaned = cleaned.replace(/^[\s\S]*?(?=\{)/, '');

  try { return JSON.parse(cleaned); } catch {}

  const m1 = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch {} }

  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch {}
  }

  const fixed = cleaned.slice(s, e + 1)
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    .replace(/[\u0000-\u001F\u007F]/g, ' ');
  if (s !== -1 && e > s) {
    try { return JSON.parse(fixed); } catch {}
  }

  throw new Error('Tidak bisa parse respons AI sebagai JSON');
}

/* ════════════════════════════════════════════════════════════
   POST-PROCESS — enrichment & cleanup hasil AI
════════════════════════════════════════════════════════════ */
function postProcessResult(parsed, topic, target) {
  if (parsed.hooks && Array.isArray(parsed.hooks)) {
    parsed.hooks = parsed.hooks.map(h => {
      const text = String(h.text || '').trim();
      return { ...h, text };
    }).filter(h => h.text.length > 10);
  }

  if (parsed.script) {
    Object.keys(parsed.script).forEach(k => {
      parsed.script[k] = String(parsed.script[k] || '').trim();
    });
  }

  if (parsed.caption) {
    parsed.caption = String(parsed.caption).trim();
    if (!parsed.caption.includes('#')) {
      parsed.caption += `\n\n#${topic.replace(/\s+/g,'').toLowerCase()} #kontenindonesia #viral`;
    }
  }

  if (parsed.ideas && Array.isArray(parsed.ideas)) {
    parsed.ideas = parsed.ideas.map(idea => String(idea).trim()).filter(i => i.length > 10);
  }

  return parsed;
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
    const prompt = buildPrompt(topic, target, platform, style, format, false);
    const { text: rawText, model } = await raceAllModels(prompt);
    winnerModel = model;

    $('modelStatus').innerHTML = '<span class="ms-ok">✓ Konten berhasil digenerate</span>';

    let parsed;

    /* Tahap 1: Parse JSON */
    try {
      parsed = parseAIResponse(rawText);
    } catch {
      toast('🔄 Memproses ulang format…', 1500);
      const retryFormatPrompt = buildPrompt(topic, target, platform, style, format, false) +
        '\n\n🚨 PENTING: Output HANYA JSON murni. Mulai LANGSUNG dari { tanpa teks apapun sebelumnya.';
      const retryFormat = await raceAllModels(retryFormatPrompt);
      parsed = parseAIResponse(retryFormat.text);
      winnerModel = retryFormat.model;
    }

    /* Tahap 2: Validasi kualitas output */
    const qualityIssues = validateOutput(parsed, topic);
    if (qualityIssues.length > 0) {
      console.warn('[Validate] Isu kualitas ditemukan:', qualityIssues);
      toast('🔄 Meningkatkan kualitas output…', 2000);

      $('modelStatus').innerHTML = '<span class="ms-racing">🔄 Optimasi kualitas konten…</span>';

      const retryQualityPrompt = buildPrompt(topic, target, platform, style, format, true) +
        `\n\n⚠️ ISU YANG HARUS DIPERBAIKI:\n${qualityIssues.map((iss, i) => `${i+1}. ${iss}`).join('\n')}`;

      try {
        const retryQuality = await raceAllModels(retryQualityPrompt);
        const retryParsed = parseAIResponse(retryQuality.text);
        const retryIssues = validateOutput(retryParsed, topic);

        if (retryIssues.length < qualityIssues.length) {
          parsed = retryParsed;
          winnerModel = retryQuality.model;
          console.log('[Validate] Retry berhasil meningkatkan kualitas');
        } else {
          console.warn('[Validate] Retry tidak meningkatkan kualitas, pakai hasil pertama');
        }
      } catch (retryErr) {
        console.warn('[Validate] Retry gagal, pakai hasil pertama:', retryErr.message);
      }

      $('modelStatus').innerHTML = '<span class="ms-ok">✓ Konten berhasil digenerate</span>';
    }

    /* Tahap 3: Post-processing */
    parsed = postProcessResult(parsed, topic, target);

    /* Normalisasi data */
    const hooks = (parsed.hooks || []).map(h => ({
      type: h.type || '💡 Hook',
      tkey: h.tkey || hookTypeToKey(h.type || ''),
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
