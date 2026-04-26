// ============================================================
// app.js — Application Controller
// ============================================================

// ── STATE ──
const state = {
  instrCount:   3,
  numStages:    5,
  forwarding:   false,
  schedule:     null,
  grid:         null,
  stageNames:   null,
  totalCycles:  0,
  currentCycle: 0,
  running:      false,
  runTimer:     null,
  hazards:      null,
};

// ── DOM ──
const $instrFields  = document.getElementById("instrFields");
const $instrCount   = document.getElementById("instrCount");
const $btnDecCount  = document.getElementById("btnDecCount");
const $btnIncCount  = document.getElementById("btnIncCount");

const $btnRun       = document.getElementById("btnRun");
const $btnStep      = document.getElementById("btnStep");
const $btnReset     = document.getElementById("btnReset");
const $simStatus    = document.getElementById("simStatus");
const $sectionViz   = document.getElementById("section-viz");
const $sectionHaz   = document.getElementById("section-hazards");
const $emptyState   = document.getElementById("emptyState");

// ── OPCODE FIELD CONFIG ──
const FIELD_CFG = {
  ADD: ["Rd", "Rs1", "Rs2"],
  SUB: ["Rd", "Rs1", "Rs2"],
  MUL: ["Rd", "Rs1", "Rs2"],
  AND: ["Rd", "Rs1", "Rs2"],
  OR:  ["Rd", "Rs1", "Rs2"],
  XOR: ["Rd", "Rs1", "Rs2"],
  SLL: ["Rd", "Rs1", "Rs2"],
  SRL: ["Rd", "Rs1", "Rs2"],
  LW:  ["Rd", "offset(Rs)"],
  SW:  ["Rs", "offset(Rb)"],
};
const ALL_OPS = Object.keys(FIELD_CFG);

const TEST_CASES = {
  1: [
    { op:"ADD", f:["R1","R2","R3"] },
    { op:"SUB", f:["R4","R5","R6"] },
    { op:"LW",  f:["R7","0(R8)"]  },
    { op:"SW",  f:["R9","4(R10)"] }
  ],
  2: [
    { op:"ADD", f:["R1","R2","R3"] },
    { op:"SUB", f:["R4","R1","R5"] },
    { op:"AND", f:["R6","R1","R7"] }
  ],
  3: [
    { op:"LW",  f:["R1","0(R2)"] },
    { op:"ADD", f:["R3","R1","R4"] },
    { op:"SW",  f:["R3","4(R5)"] }
  ],
  4: [
    { op:"ADD", f:["R1","R2","R3"] },
    { op:"SUB", f:["R4","R1","R5"] },
    { op:"LW",  f:["R6","8(R1)"] },
    { op:"ADD", f:["R7","R6","R8"] }
  ]
};
let currentDemo = TEST_CASES[2];

// ── GENERATE INSTRUCTION ROWS ──
function generateFields() {
  $instrFields.innerHTML = "";

  for (let i = 0; i < state.instrCount; i++) {
    const row = document.createElement("div");
    row.className = "instr-row";
    row.dataset.index = i;

    // Label
    const lbl = document.createElement("span");
    lbl.className = "instr-label";
    lbl.textContent = `I${i + 1}`;
    row.appendChild(lbl);

    // Opcode select
    const sel = document.createElement("select");
    sel.className = "instr-select";
    ALL_OPS.forEach(op => {
      const o = document.createElement("option");
      o.value = op; o.textContent = op;
      sel.appendChild(o);
    });
    const defOp = currentDemo[i]?.op || "ADD";
    sel.value = defOp;
    row.appendChild(sel);

    // Input fields
    appendInputFields(row, sel.value, sel);

    // Remove button
    const rm = document.createElement("button");
    rm.className = "btn-rm"; rm.title = "Remove"; rm.textContent = "✕";
    rm.addEventListener("click", () => {
      if (state.instrCount > 1) {
        state.instrCount--;
        $instrCount.textContent = state.instrCount;
        generateFields();
      }
    });
    row.appendChild(rm);

    // Opcode change → rebuild inputs
    sel.addEventListener("change", () => {
      row.querySelectorAll(".instr-input").forEach(e => e.remove());
      appendInputFields(row, sel.value, sel, rm);
    });

    $instrFields.appendChild(row);
  }

  // Pre-fill demo values
  document.querySelectorAll(".instr-row").forEach((row, i) => {
    const demo = currentDemo[i]; if (!demo) { 
       row.querySelectorAll(".instr-input").forEach(inp => inp.value = "");
       return; 
    }
    const sel = row.querySelector(".instr-select");
    if (sel.value !== demo.op) {
      sel.value = demo.op;
      sel.dispatchEvent(new Event("change"));
    }
    const ins = row.querySelectorAll(".instr-input");
    demo.f.forEach((v, fi) => { if (ins[fi]) ins[fi].value = v; });
  });
}

