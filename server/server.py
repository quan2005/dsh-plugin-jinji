#!/usr/bin/env python3
"""谨迹书房：journal 的只读 LLM Wiki 阅读器。

只用标准库。只读文件，写入只有四处：内存里的「引用队列」（由 DSH 插件
取走并填进会话输入框）；用户在专家智库点「标为专家」时，
给对应 SKILL.md 的 frontmatter 加一行 metadata.kind: 专家，「改名」时改 metadata.name 一行；用户点「归档」时写归档记录
（默认 ~/.local/share/jinji-reader/<journal-id>/archive.json，不改原文件）；用户点「收藏」时写收藏记录
（同目录 favorites.json，不改原文件）。

    python3 server/server.py   # http://127.0.0.1:4417

配置取 JINJI_CONFIG，其次本地 wiki.config.json（不入库），最后是 wiki.config.example.json。
journal 位置取 JINJI_JOURNAL，其次配置的 journal 字段。
"""
from __future__ import annotations

import hashlib
import html
from datetime import date
import json
import mimetypes
import os
import re
import sys
import threading
import time
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
CONFIG_FILE = Path(os.environ.get("JINJI_CONFIG") or next(
    (p for p in (HERE / "wiki.config.json", HERE / "wiki.config.example.json") if p.is_file()), HERE / "wiki.config.json"))
CONFIG = json.loads(CONFIG_FILE.read_text("utf-8"))
JOURNAL = Path(os.path.expanduser(os.environ.get("JINJI_JOURNAL") or CONFIG.get("journal", "~/Documents/journal"))).resolve()
PORT = int(os.environ.get("JINJI_PORT", CONFIG.get("port", 4417)))
TEXT_EXT = {".md", ".markdown", ".txt", ".json", ".yml", ".yaml", ".csv", ".py", ".js", ".ts", ".sh"}
DOC_EXT = {".md", ".markdown", ".html", ".htm", ".txt", ".pdf", ".json", ".svg"}
mimetypes.add_type("text/markdown; charset=utf-8", ".md")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")


def expand(p: str) -> Path:
    return Path(os.path.expanduser(p.replace("{journal}", str(JOURNAL)))).resolve()


SKILL_ROOTS = [expand(p) for p in CONFIG.get("skill_roots", [])]
# 状态按 journal 隔离，默认写到阅读器数据目录，不在笔记库创建顶层目录。
STATE_ROOT = expand(os.environ.get("JINJI_STATE_DIR", "~/.local/share/jinji-reader"))
JOURNAL_KEY = hashlib.sha256(str(JOURNAL).encode("utf-8")).hexdigest()[:16]
ARCHIVE_FILE = expand(CONFIG["archive_file"]) if CONFIG.get("archive_file") else STATE_ROOT / JOURNAL_KEY / "archive.json"
FAVORITES_FILE = expand(CONFIG["favorites_file"]) if CONFIG.get("favorites_file") else STATE_ROOT / JOURNAL_KEY / "favorites.json"
ARCHIVABLE_KINDS = {"docs", "portrait", "timeline"}
EXTRA_ROOTS = [expand(p) for p in CONFIG.get("extra_roots", [])]


_roots_cache: dict = {"at": -1e9, "roots": []}


def allowed_roots() -> list[Path]:
    # resolve_id 每次都要用；扫描技能目录并解析符号链接很贵，短暂缓存即可感知新增技能。
    now = time.monotonic()
    if now - _roots_cache["at"] < 2:
        return _roots_cache["roots"]
    roots = [JOURNAL, *EXTRA_ROOTS]
    for r in SKILL_ROOTS:
        if r.exists():
            roots.append(r)
            # 技能目录常是指向别处的符号链接，把真实位置也纳入
            for child in r.iterdir():
                if child.is_dir():
                    roots.append(child.resolve())
    _roots_cache.update(at=now, roots=roots)
    return roots


def resolve_id(pid: str) -> Path | None:
    """路径 id：journal 内用相对路径，外部用绝对路径。越界一律拒绝。"""
    pid = unicodedata.normalize("NFC", pid.strip())
    if not pid:
        return None
    p = Path(os.path.expanduser(pid)) if pid.startswith(("/", "~/")) else JOURNAL / pid
    try:
        real = p.resolve()
    except OSError:
        return None
    for root in allowed_roots():
        if real == root or root in real.parents:
            return real
    return None


def to_id(p: Path) -> str:
    """把真实路径转成 id；journal 内的符号链接保留 journal 内的写法。"""
    try:
        return str(p.relative_to(JOURNAL))
    except ValueError:
        return str(p)


# ---------------------------------------------------------------- frontmatter

FM_RE = re.compile(r"^﻿?---\s*\n(.*?)\n---\s*(?:\n|$)", re.S)


def scalar(v: str):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        inner = v[1:-1].strip()
        if not inner:
            return []
        return [scalar(x) for x in re.findall(r'"[^"]*"|\'[^\']*\'|[^,]+', inner)]
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if v in ("true", "false"):
        return v == "true"
    if v in ("null", "~", ""):
        return None
    return v


def parse_frontmatter(text: str) -> tuple[dict, str]:
    m = FM_RE.match(text)
    if not m:
        return {}, text
    data: dict = {}
    lines = m.group(1).split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        km = re.match(r"^([A-Za-z_][\w\-]*)\s*:\s*(.*)$", line)
        if not km:
            i += 1
            continue
        key, rest = km.group(1), km.group(2)
        if rest.strip() in ("|", ">", "|-", ">-"):
            block = []
            i += 1
            while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
                block.append(lines[i].strip())
                i += 1
            joiner = "\n" if rest.strip().startswith("|") else " "
            data[key] = joiner.join(block).strip()
            continue
        if rest.strip() == "":
            items, nested = [], {}
            i += 1
            while i < len(lines) and (lines[i].startswith((" ", "\t", "- ")) or not lines[i].strip()):
                s = lines[i].strip()
                if s.startswith("- "):
                    items.append(scalar(s[2:]))
                elif ":" in s:
                    k2, v2 = s.split(":", 1)
                    nested[k2.strip()] = scalar(v2)
                i += 1
            data[key] = items if items else (nested or None)
            continue
        data[key] = scalar(rest)
        i += 1
    return data, text[m.end():]


