#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "output" / "src"
OUT = ROOT / "docs" / "assets" / "data.json"


@dataclass
class KnowledgeItem:
    id: str
    chapter: str
    title: str
    content: str
    tags: List[str]


@dataclass
class QuestionItem:
    id: str
    source: str
    qtype: str
    stem: str
    options: List[str]
    answer: str
    explanation: str
    tags: List[str]


def clean_tex(s: str) -> str:
    s = s.replace("\\n", "\n")
    s = s.replace("\\%", "%")
    s = s.replace("\\#", "#")
    s = s.replace("\\_", "_")
    s = re.sub(r"\\texttt\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\mystrong\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\textbf\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\chapter\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\\section\{([^{}]*)\}", r"\1", s)
    s = s.replace("$\\leq67$", "≤67")
    s = s.replace("$\\leq 67$", "≤67")
    s = s.replace("$>67$", ">67")
    s = s.replace("$\\Rightarrow$", "=>")
    s = re.sub(r"\\begin\{[^}]+\}", "", s)
    s = re.sub(r"\\end\{[^}]+\}", "", s)
    s = re.sub(r"\\item\s*", "- ", s)
    s = re.sub(r"\\par", "\n", s)
    s = re.sub(r"\\[a-zA-Z]+", "", s)
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def topic_tags(text: str) -> List[str]:
    mapping = [
        ("计费结算", ["计费", "67", "140", "返还", "账单", "分片"]),
        ("签名码号", ["签名", "子端口", "码号", "三网", "落地"]),
        ("回执状态", ["回执", "未知", "状态", "MO", "MT"]),
        ("风控合规", ["黑名单", "白名单", "关键词", "投诉", "频控", "退订"]),
        ("产品形态", ["富媒体", "阅信", "5G", "语音", "闪信", "USSD", "二进制"]),
        ("国际短信", ["国际", "Sender ID", "回填", "DND", "SMPP"]),
        ("接入交付", ["压测", "QPS", "上线", "自服务", "接口", "私有化"]),
    ]
    tags = [name for name, keys in mapping if any(k.lower() in text.lower() for k in keys)]
    return tags or ["综合"]


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "-", s).strip("-")
    return s[:64] if s else "item"


def extract_chapter_segment(tex: str, chapter_starts: Dict[str, int], key: str) -> str:
    order = sorted([(k, v) for k, v in chapter_starts.items() if v is not None], key=lambda x: x[1])
    pos = dict(order)
    start = pos[key]
    next_positions = [v for k, v in order if v > start]
    end = min(next_positions) if next_positions else len(tex)
    return tex[start:end]


def parse_choices(seg: str, source: str, multi: bool = False) -> List[QuestionItem]:
    pat = re.compile(
        r"\\textbf\{(\d+)\.\}\s*(.*?)\s*&\s*\\ansline\{([A-D]+)\}\\par\s*\\expline\{(.*?)\}\s*\\\\",
        re.S,
    )
    out = []
    for n, qraw, ans, exp in pat.findall(seg):
        qraw = qraw.strip()
        stem = qraw
        options = []
        # parse A/B/C/D
        m = re.search(r"(.*?)\\par\s*\\textbf\{A\.\}", qraw, re.S)
        if m:
            stem = m.group(1).strip()
            for label in ["A", "B", "C", "D"]:
                mm = re.search(
                    rf"\\textbf\{{{label}\.\}}\s*(.*?)(?=\\par\s*\\textbf\{{[A-D]\.\}}|$)",
                    qraw,
                    re.S,
                )
                options.append(clean_tex(mm.group(1)) if mm else "")
        out.append(
            QuestionItem(
                id=f"{source}-{n}",
                source=source,
                qtype="multiple" if multi else "single",
                stem=clean_tex(stem),
                options=options,
                answer=ans,
                explanation=clean_tex(exp),
                tags=topic_tags(stem + " " + exp),
            )
        )
    return out


def parse_judge(seg: str) -> List[QuestionItem]:
    pat = re.compile(r"\\textbf\{(\d+)\.\}\s*(.*?)\s*&\s*(.*?)\\\\", re.S)
    out = []
    for n, qraw, ans in pat.findall(seg):
        q = clean_tex(qraw)
        a = clean_tex(ans)
        if not q:
            continue
        out.append(
            QuestionItem(
                id=f"C-{n}",
                source="C卷",
                qtype="truefalse",
                stem=q,
                options=["对", "错"],
                answer="对" if a.startswith("对") else "错",
                explanation=a,
                tags=topic_tags(q + " " + a),
            )
        )
    return out


def parse_short(seg: str, source: str) -> List[QuestionItem]:
    pat = re.compile(r"\\textbf\{(\d+)\.\}\s*(.*?)\s*&\s*(.*?)\\\\", re.S)
    out = []
    seen = {}
    for n, qraw, ans in pat.findall(seg):
        q = clean_tex(qraw)
        a = clean_tex(ans)
        if not q:
            continue
        seen[n] = seen.get(n, 0) + 1
        suffix = f"-{seen[n]}" if seen[n] > 1 else ""
        out.append(
            QuestionItem(
                id=f"{source}-{n}{suffix}",
                source=source,
                qtype="short",
                stem=q,
                options=[],
                answer="",
                explanation=a,
                tags=topic_tags(q + " " + a),
            )
        )
    return out


