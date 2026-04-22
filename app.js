// ===============================
// VIRAL STUDIO PRO - FINAL ENGINE
// ===============================

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {

  const app = document.getElementById("appScreen");
  const bottomNav = document.getElementById("bottomNav");

  if (app) app.style.display = "flex";
  if (bottomNav) bottomNav.style.display = "flex";

  document.getElementById("btnGenerate")?.addEventListener("click", handleGenerate);

  setupPills();
});

// ---------- PILLS SYSTEM ----------
function setupPills() {
  document.querySelectorAll(".pills").forEach(group => {
    group.querySelectorAll(".pill").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const hidden = group.parentElement.querySelector("input[type=hidden]");
        if (hidden) hidden.value = btn.dataset.value;
      });
    });
  });
}

// ---------- SAFE PARSE ----------
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON ERROR:", e);
    alert("Format AI error. Coba lagi.");
    return null;
  }
}

// ---------- BUILD PROMPT (POWERFUL) ----------
function buildPrompt(topic, target, desc, platform, style, format, goal) {
  return `Kamu adalah expert TikTok marketing Indonesia.

Produk: ${topic}
Target: ${target}
Platform: ${platform}
Gaya: ${style}
Tujuan: ${goal}
${desc ? "Detail: " + desc : ""}

ATURAN KERAS:
- Hook HARUS stop scroll
- Gunakan emosi: takut, penasaran, iri
- Jangan formal
- Fokus jualan

Output JSON:
{
"hooks":[
{"type":"Fear","text":""},
{"type":"Curiosity","text":""},
{"type":"Urgency","text":""},
{"type":"Problem","text":""},
{"type":"Aspiration","text":""},
{"type":"Social Proof","text":""},
{"type":"Authority","text":""},
{"type":"Contrast","text":""},
{"type":"Secret","text":""},
{"type":"Challenge","text":""}
],
"script":{
"opening":"",
"problem":"",
"agitation":"",
"solution":"",
"cta":""
},
"caption":"",
"ideas":["","","","",""],
"analysis":{
"target_fit":"",
"hook_type":"",
"performance":"",
"suggestion":""
}
}`;
}

// ---------- DUMMY AI ----------
async function callAI() {
  return JSON.stringify({
    hooks: [
      { type: "Curiosity", text: "Ini yang bikin jualan kamu gak laku..." }
    ],
    script: {
      opening: "Stop scroll dulu...",
      problem: "Banyak yang salah disini",
      agitation: "Makanya gak ada yang beli",
      solution: "Pakai cara ini",
      cta: "Klik link sekarang"
    },
    caption: "Masalahnya bukan produk...",
    ideas: ["Ide 1","Ide 2","Ide 3","Ide 4","Ide 5"],
    analysis: {
      target_fit: "Cocok pemula",
      hook_type: "Curiosity",
      performance: "Tinggi",
      suggestion: "Upload malam"
    }
  });
}

// ---------- GENERATE ----------
async function handleGenerate() {

  const btn = document.getElementById("btnGenerate");
  btn.disabled = true;
  btn.innerText = "Generating...";

  const topic = document.getElementById("topic").value;
  const target = document.getElementById("target").value;
  const desc = document.getElementById("description").value;

  const platform = document.getElementById("platform").value;
  const style = document.getElementById("style").value;
  const format = document.getElementById("format").value;
  const goal = document.getElementById("goal").value;

  if (!topic) {
    alert("Isi topik dulu");
    resetBtn();
    return;
  }

  document.getElementById("results").style.display = "block";

  try {
    const prompt = buildPrompt(topic, target, desc, platform, style, format, goal);
    const res = await callAI(prompt);
    const data = safeParseJSON(res);
    if (!data) return;

    renderHooks(data.hooks);
    renderScript(data.script);
    renderCaption(data.caption);
    renderIdeas(data.ideas);
    renderAnalysis(data.analysis);

  } catch (e) {
    console.error(e);
    alert("Error generate");
  }

  resetBtn();
}

function resetBtn() {
  const btn = document.getElementById("btnGenerate");
  btn.disabled = false;
  btn.innerHTML = `<span>⚡</span><span>BIKIN SCRIPT CLOSING SEKARANG</span>`;
}

// ---------- RENDER ----------
function renderHooks(hooks) {
  const el = document.getElementById("hooksList");
  el.innerHTML = hooks.map(h => `
    <div class="hook-item">
      <b>${h.type}</b><br>${h.text}
    </div>
  `).join("");
}

function renderScript(s) {
  document.getElementById("scriptBox").innerHTML = `
    <p><b>Opening:</b> ${s.opening}</p>
    <p><b>Problem:</b> ${s.problem}</p>
    <p><b>Agitation:</b> ${s.agitation}</p>
    <p><b>Solution:</b> ${s.solution}</p>
    <p><b>CTA:</b> ${s.cta}</p>
  `;
}

function renderCaption(text) {
  document.getElementById("captionText").innerText = text;
}

function renderIdeas(ideas) {
  document.getElementById("ideasList").innerHTML =
    ideas.map(i => `<div>${i}</div>`).join("");
}

function renderAnalysis(a) {
  document.getElementById("analysisGrid").innerHTML = `
    <div>Target: ${a.target_fit}</div>
    <div>Hook: ${a.hook_type}</div>
    <div>Performance: ${a.performance}</div>
    <div>Suggestion: ${a.suggestion}</div>
  `;
}
