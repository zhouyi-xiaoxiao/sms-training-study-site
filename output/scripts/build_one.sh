#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <tex-file-name-in-src>"
  echo "Example: $0 knowledge_points_full.tex"
  exit 1
fi
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
PDF_DIR="$ROOT_DIR/pdf"
mkdir -p "$PDF_DIR"
latexmk -xelatex -interaction=nonstopmode -halt-on-error \
  -output-directory="$PDF_DIR" \
  -cd "$SRC_DIR/$1"