function appendInputFields(row, op, sel, rmBtn) {
  const cfg = FIELD_CFG[op] || ["Rd","Rs1","Rs2"];
  const ref = rmBtn || row.querySelector(".btn-rm");
  cfg.forEach(ph => {
    const inp = document.createElement("input");
    inp.type = "text"; inp.className = "instr-input";
    inp.placeholder = ph; inp.autocomplete = "off"; inp.spellcheck = false;
    if (ref) row.insertBefore(inp, ref);
    else row.appendChild(inp);
  });
}

// ── COUNT CONTROLS ──
$btnDecCount.addEventListener("click", () => {
  if (state.instrCount > 1) { state.instrCount--; $instrCount.textContent = state.instrCount; generateFields(); }
});
$btnIncCount.addEventListener("click", () => {
  if (state.instrCount < 10) { state.instrCount++; $instrCount.textContent = state.instrCount; generateFields(); }
});
// ── TEST CASES ──
[1, 2, 3, 4].forEach(id => {
  document.getElementById(`btnTc${id}`).addEventListener("click", (e) => {
    // Visual feedback
    document.querySelectorAll(".tc-buttons .btn-ghost").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    
    currentDemo = TEST_CASES[id];
    state.instrCount = currentDemo.length;
    $instrCount.textContent = state.instrCount;
    generateFields();
    setStatus(`Loaded Test Case ${id}. Ready to run.`);
    if (id === 4) {
      document.querySelector('[data-value="forward"]').click();
    } else {
      document.querySelector('[data-value="stall"]').click();
    }
  });
});

