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
    return ["IF", "ID", "EX", "MEM/WB"];
  }
  // Default to 5-stage
  return ["IF", "ID", "EX", "MEM", "WB"];
}

// STEP 4 — RAW Hazard Detection
function hasRAW(prev, curr) {
  if (!prev.dest) return false;
  return prev.dest === curr.src1 || prev.dest === curr.src2;
}

// STEP 5 — Stall Insertion Logic
function computeDelay(prevStages, currTentativeStages, forwarding, isLoadUse, numStages) {
  if (!forwarding) {
    // No forwarding: Data available at WB. Consumer needs it at ID.
    // We want consumer's ID to overlap with producer's WB (write first half, read second half)
    const producerWB = numStages === 5 ? prevStages.WB : prevStages["MEM/WB"];
    const consumerID = currTentativeStages.ID;
    return Math.max(0, producerWB - consumerID);
  } else {
    // With forwarding: Data available at EX or MEM.
    if (isLoadUse) {
      // Producer is LW. Data available after MEM. Consumer needs at EX.
      const producerMEM = prevStages.MEM !== undefined ? prevStages.MEM : prevStages["MEM/WB"];
      const consumerEX = currTentativeStages.EX;
      return Math.max(0, producerMEM - consumerEX);
    } else {
      // ALU forwarding. Data available after EX. Consumer needs at EX.
      const producerEX = prevStages.EX;
      const consumerEX = currTentativeStages.EX;
      // Normal ALU-ALU is 0 stalls (producerEX is cycle 3, consumerEX is cycle 4 -> 3 - 4 = -1)
      return Math.max(0, producerEX - consumerEX);
    }
  }
}

// FINAL ENGINE FLOW
function simulate(input) {
  const parsed = parseAll(input.instructions);
  const stages = getPipelineStages(input.pipeline);
  const numStages = stages.length;

  const table = [];
  const hazards = [];

  let nextIF = 1;

  for (let i = 0; i < parsed.length; i++) {
    const curr = parsed[i];

    // STEP 3 — Basic Pipeline Scheduler (Tentative)
    const tentIF = nextIF;
    const tentStages = {};
    stages.forEach((stg, idx) => { tentStages[stg] = tentIF + idx; });

    let maxDelay = 0;
    let resolvedBy = "none";
    let hazardType = null;
    let hazardFrom = null;
    let hazardReg = null;

    // Detect hazards with previous instructions
    for (let j = 0; j < i; j++) {
      const prev = parsed[j];
      const prevTableEntry = table[j];

      if (hasRAW(prev, curr)) {
        // Check for shadowing (a later instruction overwrote the same register)
        let shadowed = false;
        for (let k = j + 1; k < i; k++) {
          if (parsed[k].dest === prev.dest) { shadowed = true; break; }
        }

        if (!shadowed) {
          const isLoadUse = prev.op === "LW";
          const delay = computeDelay(prevTableEntry.stageCycles, tentStages, input.forwarding, isLoadUse, numStages);

          if (delay >= maxDelay) {
            maxDelay = delay;
            hazardType = "RAW";
            hazardFrom = prev.id;
            hazardReg = prev.dest;
            if (input.forwarding && delay === 0) {
              resolvedBy = "forwarding";
            } else {
              resolvedBy = "stall";
            }
          }
        }
      }
    }

    if (maxDelay > 0) {
      hazards.push({
        type: hazardType,
        from: hazardFrom,
        to: curr.id,
        register: hazardReg,
        resolvedBy: "stall",
        delay: maxDelay
      });
    } else if (resolvedBy === "forwarding") {
      hazards.push({
        type: hazardType,
        from: hazardFrom,
        to: curr.id,
        register: hazardReg,
        resolvedBy: "forwarding",
        delay: 0
      });
    }

    // Apply delay
    const actualIF = tentIF + maxDelay;
    const actualStages = {};
    stages.forEach((stg, idx) => { actualStages[stg] = actualIF + idx; });

    // STEP 6 — Build Final Table Row
    // Find the total cycles so far to size the array
    const lastStageCycle = actualStages[stages[stages.length - 1]];
    const row = new Array(lastStageCycle + 1).fill("");

    // Fill tentative ID up to actual ID with STALL
    for (let c = tentIF + 1; c < actualIF + 1; c++) {
      row[c] = "STALL";
    }

    // Fill actual stages
    stages.forEach(stg => {
      row[actualStages[stg]] = stg;
    });

    table.push({
      instruction: curr,
      stages: row,
      stageCycles: actualStages,
      stallCount: maxDelay
    });

    nextIF = actualIF + 1;
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
