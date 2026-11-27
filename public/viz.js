// Visual components: a voice-reactive orb (canvas), a bill donut and a fair-bill gauge (SVG strings).
const MODE_COLORS = {
  idle:      ["#14b8a6", "#0f766e", "#5eead4"],
  listening: ["#fb7185", "#dc2626", "#fda4af"],
  speaking:  ["#fbbf24", "#f59e0b", "#fde68a"],
};

function createOrb(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const orb = { mode: "idle", level: 0, smooth: 0, t: 0 };
  function size() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 240;
    canvas.width = w * dpr; canvas.height = w * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return w;
  }
  let w = size();
  window.addEventListener("resize", () => { w = size(); });

  function frame() {
    orb.t += 0.016;
    // speaking has no real audio level, so it breathes with a synthetic envelope
    const target = orb.mode === "speaking" ? 0.35 + 0.25 * Math.sin(orb.t * 9) * Math.sin(orb.t * 3.1) : orb.level;
    orb.smooth += (target - orb.smooth) * 0.18;
    const amp = reduce ? 0.04 : 0.06 + orb.smooth * 0.5 + (orb.mode === "idle" ? 0.02 * Math.sin(orb.t * 1.5) : 0);
    const [c1, c2, c3] = MODE_COLORS[orb.mode];
    ctx.clearRect(0, 0, w, w);
    const cx = w / 2, cy = w / 2, base = w * 0.26;
    for (let layer = 3; layer >= 0; layer--) {
      const r0 = base * (1 + layer * 0.16);
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const wob = Math.sin(a * (3 + layer) + orb.t * (1.2 + layer * 0.5)) * amp + Math.sin(a * 5 - orb.t * 2) * amp * 0.5;
        const r = r0 * (1 + wob);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      if (layer === 0) {
        const g = ctx.createRadialGradient(cx - base * 0.3, cy - base * 0.3, base * 0.1, cx, cy, base * 1.2);
        g.addColorStop(0, c3); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
        ctx.fillStyle = g; ctx.shadowColor = c1; ctx.shadowBlur = 30 + orb.smooth * 60;
      } else {
        ctx.fillStyle = c1; ctx.globalAlpha = 0.16 - layer * 0.03; ctx.shadowBlur = 0;
      }
      ctx.fill(); ctx.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { setMode: (m) => { orb.mode = m; }, setLevel: (l) => { orb.level = Math.min(1, l); } };
}

// Reads the microphone level (0..1) so the orb moves with the user's real voice. Silent failure if blocked.
async function startMeter(onLevel) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let alive = true;
    (function loop() {
      if (!alive) return;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
      onLevel(Math.sqrt(sum / buf.length) * 4);
      requestAnimationFrame(loop);
    })();
    return () => { alive = false; onLevel(0); stream.getTracks().forEach((t) => t.stop()); ac.close(); };
  } catch { return null; }
}

const DONUT_COLORS = { slab0: "#5eead4", slab1: "#2dd4bf", slab2: "#14b8a6", slab3: "#0f766e", duty: "#f59e0b", fixed: "#94a3b8" };

// items: [{key, label, amount}] -> donut with the total in the middle plus a legend
function donutSvg(items, total, centerLabel) {
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = items.filter((i) => i.amount > 0).map((i) => {
    const len = (i.amount / total) * C;
    const seg = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${DONUT_COLORS[i.key] || "#999"}" stroke-width="20"
      stroke-dasharray="0 ${C}" data-len="${len}" data-c="${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 70 70)"/>`;
    offset += len;
    return seg;
  }).join("");
  const legend = items.filter((i) => i.amount > 0).map((i) =>
    `<li><i style="background:${DONUT_COLORS[i.key] || "#999"}"></i><span>${i.label}</span><b>₹${Math.round(i.amount)}</b></li>`).join("");
  return `<div class="donutwrap"><svg viewBox="0 0 140 140" class="donut" role="img" aria-label="${centerLabel} ${total}">
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--line)" stroke-width="20"/>${arcs}
    <text x="70" y="68" text-anchor="middle" class="dt">₹${total}</text><text x="70" y="86" text-anchor="middle" class="dl">${centerLabel}</text></svg>
    <ul class="legend">${legend}</ul></div>`;
}
// grow the donut arcs after insertion so they animate in
function animateDonut(root) {
  root.querySelectorAll(".donut circle[data-len]").forEach((c, i) => {
    setTimeout(() => { c.style.transition = "stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)"; c.setAttribute("stroke-dasharray", `${c.dataset.len} ${c.dataset.c}`); }, 80 + i * 120);
  });
}

// Semicircle gauge from -50% to +100% versus the expected bill. Needle rotates after insertion.
function gaugeSvg(diffPct, labels) {
  const clamped = Math.max(-50, Math.min(100, diffPct));
  const angle = -90 + ((clamped + 50) / 150) * 180; // -90 (left) .. +90 (right)
  const arc = (a0, a1, color) => {
    const p = (a) => { const r = (Math.PI * (a - 180)) / 180; return [100 + 80 * Math.cos(r), 100 + 80 * Math.sin(r)]; };
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `<path d="M${x0} ${y0} A80 80 0 0 1 ${x1} ${y1}" stroke="${color}" stroke-width="16" fill="none"/>`;
  };
  // zones: below expected (green), fair up to +25% (teal/amber), high (red). Angles run 0..180 left to right.
  const z1 = ((0 + 50) / 150) * 180, z2 = ((25 + 50) / 150) * 180;
  return `<svg viewBox="0 0 200 142" class="gauge" role="img" aria-label="${labels.expected} ${diffPct}%">
    ${arc(0, z1, "#16a34a")}${arc(z1, z2, "#f59e0b")}${arc(z2, 180, "#dc2626")}
    <g class="needle" data-angle="${angle}" style="transform-origin:100px 100px;transform:rotate(-90deg)">
      <line x1="100" y1="100" x2="100" y2="34" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><circle cx="100" cy="100" r="8" fill="var(--ink)"/></g>
    <text x="100" y="136" text-anchor="middle" class="gv">${diffPct >= 0 ? "+" : ""}${diffPct}%</text></svg>`;
}
function animateGauge(root) {
  const n = root.querySelector(".needle");
  if (n) setTimeout(() => { n.style.transition = "transform 1.2s cubic-bezier(.2,1.3,.3,1)"; n.style.transform = `rotate(${n.dataset.angle}deg)`; }, 120);
}
