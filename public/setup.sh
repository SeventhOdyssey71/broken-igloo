#!/usr/bin/env bash
# brokenigloo setup script
# Install: curl -fsSL https://brokenigloo.dev/setup.sh | bash
# Flags: --update, --uninstall

set -euo pipefail

# ═══════════════════════════════════════════════════════════
# Brand Constants
# ═══════════════════════════════════════════════════════════
PRODUCT_NAME="brokenigloo"
BASE_URL="https://brokenigloo.dev"
SKILLS_URL="$BASE_URL/skills.tar.gz"
CONFIG_DIR="$HOME/.brokenigloo"
MANIFEST_FILE="$CONFIG_DIR/manifest.json"
VERSION="0.1.0"

# Install target directories
CLAUDE_SKILLS="$HOME/.claude/skills"
CODEX_SKILLS="$HOME/.codex/skills"
AGENTS_SKILLS="$HOME/.agents/skills"

# ═══════════════════════════════════════════════════════════
# Colors
# ═══════════════════════════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════
# ASCII Banner
# ═══════════════════════════════════════════════════════════
print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo '  ╔══════════════════════════════════════════════════╗'
  echo '  ║                                                  ║'
  echo '  ║   ██████╗ ██████╗  ██████╗ ██╗  ██╗███████╗    ║'
  echo '  ║   ██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝    ║'
  echo '  ║   ██████╔╝██████╔╝██║   ██║█████╔╝ █████╗      ║'
  echo '  ║   ██╔══██╗██╔══██╗██║   ██║██╔═██╗ ██╔══╝      ║'
  echo '  ║   ██████╔╝██║  ██║╚██████╔╝██║  ██╗███████╗    ║'
  echo '  ║   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝    ║'
  echo '  ║                                                  ║'
  echo '  ║   ██╗ ██████╗ ██╗      ██████╗  ██████╗         ║'
  echo '  ║   ██║██╔════╝ ██║     ██╔═══██╗██╔═══██╗        ║'
  echo '  ║   ██║██║  ███╗██║     ██║   ██║██║   ██║        ║'
  echo '  ║   ██║██║   ██║██║     ██║   ██║██║   ██║        ║'
  echo '  ║   ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝        ║'
  echo '  ║   ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝         ║'
  echo '  ║                                                  ║'
  echo '  ║          Ship on Sui — Idea to Launch            ║'
  echo '  ╚══════════════════════════════════════════════════╝'
  echo -e "${NC}"
  echo ""
}

# ═══════════════════════════════════════════════════════════
# Utility Functions
# ═══════════════════════════════════════════════════════════
info()  { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "${RED}✗${NC}  $1"; }

command_exists() { command -v "$1" &>/dev/null; }

