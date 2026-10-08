# macOS download

`Brief-0.5.0-macOS.zip` is the application from the September 28 interview submission. It contains `Brief.app`, targeting Apple Silicon (arm64) and macOS 13+.

Extract the ZIP, open the app, and select its document icon in the menu bar. No Node.js server is required. It is an ad-hoc signed development build without Apple notarization; organization security policy may prevent launch. The browser workspace and PDF provide alternatives.

## Integrity

After downloading, compare the file with `SHA256SUMS.txt` using `shasum -a 256 Brief-0.5.0-macOS.zip`. This checksum verifies that the download matches this repository; it is not a malware scan or Apple notarization.
