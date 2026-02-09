#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PDF_DIR="$ROOT_DIR/pdf"
find "$PDF_DIR" -type f \( -name '*.aux' -o -name '*.log' -o -name '*.fls' -o -name '*.fdb_latexmk' -o -name '*.out' -o -name '*.toc' -o -name '*.xdv' \) -delete
