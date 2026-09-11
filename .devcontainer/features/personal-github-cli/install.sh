#!/bin/sh
set -eu

GITHUB_CONFIG_DIR="${_REMOTE_USER_HOME}/.config/gh"

# Set up the GitHub CLI configuration volume target
mkdir -p "$GITHUB_CONFIG_DIR"
chown -R "$_REMOTE_USER:$(id -gn "$_REMOTE_USER")" "$GITHUB_CONFIG_DIR"
