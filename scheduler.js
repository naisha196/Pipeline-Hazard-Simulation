// ============================================================
// scheduler.js — Pipeline Scheduler (in-order, single-issue)
// ============================================================

/**
 * Schedules all instructions through the pipeline, inserting
 * stall cycles where RAW hazards require them.
 *
 * Key invariant: in a single-issue in-order pipeline, each
 * instruction enters IF exactly one cycle after the previous
 * instruction BEGAN (not completed) — UNLESS a stall pushes
 * the current instruction back.
 *
 * Stall model:
 *   - When instruction j is stalled by k cycles, its IF is
 *     pushed k cycles later than the ideal.
 *   - The stall cells appear in the ROWS of instructions that
 *     are waiting: they show "STALL" for k cycles in place of
 *     ID (the instruction is frozen in the fetch/decode stage).
 *   - All later instructions are also pushed back by the same k.
 */
function scheduleInstructions(instructions, numStages, forwarding) {
  const stageNames = numStages === 5
    ? ["IF", "ID", "EX", "MEM", "WB"]
    : ["IF", "ID", "EX", "MEMWB"];

  const schedule    = [];
  const hazardReport = [];

  // nextIF: the earliest cycle the next instruction can enter IF
  let nextIF = 1;

  for (let j = 0; j < instructions.length; j++) {
    const instr = instructions[j];

    // Start with tentative IF (no stalls for this instruction yet)
    const tentIF = nextIF;
    const tentStages = buildStages(tentIF, stageNames);

    // Determine worst-case stall needed by any RAW dependency
    let maxStalls = 0;
    const instrHazards = [];

    for (let i = 0; i < j; i++) {
      const prod = schedule[i];
      if (!instructions[i].dest) continue;           // SW has no dest

      const reads = getReadRegisters(instr);
      if (!reads.includes(instructions[i].dest)) continue;

      // Shadowing: if an instruction between i and j already overwrites the
      // same register, the earlier dependency is neutralised for j
      let shadowed = false;
      for (let k = i + 1; k < j; k++) {
        if (instructions[k].dest === instructions[i].dest) { shadowed = true; break; }
      }
      if (shadowed) continue;

      const stalls = calculateStalls(
        prod.stages, tentStages,
        forwarding, instructions[i].op === "LW", numStages
      );

      instrHazards.push({
        producerIdx:   i,
        consumerIdx:   j,
        producerLabel: instructions[i].id,
        consumerLabel: instr.id,
        register:      instructions[i].dest,
        isLoadUse:     instructions[i].op === "LW",
        stalls:        stalls,
        forwarding:    forwarding && stalls === 0,
        resolved:      forwarding && stalls === 0 ? "forwarding" : "stall",
      });

      if (stalls > maxStalls) maxStalls = stalls;
    }

    // Actual IF is pushed back by the stall count
    const actualIF     = tentIF + maxStalls;
    const actualStages = buildStages(actualIF, stageNames);

    // Stall cells: shown in this instruction's row, between tentIF+1 and actualIF (inclusive)
    // They represent the instruction being frozen waiting for its operand.
    const stallCycles = [];
    for (let s = tentIF + 1; s <= actualIF; s++) stallCycles.push(s);

    // Which dependencies were resolved by forwarding (0 stalls)?
    const forwardedFrom = instrHazards
      .filter(h => h.forwarding && h.stalls === 0)
      .map(h => h.producerIdx);

    schedule.push({
      instr,
      stages:       actualStages,
      stallCycles,
      stallCount:   maxStalls,
      forwardedFrom,
      hazards:      instrHazards,
    });

    hazardReport.push(instrHazards);

    // Next instruction enters IF the cycle AFTER this one's actual IF
    nextIF = actualIF + 1;
  }

  // Total cycles = last stage of last instruction
  const last      = schedule[schedule.length - 1];
  const lastStage = stageNames[stageNames.length - 1];
  const totalCycles = last ? last.stages[lastStage] : 0;

  return { schedule, hazardReport, totalCycles, stageNames };
}

/** Build a stage→cycle object starting at 'start'. */
function buildStages(start, stageNames) {
  const s = {};
  stageNames.forEach((name, i) => { s[name] = start + i; });
  return s;
}

/**
 * Build the 2-D cell grid used by the renderer.
 * grid[instrIdx][cycle] = stage label string | ""
 * Forwarding is shown as "FWD" on the EX cell of the consumer.
 */
function buildCellGrid(schedule, totalCycles, stageNames, forwarding) {
  return schedule.map(entry => {
    const row = new Array(totalCycles + 1).fill("");   // 1-based

    // Stage labels
    for (const [stageName, cycle] of Object.entries(entry.stages)) {
      if (cycle >= 1 && cycle <= totalCycles) {
        // Mark EX as FWD when forwarding resolved at least one dependency
        if (stageName === "EX" && forwarding && entry.forwardedFrom.length > 0) {
          row[cycle] = "FWD";
        } else {
          row[cycle] = stageName;
        }
      }
    }

    // Stall labels (overwrite whatever was tentatively there)
    for (const sc of entry.stallCycles) {
      if (sc >= 1 && sc <= totalCycles) row[sc] = "STALL";
    }

    return row;
  });
}
