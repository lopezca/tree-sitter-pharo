#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable, List, Optional

from tree_sitter import Language, Parser  # type: ignore[attr-defined]

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = REPO_ROOT / "test" / "corpus" / "tonel.txt"
OUTPUT_PATH = REPO_ROOT / "test" / "corpus" / "tonel_methods.txt"


def _ensure_binding_available() -> Language:
    try:
        from tree_sitter_pharo import language as ts_language
        return Language(ts_language())
    except ModuleNotFoundError:
        build_dir = REPO_ROOT / "build"
        for candidate in sorted(build_dir.glob("lib.*"), reverse=True):
            sys.path.insert(0, str(candidate))
            try:
                from tree_sitter_pharo import language as ts_language
                return Language(ts_language())
            except ModuleNotFoundError:
                sys.path.pop(0)
        raise


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Tonel method fixtures using tree-sitter.")
    parser.add_argument("--fail-on-skip", action="store_true", help="Exit with a non-zero status if any methods are skipped.")
    return parser.parse_args(argv)


def load_corpus_sections(content: str) -> List[dict[str, str]]:
    lines = content.splitlines()
    sections: List[dict[str, str]] = []
    i = 0
    while i < len(lines):
        while i < len(lines) and not lines[i].strip():
            i += 1
        if i >= len(lines):
            break
        if not lines[i].startswith("==="):
            i += 1
            continue

        separator = lines[i]
        separator_width = len(separator)
        i += 1

        title = lines[i] if i < len(lines) else ""
        i += 1

        if i < len(lines) and lines[i].startswith("="):
            i += 1

        sample_lines: List[str] = []
        while i < len(lines) and lines[i] != "-" * separator_width:
            sample_lines.append(lines[i])
            i += 1

        if i >= len(lines):
            break
        i += 1

        if i < len(lines) and not lines[i].strip():
            i += 1

        tree_lines: List[str] = []
        while i < len(lines) and not lines[i].startswith("="):
            tree_lines.append(lines[i])
            i += 1

        sections.append(
            {
                "title": title.strip(),
                "sample": "\n".join(sample_lines).rstrip(),
                "tree": "\n".join(tree_lines).strip(),
            }
        )
    return sections


def _descendants_of_type(node, type_name: str):
    stack = [node]
    while stack:
        current = stack.pop()
        if current.type == type_name:
            yield current
        stack.extend(reversed(current.children))


def find_methods(parser: Parser, sample: str):
    tree = parser.parse(sample.encode("utf8"))
    nodes = list(_descendants_of_type(tree.root_node, "method_definition"))
    return [(node, tree) for node in nodes]


def selector_text(sample_bytes: bytes, header_node) -> str:
    for child in header_node.named_children:
        if child.type.endswith("_selector"):
            return sample_bytes[child.start_byte : child.end_byte].decode("utf8").strip()
    return ""


def method_source_from_tonel(sample: str, sample_bytes: bytes, method_node, selector: str) -> str:
    text = sample_bytes[method_node.start_byte : method_node.end_byte].decode("utf8")
    lines = text.splitlines()
    header_index = next((idx for idx, line in enumerate(lines) if ">>" in line), -1)
    if header_index == -1:
        return f"{selector}\n"

    close_index = len(lines) - 1
    while close_index > header_index and "]" not in lines[close_index]:
        close_index -= 1

    raw_body = lines[header_index + 1 : close_index]
    significant = [line for line in raw_body if line.strip()]
    indent = min((len(line) - len(line.lstrip()) for line in significant), default=0)

    body_lines = []
    for line in raw_body:
        if not line.strip():
            body_lines.append("")
            continue
        adjusted = line[indent:]
        adjusted = adjusted.rstrip()
        adjusted = re.sub(r"\|\s*\.$", "|", adjusted)
        body_lines.append(adjusted)

    indented_body = [f"    {line}" if line else "" for line in body_lines]

    result_lines = [selector, ""]
    result_lines.extend(indented_body)
    return "\n".join(result_lines).rstrip() + "\n"


def format_tree(node, indent: int = 0) -> str:
    indent_str = "  " * indent
    named_children = [child for child in node.children if child.is_named]
    if not named_children:
        return f"{indent_str}({node.type})"

    lines = [f"{indent_str}({node.type}"]
    for child in named_children:
        lines.append(format_tree(child, indent + 1))
    lines[-1] = f"{lines[-1]})"
    return "\n".join(lines)


def build_method_fixture(parser: Parser, section_title: str, sample: str, method_node, index: int, stats):
    header_node = next((child for child in method_node.named_children if child.type == "method_header"), None)
    if header_node is None:
        key = build_skip_key(section_title, index)
        stats["skipped"].append({
            "key": key,
            "section": section_title,
            "index": index,
            "reason": "Missing method header",
        })
        return None

    sample_bytes = sample.encode("utf8")
    selector = selector_text(sample_bytes, header_node)
    method_source = method_source_from_tonel(sample, sample_bytes, method_node, selector)

    method_tree = parser.parse(method_source.encode("utf8"))
    if method_tree.root_node.has_error:
        key = build_skip_key(section_title, index)
        stats["skipped"].append({
            "key": key,
            "section": section_title,
            "index": index,
            "reason": "Generated method has parse errors",
        })
        return None

    formatted_tree = format_tree(method_tree.root_node)
    label_selector = " ".join(selector.split()).strip() or f"method-{index + 1}"

    return {
        "title": f"{section_title} - {label_selector}".strip(),
        "source": method_source,
        "tree": formatted_tree,
    }


def serialize_fixture(fixture: dict[str, str]) -> str:
    separator = "=" * 80
    dash_separator = "-" * 80
    return "\n".join(
        [
            separator,
            fixture["title"],
            separator,
            fixture["source"].rstrip(),
            dash_separator,
            "",
            fixture["tree"],
            "",
        ]
    )


def format_skip_summary(stats) -> str:
    if not stats["skipped"]:
        return "No skipped methods."
    lines = ["Skipped methods while generating Tonel fixtures:"]
    for entry in stats["skipped"]:
        lines.append(f"  - {entry['section']} (#{entry['index'] + 1}): {entry['reason']}")
    return "\n".join(lines)


def create_parser() -> Parser:
    language = _ensure_binding_available()
    parser = Parser()
    parser.language = language
    return parser


def build_skip_key(section_title: str, index: int) -> str:
    return f"{section_title}#{index + 1}"


def main(argv: Optional[Iterable[str]] = None) -> None:
    args = parse_args(argv)
    parser = create_parser()

    content = INPUT_PATH.read_text(encoding="utf8")
    sections = load_corpus_sections(content)

    fixtures = []
    stats = {"skipped": []}

    for section in sections:
        methods = find_methods(parser, section["sample"])
        for method_index, (node, _tree) in enumerate(methods):
            fixture = build_method_fixture(parser, section["title"], section["sample"], node, method_index, stats)
            if fixture:
                fixtures.append(fixture)

    if not fixtures:
        print("No methods found in Tonel corpus. Nothing to write.")
        if args.fail_on_skip and stats["skipped"]:
            print(format_skip_summary(stats), file=sys.stderr)
            sys.exit(1)
        return

    output = "\n".join(serialize_fixture(fixture) for fixture in fixtures)
    OUTPUT_PATH.write_text(output + "\n", encoding="utf8")
    print(f"Wrote {len(fixtures)} method fixtures to {OUTPUT_PATH}")

    if stats["skipped"]:
        summary = format_skip_summary(stats)
        print(summary, file=sys.stderr)
        if args.fail_on_skip:
            sys.exit(1)


if __name__ == "__main__":
    main()
