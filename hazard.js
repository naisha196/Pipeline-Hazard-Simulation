// ============================================================
// hazard.js — RAW Hazard Detection & Stall Calculation
// ============================================================

/**
 * Calculate stalls needed between a producer and consumer instruction.
 *
 * Assumptions (standard textbook model):
 *  - Without forwarding: result usable only AFTER WB completes.
 *    Consumer needs the value at its ID stage (register file read).
 *    => stalls = producerWB - consumerID (clamped to 0)
 *
 *  - With forwarding (ALU→ALU): result forwarded from end of EX.
 *    Consumer needs it at start of EX.
 *    => stalls = producerEX - consumerEX (clamped to 0)
 *
 *  - With forwarding (LW load-use): result only available after MEM.
 *    Even with forwarding, 1 stall is required.
 *    => stalls = producerMEM - consumerEX (clamped to 0)
 *
 * @param {object}  pStages      — producer's stage→cycle map
 * @param {object}  cStages      — consumer's TENTATIVE stage→cycle map
 * @param {boolean} forwarding
 * @param {boolean} isLoadUse    — producer is LW
 * @param {number}  numStages    — 4 or 5
 */
function calculateStalls(pStages, cStages, forwarding, isLoadUse, numStages) {
  if (forwarding) {
    if (isLoadUse) {
      // LW result ready after MEM; consumer needs it at EX
      const ready  = pStages.MEM  !== undefined ? pStages.MEM  : pStages.MEMWB;
      const needed = cStages.EX;
      return Math.max(0, ready - needed);
    } else {
      // ALU forwarding: result at end of EX → forwarded to next EX input
      const ready  = pStages.EX;
      const needed = cStages.EX;
      return Math.max(0, ready - needed);
    }
  } else {
    // No forwarding: result available only after WB writes to register file
    const ready  = numStages === 5 ? pStages.WB : pStages.MEMWB;
    // Consumer reads the register at the END of its ID stage (start of EX)
    const needed = cStages.EX;
    return Math.max(0, ready - needed);
  }
}
