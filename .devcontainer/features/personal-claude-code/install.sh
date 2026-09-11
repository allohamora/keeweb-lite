#!/bin/sh
set -eu

CLAUDE_DIR="${_REMOTE_USER_HOME}/.claude"
CLAUDE_CONFIG="${_REMOTE_USER_HOME}/.claude.json"
SHELL_CONFIG="${_REMOTE_USER_HOME}/.bashrc"
REMOTE_GROUP="$(id -gn "$_REMOTE_USER")"
CLAUDE_PATH_EXPORT='export PATH="$HOME/.local/bin:$PATH"'
CLAUDE_YOLO_ALIAS="alias claude-yolo='claude --dangerously-skip-permissions'"

# Set up the Claude configuration volume target and persistent .claude.json symlink
mkdir -p "$CLAUDE_DIR"
ln -snf "$CLAUDE_DIR/__do_not_use_user_claude.json" "$CLAUDE_CONFIG"
touch "$SHELL_CONFIG"

# Add the native installer location
if ! grep -Fqx "$CLAUDE_PATH_EXPORT" "$SHELL_CONFIG"; then
    printf "\n%s\n" "$CLAUDE_PATH_EXPORT" >> "$SHELL_CONFIG"
fi

# Add the claude-yolo alias
if ! grep -Fqx "$CLAUDE_YOLO_ALIAS" "$SHELL_CONFIG"; then
    printf "\n%s\n" "$CLAUDE_YOLO_ALIAS" >> "$SHELL_CONFIG"
fi

# Set ownership for the remote user
chown -R "$_REMOTE_USER:$REMOTE_GROUP" "$CLAUDE_DIR"
chown -h "$_REMOTE_USER:$REMOTE_GROUP" "$CLAUDE_CONFIG"
chown "$_REMOTE_USER:$REMOTE_GROUP" "$SHELL_CONFIG"

# Install Claude Code as the remote user because the native installer writes to the user's home
su - "$_REMOTE_USER" -c "$CLAUDE_PATH_EXPORT; curl -fsSL https://claude.ai/install.sh | bash"

# Verify the native installation
"${_REMOTE_USER_HOME}/.local/bin/claude" --version
