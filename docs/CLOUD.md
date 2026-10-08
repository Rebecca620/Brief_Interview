# Cloud choices for a macOS-first POC

The main deliverable is the Mac app. Core capture, analysis, report editing and storage work locally. No public deployment, cloud synchronization or shared report service is currently live.

## Current architecture

The app bundles the HTML/CSS/JavaScript report engine. Its native loopback server serves those local assets to WKWebView; it is not a cloud server. The optional Node/Jev development adapter remains in `server/` and is not bundled into the native app.

## Optional cloud evolution

If user research establishes a need for shared reports or cross-device work, add an authenticated HTTPS API, enterprise SSO, report-level authorization, a relational database for report metadata, and object storage for files. Plan conflict handling, retention, audit history and operational monitoring before claiming enterprise readiness.

For cloud AI, keep credentials server-side and require explicit data review, user authentication and request quotas. The existing local provider adapter is a starting point, not a production multi-user service.

## Secondary browser demonstration

`node scripts/build.mjs` produces a static `dist/` bundle. This can be deployed to an HTTPS static host/CDN, such as Cloudflare Pages. Use build command `node scripts/build.mjs`, output directory `dist`, and no runtime secrets for the core workflow. The optional `_headers` configuration is copied from `public/`; verify headers on the chosen host.

The web demo shares the application, not a user's saved reports. Browser-local report routes are not share links. Use exported artifacts to hand off report content. The browser demo does not reproduce the native menu bar interaction.

Earlier hosting-attempt metadata was archived with the obsolete browser-first handoff in `.build/recovery/cleanup-before-macos-first.zip`; it is not required to build or run Brief. Do not treat historical provisioned project IDs as proof of a live deployment.

The interview's “Choice of technologies to deploy on cloud” is addressed by this architecture and its tradeoffs. Describe these as proposed extensions unless actually implemented and verified.

## Provider reference

Cloudflare documents support for static HTML with a custom build command and output directory: [Static HTML on Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/). Checked September 28, 2026. For this repository, the proposed command is `node scripts/build.mjs` and directory is `dist`. This is a deployment plan, not evidence of a deployed site.
