#!/bin/sh
# Runs a command with the local tools first on PATH: bun (also as node) and pnpm
# from .tools/bin, and tree-sitter from node_modules/.bin. Set them up once with
# scripts/setup-local-tools.sh. tree-sitter generate runs grammar.js with bun:
# it feeds node a script on standard input, which bun does not read under the
# name node.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
TREE_SITTER_JS_RUNTIME=bun
export TREE_SITTER_JS_RUNTIME
PATH="$root/.tools/bin:$root/node_modules/.bin:$PATH" exec "$@"
