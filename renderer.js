// ============================================================
// renderer.js — Table & Hazard Renderer
// ============================================================

const STAGE_CLASS = {
  "IF":    "c-IF",
  "ID":    "c-ID",
  "EX":    "c-EX",
  "MEM":   "c-MEM",
  "WB":    "c-WB",
  "MEMWB": "c-MEMWB",
  "STALL": "c-STALL",
  "FWD":   "c-FWD",
};

function renderPipelineTable(grid, schedule, totalCycles, currentCycle, stageNames) {
  const thead = document.getElementById("tableHead");
  const tbody = document.getElementById("tableBody");

  // ── HEADER ──
  thead.innerHTML = "";
  const hr = document.createElement("tr");

  const thI = document.createElement("th");
  thI.className = "th-instr";
  thI.textContent = "INSTRUCTION";
  hr.appendChild(thI);

  for (let c = 1; c <= totalCycles; c++) {
    const th = document.createElement("th");
    th.textContent = c;
    if (currentCycle > 0 && c === currentCycle) th.classList.add("th-active");
    hr.appendChild(th);
  }
  thead.appendChild(hr);

  // ── BODY ──
  tbody.innerHTML = "";

  schedule.forEach((entry, j) => {
    const tr = document.createElement("tr");

    // Instruction label cell
    const tdI = document.createElement("td");
    tdI.className = "td-instr";
    tdI.innerHTML = `<strong>${entry.instr.id}</strong>${entry.instr.raw}`;
    tr.appendChild(tdI);

    // Stage cells
    for (let c = 1; c <= totalCycles; c++) {
      const td  = document.createElement("td");
      const val = grid[j][c] || "";

      if (!val) {
        td.className = "c-empty";
      } else {
        td.className = STAGE_CLASS[val] || "";
        td.textContent = val === "MEMWB" ? "MEM/WB" : val;
      }

      if (currentCycle > 0 && c > currentCycle)  td.classList.add("dim");
      if (currentCycle > 0 && c === currentCycle) td.classList.add("col-hl");

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

function renderHazards(hazardReport, instructions, forwarding) {
  const section = document.getElementById("section-hazards");
  const list    = document.getElementById("hazardList");
  const badge   = document.getElementById("hazardCount");

  list.innerHTML = "";
  section.classList.remove("hidden");

  // Collect unique meaningful hazards
  const seen     = new Set();
  const hazards  = [];

  hazardReport.forEach(instHazards => {
    instHazards.forEach(h => {
      const key = `${h.producerIdx}-${h.consumerIdx}-${h.register}`;
      if (seen.has(key)) return;
      seen.add(key);
      // Only show if there's an actual stall or a forwarding bypass
      if (h.stalls > 0 || (forwarding && h.forwarding)) hazards.push(h);
    });
  });

  badge.textContent = hazards.length;

  if (hazards.length === 0) {
    list.innerHTML = `
      <div class="h-item h-none">
        <span class="h-icon">✓</span>
        <div class="h-body">
          <div class="h-title">NO HAZARDS DETECTED</div>
          <div class="h-desc">All instructions are independent — the pipeline flows without any stalls.</div>
        </div>
      </div>`;
    return;
  }

  hazards.forEach(h => {
    const isFwd = forwarding && h.stalls === 0 && h.forwarding;
    const item  = document.createElement("div");
    item.className = `h-item${isFwd ? " h-fwd" : ""}`;

    const typeTxt = h.isLoadUse ? "LOAD-USE RAW HAZARD" : "RAW DATA HAZARD";
    const regHtml = `<strong>${h.register}</strong>`;
    const desc    = isFwd
      ? `${h.consumerLabel} reads ${regHtml} written by ${h.producerLabel}. Resolved via <strong>EX→EX forwarding</strong> — no stall inserted.`
      : `${h.consumerLabel} reads ${regHtml} but ${h.producerLabel} hasn't written it yet. <strong>${h.stalls} stall cycle${h.stalls !== 1 ? "s" : ""}</strong> inserted to wait.`;

    const pill = isFwd
      ? `<span class="h-pill fwd-pill">FWD</span>`
      : `<span class="h-pill">+${h.stalls} STALL${h.stalls !== 1 ? "S" : ""}</span>`;

    item.innerHTML = `
      <span class="h-icon">${isFwd ? "⚡" : "⚠"}</span>
      <div class="h-body">
        <div class="h-title">${typeTxt} — ${h.register}</div>
        <div class="h-desc">${desc}</div>
      </div>
      ${pill}`;

    list.appendChild(item);
  });
}

function updateCycleDisplay(current, total) {
  document.getElementById("cycleCounter").textContent = current > 0 ? current : "—";
  document.getElementById("totalCycles").textContent  = total  > 0 ? total  : "—";
  const bar = document.getElementById("cycleBar");
  if (bar && total > 0 && current > 0) {
    bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
  } else if (bar) {
    bar.style.width = "0%";
  }
}

function updateVizBadge(numStages, forwarding) {
  document.getElementById("vizMode").textContent =
    `${numStages}-STAGE · ${forwarding ? "FORWARDING" : "STALL"}`;
}