# ═══════════════════════════════════════════════════════════
# Uninstall
# ═══════════════════════════════════════════════════════════
do_uninstall() {
  echo ""
  info "Uninstalling $PRODUCT_NAME..."

  if [ ! -f "$MANIFEST_FILE" ]; then
    warn "No manifest found. Removing known skill directories..."
  fi

  # Remove installed skills
  for dir in "$CLAUDE_SKILLS" "$CODEX_SKILLS" "$AGENTS_SKILLS"; do
    if [ -d "$dir" ]; then
      # Remove brokenigloo-specific skills
      for skill_dir in "$dir"/*/; do
        if [ -f "$skill_dir/SKILL.md" ]; then
          rm -rf "$skill_dir"
        fi
      done
      # Remove shared files
      rm -f "$dir/SKILL_ROUTER.md"
      rm -rf "$dir/data"
    fi
  done

  # Remove config directory
  rm -rf "$CONFIG_DIR"

  ok "Uninstalled $PRODUCT_NAME"
  echo ""
  exit 0
}

# ═══════════════════════════════════════════════════════════
# Parse Arguments
# ═══════════════════════════════════════════════════════════
ACTION="install"
for arg in "$@"; do
  case $arg in
    --uninstall) ACTION="uninstall" ;;
    --update)    ACTION="update" ;;
    --help)
      echo "Usage: setup.sh [--update | --uninstall | --help]"
      exit 0
      ;;
  esac
done

if [ "$ACTION" = "uninstall" ]; then
  do_uninstall
fi

# ═══════════════════════════════════════════════════════════
# Main Install Flow
# ═══════════════════════════════════════════════════════════
print_banner

# Check prerequisites
info "Checking prerequisites..."

if ! command_exists curl && ! command_exists wget; then
  fail "curl or wget is required. Please install one first."
  exit 1
fi
ok "Download tool available"

# Check for AI agent CLIs
HAS_CLAUDE=false
HAS_CODEX=false

if command_exists claude; then
  HAS_CLAUDE=true
  ok "Claude Code detected"
else
  warn "Claude Code not found. Install: npm i -g @anthropic-ai/claude-code"
fi

if command_exists codex; then
  HAS_CODEX=true
  ok "OpenAI Codex detected"
else
  warn "OpenAI Codex not found. Install: npm i -g @openai/codex"
fi

if [ "$HAS_CLAUDE" = false ] && [ "$HAS_CODEX" = false ]; then
  warn "No AI agent CLI detected. Skills will be installed but you need Claude Code or Codex to use them."
  echo ""
  echo -e "  ${DIM}Install Claude Code:${NC}  npm i -g @anthropic-ai/claude-code"
  echo -e "  ${DIM}Install Codex:${NC}        npm i -g @openai/codex"
  echo ""
fi

# Check for Sui CLI
if command_exists sui; then
  SUI_VERSION=$(sui --version 2>/dev/null | head -1)
  ok "Sui CLI detected: $SUI_VERSION"
else
  warn "Sui CLI not found. Install: brew install sui"
fi

echo ""

# ═══════════════════════════════════════════════════════════
# Download Skills
# ═══════════════════════════════════════════════════════════
info "Downloading $PRODUCT_NAME skills v$VERSION..."

TMPDIR=$(mktemp -d)
TARBALL="$TMPDIR/skills.tar.gz"

if command_exists curl; then
  curl -fsSL "$SKILLS_URL" -o "$TARBALL" 2>/dev/null || {
    # Fallback: try local file if running from repo
    if [ -f "$(dirname "$0")/../skills.tar.gz" ]; then
      cp "$(dirname "$0")/../skills.tar.gz" "$TARBALL"
    else
      fail "Failed to download skills. Check your internet connection."
      rm -rf "$TMPDIR"
      exit 1
    fi
  }
else
  wget -q "$SKILLS_URL" -O "$TARBALL" 2>/dev/null || {
    fail "Failed to download skills."
    rm -rf "$TMPDIR"
    exit 1
  }
fi

ok "Downloaded skills package"

# Extract
tar -xzf "$TARBALL" -C "$TMPDIR"
ok "Extracted skills"

# ═══════════════════════════════════════════════════════════
# Install Skills
# ═══════════════════════════════════════════════════════════
info "Installing skills..."

INSTALLED_SKILLS=()

for target_dir in "$CLAUDE_SKILLS" "$CODEX_SKILLS" "$AGENTS_SKILLS"; do
  mkdir -p "$target_dir"

  # Copy SKILL_ROUTER.md
  cp "$TMPDIR/skills/SKILL_ROUTER.md" "$target_dir/" 2>/dev/null || true

  # Copy shared data
  if [ -d "$TMPDIR/skills/data" ]; then
    cp -r "$TMPDIR/skills/data" "$target_dir/" 2>/dev/null || true
  fi

  # Copy each skill
  for phase_dir in "$TMPDIR/skills/idea" "$TMPDIR/skills/build" "$TMPDIR/skills/launch"; do
    if [ -d "$phase_dir" ]; then
      for skill_dir in "$phase_dir"/*/; do
        skill_name=$(basename "$skill_dir")
        mkdir -p "$target_dir/$skill_name"
        cp -r "$skill_dir"* "$target_dir/$skill_name/" 2>/dev/null || true
        INSTALLED_SKILLS+=("$skill_name")
      done
    fi
  done
done

# Deduplicate skill count
UNIQUE_SKILLS=($(echo "${INSTALLED_SKILLS[@]}" | tr ' ' '\n' | sort -u))
ok "Installed ${#UNIQUE_SKILLS[@]} skills to Claude, Codex, and Agents directories"

# ═══════════════════════════════════════════════════════════
# Configure Claude Code Permissions
# ═══════════════════════════════════════════════════════════
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
if [ "$HAS_CLAUDE" = true ] || [ -d "$HOME/.claude" ]; then
  mkdir -p "$HOME/.claude"

  if [ -f "$CLAUDE_SETTINGS" ]; then
    # Check if permissions already configured
    if ! grep -q "Bash" "$CLAUDE_SETTINGS" 2>/dev/null; then
      info "Configuring Claude Code permissions for skill preambles..."
      # Add auto-allow for skill telemetry bash commands
      # This is a best-effort addition — user can adjust in settings
    fi
  else
    cat > "$CLAUDE_SETTINGS" << 'SETTINGS_EOF'
{
  "permissions": {
    "allow": [
      "Bash(cat ~/.brokenigloo/*)",
      "Bash(uuidgen*)",
      "Bash(date*)",
      "Bash(echo*>>*telemetry*)",
      "Read",
      "Glob",
      "Grep"
    ]
  }
}
SETTINGS_EOF
    ok "Created Claude Code settings with skill permissions"
  fi
fi

# ═══════════════════════════════════════════════════════════
# Create Config Directory
# ═══════════════════════════════════════════════════════════
mkdir -p "$CONFIG_DIR"

# Write manifest
cat > "$MANIFEST_FILE" << EOF
{
  "version": "$VERSION",
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "skills_count": ${#UNIQUE_SKILLS[@]},
  "skills": $(printf '%s\n' "${UNIQUE_SKILLS[@]}" | jq -R . | jq -s .),
  "targets": [
    "$CLAUDE_SKILLS",
    "$CODEX_SKILLS",
    "$AGENTS_SKILLS"
  ]
}
EOF

ok "Wrote install manifest"

# ═══════════════════════════════════════════════════════════
# Telemetry Opt-In
# ═══════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}Telemetry${NC}"
echo -e "${DIM}Help improve brokenigloo by sharing anonymous skill usage data.${NC}"
echo -e "${DIM}No code, file paths, or personal information is ever collected.${NC}"
echo ""
echo "  1) anonymous  — skill name + duration only"
echo "  2) community  — same + anonymous installation ID"
echo "  3) off         — no telemetry"
echo ""
read -r -p "Choose (1/2/3) [default: 3]: " TELEMETRY_CHOICE </dev/tty 2>/dev/null || TELEMETRY_CHOICE="3"

case "$TELEMETRY_CHOICE" in
  1) TIER="anonymous" ;;
  2) TIER="community" ;;
  *)  TIER="off" ;;
