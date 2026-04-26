
// Instruction Parser
// Parses user input fields into structured instruction objects


const SUPPORTED_OPS = ["ADD", "SUB", "LW", "SW"];

function buildInstructionFromFields(index, op, f1, f2, f3) {
  const id = `I${index + 1}`;
  op = op.toUpperCase().trim();
  const norm = s => s.trim().toUpperCase().replace(/\s+/g, "");

  if (op === "LW") {
    if (!f1) return { error: "LW requires destination register (e.g. R1)" };
    const dest = norm(f1);
    let src1 = null;
    if (f2) {
      const m = norm(f2).match(/^-?\d*\(([A-Z][A-Z0-9]*)\)$/);
      src1 = m ? m[1] : norm(f2);
    }
    return { id, raw: `LW ${dest}, ${f2 || "0(R0)"}`, op: "LW", dest, src1, src2: null };
  }

  if (op === "SW") {
    if (!f1) return { error: "SW requires source register (e.g. R1)" };
    const src1 = norm(f1);
    let src2 = null;
    if (f2) {
      const m = norm(f2).match(/^-?\d*\(([A-Z][A-Z0-9]*)\)$/);
      src2 = m ? m[1] : norm(f2);
    }
    return { id, raw: `SW ${src1}, ${f2 || "0(R0)"}`, op: "SW", dest: null, src1, src2 };
  }

  // R-type: dest, src1, src2
  if (!f1 || !f2 || !f3) return { error: `${op} needs 3 registers (e.g. R1, R2, R3)` };
  return {
    id,
    raw: `${op} ${norm(f1)}, ${norm(f2)}, ${norm(f3)}`,
    op,
    dest: norm(f1),
    src1: norm(f2),
    src2: norm(f3),
  };
}

function collectInstructions() {
  const rows = document.querySelectorAll(".instr-row");
  const instructions = [], errors = [];
  rows.forEach((row, i) => {
    const op = row.querySelector(".instr-select").value;
    const ins = row.querySelectorAll(".instr-input");
    ins.forEach(inp => inp.classList.remove("error"));
    const f1 = ins[0]?.value.trim() || "";
    const f2 = ins[1]?.value.trim() || "";
    const f3 = ins[2]?.value.trim() || "";
    const r = buildInstructionFromFields(i, op, f1, f2, f3);
    if (r.error) {
      errors.push(`I${i + 1}: ${r.error}`);
      ins[0]?.classList.add("error");
    } else {
      instructions.push(r);
    }
  });
  return { instructions, errors };
}

function getReadRegisters(instr) {
  const r = [];
  if (instr.src1) r.push(instr.src1);
  if (instr.src2) r.push(instr.src2);
  return r;
}
