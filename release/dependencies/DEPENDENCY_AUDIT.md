# Eatlog production dependency audit

Audit date: 2026-08-10

## Scope and method

The root app and `worker/` were cloned from the local release branch into `/tmp` without environment files, generated native projects, or local build output. Each directory was installed with `env TMPDIR=/tmp npm ci`, then audited with `npm audit --omit=dev`. No `--force` remediation was used.

The root audit initially reported 30 findings: 16 high, 14 moderate, and no critical findings. A non-forced, lockfile-only audit update moved patched transitive versions of `brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, and `undici` within their existing dependency ranges. Removing the obsolete `expo-health-connect` package also removed its finding path. The updated production audit reports 25 findings: 12 high, 13 moderate, and no critical findings. The Worker audit reports no vulnerabilities.

`npm audit` counts vulnerable dependants as separate high findings. The 12 remaining high findings reduce to two vulnerable packages in the Expo/Metro build graph.

## High findings

| Package | Reachability | Classification | Decision |
| --- | --- | --- | --- |
| `brace-expansion` | Expo fingerprinting, React Native code generation, globbing, and test tooling | Fixed surgically | Updated transitive lockfile entries to patched releases within existing ranges. |
| `fast-uri` | Expo configuration schema validation | Fixed surgically | Updated `3.1.4` to `3.1.5` in the lockfile. |
| `js-yaml` | Expo/configuration and test tooling | Fixed surgically | Updated both lockfile lines to patched releases within existing ranges. |
| `nanoid` | CSS/build transformation tooling | Fixed surgically | Updated `3.3.16` to `3.3.18` in the lockfile. |
| `image-size` | Metro reads repository-owned image assets while bundling | Build/dev only; blocked on upstream | It is not imported by Eatlog runtime or Worker source. npm offers only a forced Expo 57 upgrade, which is outside this SDK 54 release and must not be applied without an Expo upgrade cycle. A malicious committed image could stop a build, so release assets remain review-controlled. |
| `postcss` | NativeWind and Metro process repository-owned styles while bundling | Build/dev only; blocked on upstream | It is not part of Eatlog's native runtime request handling. npm offers only a forced Expo 57 upgrade. Do not process unreviewed CSS or source maps in the release build. |

No high or critical finding is reachable through installed-app input, Worker requests, provider responses, SQLite data, backup archives, or normal app runtime execution based on the inspected dependency paths and application imports.

## Accepted release constraint

The remaining high findings are accepted only for the SDK 54 build toolchain. Re-run both audits before every signed build. If Expo publishes an SDK 54-compatible patch, apply it and repeat clean install, export, prebuild, and device QA. Otherwise, resolve these findings in a separately tested Expo SDK upgrade; do not use `npm audit fix --force` on the release branch.

## Reproduction

```sh
env TMPDIR=/tmp npm ci
npm audit --omit=dev

cd worker
env TMPDIR=/tmp npm ci
npm audit --omit=dev
```

The checked-in dependency graph is authoritative. A release build must use the repository's local package scripts and `npx`-resolved Expo CLI; it must not rely on a global CLI, copied `node_modules`, environment files, or generated `android/`, `ios/`, or `dist/` directories.