def as_list(v) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if x is not None]
    return [x.strip() for x in str(v).split(",") if x.strip()]


# ---------------------------------------------------------------- file meta

_meta_cache: dict[str, tuple[float, dict]] = {}


def read_head(p: Path, n: int = 16384) -> str:
    try:
        with open(p, "rb") as f:
            return f.read(n).decode("utf-8", "ignore")
    except OSError:
        return ""


def strip_md(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"[*_`>#|]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def first_paragraph(body: str) -> str:
    for block in re.split(r"\n\s*\n", body):
        b = block.strip()
        if not b or b.startswith(("#", "|", "```", "<a id", "---", "![", "<picture", "<img")):
            continue
        t = strip_md(b)
        if len(t) > 12:
            return t[:180]
    return ""


def file_meta(p: Path) -> dict:
    try:
        st = p.stat()
    except OSError:
        return {}
    key = str(p)
    hit = _meta_cache.get(key)
    if hit and hit[0] == st.st_mtime:
        return hit[1]
    ext = p.suffix.lower()
    fm: dict = {}
    title, summary = "", ""
    if ext in (".md", ".markdown"):
        head = read_head(p)
        fm, body = parse_frontmatter(head)
        h1 = re.search(r"^#\s+(.+)$", body, re.M)
        title = str(fm.get("title") or (h1.group(1).strip() if h1 else ""))
        summary = str(fm.get("summary") or fm.get("description") or first_paragraph(body))
    elif ext in (".html", ".htm"):
        head = read_head(p, 65536)
        t = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", head, re.S | re.I)
        title = html.unescape(re.sub(r"<[^>]+>", "", (t or h1).group(1))).strip() if (t or h1) else ""
        d = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', head, re.I)
        summary = html.unescape(d.group(1)) if d else ""
    meta = {
        "path": to_id(p),
        "name": p.name,
        "ext": ext.lstrip("."),
        "title": strip_md(title) or p.stem,
        "summary": summary[:220],
        "type": str(fm.get("type") or ""),
        "tags": as_list(fm.get("tags")),
        "mtime": st.st_mtime,
        "size": st.st_size,
        "fm": {k: v for k, v in fm.items() if isinstance(v, (str, int, float, bool, list)) and k not in ("summary", "description")},
    }
    _meta_cache[key] = (st.st_mtime, meta)
    return meta


def glob_rel(pattern: str) -> list[Path]:
    out = []
    for p in JOURNAL.glob(pattern):
        if p.is_file() and not p.name.startswith(".") and resolve_id(str(p)):
            out.append(p)
    return out


def source_links(fm: dict, doc: Path) -> list[dict]:
    """sources 为根相对路径；显式 ./、../ 按文档目录解析，不猜旧路径。"""
    sources = fm.get("sources", [])
    values = sources if isinstance(sources, list) else [sources]
    if fm.get("source"):
        values = [*values, fm["source"]]
    out, seen = [], set()
    for value in values:
        if not isinstance(value, str) or not value.strip() or value in seen:
            continue
        seen.add(value)
        label = value.strip()
        item = {"label": label}
        if re.match(r"^https?://", label):
            item["url"] = label
        else:
            pid, _, anchor = label.partition("#")
            if re.match(r"^(?:\d{4}/|identity/|\.agents/|\.{1,2}/|/|~/)", pid):
                target = str(doc.parent / pid) if pid.startswith(("./", "../")) else pid
                resolved = resolve_id(target)
                item.update(path=to_id(resolved) if resolved else pid, anchor=anchor,
                            available=bool(resolved and resolved.exists()))
        out.append(item)
    return out


# ---------------------------------------------------------------- categories

MONTH_RE = re.compile(r"^\d{2}(?:0[1-9]|1[0-2])$")
DAY_RE = re.compile(r"^(\d{2})-(.+)$")
SKIP_DIRS = {"raw", "node_modules", "__pycache__", "venv", "dist", "build"}
JOURNAL_KINDS = {"meeting": "会议", "report": "汇报", "project": "项目", "research": "研究",
                 "learning": "学习", "personal": "个人", "technical": "技术", "content": "内容", "hr": "人事"}


def entry_date(month: str, name: str) -> str | None:
    match = DAY_RE.match(name)
    if not MONTH_RE.fullmatch(month) or not match:
        return None
    try:
        return date(2000 + int(month[:2]), int(month[2:]), int(match[1])).isoformat()
    except ValueError:
        return None


def month_dirs():
    if JOURNAL.is_dir():
        yield from sorted((p for p in JOURNAL.iterdir() if p.is_dir() and not p.is_symlink()
                           and MONTH_RE.fullmatch(p.name)), reverse=True)


def artifact_packages():
    for month in month_dirs():
        for p in sorted(month.iterdir()):
            if p.is_dir() and not p.is_symlink() and entry_date(month.name, p.name):
                yield p


def walk_files(root: Path):
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in SKIP_DIRS
                         and not (Path(dirpath) / d).is_symlink())
        for name in sorted(files):
            if name.startswith("."):
                continue
            p = Path(dirpath) / name
            # 目录已排除符号链接；普通文件必在 journal 内，只有符号链接文件需要越界检查。
            if not p.is_symlink() or resolve_id(str(p)):
                yield p


