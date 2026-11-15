#!/usr/bin/env python3
"""Cross-package parity gate for the two DGII e-CF SDKs.

There is no shared code and no codegen: `packages/typescript` and
`packages/python` are kept behaviourally identical by hand, so every drift is
introduced by a human (or an agent) editing one side only. That has already
happened more than once — a retry budget that meant 4 sends on one side and 3 on
the other, an idempotency marker written in two different shapes, an exported
helper missing from one package.

This gate pins the parts of the contract that can be compared mechanically:

* every literal table both packages must agree on — DGII endpoints, base URLs,
  environments, status environments, error codes;
* the resilience defaults that decide how many times a fiscal document is sent;
* the idempotency threshold and pending-marker shape;
* byte-identity of the vendored XSDs, which are kept in three copies.

It is deliberately narrow: it fails only on things that are unambiguously wrong
on one side. Prose, module layout and language idioms are the reviewers' job.

Run: `mise run parity` (also wired as a pre-commit hook).
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TS_SRC = REPO / "packages/typescript/src"
PY_SRC = REPO / "packages/python/src/py_dgii_ecf"
SCHEMA_DIRS = (
    REPO / "packages/typescript/schemas",
    REPO / "packages/python/src/py_dgii_ecf/schemas",
    REPO / "examples/fixtures/schemas",
)

NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:  # pragma: no cover - configuration error
        raise SystemExit(f"parity: cannot read {path}: {exc}") from exc


def normalise(member: str) -> str:
    """Compare member names without case or separator noise."""
    return member.replace("_", "").lower()


def parse_block(source: str, header: str) -> str:
    """Body of the first `{...}` block that follows `header`."""
    start = source.find(header)
    if start == -1:
        raise SystemExit(f"parity: cannot find {header!r}")
    brace = source.find("{", start + len(header) - 1)
    if brace == -1:
        raise SystemExit(f"parity: no block after {header!r}")
    depth = 0
    for index in range(brace, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[brace + 1 : index]
    raise SystemExit(f"parity: unterminated block after {header!r}")


def parse_union(source: str, header: str) -> str:
    """Body of a TypeScript union type: everything up to the closing `;`."""
    start = source.find(header)
    if start == -1:
        raise SystemExit(f"parity: cannot find {header!r}")
    end = source.find(";", start)
    if end == -1:
        raise SystemExit(f"parity: unterminated union after {header!r}")
    return source[start + len(header) : end]


def parse_indented(source: str, header: str) -> str:
    """Body of a Python class: the indented lines that follow `header`."""
    lines = source.splitlines()
    try:
        start = next(
            index for index, line in enumerate(lines) if line.startswith(header)
        )
    except StopIteration:
        raise SystemExit(f"parity: cannot find {header!r}") from None
    body: list[str] = []
    for line in lines[start + 1 :]:
        if line.strip() and not line.startswith((" ", "\t")):
            break
        body.append(line)
    return "\n".join(body)


def pairs(body: str) -> dict[str, str]:
    """`NAME = value` pairs, normalised by member name."""
    found: dict[str, str] = {}
    for match in re.finditer(
        r"([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*['\"]([^'\"]*)['\"]", body
    ):
        found[normalise(match.group(1))] = match.group(2)
    return found


def ts_enum(name: str) -> dict[str, str]:
    return pairs(parse_block(read(TS_SRC / "environment.ts"), f"enum {name}"))


def py_enum(name: str) -> dict[str, str]:
    return pairs(parse_indented(read(PY_SRC / "environment.py"), f"class {name}("))


def ts_const(name: str) -> dict[str, str]:
    source = read(TS_SRC / "environment.ts")
    return pairs(parse_block(source, f"const {name} ="))


def py_str_enum(name: str) -> dict[str, str]:
    return pairs(parse_indented(read(PY_SRC / "environment.py"), f"class {name}("))


def ts_error_codes() -> set[str]:
    source = read(TS_SRC / "errors.ts")
    body = parse_union(source, "type DgiiErrorCode =")
    return {normalise(name) for name in re.findall(r"'([A-Z_]+)'", body)}


def py_error_codes() -> set[str]:
    source = read(PY_SRC / "errors.py")
    return {normalise(name) for name in re.findall(r"^    ([A-Z_]+) = ", source, re.M)}


def ts_error_code_values() -> set[str]:
    """Exact string values of the TypeScript error-code union."""
    source = read(TS_SRC / "errors.ts")
    body = parse_union(source, "type DgiiErrorCode =")
    return set(re.findall(r"'([A-Z_]+)'", body))


def py_error_code_values() -> set[str]:
    """Exact string values of the Python error-code enum, case-sensitive."""
    body = parse_indented(read(PY_SRC / "errors.py"), "class DgiiErrorCode(")
    return set(re.findall(r'= "([A-Z_]+)"', body))


def ts_number(source: str, key: str) -> float | None:
    match = re.search(rf"^\s*{key}:\s*([0-9_]+)", source, re.M)
    return None if match is None else float(match.group(1).replace("_", ""))


def py_number(source: str, key: str) -> float | None:
    match = re.search(rf"^\s*{key}:\s*[A-Za-z]+\s*=\s*([0-9_.]+)", source, re.M)
    return None if match is None else float(match.group(1).replace("_", ""))


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks = 0

    def compare_maps(self, label: str, left: dict[str, str], right: dict[str, str]) -> None:
        self.checks += 1
        for key in sorted(set(left) | set(right)):
            a, b = left.get(key), right.get(key)
            if a == b:
                continue
            self.failures.append(
                f"{label}: {key!r} is {a!r} in TypeScript and {b!r} in Python"
            )

    def compare_sets(self, label: str, left: set[str], right: set[str]) -> None:
        self.checks += 1
        for missing in sorted(left - right):
            self.failures.append(f"{label}: {missing} exists in TypeScript only")
        for missing in sorted(right - left):
            self.failures.append(f"{label}: {missing} exists in Python only")

    def compare_numbers(self, label: str, left: float | None, right: float | None) -> None:
        self.checks += 1
        if left is None or right is None:
            self.failures.append(
                f"{label}: not found on one side (TypeScript {left}, Python {right})"
            )
        elif left != right:
            self.failures.append(
                f"{label}: TypeScript {left:g} vs Python {right:g}"
            )


def check_schemas(report: Report) -> None:
    digests: dict[str, dict[str, str]] = {}
    for directory in SCHEMA_DIRS:
        for path in sorted(directory.glob("*.xsd")):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            digests.setdefault(path.name, {})[str(directory.relative_to(REPO))] = digest
    report.checks += 1
    if not digests:
        report.failures.append("schemas: no vendored XSDs found")
        return
    for name, copies in sorted(digests.items()):
        if len(copies) != len(SCHEMA_DIRS):
            missing = sorted(
                str(directory.relative_to(REPO))
                for directory in SCHEMA_DIRS
                if str(directory.relative_to(REPO)) not in copies
            )
            report.failures.append(f"schemas: {name} is missing from {missing}")
        elif len(set(copies.values())) != 1:
            report.failures.append(
                f"schemas: {name} differs between copies ({sorted(copies)})"
            )


def main() -> int:
    report = Report()

    report.compare_maps(
        "Endpoint",
        ts_enum("Endpoint"),
        py_enum("Endpoint"),
    )
    report.compare_maps(
        "SenderReceiverEndpoint",
        ts_enum("SenderReceiverEndpoint"),
        py_enum("SenderReceiverEndpoint"),
    )
    report.compare_maps(
        "StatusEndpoint",
        ts_enum("StatusEndpoint"),
        py_enum("StatusEndpoint"),
    )
    report.compare_maps("BaseUrl", ts_const("BaseUrl"), py_str_enum("BaseUrl"))
    report.compare_maps("Environment", ts_enum("Environment"), py_enum("Environment"))
    report.compare_maps(
        "StatusEnvironment",
        ts_enum("StatusEnvironment"),
        py_enum("StatusEnvironment"),
    )
    report.compare_sets("DgiiErrorCode", ts_error_codes(), py_error_codes())
    report.compare_sets(
        "DgiiErrorCode value", ts_error_code_values(), py_error_code_values()
    )

    ts_resilience = read(TS_SRC / "resilience.ts")
    py_resilience = read(PY_SRC / "resilience.py")
    report.compare_numbers(
        "resilience.maxRetries (attempts)",
        ts_number(ts_resilience, "maxRetries"),
        py_number(py_resilience, "max_retries"),
    )
    report.compare_numbers(
        "resilience.breakerThreshold",
        ts_number(ts_resilience, "breakerThreshold"),
        py_number(py_resilience, "breaker_threshold"),
    )
    report.compare_numbers(
        "resilience.halfOpenAfterMs vs reset_timeout_s*1000",
        ts_number(ts_resilience, "halfOpenAfterMs"),
        (py_number(py_resilience, "reset_timeout_s") or 0.0) * 1000 or None,
    )
    report.compare_numbers(
        "resilience.timeoutMs vs timeout_s*1000",
        ts_number(ts_resilience, "timeoutMs"),
        (py_number(py_resilience, "timeout_s") or 0.0) * 1000 or None,
    )

    ts_http = read(TS_SRC / "http.ts")
    py_http = read(PY_SRC / "http.py")
    report.checks += 1
    ts_ttl = re.search(r"DEFAULT_IDEMPOTENCY_TTL_MS = ([0-9 *]+)", ts_http)
    py_ttl = re.search(r"DEFAULT_IDEMPOTENCY_TTL_S = ([0-9 *]+)", py_http)

    def product(expression: str) -> float:
        total = 1.0
        for factor in expression.split("*"):
            total *= float(factor.strip())
        return total

    if ts_ttl is None or py_ttl is None:
        report.failures.append("idempotency TTL: not found on one side")
    elif product(ts_ttl.group(1)) / 1000 != product(py_ttl.group(1)):
        report.failures.append(
            "idempotency TTL: TypeScript "
            f"{product(ts_ttl.group(1)) / 1000:g}s vs Python "
            f"{product(py_ttl.group(1)):g}s"
        )

    report.checks += 1
    # Compare the actual wire shape written by each package, not the presence of
    # a substring: the two markers were once `{pending: true}` and
    # `{"__pending__": True}`, so a re-read in the other package reported an
    # in-flight document as delivered.
    ts_marker = re.search(
        r"PENDING_SUBMISSION[^=]*=\s*\{([^}]*)\}", read(TS_SRC / "client.ts")
    )
    py_marker = re.search(
        r"_PENDING_MARKER[^=]*=\s*\{([^}]*)\}", read(PY_SRC / "client.py")
    )
    if ts_marker is None or py_marker is None:
        report.failures.append("pending marker: not found on one side")
    else:
        # Compare the exact keys, not normalised names: the underscore in
        # `__pending__` is part of the wire shape, so `pending` and
        # `__pending__` must not collapse to the same value.
        ts_keys = set(re.findall(r"([A-Za-z_]\w*)\s*:", ts_marker.group(1)))
        py_keys = set(re.findall(r"[\"']([A-Za-z_]\w*)[\"']\s*:", py_marker.group(1)))
        if ts_keys != py_keys:
            report.failures.append(
                "pending marker: TypeScript writes "
                f"{sorted(ts_keys)} but Python writes {sorted(py_keys)}"
            )

    report.checks += 1
    threshold = re.compile(
        r"CONSUMPTION_SUMMARY_THRESHOLD(?:\s*:\s*[A-Za-z\[\]]+)?\s*=\s*['\"]?([0-9_.]+)"
    )
    ts_threshold = threshold.search(read(TS_SRC / "reception.ts"))
    py_threshold = threshold.search(read(PY_SRC / "reception.py"))
    if (
        ts_threshold is None
        or py_threshold is None
        or ts_threshold.group(1).replace("_", "")
        != py_threshold.group(1).replace("_", "")
    ):
        report.failures.append(
            "reception threshold: CONSUMPTION_SUMMARY_THRESHOLD differs or is missing"
        )

    check_schemas(report)

    if report.failures:
        print(f"parity: {len(report.failures)} failure(s) across {report.checks} checks")
        for failure in report.failures:
            print(f"  - {failure}")
        return 1
    print(f"parity: OK ({report.checks} checks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
