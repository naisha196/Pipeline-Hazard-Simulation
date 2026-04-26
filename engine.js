function parseAll(instructionsRaw) {
  const parsed = [];
  const norm = s => s ? s.trim().toUpperCase() : null;

  instructionsRaw.forEach((raw, i) => {
    const id = `I${i + 1}`;
    const parts = raw.replace(/,/g, ' ').trim().split(/\s+/);
    const op = norm(parts[0]);

    let dest = null, src1 = null, src2 = null, offset = null;

    const RTYPE_OPS = ['ADD', 'SUB', 'AND', 'OR', 'SLT', 'SLL', 'SRL', 'MUL', 'XOR'];
    const ITYPE_OPS = ['ADDI', 'ORI', 'ANDI'];

    if (RTYPE_OPS.includes(op)) {
      dest = norm(parts[1]);
      src1 = norm(parts[2]);
      src2 = norm(parts[3]);
    } else if (ITYPE_OPS.includes(op)) {
      dest = norm(parts[1]);
      src1 = norm(parts[2]);
      // Third part is immediate, not a register
    } else if (op === "LW") {
      dest = norm(parts[1]);
      const mem = norm(parts[2]);
      if (mem) {
        const m = mem.match(/(.*)\((.*)\)/);
        if (m) {
          offset = m[1];
          src1 = m[2];
        } else {
          src1 = mem;
        }
      }
    } else if (op === "SW") {
      src1 = norm(parts[1]); // src register
      const mem = norm(parts[2]);
      if (mem) {
        const m = mem.match(/(.*)\((.*)\)/);
        if (m) {
          offset = m[1];
          src2 = m[2]; // base register
        } else {
          src2 = mem;
        }
      }
    }

    parsed.push({
      id,
      raw,
      op,
      dest,
      src1,
      src2,
      offset,
      label: `${id}: ${raw}`
    });
  });

  return parsed;
}

function getReadRegisters(ins) {
  if (!ins) return [];
  const RTYPE_S = ['ADD', 'SUB', 'AND', 'OR', 'SLT', 'SLL', 'SRL', 'MUL', 'XOR'];
  const ITYPE_S = ['ADDI', 'ORI', 'ANDI'];
  if (RTYPE_S.includes(ins.op)) return [ins.src1, ins.src2].filter(Boolean);
  if (ITYPE_S.includes(ins.op)) return [ins.src1].filter(Boolean);
  if (ins.op === 'LW') return [ins.src1];
  if (ins.op === 'SW') return [ins.src1, ins.src2].filter(Boolean);
  return [];
}

