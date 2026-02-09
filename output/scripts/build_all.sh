#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
PDF_DIR="$ROOT_DIR/pdf"
STYLE_DIR="$ROOT_DIR/style"
mkdir -p "$PDF_DIR"

build_one() {
  local texfile="$1"
  latexmk -xelatex -interaction=nonstopmode -halt-on-error \
    -output-directory="$PDF_DIR" \
    -cd "$SRC_DIR/$texfile"
}

build_one original_complete.tex
build_one knowledge_points_full.tex
build_one practice_with_brain_science.tex
build_one verbatim_transcript.tex

# 统一交付命名（只保留一套，避免重复文件）
cp -f "$PDF_DIR/original_complete.pdf" "$PDF_DIR/01-企业短信培训学习手册-专业文稿版.pdf"
cp -f "$PDF_DIR/knowledge_points_full.pdf" "$PDF_DIR/02-全知识点-企业短信培训.pdf"
cp -f "$PDF_DIR/practice_with_brain_science.pdf" "$PDF_DIR/03-企业短信培训题库-学习测评版.pdf"
cp -f "$PDF_DIR/verbatim_transcript.pdf" "$PDF_DIR/04-逐字稿-企业短信培训.pdf"

rm -f \
  "$PDF_DIR/01-完整原文-企业短信培训.pdf" \
  "$PDF_DIR/03-题库-脑科学训练版-企业短信培训.pdf" \
  "$PDF_DIR/03-题库-脑科学学习版-企业短信培训.pdf" \
  "$PDF_DIR/original_complete.pdf" \
  "$PDF_DIR/knowledge_points_full.pdf" \
  "$PDF_DIR/practice_with_brain_science.pdf" \
  "$PDF_DIR/verbatim_transcript.pdf"

find "$PDF_DIR" -type f \( -name '*.aux' -o -name '*.log' -o -name '*.fls' -o -name '*.fdb_latexmk' -o -name '*.out' -o -name '*.toc' -o -name '*.xdv' \) -delete

echo "Build finished. Final deliverables in: $PDF_DIR"
