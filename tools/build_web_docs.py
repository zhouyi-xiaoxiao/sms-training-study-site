#!/usr/bin/env python3
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "output" / "src"
OUT_DIR = ROOT / "docs" / "readers"


@dataclass(frozen=True)
class DocSpec:
    doc_id: str
    title: str
    source_name: str
    output_name: str


DOC_SPECS = [
    DocSpec(
        doc_id="doc-1",
        title="企业短信培训学习手册（专业文稿版）",
        source_name="original_complete.tex",
        output_name="doc-1.html",
    ),
    DocSpec(
        doc_id="doc-2",
        title="全知识点（结构化）",
        source_name="knowledge_points_full.tex",
        output_name="doc-2.html",
    ),
    DocSpec(
        doc_id="doc-3",
        title="题库（学习测评版）",
        source_name="practice_with_brain_science.tex",
        output_name="doc-3.html",
    ),
]


def read_tex(source_path: Path) -> str:
    return source_path.read_text(encoding="utf-8")


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%[^\n]*", "", text)


def extract_document_body(text: str) -> str:
    begin = re.search(r"\\begin\{document\}", text)
    end = re.search(r"\\end\{document\}", text)
    if begin and end and begin.end() < end.start():
        return text[begin.end() : end.start()]
    return text


def remove_braced_command(text: str, command: str) -> str:
    token = f"\\{command}" + "{"
    cursor = 0
    parts = []

    while True:
        start = text.find(token, cursor)
        if start < 0:
            parts.append(text[cursor:])
            break

        parts.append(text[cursor:start])
        i = start + len(token)
        depth = 1

        while i < len(text) and depth > 0:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1

        cursor = i

    return "".join(parts)


