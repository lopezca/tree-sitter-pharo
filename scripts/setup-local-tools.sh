#!/bin/sh
# Installs the JavaScript tooling this grammar needs, pinned and local to this folder:
# bun and pnpm binaries in .tools/ (ignored by git), and the dev dependencies
# (tree-sitter-cli) in node_modules/. Nothing is installed globally. bun stands in
# for node: .tools/bin/node is a link to bun, which runs as node under that name.
#
# Then run commands through scripts/with-local-tools.sh, for example:
#   scripts/with-local-tools.sh pnpm run generate
#   scripts/with-local-tools.sh tree-sitter test
set -eu

BUN_VERSION=1.3.13
PNPM_VERSION=12.15.0

root=$(cd "$(dirname "$0")/.." && pwd)
tools="$root/.tools"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) bun_asset=bun-darwin-aarch64 pnpm_asset=pnpm-darwin-arm64 ;;
  Darwin-x86_64) bun_asset=bun-darwin-x64 pnpm_asset=pnpm-darwin-x64 ;;
  Linux-x86_64) bun_asset=bun-linux-x64 pnpm_asset=pnpm-linux-x64 ;;
  Linux-aarch64 | Linux-arm64) bun_asset=bun-linux-aarch64 pnpm_asset=pnpm-linux-arm64 ;;
  *) echo "unsupported platform: $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac

mkdir -p "$tools/bin"

bun_dir="$tools/bun-$BUN_VERSION"
if [ ! -x "$bun_dir/bun" ]; then
  rm -rf "$bun_dir" "$tools/download"
  mkdir -p "$tools/download"
  curl -fsSL -o "$tools/download/bun.zip" \
    "https://github.com/oven-sh/bun/releases/download/bun-v$BUN_VERSION/$bun_asset.zip"
  unzip -q "$tools/download/bun.zip" -d "$tools/download"
  mkdir -p "$bun_dir"
  mv "$tools/download/$bun_asset/bun" "$bun_dir/bun"
  rm -rf "$tools/download"
fi

pnpm_dir="$tools/pnpm-$PNPM_VERSION"
if [ ! -x "$pnpm_dir/pnpm" ]; then
  rm -rf "$pnpm_dir"
  mkdir -p "$pnpm_dir"
  curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v$PNPM_VERSION/$pnpm_asset.tar.gz" |
    tar xzf - -C "$pnpm_dir"
fi

ln -sf "../bun-$BUN_VERSION/bun" "$tools/bin/bun"
ln -sf "../bun-$BUN_VERSION/bun" "$tools/bin/node"
ln -sf "../pnpm-$PNPM_VERSION/pnpm" "$tools/bin/pnpm"

cd "$root"
# --ignore-scripts skips this package's own install script (node-gyp-build of the
# Node.js binding, not needed to generate or test the grammar); tree-sitter-cli's
# install script, which downloads the CLI binary, is run explicitly afterwards.
PATH="$tools/bin:$PATH" pnpm install --ignore-scripts
PATH="$tools/bin:$PATH" pnpm rebuild tree-sitter-cli

"$root/scripts/with-local-tools.sh" tree-sitter --version