def build_docs(cat: dict) -> list[dict]:
    seen, items = set(), []
    candidates = []
    for pat in cat.get("include", []):
        base = JOURNAL / re.split(r"[\[*?]", pat, maxsplit=1)[0].rstrip("/")
        candidates.extend((p, base) for p in glob_rel(pat))
    for p, base in candidates:
        if p.suffix.lower() not in DOC_EXT or p in seen:
            continue
        seen.add(p)
        m = dict(file_meta(p))
        if not m:
            continue
        try:
            group = str(p.parent.relative_to(base))
        except ValueError:
            group = str(p.parent.relative_to(JOURNAL))
        m["group"] = "" if group == "." else group
        items.append(m)
    items.sort(key=lambda x: (x["group"], x["name"]))
    return items


def build_portraits(cat: dict) -> list[dict]:
    items = []
    for pat in cat.get("include", []):
        for p in glob_rel(pat):
            m = dict(file_meta(p))
            # identity/README.md 是本人画像（type: person + tags: self）；没写 type 的 README 才是说明页
            if p.stem.upper() == "README" and not m.get("type"):
                continue
            # 画像类型：显式 type 优先；未写 type 时 product- 前缀算产品，其余算人物
            kind = m.get("type") or ("product" if p.stem.startswith("product-") else "person")
            if kind != cat.get("type"):
                continue
            stem = p.stem
            if cat["type"] == "product":
                m["display"] = stem.removeprefix("product-")
                m["group"] = ""
            else:
                org, _, person = stem.partition("-")
                m["display"] = person or stem
                m["group"] = org if person else "其他"
                if "self" in m["tags"]:
                    m["group"] = "我"
                    m["display"] = re.sub(r"[（(].*", "", m["title"]).strip() or m["display"]
            items.append(m)
    order = {"我": 0}
    items.sort(key=lambda x: (order.get(x["group"], 1), x["group"], x["display"]))
    return items


def journal_variants(p: Path, candidates=None) -> dict:
    """同月同名的 Markdown/HTML 共用一个日志条目；不配对 raw 或成品包中的文件。"""
    if p.parent.parent != JOURNAL or not entry_date(p.parent.name, p.stem):
        return {}
    if p.suffix.lower() not in {".md", ".markdown", ".html", ".htm"}:
        return {}
    candidates = sorted(p.parent.iterdir()) if candidates is None else candidates
    siblings = {x.suffix.lower(): x for x in candidates
                if x.stem == p.stem and x.is_file() and not x.is_symlink()}
    md = siblings.get(".md") or siblings.get(".markdown")
    html_file = siblings.get(".html") or siblings.get(".htm")
    return {"markdown": to_id(md), "html": to_id(html_file)} if md and html_file else {}


def build_timeline(cat: dict) -> list[dict]:
    items = []
    for month in month_dirs():
        candidates = sorted(month.iterdir())
        for p in candidates:
            recorded = entry_date(month.name, p.stem)
            if not p.is_file() or p.is_symlink() or p.suffix.lower() not in {".md", ".markdown", ".html", ".htm"} or not recorded:
                continue
            variants = journal_variants(p, candidates)
            if variants and to_id(p) != variants["markdown"]:
                continue
            m = dict(file_meta(p))
            if not m:
                continue
            if variants:
                m["variants"] = variants
            m["date"], m["month"] = recorded, recorded[:7]
            # DD 后面的文字都是标题，不把新式 DD-title 中的短词误当类型。
            m["kind"] = next((JOURNAL_KINDS[t] for t in m["tags"] if t in JOURNAL_KINDS), "")
            if m["title"] == p.stem:
                m["title"] = DAY_RE.match(p.stem)[2]
            items.append(m)
    items.sort(key=lambda x: (x["date"], x["mtime"], x["path"]), reverse=True)
    return items


def book_cards():
    # 书卡可以是任一日志（yyMM/DD-title.md），也可以放在成品目录里；
    # 只按 type: book 汇总，不扫描 raw、隐藏目录、依赖或整个工作区。
    for month in month_dirs():
        for p in sorted(month.iterdir()):
            if (p.is_file() and not p.is_symlink() and p.suffix.lower() in {".md", ".markdown"}
                    and entry_date(month.name, p.stem)):
                yield p
    for package in artifact_packages():
        for p in walk_files(package):
            if p.suffix.lower() in {".md", ".markdown"}:
                yield p


def build_books() -> list[dict]:
    books = []
    for p in book_cards():
        m = dict(file_meta(p))
        if m.get("type") != "book":
            continue
        fm = m["fm"]
        card_dir = p.parent

        def rel_to_card(v, card_dir=card_dir):
            if not v:
                return ""
            v = str(v)
            if v.startswith(("http://", "https://")):
                return v
            target = Path(os.path.expanduser(v)) if v.startswith(("/", "~")) else (card_dir / v)
            r = resolve_id(str(target))
            return to_id(r) if r and r.exists() else ""

        entry = rel_to_card(fm.get("book_source"))
        cover = rel_to_card(fm.get("book_cover"))
        package = rel_to_card(fm.get("book_package"))
        if not package and entry and not entry.startswith("http"):
            # 同名 HTML 与书卡同级时，书包是同名目录，而不是整个月份目录。
            sibling = card_dir / p.stem
            if (card_dir / Path(entry).name).resolve() == resolve_id(entry):
                package = to_id(sibling) if sibling.is_dir() else ""
            else:
                package = str(Path(entry).parent)
        m.update({
            "author": str(fm.get("book_author") or ""),
            "category": str(fm.get("book_category") or "未分类"),
            "format": str(fm.get("book_format") or "unknown"),
            "status": str(fm.get("reading_status") or "unknown"),
            "entry": entry,
            "entry_raw": str(fm.get("book_source") or ""),
            "cover": cover,
            "text": rel_to_card(fm.get("book_text")),
            "package": package,
            # 未写 book_tags 时，用日志 tags 去掉通用标签。
            "book_tags": as_list(fm.get("book_tags")) or [t for t in m["tags"] if t not in {"journal", "book"}],
        })
        books.append(m)
    books.sort(key=lambda b: (b["category"], b["title"]))
    return books