def parse_flash(seg: str) -> List[QuestionItem]:
    pat = re.compile(r"\\textbf\{(\d+)\.\}\s*(.*?)\s*&\s*(.*?)\\\\", re.S)
    out = []
    for n, qraw, ans in pat.findall(seg):
        q = clean_tex(qraw)
        a = clean_tex(ans)
        if not q:
            continue
        out.append(
            QuestionItem(
                id=f"E-{n}",
                source="E卷",
                qtype="flash",
                stem=q,
                options=[],
                answer="",
                explanation=a,
                tags=topic_tags(q + " " + a),
            )
        )
    return out


def parse_knowledge(tex: str) -> List[KnowledgeItem]:
    chap_iter = list(re.finditer(r"\\chapter\{([^}]*)\}", tex))
    items: List[KnowledgeItem] = []
    for i, cm in enumerate(chap_iter):
        chap_title = clean_tex(cm.group(1))
        start = cm.end()
        end = chap_iter[i + 1].start() if i + 1 < len(chap_iter) else len(tex)
        chap_seg = tex[start:end]
        sec_iter = list(re.finditer(r"\\section\{([^}]*)\}", chap_seg))
        if not sec_iter:
            continue
        for j, sm in enumerate(sec_iter):
            sec_title = clean_tex(sm.group(1))
            s_start = sm.end()
            s_end = sec_iter[j + 1].start() if j + 1 < len(sec_iter) else len(chap_seg)
            s_seg = chap_seg[s_start:s_end]
            # strip tables and heavy latex blocks for readability
            s_seg = re.sub(r"\\begin\{longtable\}.*?\\end\{longtable\}", "", s_seg, flags=re.S)
            s_seg = re.sub(r"\\begin\{titlepage\}.*?\\end\{titlepage\}", "", s_seg, flags=re.S)
            content = clean_tex(s_seg)
            if len(content) < 20:
                continue
            kid = slugify(f"{chap_title}-{sec_title}")
            items.append(
                KnowledgeItem(
                    id=kid,
                    chapter=chap_title,
                    title=sec_title,
                    content=content,
                    tags=topic_tags(sec_title + " " + content),
                )
            )
    # Deduplicate by id
    uniq = {}
    for item in items:
        uniq[item.id] = item
    return list(uniq.values())


def main() -> None:
    practice_tex = (SRC / "practice_with_brain_science.tex").read_text(encoding="utf-8")
    knowledge_tex = (SRC / "knowledge_points_full.tex").read_text(encoding="utf-8")

    ch_starts = {k: (m.start() if (m := re.search(rf"\\chapter\{{{re.escape(k)}", practice_tex)) else None) for k in ["A卷", "B卷", "C卷", "D卷", "E卷", "F卷"]}

    segA = extract_chapter_segment(practice_tex, ch_starts, "A卷")
    segB = extract_chapter_segment(practice_tex, ch_starts, "B卷")
    segC = extract_chapter_segment(practice_tex, ch_starts, "C卷")
    segD = extract_chapter_segment(practice_tex, ch_starts, "D卷")
    segE = extract_chapter_segment(practice_tex, ch_starts, "E卷")
    segF = extract_chapter_segment(practice_tex, ch_starts, "F卷")

    questions: List[QuestionItem] = []
    questions += parse_choices(segA, "A卷", multi=False)
    questions += parse_choices(segB, "B卷", multi=True)
    questions += parse_judge(segC)
    questions += parse_short(segD, "D卷")
    questions += parse_flash(segE)
    questions += parse_choices(segF, "F卷", multi=False)

    knowledge = parse_knowledge(knowledge_tex)

    docs = [
        {
            "id": "doc-1",
            "title": "企业短信培训学习手册（专业文稿版）",
            "desc": "完整学习主线，适合系统阅读与阶段复习。",
            "web": "readers/doc-1.html",
            "pdf": "files/01-企业短信培训学习手册-专业文稿版.pdf",
        },
        {
            "id": "doc-3",
            "title": "题库（学习测评版）",
            "desc": "覆盖单选、多选、判断、场景、闪卡与扩展消息类型专题。",
            "web": "readers/doc-3.html",
            "pdf": "files/03-企业短信培训题库-学习测评版.pdf",
        },
    ]

    data = {
        "meta": {
            "title": "企业短信学习站",
            "version": "web-v1.0",
            "knowledge_count": len(knowledge),
            "question_count": len(questions),
        },
        "documents": docs,
        "knowledge": [asdict(k) for k in knowledge],
        "questions": [asdict(q) for q in questions],
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Knowledge: {len(knowledge)} | Questions: {len(questions)}")


if __name__ == "__main__":
    main()
