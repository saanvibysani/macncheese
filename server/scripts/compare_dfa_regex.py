#!/usr/bin/env python3
"""Compare a hand-built loan-code DFA with its equivalent regular expression."""

import re


DEAD = "qd"
CODE_PATTERN = re.compile(r"LOAN[HVPE][0-9]{6}")
TRANSITIONS = {
    "start": {"L": "q0"},
    "q0": {"O": "q1"},
    "q1": {"A": "q2"},
    "q2": {"N": "q3"},
    "q3": {letter: "q4" for letter in "HVPE"},
    "q10": {},
    DEAD: {},
}

for state in range(4, 10):
    TRANSITIONS[f"q{state}"] = {str(digit): f"q{state + 1}" for digit in range(10)}


def dfa_accepts(value):
    state = "start"
    for symbol in value:
        state = TRANSITIONS.get(state, {}).get(symbol, DEAD)
    return state == "q10"


def regex_accepts(value):
    return CODE_PATTERN.fullmatch(value) is not None


CASES = [
    ("LOANH123456", True),
    ("LOANV123456", True),
    ("LOANP123456", True),
    ("LOANE123456", True),
    ("LOANX123456", False),
    ("LOANH12345", False),
    ("LOANH1234567", False),
    ("", False),
    ("loanh123456", False),
    ("LOANH123456\n", False),
]


def main():
    print(f"{'Input':<20} {'Expected':<9} {'DFA':<5} {'Regex':<6} Agree")
    print("-" * 52)
    all_agree = True
    for value, expected in CASES:
        dfa_result = dfa_accepts(value)
        regex_result = regex_accepts(value)
        agree = dfa_result == regex_result
        all_agree = all_agree and agree and dfa_result == expected
        print(f"{value!r:<20} {str(expected):<9} {str(dfa_result):<5} {str(regex_result):<6} {agree}")
    if not all_agree:
        raise SystemExit("DFA and regex comparison failed")
    print(f"\nAll {len(CASES)} cases agree with the expected result.")


if __name__ == "__main__":
    main()