def list_tree(root: Path, limit: int = 400) -> list[dict]:
    out = []
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "__pycache__")
        for f in sorted(files):
            if f.startswith("."):
                continue
            fp = Path(dirpath) / f
            try:
                size = fp.stat().st_size
            except OSError:
                continue
            out.append({"path": to_id(fp), "rel": str(fp.relative_to(root)), "size": size, "ext": fp.suffix.lower().lstrip(".")})
            if len(out) >= limit:
                return out
    return out


def build_skills() -> list[dict]:
    seen, skills = set(), []
    for root in SKILL_ROOTS:
        if not root.exists():
            continue
        for d in sorted(root.iterdir()):
            sk = d / "SKILL.md"
            if not sk.is_file():
                continue
            real = sk.resolve()
            if real in seen or d.name in seen:
                continue
            seen.update((real, d.name))
            fm, body = parse_frontmatter(read_head(real, 20000))
            skills.append({
                "id": d.name,
                "name": str(fm.get("name") or d.name),
                "description": strip_md(str(fm.get("description") or first_paragraph(body)))[:600],
                "path": to_id(real),
                "dir": to_id(real.parent),
                "root": str(root).replace(str(Path.home()), "~"),
                "writable": JOURNAL not in real.parents,
                "invocable": fm.get("user-invocable") is not False,
                "meta": fm.get("metadata") if isinstance(fm.get("metadata"), dict) else {},
                "files": sum(1 for _ in real.parent.rglob("*") if _.is_file()),
                "mtime": real.stat().st_mtime,
            })
    return skills


EXPERT_TYPE_ORDER = ["人物", "组织框架", "主题顾问", "学者委员会"]


def build_experts(skills: list[dict]) -> dict:
    """专家只认全局技能 metadata.kind 为「专家」；其余全局技能单列为「其他技能」，不计入专家。"""
    experts, others = [], []
    for s in skills:
        meta = s.get("meta") or {}
        if meta.get("kind") != "专家":
            others.append({k: s[k] for k in ("id", "name", "description", "path", "dir", "root", "writable", "invocable", "files", "mtime")})
            continue
        experts.append({
            "id": s["id"],
            "name": str(meta.get("name") or s["name"]),
            "type": str(meta.get("type") or ""),
            "alias": str(meta.get("alias") or ""),
            "familiarity": str(meta.get("familiarity") or "候选"),
            "domains": as_list(meta.get("domains")),
            "triggers": as_list(meta.get("triggers")),
            "skill_info": s,
        })
    rank = {t: i for i, t in enumerate(EXPERT_TYPE_ORDER)}
    experts.sort(key=lambda e: (rank.get(e["type"], len(rank)), e["name"]))
    others.sort(key=lambda s: s["id"])
    return {"experts": experts, "skills": others}


class MarkError(Exception):
    pass


def _skill_md(skill_id: str) -> tuple[dict, Path]:
    sk = next((s for s in build_skills() if s["id"] == skill_id), None)
    if not sk:
        raise MarkError(f"skill 目录里没有 {skill_id}")
    path = resolve_id(sk["path"])
    if path is None:
        raise MarkError("skill 路径不允许访问")
    return sk, path


