#!/bin/sh
set -eu

WORKSPACES_DIR="/workspaces"
PROJECT_DIR="$WORKSPACES_DIR/keeweb-lite"
NVM_PROFILE_SCRIPT="/etc/profile.d/nvm.sh"
NVM_DIR_EXPORT='export NVM_DIR="/usr/local/share/nvm"'
NVM_SOURCE_LINE='[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

# Set up the node_modules volume target
mkdir -p "$PROJECT_DIR/node_modules"
chown -R "$_REMOTE_USER:$(id -gn "$_REMOTE_USER")" "$WORKSPACES_DIR"

# The node feature only wires nvm into bashrc/zshrc, which non-interactive login
# shells (e.g. `su - user -c '...'`, used by other features' native installers)
# never source. Add it to profile.d so those shells can still find node/npm.
touch "$NVM_PROFILE_SCRIPT"

# Add the NVM_DIR export
if ! grep -Fqx "$NVM_DIR_EXPORT" "$NVM_PROFILE_SCRIPT"; then
    printf "%s\n" "$NVM_DIR_EXPORT" >> "$NVM_PROFILE_SCRIPT"
fi

# Add the nvm.sh sourcing line
if ! grep -Fqx "$NVM_SOURCE_LINE" "$NVM_PROFILE_SCRIPT"; then
    printf "%s\n" "$NVM_SOURCE_LINE" >> "$NVM_PROFILE_SCRIPT"
fi

# Make it world-readable so every user's login shell can source it, root-writable only
chmod 0644 "$NVM_PROFILE_SCRIPT"
