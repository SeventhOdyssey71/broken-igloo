#!/usr/bin/env bash
# Package all skills into a tarball for distribution
# Usage: bash scripts/package-skills.sh
# Output: skills.tar.gz in the project root

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$PROJECT_ROOT/skills.tar.gz"

echo "📦 Packaging brokenigloo skills..."

# Verify skills directory exists
if [ ! -d "$PROJECT_ROOT/skills" ]; then
  echo "❌ Error: skills/ directory not found at $PROJECT_ROOT/skills"
  exit 1
fi

# Count skills
SKILL_COUNT=$(find "$PROJECT_ROOT/skills" -name "SKILL.md" | wc -l | tr -d ' ')
echo "   Found $SKILL_COUNT skills"

# Create tarball
cd "$PROJECT_ROOT"
tar -czf "$OUTPUT_FILE" \
  --exclude='.DS_Store' \
  skills/SKILL_ROUTER.md \
  skills/idea/ \
  skills/build/ \
  skills/launch/ \
  skills/data/

# Report
SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
echo "✅ Packaged $SKILL_COUNT skills into skills.tar.gz ($SIZE)"
echo "   Output: $OUTPUT_FILE"
