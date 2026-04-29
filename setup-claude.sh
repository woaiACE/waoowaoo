#!/bin/bash
# ============================================================
# setup-claude.sh — 新电脑 Claude Code 环境一键配置
# 用法: bash setup-claude.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }

echo "============================================"
echo " waoowaoo Claude Code 环境配置"
echo "============================================"
echo ""

# ---- Step 1: 安装 Claude Code CLI ----
if command -v claude &>/dev/null; then
    log "Claude Code 已安装: $(claude --version 2>&1 | head -1)"
else
    warn "Claude Code 未安装，正在安装..."
    npm install -g @anthropic-ai/claude-code
    log "Claude Code 安装完成"
fi

# ---- Step 2: 注册 marketplace + 安装插件 ----
echo ""
echo "正在安装插件..."

# 先注册 everything-claude-code 的自托管 marketplace
ECC_MARKETPLACE="https://github.com/affaan-m/everything-claude-code.git"
if claude plugins marketplace list 2>/dev/null | grep -q "everything-claude-code"; then
    log "Marketplace 已注册: everything-claude-code"
else
    warn "正在注册 marketplace: everything-claude-code"
    claude plugins marketplace add "$ECC_MARKETPLACE"
    log "Marketplace 注册完成"
fi

PLUGINS=(
    "superpowers@claude-plugins-official"
    "everything-claude-code@everything-claude-code"
    "context7@claude-plugins-official"
    "frontend-design@claude-plugins-official"
    "code-review@claude-plugins-official"
)

for plugin in "${PLUGINS[@]}"; do
    if claude plugins list 2>/dev/null | grep -q "$plugin"; then
        log "插件已安装: $plugin"
    else
        warn "正在安装: $plugin"
        claude plugins install "$plugin"
        log "插件安装完成: $plugin"
    fi
done

# ---- Step 3: 安装 Rules ----
# Claude Code 插件不支持自动分发 rules，需要从 everything-claude-code 仓库手动复制
echo ""
echo "正在安装 rules..."

RULES_DIR="$HOME/.claude/rules"
ECC_REPO="https://github.com/affaan-m/everything-claude-code.git"
ECC_TMP="/tmp/everything-claude-code-rules"

# 本项目所需的 rules 语言包
# common 和 zh 始终安装；typescript/python/web 根据项目技术栈
RULE_PACKS=("common" "zh" "typescript" "python" "web")

if [ -d "$RULES_DIR/common" ] && [ -f "$RULES_DIR/common/coding-style.md" ]; then
    log "Rules 已安装，跳过"
else
    warn "Rules 未安装，从 everything-claude-code 仓库拉取..."

    # 浅克隆（只取最新版本，节省时间和带宽）
    if [ -d "$ECC_TMP" ]; then
        rm -rf "$ECC_TMP"
    fi

    git clone --depth 1 "$ECC_REPO" "$ECC_TMP"

    mkdir -p "$RULES_DIR"

    for pack in "${RULE_PACKS[@]}"; do
        if [ -d "$ECC_TMP/rules/$pack" ]; then
            cp -r "$ECC_TMP/rules/$pack" "$RULES_DIR/"
            log "  已安装 rules/$pack"
        else
            warn "  rules/$pack 不存在，跳过"
        fi
    done

    # 清理临时仓库
    rm -rf "$ECC_TMP"
    log "Rules 安装完成"
fi

# ---- Step 4: 推荐 Token 优化配置 ----
SETTINGS_USER="$HOME/.claude/settings.json"
if [ ! -f "$SETTINGS_USER" ]; then
    cat > "$SETTINGS_USER" << 'SETEOF'
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50"
  }
}
SETEOF
    log "已创建 ~/.claude/settings.json（推荐 Token 优化配置：sonnet 模型 + 降低 thinking tokens）"
else
    log "~/.claude/settings.json 已存在，跳过"
fi

# ---- Step 5: 创建 settings.local.json 模板 ----
SETTINGS_LOCAL="$HOME/.claude/settings.local.json"
if [ ! -f "$SETTINGS_LOCAL" ]; then
    cat > "$SETTINGS_LOCAL" << 'SETEOF'
{
  "permissions": {
    "allow": []
  }
}
SETEOF
    log "已创建 ~/.claude/settings.local.json 模板（机器相关权限请自行补充）"
else
    log "~/.claude/settings.local.json 已存在，跳过"
fi

# ---- 完成 ----
echo ""
echo "============================================"
echo " 配置完成！"
echo "============================================"
echo ""
echo "已安装:"
echo "  • Claude Code CLI"
echo "  • superpowers              — 规划 / 头脑风暴 / 写计划"
echo "  • everything-claude-code   — 38 代理 + 156 技能 + hooks"
echo "  • context7                 — 实时文档查询"
echo "  • frontend-design          — 前端设计技能"
echo "  • code-review              — 代码审查"
echo "  • rules (common/zh/typescript/python/web)"
echo ""
echo "项目配置 (.claude/) 已随 Git 仓库携带，无需额外操作。"
echo "运行 cd <项目目录> && claude 即可开始使用。"
echo ""