// ── PIPELINE TOGGLE ──
document.getElementById("pipelineToggle").addEventListener("click", e => {
  const btn = e.target.closest(".seg-btn"); if (!btn) return;
  document.querySelectorAll("#pipelineToggle .seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  state.numStages = parseInt(btn.dataset.value);
  updatePipeDiagram();
});

// ── FORWARDING TOGGLE ──
document.getElementById("forwardingToggle").addEventListener("click", e => {
  const btn = e.target.closest(".seg-btn"); if (!btn) return;
  document.querySelectorAll("#forwardingToggle .seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  state.forwarding = btn.dataset.value === "forward";
});

// Update the pipeline diagram when type changes
function updatePipeDiagram() {
  const wb = document.getElementById("wbLabel");
  const memStage = document.querySelector(".pv-mem");
  if (!wb || !memStage) return;
  if (state.numStages === 4) {
    memStage.textContent = "MEM/WB";
    wb.style.display = "none";
    document.querySelectorAll(".pv-arrow")[3].style.display = "none";
  } else {
    memStage.textContent = "MEM";
    wb.style.display = "";
    document.querySelectorAll(".pv-arrow")[3].style.display = "";
  }
}

// ── SIMULATION CORE ──
function runSimulation() {
  const { instructions, errors } = collectInstructions();
  if (errors.length) { setStatus("⚠ " + errors[0], "err"); return false; }
  if (!instructions.length) { setStatus("⚠ Enter at least one instruction.", "err"); return false; }

  const input = {
    instructions: instructions.map(i => i.raw),
    pipeline: state.numStages === 4 ? "4-stage" : "5-stage",
    forwarding: state.forwarding
  };
  const engineResult = window.simulateEngine(input);
  
  const totalCycles = engineResult.table.length > 0 
    ? engineResult.table[engineResult.table.length - 1].stages.length - 1 
    : 0;
    
  state.schedule = engineResult.table.map((t, idx) => ({ instr: instructions[idx] }));
  state.stageNames = engineResult.stages;
  state.totalCycles = totalCycles;
  
  const grid = [];
  engineResult.table.forEach(t => {
     const row = new Array(totalCycles + 1).fill("");
     for (let i = 1; i < t.stages.length; i++) {
        if (t.stages[i]) row[i] = t.stages[i];
     }
     grid.push(row);
  });
  
  engineResult.hazards.forEach(h => {
     if (h.resolvedBy === "forwarding") {
        const consumerIdx = engineResult.table.findIndex(t => t.instruction.id === h.to);
        if (consumerIdx >= 0) {
           const exCycle = engineResult.table[consumerIdx].stageCycles["EXE"];
           if (exCycle) grid[consumerIdx][exCycle] = "FWD";
        }
     }
  });
  
  state.grid = grid;
  
  const legacyHazards = engineResult.hazards.map(h => ({
     producerIdx: parseInt(h.from.substring(1)) - 1,
     consumerIdx: parseInt(h.to.substring(1)) - 1,
     producerLabel: h.from,
     consumerLabel: h.to,
     register: h.register,
     isLoadUse: engineResult.parsed.find(p => p.id === h.from).op === "LW",
     stalls: h.delay,
     forwarding: h.resolvedBy === "forwarding"
  }));
  const hazardReport = [legacyHazards];
  state.hazards = legacyHazards;

  renderHazards(hazardReport, instructions, state.forwarding);

  const cpi = (state.totalCycles / instructions.length).toFixed(2);
  document.getElementById("cpiMetric").textContent = cpi;

  $sectionViz.classList.remove("hidden");
  $emptyState.style.display = "none";
  updateVizBadge(state.numStages, state.forwarding);
  updateCycleDisplay(0, state.totalCycles);

  return true;
}

function renderAtCycle(cycle) {
  renderPipelineTable(state.grid, state.schedule, state.totalCycles, cycle, state.stageNames, state.hazards);
  updateCycleDisplay(cycle || state.totalCycles, state.totalCycles);
}

// RUN
$btnRun.addEventListener("click", () => {
  if (state.running) {
    clearInterval(state.runTimer);
    state.running = false;
    $btnRun.textContent = "▶ RUN";
    return;
  }
  if (!runSimulation()) return;
  state.currentCycle = 0;
  state.running = true;
  $btnRun.textContent = "⏹ STOP";
  setStatus("▶ Simulation running…");

  state.runTimer = setInterval(() => {
    state.currentCycle++;
    renderAtCycle(state.currentCycle);
    if (state.currentCycle >= state.totalCycles) {
      clearInterval(state.runTimer);
      state.running = false;
      $btnRun.textContent = "▶ RUN";
      renderAtCycle(0);
      setStatus(`✓ Complete — ${state.totalCycles} total cycles.`);
    }
  }, 550);
});

// STEP
$btnStep.addEventListener("click", () => {
  if (state.running) return;
  if (!state.schedule) {
    if (!runSimulation()) return;
    state.currentCycle = 0;
  }
  if (state.currentCycle >= state.totalCycles) {
    state.currentCycle = 0;
    renderAtCycle(0);
    setStatus("↺ Rewound to start. Press STEP to advance.");
    return;
  }
  state.currentCycle++;
  renderAtCycle(state.currentCycle);
  if (state.currentCycle === state.totalCycles) {
    setStatus(`✓ Cycle ${state.totalCycles} / ${state.totalCycles} — done. STEP to rewind.`);
  } else {
    setStatus(`Cycle ${state.currentCycle} of ${state.totalCycles}`);
  }
});

// RESET
$btnReset.addEventListener("click", () => {
  clearInterval(state.runTimer);
  Object.assign(state, { running:false, schedule:null, grid:null, currentCycle:0, totalCycles:0, hazards:null });
  $btnRun.textContent = "▶ RUN";
  $sectionViz.classList.add("hidden");
  $sectionHaz.classList.add("hidden");
  $emptyState.style.display = "";
  document.getElementById("tableHead").innerHTML = "";
  document.getElementById("tableBody").innerHTML = "";
  document.getElementById("cpiMetric").textContent = "—";
  updateCycleDisplay(0, 0);
  setStatus("↺ Reset. Configure and run again.");
});

function setStatus(msg, type) {
  $simStatus.textContent = msg;
  $simStatus.style.color = type === "err" ? "var(--red)" : "var(--green)";
}

// ── STARFIELD ──
(function () {
  const cv = document.getElementById("starfield");
  const cx = cv.getContext("2d");
  let stars = [];

  const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
  const init   = () => {
    stars = Array.from({ length: 220 }, () => ({
      x: Math.random() * cv.width,
      y: Math.random() * cv.height,
      r: Math.random() * 1.1 + 0.2,
      s: Math.random() * 0.12 + 0.02,
      o: Math.random() * 0.55 + 0.15,
    }));
  };
  const draw   = () => {
    cx.clearRect(0, 0, cv.width, cv.height);
    stars.forEach(s => {
      cx.beginPath();
      cx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(190,220,255,${s.o})`;
      cx.fill();
      s.y += s.s;
      if (s.y > cv.height) { s.y = 0; s.x = Math.random() * cv.width; }
    });
    requestAnimationFrame(draw);
  };

  window.addEventListener("resize", () => { resize(); init(); });
  resize(); init(); draw();
})();

// ── INIT ──
generateFields();
setStatus("Configure instructions above, then press RUN or STEP.");
