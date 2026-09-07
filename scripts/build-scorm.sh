#!/usr/bin/env bash
# Packages a SCORM 1.2 course zip for upload to an LMS.
#
# Ships only what the SCO actually needs at runtime (index.html, css/,
# js/, imsmanifest.xml) -- dev-only files (tests.html, tests/, NOTES.md,
# README.md, this scripts/ dir) are left out of the package on purpose,
# they're not part of the lesson.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="${1:-eko-computerhythm-scorm.zip}"
case "$OUT" in
  /*) : ;;                      # already absolute
  *) OUT="$(pwd)/$OUT" ;;       # make relative paths absolute before we cd into the staging dir
esac
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp imsmanifest.xml "$STAGE/"
cp index.html "$STAGE/"
mkdir -p "$STAGE/css" "$STAGE/js"
cp css/styles.css "$STAGE/css/"
cp js/*.js "$STAGE/js/"

rm -f "$OUT"
( cd "$STAGE" && zip -rq "$OUT" . )

echo "Wrote $OUT"
unzip -l "$OUT"