def clean_math(expr: str) -> str:
    s = expr
    s = s.replace(r"\leq", "≤")
    s = s.replace(r"\geq", "≥")
    s = s.replace(r"\Rightarrow", "=>")
    s = s.replace(r"\rightarrow", "→")
    s = s.replace(r"\leftarrow", "←")
    s = s.replace(r"\%", "%")
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\\[a-zA-Z]+", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def clean_inline(text: str, collapse_whitespace: bool = True) -> str:
    s = text
    s = s.replace("\\%", "%")
    s = s.replace("\\#", "#")
    s = s.replace("\\_", "_")
    s = s.replace("\\&", "&")
    s = s.replace("~", " ")
    s = s.replace("\\par", " ")
    s = s.replace("\\\\", " ")

    s = re.sub(r"\\ansline\{([^{}]*)\}", r"答案：\1", s)
    s = re.sub(r"\\expline\{([^{}]*)\}", r"解释：\1", s)
    s = re.sub(r"\\coverline\{([^{}]*)\}", r"\1", s)

    wrappers = ["textbf", "mystrong", "texttt", "ansbadge", "emph", "underline"]
    changed = True
    while changed:
        changed = False
        for cmd in wrappers:
            pattern = rf"\\{cmd}\{{([^{{}}]*)\}}"
            new = re.sub(pattern, r"\1", s)
            if new != s:
                s = new
                changed = True

    s = re.sub(r"\$([^$]+)\$", lambda m: clean_math(m.group(1)), s)

    s = re.sub(r"\\vspace\*?\{[^{}]*\}", " ", s)
    s = re.sub(r"\\fontsize\{[^{}]*\}\{[^{}]*\}", " ", s)
    s = re.sub(r"\\color\{[^{}]*\}", " ", s)

    s = re.sub(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?", " ", s)
    s = s.replace("{", "").replace("}", "")

    if collapse_whitespace:
        s = re.sub(r"\s+", " ", s)
    return s.strip()


def expand_verbatim_input(text: str, source_path: Path) -> str:
    pattern = re.compile(r"\\VerbatimInput(?:\[[^\]]*\])?\{([^}]*)\}")

    def repl(match: re.Match[str]) -> str:
        rel_path = match.group(1).strip()
        raw_path = (source_path.parent / rel_path).resolve()
        if not raw_path.exists():
            missing = f"引用文件缺失：{rel_path}"
            return f"\n[[PRE_START]]\n{missing}\n[[PRE_END]]\n"
        content = raw_path.read_text(encoding="utf-8")
        return f"\n[[PRE_START]]\n{content.rstrip()}\n[[PRE_END]]\n"

    return pattern.sub(repl, text)


def convert_longtable_blocks(text: str) -> str:
    pattern = re.compile(r"\\begin\{longtable\}\{[^\n]*\}(.*?)\\end\{longtable\}", re.S)

    def repl(match: re.Match[str]) -> str:
        block = match.group(1)
        block = re.sub(r"\\(?:toprule|midrule|bottomrule|hline)", "", block)

        rows = []
        for raw_row in re.split(r"\\\\", block):
            row = raw_row.strip()
            if not row:
                continue
            cells = [clean_inline(cell) for cell in row.split("&")]
            cells = [cell for cell in cells if cell]
            if not cells:
                continue

            if len(cells) == 1:
                rows.append(f"[[TABLE_ITEM]] {cells[0]}")
                continue

            left = cells[0]
            right = "；".join(cells[1:])
            rows.append(f"[[TABLE_ROW]] {left} || {right}")

        if not rows:
            return "\n"
        return "\n" + "\n".join(rows) + "\n"

    return pattern.sub(repl, text)


def preprocess(text: str, source_path: Path) -> str:
    content = extract_document_body(text)
    content = strip_comments(content)
    content = expand_verbatim_input(content, source_path)
    content = remove_braced_command(content, "hypersetup")
    content = convert_longtable_blocks(content)

    content = re.sub(r"\\chapter\{([^{}]*)\}", lambda m: f"\n[[H1]] {clean_inline(m.group(1))}\n", content)
    content = re.sub(r"\\section\{([^{}]*)\}", lambda m: f"\n[[H2]] {clean_inline(m.group(1))}\n", content)
    content = re.sub(r"\\subsection\{([^{}]*)\}", lambda m: f"\n[[H3]] {clean_inline(m.group(1))}\n", content)

    block_replacements = {
        r"\begin{itemize}": "\n[[UL_START]]\n",
        r"\end{itemize}": "\n[[UL_END]]\n",
        r"\begin{enumerate}": "\n[[OL_START]]\n",
        r"\end{enumerate}": "\n[[OL_END]]\n",
        r"\begin{keybox}": "\n[[CALLOUT_START]]\n",
        r"\end{keybox}": "\n[[CALLOUT_END]]\n",
        r"\begin{riskbox}": "\n[[CALLOUT_START]]\n",
        r"\end{riskbox}": "\n[[CALLOUT_END]]\n",
        r"\begin{titlepage}": "\n",
        r"\end{titlepage}": "\n",
        r"\tableofcontents": "\n",
        r"\clearpage": "\n",
        r"\newpage": "\n",
        r"\vfill": "\n",
        r"\centering": "\n",
    }
    for src, dst in block_replacements.items():
        content = content.replace(src, dst)

    content = re.sub(r"\\item\s*", "\n[[ITEM]] ", content)
    content = re.sub(r"\\vspace\*?\{[^{}]*\}", "\n", content)

    content = re.sub(r"\\begin\{[^}]+\}", "\n", content)
    content = re.sub(r"\\end\{[^}]+\}", "\n", content)

    content = content.replace("\\\\", "\n")
    content = content.replace("\\par", "\n")

    return content


def make_slug(text: str, used: set[str]) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", text).strip("-").lower()
    if not slug:
        slug = "section"
    base = slug
    i = 2
    while slug in used:
        slug = f"{base}-{i}"
        i += 1
    used.add(slug)
    return slug


def parse_to_html(content: str) -> tuple[str, list[tuple[int, str, str]]]:
    lines = content.splitlines()

    parts: list[str] = []
    toc: list[tuple[int, str, str]] = []
    used_ids: set[str] = set()

    paragraph_chunks: list[str] = []
    list_mode: str | None = None
    list_items: list[str] = []
    callout_depth = 0

    pre_mode = False
    pre_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_chunks
        if not paragraph_chunks:
            return
        text = clean_inline(" ".join(paragraph_chunks))
        paragraph_chunks = []
        if text:
            parts.append(f"<p>{html.escape(text)}</p>")

    def flush_list() -> None:
        nonlocal list_mode, list_items
        if not list_mode:
            list_items = []
            return
        cleaned = [clean_inline(item) for item in list_items]
        cleaned = [item for item in cleaned if item]
        if cleaned:
            tag = "ol" if list_mode == "ol" else "ul"
            li_html = "".join(f"<li>{html.escape(item)}</li>" for item in cleaned)
            parts.append(f"<{tag}>{li_html}</{tag}>")
        list_mode = None
        list_items = []

    for raw_line in lines:
        stripped = raw_line.strip()

        if pre_mode:
            if stripped == "[[PRE_END]]":
                pre_mode = False
                pre_text = "\n".join(pre_lines)
                pre_lines = []
                parts.append(f"<pre>{html.escape(pre_text)}</pre>")
            else:
                pre_lines.append(raw_line.rstrip("\n"))
            continue

        if not stripped:
            if list_mode:
                continue
            flush_paragraph()
            flush_list()
            continue

        if stripped == "[[PRE_START]]":
            flush_paragraph()
            flush_list()
            pre_mode = True
            pre_lines = []
            continue

        if stripped == "[[CALLOUT_START]]":
            flush_paragraph()
            flush_list()
            parts.append('<aside class="callout">')
            callout_depth += 1
            continue

        if stripped == "[[CALLOUT_END]]":
            flush_paragraph()
            flush_list()
            if callout_depth > 0:
                parts.append("</aside>")
                callout_depth -= 1
            continue

        if stripped == "[[UL_START]]":
            flush_paragraph()
            flush_list()
            list_mode = "ul"
            list_items = []
            continue

        if stripped == "[[OL_START]]":
            flush_paragraph()
            flush_list()
            list_mode = "ol"
            list_items = []
            continue

        if stripped in {"[[UL_END]]", "[[OL_END]]"}:
            flush_paragraph()
            flush_list()
            continue

        if stripped.startswith("[[H1]] ") or stripped.startswith("[[H2]] ") or stripped.startswith("[[H3]] "):
            flush_paragraph()
            flush_list()
            marker, title = stripped.split(" ", 1)
            level_map = {"[[H1]]": 1, "[[H2]]": 2, "[[H3]]": 3}
            level = level_map[marker]
            title_text = clean_inline(title)
            if not title_text:
                continue
            anchor = make_slug(title_text, used_ids)
            toc.append((level, title_text, anchor))
            tag = f"h{level}"
            parts.append(f'<{tag} id="{anchor}">{html.escape(title_text)}</{tag}>')
            continue

        if stripped.startswith("[[ITEM]] "):
            flush_paragraph()
            if not list_mode:
                list_mode = "ul"
                list_items = []
            item_text = clean_inline(stripped[len("[[ITEM]] ") :])
            if item_text:
                list_items.append(item_text)
            continue

        if stripped.startswith("[[TABLE_ITEM]] "):
            flush_paragraph()
            flush_list()
            row = clean_inline(stripped[len("[[TABLE_ITEM]] ") :])
            if row:
                parts.append(f'<p class="table-item">{html.escape(row)}</p>')
            continue

        if stripped.startswith("[[TABLE_ROW]] "):
            flush_paragraph()
            flush_list()
            row = clean_inline(stripped[len("[[TABLE_ROW]] ") :], collapse_whitespace=False)
            if row:
                left, _, right = row.partition(" || ")
                left = clean_inline(left)
                right = clean_inline(right)
                parts.append(
                    "<div class=\"table-row\">"
                    f"<p class=\"table-key\">{html.escape(left)}</p>"
                    f"<p class=\"table-value\">{html.escape(right)}</p>"
                    "</div>"
                )
            continue

        if list_mode and list_items:
            continuation = clean_inline(stripped)
            if continuation:
                list_items[-1] = f"{list_items[-1]} {continuation}"
            continue

        paragraph_chunks.append(stripped)

    flush_paragraph()
    flush_list()

    if pre_mode and pre_lines:
        pre_text = "\n".join(pre_lines)
        parts.append(f"<pre>{html.escape(pre_text)}</pre>")

    while callout_depth > 0:
        parts.append("</aside>")
        callout_depth -= 1

    return "\n".join(parts), toc


def build_toc_html(toc: list[tuple[int, str, str]]) -> str:
    if not toc:
        return ""

    items = "\n".join(
        f'<li class="lv-{level}"><a href="#{anchor}">{html.escape(title)}</a></li>'
        for level, title, anchor in toc
    )
    return (
        '<nav class="doc-toc" aria-label="文档目录">\n'
        "  <h2>目录</h2>\n"
        f"  <ol>\n{items}\n  </ol>\n"
        "</nav>"
    )


def render_page(title: str, body_html: str, toc_html: str) -> str:
    return f"""<!doctype html>
<html lang=\"zh-CN\">
  <head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>{html.escape(title)} · 在线文稿</title>
    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\" />
    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin />
    <link href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap\" rel=\"stylesheet\" />
    <link rel=\"stylesheet\" href=\"../assets/reader.css\" />
  </head>
  <body>
    <a class=\"skip-link\" href=\"#docMain\">跳到正文</a>
    <a class=\"back-float\" href=\"../index.html\" target=\"_top\" rel=\"noopener\">返回学习站</a>
    <main class=\"reader-shell\" id=\"docMain\">
      <header class=\"doc-header\">
        <p class=\"kicker\">在线文稿</p>
        <h1>{html.escape(title)}</h1>
        <a class=\"back-link\" href=\"../index.html\" target=\"_top\" rel=\"noopener\">返回学习站</a>
      </header>
      {toc_html}
      <article class=\"doc-content\">
{body_html}
      </article>
    </main>
  </body>
</html>
"""


def build_one(spec: DocSpec) -> None:
    source_path = SRC_DIR / spec.source_name
    output_path = OUT_DIR / spec.output_name

    raw = read_tex(source_path)
    preprocessed = preprocess(raw, source_path)
    body_html, toc = parse_to_html(preprocessed)
    page_html = render_page(spec.title, body_html, build_toc_html(toc))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(page_html, encoding="utf-8")
    print(f"Wrote {output_path}")


def main() -> None:
    for spec in DOC_SPECS:
        build_one(spec)


if __name__ == "__main__":
    main()
