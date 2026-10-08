#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build.mjs
swift build --package-path macos -c release --scratch-path .build/macos-swift -Xswiftc -warnings-as-errors
app_version=$(node -p 'require("./package.json").version')
app='.build/Brief.app'
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
swift scripts/testing/build-icon.swift .build/Brief.iconset
iconutil --convert icns .build/Brief.iconset --output "$app/Contents/Resources/Brief.icns"
cp .build/macos-swift/release/BriefMac "$app/Contents/MacOS/BriefMac"
rm -rf "$app/Contents/Resources/Web"
cp -R dist "$app/Contents/Resources/Web"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Brief</string>
<key>CFBundleDisplayName</key><string>Brief</string>
<key>CFBundleIdentifier</key><string>com.brief.reportbuilder.poc</string>
<key>CFBundleExecutable</key><string>BriefMac</string>
<key>CFBundleIconFile</key><string>Brief</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$app_version</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
printf 'Built %s\n' "$app"
