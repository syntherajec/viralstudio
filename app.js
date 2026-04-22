function buildPrompt(topic, target, platform, style, format, goal, description) {
  const platformDesc = {
    tiktok:    'TikTok (hook kuat 1–2 detik pertama, cepat, emosional, scroll-stopping)',
    instagram: 'Instagram (storytelling kuat, relatable, caption tajam)',
    youtube:   'YouTube (opening kuat, retention tinggi, engaging)',
  }[platform] || platform;

  const styleDesc = {
    santai:   'bahasa santai, natural, seperti ngobrol',
    tegas:    'langsung, to the point, no-bullshit',
    dramatis: 'emosional, dramatis, bikin relate',
    edukatif: 'informatif tapi tetap engaging, bukan kaku',
    humor:    'ringan, witty, tapi tetap menjual',
  }[style] || style;

  const goalDesc = {
    closing:    'FOKUS JUALAN: dorong pembelian SEKARANG dengan urgency dan alasan kuat',
    engagement: 'FOKUS VIRAL: bikin orang komen, share, dan penasaran',
    edukasi:    'FOKUS VALUE: kasih insight tapi tetap mengarah ke jualan',
  }[goal] || 'FOKUS JUALAN';

  const bonusInstruction = {
    thread:   'Untuk field "bonus": buat thread 6 tweet (1/ 2/ dst, tiap baris 1 tweet)',
    carousel: 'Untuk field "bonus": buat 6 slide carousel (format: "Slide 1: ...")',
    short:    'Untuk field "bonus": buat script video pendek 5 scene (tiap baris 1 scene)',
    standard: '',
  }[format] || '';

  const needBonus = format !== 'standard';

  return `Kamu adalah content creator TikTok Indonesia dengan jutaan views dan kemampuan closing tinggi.

TUGAS:
Buat konten marketing untuk:
- Produk: "${topic}"
- Target: ${target}
- Platform: ${platformDesc}
- Gaya: ${styleDesc}
- Tujuan: ${goalDesc}

ATURAN WAJIB:

1. HOOK:
- Harus bikin berhenti scroll dalam 1 detik
- Gunakan emosi kuat (takut, penasaran, iri, marah)
- DILARANG pakai kalimat seperti "Apakah kamu..."
- Harus terasa natural dan tidak formal

2. GAYA:
- Gunakan bahasa Indonesia sehari-hari
- Jangan terlalu rapi seperti artikel
- Harus terasa seperti orang jualan langsung

3. POLA VIRAL:
- Gunakan pernyataan mengejutkan
- Gunakan opini yang bertentangan dengan kebanyakan orang
- Gunakan angka spesifik (contoh: 3 hari, 50rb, dll)
- Gunakan storytelling singkat seperti pengalaman nyata

4. SCRIPT:
- Fokus problem → agitation → solusi → closing
- Harus menjual, bukan menjelaskan panjang lebar

5. CTA:
- Harus spesifik (contoh: klik link di bio sekarang)
- Harus ada urgency (hari ini, sekarang, sebelum habis)
- Harus ada alasan kuat untuk beli sekarang

6. CAPTION:
- 30% storytelling
- 70% jualan terselubung
- Tidak boleh bertele-tele atau filler

${description ? `Detail tambahan produk: ${description}` : ''}

Balas HANYA dengan JSON valid (tanpa penjelasan apapun):

{
  "hooks": [
    {"type": "⚠️ Fear", "text": ""},
    {"type": "💡 Curiosity", "text": ""},
    {"type": "⏰ Urgency", "text": ""},
    {"type": "🔍 Problem", "text": ""},
    {"type": "🌟 Aspiration", "text": ""},
    {"type": "👥 Social Proof", "text": ""},
    {"type": "🏆 Authority", "text": ""},
    {"type": "⚡ Contrast", "text": ""},
    {"type": "🔐 Secret", "text": ""},
    {"type": "💪 Challenge", "text": ""}
  ],
  "script": {
    "opening": "",
    "problem": "",
    "agitation": "",
    "solution": "",
    "cta": ""
  },
  "caption": "",
  "ideas": [
    "",
    "",
    "",
    "",
    ""
  ],
  "analysis": {
    "target_fit": "",
    "hook_type": "",
    "performance": "",
    "suggestion": ""
  }${needBonus ? ',\n  "bonus": ""' : ''}
}

${bonusInstruction}`;
}