def _edit_frontmatter(path: Path, edit) -> None:
    """按行改 SKILL.md frontmatter：edit(lines, end) 原地改 lines；其余字节（含换行风格）不动，原子替换。"""
    if path.resolve() == JOURNAL or JOURNAL in path.resolve().parents:
        raise MarkError("journal 内的技能只读，请在笔记库维护流程中修改")
    text = path.read_bytes().decode("utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    if not lines or lines[0].lstrip("\ufeff").strip() != "---":
        raise MarkError("SKILL.md 没有 frontmatter")
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        raise MarkError("SKILL.md 的 frontmatter 没有结束行")
    edit(lines, end)
    tmp = path.with_name(f".{path.name}.jinji-tmp")
    tmp.write_bytes(nl.join(lines).encode("utf-8"))
    os.chmod(tmp, path.stat().st_mode & 0o7777)
    os.replace(tmp, path)
    with _index_lock:
        _index["data"] = None


def _meta_block(lines: list[str], end: int):
    """返回 (metadata 行号, 子行缩进)；没有 metadata 时行号为 None。单行写法拒绝。"""
    meta_i = next((i for i in range(1, end) if re.match(r"^metadata\s*:", lines[i])), None)
    if meta_i is None:
        return None, "  "
    if lines[meta_i].split(":", 1)[1].strip():
        raise MarkError("metadata 是单行写法，书房不自动改，请手动编辑 SKILL.md")
    child = next((line for line in lines[meta_i + 1:end] if line.strip()), "")
    m = re.match(r"^[ \t]+", child)
    return meta_i, (m.group(0) if m else "  ")


def mark_expert(skill_id: str) -> str:
    """在工具技能的 SKILL.md frontmatter 里写入 metadata.kind: 专家。只加这一行，其余字节不动。"""
    sk, path = _skill_md(skill_id)
    if str((sk.get("meta") or {}).get("kind") or "").strip() == "专家":
        raise MarkError(f"{skill_id} 已经是专家")

    def edit(lines, end):
        meta_i, indent = _meta_block(lines, end)
        if meta_i is None:
            lines[end:end] = ["metadata:", "  kind: 专家"]
            return
        if any(re.match(rf"^{re.escape(indent)}kind\s*:", line) for line in lines[meta_i + 1:end]):
            raise MarkError("metadata 里已有其他 kind 值，请手动处理")
        lines.insert(meta_i + 1, f"{indent}kind: 专家")

    _edit_frontmatter(path, edit)
    return to_id(path)


NAME_RE = re.compile(r'^[^"\\\x00-\x1f\x7f]{1,40}$')


def rename_expert(skill_id: str, name: str) -> str:
    """改专家显示名：只写 metadata.name 这一行（不改 skill 的 name，它是调用名）。"""
    name = unicodedata.normalize("NFC", name).strip()
    if not NAME_RE.match(name):
        raise MarkError("名字 1–40 个字，不能含引号、反斜杠或换行")
    sk, path = _skill_md(skill_id)
    if str((sk.get("meta") or {}).get("kind") or "").strip() != "专家":
        raise MarkError(f"{skill_id} 不是专家，不能改名")
    line_val = json.dumps(name, ensure_ascii=False)

    def edit(lines, end):
        meta_i, indent = _meta_block(lines, end)
        pat = re.compile(rf"^{re.escape(indent)}name\s*:")
        for i in range(meta_i + 1, end):
            if pat.match(lines[i]):
                lines[i] = f"{indent}name: {line_val}"
                return
        kind_i = next(i for i in range(meta_i + 1, end) if re.match(rf"^{re.escape(indent)}kind\s*:", lines[i]))
        lines.insert(kind_i + 1, f"{indent}name: {line_val}")

    _edit_frontmatter(path, edit)
    return name


# ---------------------------------------------------------------- index cache

_index_lock = threading.Lock()
_index: dict = {"at": 0.0, "data": None}


# ---------------------------------------------------------------- archive
# 归档状态存于阅读器数据目录，不写 journal；HTML 也没有 frontmatter。
# {路径: true/false}，
# false 用来覆盖画像 frontmatter 里已有的 archived: true。

_archive_lock = threading.Lock()


def load_archive() -> dict:
    try:
        data = json.loads(ARCHIVE_FILE.read_text("utf-8"))
        items = data.get("items", {}) if isinstance(data, dict) else {}
        return {str(k): v for k, v in items.items() if isinstance(v, bool)}
    except (OSError, json.JSONDecodeError):
        return {}


def archive_state(item: dict, archive: dict) -> bool:
    if item["path"] in archive:
        return archive[item["path"]]
    return item.get("fm_archived") is True


def set_archived(pid: str, archived: bool) -> dict:
    resolved = resolve_id(pid)
    if resolved:
        pid = journal_variants(resolved).get("markdown", pid)
    if ARCHIVE_FILE.resolve() == JOURNAL or JOURNAL in ARCHIVE_FILE.resolve().parents:
        raise MarkError("归档状态必须保存在 journal 之外，请修改 archive_file 配置")
    # 用缓存索引定位条目；只有缓存里找不到（例如刚新建的文件）才重建。
    def find(idx):
        for cat in idx["categories"]:
            if cat["kind"] in ARCHIVABLE_KINDS:
                hit = next((x for x in idx["items"][cat["id"]] if x["path"] == pid), None)
                if hit:
                    return hit
        return None
    hit = find(get_index()) or find(get_index(force=True))
    if not hit:
        raise MarkError("只能归档文档、画像和日志里的条目")
    with _archive_lock:
        archive = load_archive()
        fm_archived = hit.get("fm_archived") is True
        if archived == fm_archived:
            archive.pop(pid, None)  # 与 frontmatter 一致时不必记
        else:
            archive[pid] = archived
        ARCHIVE_FILE.parent.mkdir(parents=True, exist_ok=True)
        body = {"note": "谨迹书房的归档记录：书房里点「归档」写入这里，不改原文件。true=归档，false=取消 frontmatter 里的 archived。",
                "updated": time.strftime("%Y-%m-%d %H:%M:%S"), "items": dict(sorted(archive.items()))}
        tmp = ARCHIVE_FILE.with_name(f".{ARCHIVE_FILE.name}.tmp")
        tmp.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", "utf-8")
        os.replace(tmp, ARCHIVE_FILE)
    # 不重扫磁盘：只在缓存索引上重放归档状态，并换新版本号。
    with _index_lock:
        if _index["data"]:
            _index["data"] = finish_index(_index["data"], archive, load_favorites())
    return {"path": pid, "archived": archived, "version": _index["data"]["version"] if _index["data"] else ""}


# ---------------------------------------------------------------- favorites
# 收藏与归档相互独立：任何能在书房打开的文件都可收藏（日志、画像、书卡、专家、技能及其文件）。
# 记录存于阅读器数据目录：{路径: {"at": 收藏时间, "title": 收藏时的标题}}，不写 journal。

_favorite_lock = threading.Lock()


def load_favorites() -> dict:
    try:
        data = json.loads(FAVORITES_FILE.read_text("utf-8"))
        items = data.get("items", {}) if isinstance(data, dict) else {}
        return {str(k): {"at": float(v.get("at") or 0), "title": str(v.get("title") or "")}
                for k, v in items.items() if isinstance(v, dict)}
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return {}


def favorite_rows(favorites: dict, items: dict, experts: dict) -> list[dict]:
    """收藏按时间倒序；能在索引中找到的条目带上入口和当前标题，找不到的检查文件是否还在。"""
    where: dict = {}
    for cid, lst in items.items():
        for x in lst:
            where.setdefault(x["path"], (cid, x.get("display") or x["title"]))
    for e in experts.get("experts", []):
        where.setdefault(e["skill_info"]["path"], ("experts", e["name"]))
    for k in experts.get("skills", []):
        where.setdefault(k["path"], ("experts", k["id"]))
    rows = []
    for path, v in favorites.items():
        cid, title = where.get(path, (None, None))
        row = {"path": path, "at": v["at"], "title": title or v["title"] or Path(path).name, "cat": cid}
        if cid is None:
            p = resolve_id(path)
            row["missing"] = not (p and p.is_file())
        rows.append(row)
    rows.sort(key=lambda r: (-r["at"], r["path"]))
    return rows


def set_favorite(pid: str, favorite: bool) -> dict:
    pid = unicodedata.normalize("NFC", pid.strip())
    if not pid:
        raise MarkError("缺少要收藏的路径")
    if FAVORITES_FILE.resolve() == JOURNAL or JOURNAL in FAVORITES_FILE.resolve().parents:
        raise MarkError("收藏记录必须保存在 journal 之外，请修改 favorites_file 配置")
    resolved = resolve_id(pid)
    if resolved and resolved.is_file():
        # 同名 HTML 与 Markdown 是同一篇日志，收藏记在 Markdown 上。
        pid = journal_variants(resolved).get("markdown") or to_id(resolved)
    elif favorite:
        raise MarkError("只能收藏书房里能打开的文件")
    with _favorite_lock:
        favorites = load_favorites()
        if favorite:
            if pid not in favorites:
                title = ""
                idx = _index["data"]
                if idx:
                    title = next((r["title"] for r in favorite_rows({pid: {"at": 0, "title": ""}}, idx["items"], idx["experts"])), "")
                favorites[pid] = {"at": time.time(), "title": title or file_meta(resolved).get("title") or resolved.name}
        else:
            favorites.pop(pid, None)
        FAVORITES_FILE.parent.mkdir(parents=True, exist_ok=True)
        body = {"note": "谨迹书房的收藏记录：书房里点「收藏」写入这里，不改原文件。at=收藏时间（Unix 秒），title=收藏时的标题。",
                "updated": time.strftime("%Y-%m-%d %H:%M:%S"),
                "items": dict(sorted(favorites.items(), key=lambda kv: -kv[1]["at"]))}
        tmp = FAVORITES_FILE.with_name(f".{FAVORITES_FILE.name}.tmp")
        tmp.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", "utf-8")
        os.replace(tmp, FAVORITES_FILE)
    # 与归档一样：只在缓存索引上重放，不重扫磁盘。
    with _index_lock:
        if _index["data"]:
            _index["data"] = finish_index(_index["data"], load_archive(), favorites)
        idx = _index["data"]
    return {"path": pid, "favorite": favorite, "version": idx["version"] if idx else "",
            "favorites": idx["favorites"] if idx else favorite_rows(favorites, {}, {})}


def finish_index(idx: dict, archive: dict, favorites: dict) -> dict:
    """把归档与收藏状态叠加到索引上，重算计数、最近更新、收藏列表和版本号；不读条目文件。"""
    items = {}
    kinds = {c["id"]: c["kind"] for c in idx["categories"]}
    for cid, lst in idx["items"].items():
        if kinds[cid] in ARCHIVABLE_KINDS:
            lst = [x | {"archived": archive_state(x, archive)} for x in lst]
        items[cid] = lst
    cats = []
    for c in idx["categories"]:
        lst = items[c["id"]]
        active = sum(1 for x in lst if not x.get("archived"))
        cats.append(c | {"count": len(idx["experts"]["experts"]) if c["kind"] == "experts" else active,
                         "archived": len(lst) - active})
    recent_by_path = {}
    for cid, lst in items.items():
        for x in lst:
            if not x.get("archived"):
                recent_by_path.setdefault(x["path"], {"path": x["path"], "title": x["title"], "cat": cid, "mtime": x["mtime"]})
    out = idx | {"categories": cats, "items": items,
                 "recent": sorted(recent_by_path.values(), key=lambda x: -x["mtime"])[:24],
                 "favorites": favorite_rows(favorites, items, idx["experts"])}
    out.pop("version", None)
    digest = hashlib.sha1(json.dumps(out | {"built_ms": 0, "generated": 0}, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    out["version"] = digest.hexdigest()[:16]
    return out


def build_index() -> dict:
    t0 = time.time()
    cats, items = [], {}
    books = build_books()
    skills = build_skills()
    experts = build_experts(skills)
    timeline = build_timeline({})

    def slim(x: dict) -> dict:
        # 列表不需要完整 frontmatter：只保留归档判定所需的标记，响应体积减半以上。
        out = {k: v for k, v in x.items() if k != "fm"}
        out["fm_archived"] = (x.get("fm") or {}).get("archived") is True
        return out

    for cat in CONFIG["categories"]:
        kind = cat["kind"]
        if kind == "portrait":
            lst = build_portraits(cat)
        elif kind == "timeline":
            required_tags = set(cat.get("tags", []))
            lst = [x for x in timeline if required_tags <= set(x["tags"])]
        elif kind == "shelf":
            lst = books
        elif kind == "experts":
            lst = []  # 专家仅由全局 SKILL.md 元数据生成，不扫描 journal 专题目录。
        else:
            lst = build_docs(cat)
        if kind in ARCHIVABLE_KINDS:
            lst = [slim(x) for x in lst]
        items[cat["id"]] = lst
        cats.append({k: cat.get(k) for k in ("id", "name", "glyph", "kind", "tagline", "tags", "featured") if k not in ("tags", "featured") or cat.get(k)})
    return finish_index({
        "journal": str(JOURNAL),
        "schema": "journal-monthly-v2",
        "categories": cats,
        "items": items,
        "experts": experts,
        "built_ms": int((time.time() - t0) * 1000),
        "generated": time.time(),
    }, load_archive(), load_favorites())


def get_index(force: bool = False) -> dict:
    with _index_lock:
        if force or not _index["data"] or time.time() - _index["at"] > 5:
            _index["data"] = build_index()
            _index["at"] = time.time()
        return _index["data"]


# ---------------------------------------------------------------- search

def search(q: str, limit: int = 60) -> list[dict]:
    q = q.strip().lower()
    if not q:
        return []
    terms = [t for t in q.split() if t]
    idx = get_index()
    pool: list[tuple[str, dict]] = []
    for cid, lst in idx["items"].items():
        for x in lst:
            pool.append((cid, x))
            paired_html = x.get("variants", {}).get("html")
            if paired_html:
                pool.append((cid, {"path": paired_html, "title": x["title"], "ext": "html", "canonical": x["path"]}))
    for e in idx["experts"]["experts"]:
        if e.get("skill_info"):
            pool.append(("experts", {"path": e["skill_info"]["path"], "title": e.get("name", ""), "ext": "md"}))
    for k in idx["experts"].get("skills", []):
        pool.append(("experts", {"path": k["path"], "title": k["id"], "ext": "md"}))
    for b in idx["items"].get("shelf", []):
        body = b.get("text") or b.get("entry")
        if body and not body.startswith("http"):
            pool.append(("shelf", {"path": body, "title": f"{b['title']} · 正文", "ext": Path(body).suffix.lstrip(".").lower()}))
    seen, out = set(), []
    for cid, x in pool:
        if x["path"] in seen or x.get("ext") not in ("md", "markdown", "html", "htm", "txt"):
            continue
        seen.add(x["path"])
        p = resolve_id(x["path"])
        if not p:
            continue
        try:
            if p.stat().st_size > 6_000_000:
                continue
            text = p.read_text("utf-8", "ignore")
        except OSError:
            continue
        if x["ext"] in ("html", "htm"):
            text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
            text = html.unescape(re.sub(r"<[^>]+>", " ", text))
        low = text.lower()
        if not all(t in low for t in terms):
            continue
        pos = low.find(terms[0])
        s = max(0, pos - 50)
        snippet = re.sub(r"\s+", " ", text[s:pos + 110]).strip()
        score = low.count(terms[0]) + (20 if terms[0] in x.get("title", "").lower() else 0)
        out.append({"path": x.get("canonical", x["path"]), "title": x.get("title") or Path(x["path"]).name, "cat": cid,
                    "snippet": snippet, "score": score})
    out.sort(key=lambda r: -r["score"])
    unique = {}
    for result in out:
        unique.setdefault(result["path"], result)
    return list(unique.values())[:limit]


# ---------------------------------------------------------------- cite bridge

_cite_lock = threading.Lock()
_cite_queue: list[dict] = []
_bridge = {"last_poll": 0.0}


def bridge_alive() -> bool:
    return time.time() - _bridge["last_poll"] < 3


# ---------------------------------------------------------------- http

THEME_TAG = b'<script src="/static/frame-theme.js"></script>'
HEAD_RE = re.compile(rb"<head(?:\s[^>]*)?>|<html(?:\s[^>]*)?>|<!doctype[^>]*>", re.I)


def inject_theme(data: bytes) -> bytes:
    """在 HTML 响应开头插入主题跟随脚本；磁盘文件不变。插在 doctype 之后，不触发怪异模式。"""
    head = data[:8192]
    best = None
    for m in HEAD_RE.finditer(head):
        tag = m.group(0)[:5].lower()
        rank = 0 if tag == b"<head" else 1 if tag == b"<html" else 2
        if best is None or rank < best[0]:
            best = (rank, m.end())
    at = best[1] if best else (3 if data.startswith(b"\xef\xbb\xbf") else 0)
    return data[:at] + THEME_TAG + data[at:]


class Handler(BaseHTTPRequestHandler):
    server_version = "JinjiReader/1.0"

    def log_message(self, fmt, *args):  # 安静
        if os.environ.get("JINJI_DEBUG"):
            sys.stderr.write("%s\n" % (fmt % args))

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, p: Path, cache=False, theme=False):
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") and "charset" not in ctype:
            ctype += "; charset=utf-8"
        try:
            data = p.read_bytes()
        except OSError:
            return self.send_json({"error": "unreadable"}, 404)
        if theme and p.suffix.lower() in (".html", ".htm"):
            data = inject_theme(data)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "max-age=60" if cache else "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        path = unquote(u.path)
        qs = {k: v[0] for k, v in parse_qs(u.query).items()}
        if path in ("/", "/index.html"):
            return self.send_file(HERE / "static" / "index.html")
        if path.startswith("/static/"):
            p = (HERE / "static" / path[len("/static/"):]).resolve()
            if HERE / "static" in p.parents and p.is_file():
                return self.send_file(p)
            return self.send_json({"error": "not found"}, 404)
        if path.startswith("/raw/"):
            # /raw/<id>：journal 内相对路径，或 /raw//Users/... 绝对路径
            p = resolve_id(path[len("/raw/"):])
            if p and p.is_dir():
                idx = p / "index.html"
                p = idx if idx.is_file() else None
            if not p or not p.is_file():
                return self.send_json({"error": "not found or not allowed"}, 404)
            return self.send_file(p, theme=True)
        if path == "/api/ping":
            return self.send_json({"ok": True, "app": "jinji-reader", "journal": str(JOURNAL), "port": PORT,
                                   "bridge": bridge_alive()})
        if path == "/api/index":
            idx = get_index(force=qs.get("refresh") == "1")
            # 轮询时客户端带上已有版本；没有变化只回一行，不重传整个索引。
            if qs.get("since") and qs["since"] == idx["version"]:
                return self.send_json({"unchanged": True, "version": idx["version"], "built_ms": idx["built_ms"]})
            return self.send_json(idx)
        if path == "/api/doc":
            return self.api_doc(qs.get("path", ""))
        if path == "/api/stat":
            p = resolve_id(qs.get("path", ""))
            if not p or not p.exists():
                return self.send_json({"error": "not found"}, 404)
            return self.send_json({"mtime": p.stat().st_mtime, "bridge": bridge_alive()})
        if path == "/api/search":
            return self.send_json({"results": search(qs.get("q", ""))})
        if path == "/api/cite/pull":
            _bridge["last_poll"] = time.time()
            with _cite_lock:
                items = list(_cite_queue)
                _cite_queue.clear()
            return self.send_json({"items": items})
        return self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        if u.path == "/api/mark-expert":
            return self.api_mark_expert()
        if u.path == "/api/rename-expert":
            return self.api_rename_expert()
        if u.path == "/api/archive":
            return self.api_archive()
        if u.path == "/api/favorite":
            return self.api_favorite()
        if u.path != "/api/cite":
            return self.send_json({"error": "not found"}, 404)
        # 只接受本页面发起的请求
        origin = self.headers.get("Origin") or ""
        if origin and not re.match(r"^http://(127\.0\.0\.1|localhost)(:\d+)?$", origin):
            return self.send_json({"error": "forbidden origin"}, 403)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 65536)) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("expected object")
        except (ValueError, json.JSONDecodeError):
            return self.send_json({"error": "bad json"}, 400)
        p = resolve_id(str(body.get("path", "")))
        if not p or not p.exists():
            return self.send_json({"error": "not found or not allowed"}, 404)
        item = {"path": to_id(p), "abs": str(p), "anchor": str(body.get("anchor") or "")[:200], "at": time.time()}
        # 嵌入 DSH 时直接向所属 iframe 父页发送；只解析/校验路径，不加入公共队列。
        if body.get("delivery") == "parent":
            return self.send_json({"queued": False, "item": item})
        with _cite_lock:
            _cite_queue.append(item)
            del _cite_queue[:-20]
        return self.send_json({"queued": True, "bridge": bridge_alive(), "item": item})

    def read_page_json(self):
        """会写文件的接口共用：必须来自书房页面本身（同源 + JSON），防止别的网页借浏览器写入。"""
        origin = self.headers.get("Origin") or ""
        if not re.match(rf"^http://(127\.0\.0\.1|localhost):{PORT}$", origin):
            self.send_json({"error": "forbidden origin"}, 403)
            return None
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            self.send_json({"error": "need json"}, 415)
            return None
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 4096)) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
            return body
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "bad json"}, 400)
            return None

    def api_archive(self):
        body = self.read_page_json()
        if body is None:
            return
        try:
            return self.send_json({"ok": True} | set_archived(unicodedata.normalize("NFC", str(body.get("path") or "")), body.get("archived") is not False))
        except MarkError as e:
            return self.send_json({"error": str(e)}, 409)
        except OSError as e:
            return self.send_json({"error": f"写入失败：{e}"}, 500)

    def api_favorite(self):
        body = self.read_page_json()
        if body is None:
            return
        try:
            return self.send_json({"ok": True} | set_favorite(str(body.get("path") or ""), body.get("favorite") is not False))
        except MarkError as e:
            return self.send_json({"error": str(e)}, 409)
        except OSError as e:
            return self.send_json({"error": f"写入失败：{e}"}, 500)

    def api_rename_expert(self):
        body = self.read_page_json()
        if body is None:
            return
        try:
            return self.send_json({"ok": True, "name": rename_expert(str(body.get("id") or ""), str(body.get("name") or ""))})
        except MarkError as e:
            return self.send_json({"error": str(e)}, 409)
        except (OSError, UnicodeDecodeError) as e:
            return self.send_json({"error": f"写入失败：{e}"}, 500)

    def api_mark_expert(self):
        body = self.read_page_json()
        if body is None:
            return
        skill_id = str(body.get("id") or "")
        try:
            return self.send_json({"ok": True, "path": mark_expert(skill_id)})
        except MarkError as e:
            return self.send_json({"error": str(e)}, 409)
        except (OSError, UnicodeDecodeError) as e:
            return self.send_json({"error": f"写入失败：{e}"}, 500)

    def api_doc(self, pid: str):
        p = resolve_id(pid)
        if not p or not p.exists():
            return self.send_json({"error": "not found or not allowed", "path": pid}, 404)
        st = p.stat()
        base = {"path": to_id(p), "abs": str(p), "name": p.name, "mtime": st.st_mtime, "size": st.st_size,
                "raw": "/raw/" + quote(to_id(p))}
        if p.is_dir():
            return self.send_json(base | {"ext": "dir", "title": p.name, "tree": list_tree(p)})
        ext = p.suffix.lower()
        base["ext"] = ext.lstrip(".")
        variants = journal_variants(p)
        if variants:
            base["variants"] = variants
        if ext in (".md", ".markdown"):
            text = p.read_text("utf-8", "ignore")
            fm, body = parse_frontmatter(text)
            meta = file_meta(p)
            return self.send_json(base | {"title": meta["title"], "fm": fm, "body": body, "source": text, "sources": source_links(fm, p)})
        if ext in TEXT_EXT and st.st_size < 3_000_000:
            return self.send_json(base | {"title": p.name, "body": p.read_text("utf-8", "ignore")})
        return self.send_json(base | {"title": file_meta(p).get("title") or p.name})


def is_ours() -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{PORT}/api/ping", timeout=1.5) as r:
            return json.load(r).get("app") == "jinji-reader"
    except Exception:
        return False


def main():
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        if is_ours():
            print(f"谨迹书房已在运行：http://127.0.0.1:{PORT}", flush=True)
            # 由 preview_start 拉起时保持进程存活，避免被当成启动失败
            while os.environ.get("JINJI_HOLD") == "1" and is_ours():
                time.sleep(5)
            return
        raise
    threading.Thread(target=get_index, daemon=True).start()
    print(f"谨迹书房：http://127.0.0.1:{PORT}  （journal = {JOURNAL}）", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