// Engine Flow
function simulate(input) {
  const parsed = parseAll(input.instructions);
  const n = parsed.length;
  const numStages = input.pipeline === "4-stage" ? 4 : 5;
  const forwarding = input.forwarding;
  const stages = numStages === 5 
    ? ['IF', 'ID', 'EXE', 'MEM', 'WB'] 
    : ['IF', 'ID', 'EXE', 'MEM/WB'];

  const schedule = [];
  const hazards = [];

  for (let i = 0; i < n; i++) {
    // Structural constraint: IF of current waits for ID of previous
    const prevID = i === 0 ? 0 : (schedule[i - 1].ifCycle + 1 + schedule[i - 1].idDelay);
    const ifCycle = (numStages === 5) ? Math.max(i + 1, prevID) : (i + 1);
    
    let idDelay = 0;
    let exDelay = 0;
    let fwdUsed = false;

    for (let p = 0; p < i; p++) {
      const prod = parsed[p];
      const prodDest = prod.dest;
      if (!prodDest || !getReadRegisters(parsed[i]).includes(prodDest)) continue;

      // Shadowing check: most recent write wins
      let shadowed = false;
      for (let k = p + 1; k < i; k++) {
        if (parsed[k].dest === prodDest) { shadowed = true; break; }
      }
      if (shadowed) continue;

      const ps = schedule[p];
      const prodID = ps.ifCycle + 1 + ps.idDelay;
      const prodEX = prodID + 1 + ps.exDelay;
      const prodMEM = prodEX + 1;
      const prodWB = numStages === 5 ? prodMEM + 1 : prodMEM;
      const isLoad = prod.op === 'LW';

      if (numStages === 5) {
        if (forwarding) {
          if (isLoad) {
            // Load-use: consumerID >= prodID + 2 (1 stall)
            const minID = prodID + 2;
            const needed = minID - (ifCycle + 1);
            if (needed > idDelay) idDelay = needed;
            if (needed > 0) {
              hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "stall", delay: needed });
            }
          } else {
            // ALU: consumerEX >= prodEX + 1 (0 stalls)
            const minEX = prodEX + 1;
            const refNeeded = minEX - (ifCycle + 2); 
            if (refNeeded > idDelay) idDelay = refNeeded;
            fwdUsed = true;
            hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "forwarding", delay: 0 });
          }
        } else {
          // No forwarding: consumerID >= prodWB + 1
          const minID = prodWB + 1;
          const needed = minID - (ifCycle + 1);
          if (needed > idDelay) idDelay = needed;
          if (needed > 0) {
            hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "stall", delay: needed });
          }
        }
      } else {
        // 4-stage
        if (forwarding) {
          if (isLoad) {
            // 4-stage fwd LW: stall AFTER ID. consumerEX >= prodMEM + 1
            const minEX = prodMEM + 1;
            const curEX = ifCycle + 2; // Tentative EX without exDelay
            const needed = minEX - curEX;
            if (needed > exDelay) exDelay = needed;
            if (needed > 0) {
              hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "stall", delay: needed });
            }
          } else {
            // ALU: consumerEX >= prodEX + 1
            const minEX = prodEX + 1;
            const needed = minEX - (ifCycle + 2);
            if (needed > idDelay) idDelay = needed;
            fwdUsed = true;
            hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "forwarding", delay: 0 });
          }
        } else {
          // No forwarding: consumerID >= prodWB + 1
          const minID = prodWB + 1;
          const needed = minID - (ifCycle + 1);
          if (needed > idDelay) idDelay = needed;
          if (needed > 0) {
            hazards.push({ type: "RAW", from: prod.id, to: parsed[i].id, register: prodDest, resolvedBy: "stall", delay: needed });
          }
        }
      }
    }

    schedule.push({
      ifCycle,
      idDelay: Math.max(0, idDelay),
      exDelay: Math.max(0, exDelay),
      fwdUsed
    });
  }

  // Build the table structure expected by app.js
  const table = [];
  let totalCycles = 0;

  for (let i = 0; i < n; i++) {
    const s = schedule[i];
    const idCycle = s.ifCycle + 1 + s.idDelay;
    const exCycle = idCycle + 1 + s.exDelay;
    const lastCycle = exCycle + (stages.length - 3);
    if (lastCycle > totalCycles) totalCycles = lastCycle;
  }

  for (let i = 0; i < n; i++) {
    const s = schedule[i];
    const idCycle = s.ifCycle + 1 + s.idDelay;
    const exCycle = idCycle + 1 + s.exDelay;
    
    const row = new Array(totalCycles + 1).fill("");
    const stageCycles = {};

    // IF
    row[s.ifCycle] = "IF";
    stageCycles["IF"] = s.ifCycle;

    // Stalls before ID
    for (let c = s.ifCycle + 1; c < idCycle; c++) {
      row[c] = "STALL";
    }

    // ID
    row[idCycle] = "ID";
    stageCycles["ID"] = idCycle;

    // Stalls after ID
    for (let c = idCycle + 1; c < exCycle; c++) {
      row[c] = "STALL";
    }

    // EXE
    row[exCycle] = "EXE";
    stageCycles["EXE"] = exCycle;

    // Remaining stages
    for (let st = 3; st < stages.length; st++) {
      const c = exCycle + (st - 2);
      row[c] = stages[st];
      stageCycles[stages[st]] = c;
    }

    table.push({
      instruction: parsed[i],
      stages: row,
      stageCycles: stageCycles,
      stallCount: s.idDelay + s.exDelay
    });
  }

  return {
    table,
    hazards,
    parsed,
    stages
  };
}

window.simulateEngine = simulate;
