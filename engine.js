function parseAll(instructionsRaw) {
  const parsed = [];
  const norm = s => s ? s.trim().toUpperCase() : null;

  instructionsRaw.forEach((raw, i) => {
    const id = `I${i + 1}`;
    const parts = raw.replace(/,/g, ' ').trim().split(/\s+/);
    const op = norm(parts[0]);

    let dest = null, src1 = null, src2 = null;

    if (op === "ADD" || op === "SUB" || op === "MUL" || op === "AND" || op === "OR" || op === "XOR" || op === "SLL" || op === "SRL") {
      dest = norm(parts[1]);
      src1 = norm(parts[2]);
      src2 = norm(parts[3]);
    } else if (op === "LW") {
      dest = norm(parts[1]);
      // Format: offset(Rs)
      const mem = norm(parts[2]);
      if (mem) {
        const m = mem.match(/.*\((.*)\)/);
        src1 = m ? m[1] : mem;
      }
    } else if (op === "SW") {
      src1 = norm(parts[1]);
      const mem = norm(parts[2]);
      if (mem) {
        const m = mem.match(/.*\((.*)\)/);
        src2 = m ? m[1] : mem;
      }
    }

    parsed.push({
      id,
      raw,
      op,
      dest,
      src1,
      src2
    });
  });

  return parsed;
}

// STEP 2 — Define Pipeline Structure
function getPipelineStages(type) {
  if (type === "4-stage") {
    return ["IF", "ID", "EXE", "MEM/WB"];
  }
  // Default to 5-stage
  return ["IF", "ID", "EXE", "MEM", "WB"];
}

// STEP 4 — RAW Hazard Detection
function hasRAW(prev, curr) {
  if (!prev.dest) return false;
  const dest = prev.dest.toUpperCase();
  return (curr.src1 && curr.src1.toUpperCase() === dest) || 
         (curr.src2 && curr.src2.toUpperCase() === dest);
}

// FINAL ENGINE FLOW
function simulate(input) {
  const parsed = parseAll(input.instructions);
  const stages = getPipelineStages(input.pipeline);
  const numStages = stages.length;

  const table = [];
  const hazards = [];

  for (let i = 0; i < parsed.length; i++) {
    const curr = parsed[i];
    let stageCycles = {};

    // 1. IDEAL SCHEDULE (No hazards, perfectly pipelined)
    let ideal_IF = (i === 0) ? 1 : table[i-1].stageCycles["IF"] + 1;
    stageCycles[stages[0]] = ideal_IF;
    for (let idx = 1; idx < numStages; idx++) {
      stageCycles[stages[idx]] = stageCycles[stages[idx - 1]] + 1;
    }

    // 2. STRUCTURAL CONSTRAINTS (In-order pipeline)
    if (i > 0) {
      const prevCycles = table[i-1].stageCycles;
      
      // Instruction cannot enter a stage until previous instruction enters the NEXT stage.
      // This means Stage_j(idx) >= PrevStage(idx+1)
      stageCycles[stages[0]] = Math.max(stageCycles[stages[0]], prevCycles[stages[1]]);
      for (let idx = 1; idx < numStages; idx++) {
        const stg = stages[idx];
        // Cascade structural delay
        stageCycles[stg] = Math.max(stageCycles[stg], stageCycles[stages[idx - 1]] + 1);
        // Structural constraint vs previous instruction
        if (idx < numStages - 1) {
          stageCycles[stg] = Math.max(stageCycles[stg], prevCycles[stages[idx + 1]]);
        }
      }
    }

    let hazardType = null;
    let hazardFrom = null;
    let hazardReg = null;

    // 3. DATA HAZARDS
    for (let j = 0; j < i; j++) {
      const prev = parsed[j];
      const prevEntry = table[j];

      if (hasRAW(prev, curr)) {
        let shadowed = false;
        for (let k = j + 1; k < i; k++) {
          if (parsed[k].dest === prev.dest) { shadowed = true; break; }
        }

        if (!shadowed) {
          if (!input.forwarding) {
            // No Forwarding: Instruction must wait in IF until data is written to registers.
            // Stall AFTER IF (Case A).
            const avail = numStages === 5 ? prevEntry.stageCycles["WB"] : prevEntry.stageCycles["MEM/WB"];
            const requiredID = avail + 1;
            
            if (requiredID > stageCycles["ID"]) {
              stageCycles["ID"] = requiredID;
              if (!hazardType) { hazardType = "RAW"; hazardFrom = prev.id; hazardReg = prev.dest; }
            }
          } else {
            // Forwarding: Instruction must wait in IF until data is available in EXE/MEM stages.
            // Stall AFTER IF (Case A).
            let avail;
            if (prev.op === "LW") {
              avail = numStages === 5 ? prevEntry.stageCycles["MEM"] : prevEntry.stageCycles["MEM/WB"];
            } else {
              avail = prevEntry.stageCycles["EXE"];
            }
            const requiredID = avail;
            
            if (requiredID > stageCycles["ID"]) {
              stageCycles["ID"] = requiredID;
              if (!hazardType) { hazardType = "RAW"; hazardFrom = prev.id; hazardReg = prev.dest; }
            }
          }
        }
      }
    }

    // 4. CASCADE DATA HAZARD DELAYS DOWN THE PIPELINE
    for (let idx = 1; idx < numStages; idx++) {
      const stg = stages[idx];
      stageCycles[stg] = Math.max(stageCycles[stg], stageCycles[stages[idx - 1]] + 1);
    }

    // 5. CALCULATE TOTAL STALLS
    let stallCount = 0;
    for (let idx = 1; idx < numStages; idx++) {
      stallCount += (stageCycles[stages[idx]] - stageCycles[stages[idx - 1]] - 1);
    }

    if (stallCount > 0 && hazardFrom !== null) {
      hazards.push({
        type: hazardType,
        from: hazardFrom,
        to: curr.id,
        register: hazardReg,
        resolvedBy: "stall",
        delay: stallCount
      });
    } else if (input.forwarding) {
      for (let j = 0; j < i; j++) {
        const prev = parsed[j];
        if (hasRAW(prev, curr)) {
          let shadowed = false;
          for (let k = j + 1; k < i; k++) {
            if (parsed[k].dest === prev.dest) { shadowed = true; break; }
          }
          if (!shadowed) {
            hazards.push({
              type: "RAW",
              from: prev.id,
              to: curr.id,
              register: prev.dest,
              resolvedBy: "forwarding",
              delay: 0
            });
            break;
          }
        }
      }
    }

    // 6. BUILD VISUAL TABLE WITH STALLS
    const lastStageCycle = stageCycles[stages[numStages - 1]];
    const row = new Array(lastStageCycle + 1).fill("");

    // Place actual stages
    for (let idx = 0; idx < numStages; idx++) {
      const stg = stages[idx];
      row[stageCycles[stg]] = stg;
    }

    // Fill gaps with STALL
    for (let idx = 1; idx < numStages; idx++) {
      const prevStgCycle = stageCycles[stages[idx - 1]];
      const currStgCycle = stageCycles[stages[idx]];
      for (let c = prevStgCycle + 1; c < currStgCycle; c++) {
        row[c] = "STALL";
      }
    }

    table.push({
      instruction: curr,
      stages: row,
      stageCycles: stageCycles,
      stallCount: stallCount
    });
  }

  return {
    table,
    hazards,
    parsed,
    stages
  };
}

// Export for browser
window.simulateEngine = simulate;
