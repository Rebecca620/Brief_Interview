#!/bin/zsh
set -euo pipefail
cd "${0:A:h:h}"
mkdir -p .build
swiftc -parse-as-library macos/Sources/BriefMac/LocalStore.swift \
  macos/Sources/BriefMac/AssetServer.swift scripts/testing/macos-checks.swift \
  -o .build/macos-checks
.build/macos-checks
swiftc -parse-as-library macos/Sources/BriefMac/QuitCoordinator.swift \
  scripts/testing/macos-quit-checks.swift -o .build/macos-quit-checks
.build/macos-quit-checks