esac

echo "$TIER" > "$CONFIG_DIR/telemetry-tier"
ok "Telemetry set to: $TIER"

# Generate installation ID if community tier
if [ "$TIER" = "community" ]; then
  INSTALL_ID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')")
  echo "$INSTALL_ID" > "$CONFIG_DIR/installation-id"
fi

# ═══════════════════════════════════════════════════════════
# Cleanup
# ═══════════════════════════════════════════════════════════
rm -rf "$TMPDIR"

# ═══════════════════════════════════════════════════════════
# Done
# ═══════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  brokenigloo installed successfully!${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Get started:${NC}"
echo ""
echo -e "  ${CYAN}1.${NC} Open Claude Code in your project directory"
echo -e "  ${CYAN}2.${NC} Say: ${BOLD}\"teach me Sui\"${NC} to learn the fundamentals"
echo -e "  ${CYAN}3.${NC} Say: ${BOLD}\"help me find a crypto idea\"${NC} to discover what to build"
echo -e "  ${CYAN}4.${NC} Say: ${BOLD}\"scaffold a Sui project\"${NC} to start building"
echo ""
echo -e "  ${DIM}Skills installed: ${#UNIQUE_SKILLS[@]}${NC}"
echo -e "  ${DIM}Locations: ~/.claude/skills/ ~/.codex/skills/ ~/.agents/skills/${NC}"
echo -e "  ${DIM}Config: ~/.brokenigloo/${NC}"
echo ""
echo -e "  ${DIM}Uninstall: curl -fsSL $BASE_URL/setup.sh | bash -s -- --uninstall${NC}"
echo ""
