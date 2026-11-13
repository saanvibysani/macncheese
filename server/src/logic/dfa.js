// Part A: DFA construction and simulation.
// States q0..q10 for LOAN[HVPE]dddddd, plus dead state qd.

const DEAD = 'qd';

// A state name means "this symbol has just been read", matching the written answer:
//   start -L-> q0 -O-> q1 -A-> q2 -N-> q3 -[HVPE]-> q4 -digit-> q5 ... -digit-> q10 (accepting, 6th digit)
function buildCodeDfa() {
  const transitions = {};
  transitions.start = (c) => (c === 'L' ? 'q0' : DEAD);
  transitions.q0 = (c) => (c === 'O' ? 'q1' : DEAD);
  transitions.q1 = (c) => (c === 'A' ? 'q2' : DEAD);
  transitions.q2 = (c) => (c === 'N' ? 'q3' : DEAD);
  transitions.q3 = (c) => (c.length === 1 && 'HVPE'.includes(c) ? 'q4' : DEAD);
  for (let i = 4; i <= 9; i++) {
    transitions[`q${i}`] = (c) => (/^[0-9]$/.test(c) ? `q${i + 1}` : DEAD);
  }
  transitions.q10 = () => DEAD; // nothing may follow the sixth digit
  transitions[DEAD] = () => DEAD;
  return { start: 'start', accepting: new Set(['q10']), transitions };
}

// Income/amount DFA for ^[1-9][0-9]{0,7}$ : s0 -first nonzero digit-> s1 ... s8 (accepting s1..s8)
function buildNumberDfa() {
  const transitions = {};
  transitions.s0 = (c) => (/^[1-9]$/.test(c) ? 's1' : DEAD);
  for (let i = 1; i <= 7; i++) {
    transitions[`s${i}`] = (c) => (/^[0-9]$/.test(c) ? `s${i + 1}` : DEAD);
  }
  transitions.s8 = () => DEAD;
  transitions[DEAD] = () => DEAD;
  const accepting = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
  return { start: 's0', accepting, transitions };
}

function simulate(dfa, input) {
  const str = typeof input === 'string' ? input : '';
  let state = dfa.start;
  const trace = [{ state, read: null }];
  for (const ch of str) {
    state = dfa.transitions[state](ch);
    trace.push({ state, read: ch });
  }
  return { accepted: dfa.accepting.has(state), finalState: state, trace };
}

const codeDfa = buildCodeDfa();
const numberDfa = buildNumberDfa();

module.exports = {
  DEAD,
  codeDfa,
  numberDfa,
  simulate,
  runCodeDfa: (s) => simulate(codeDfa, s),
  runNumberDfa: (s) => simulate(numberDfa, s),
};
