# Contributing to Eatlog

Eatlog is a free, open-source local food log. Small fixes are welcome, including copy, accessibility, docs, tests, and food-search corrections. Open a [GitHub issue](https://github.com/garettie/eatlog/issues) to describe a bug or propose a change. A pull request should explain what changed and how you checked it.

## Work locally

Install Node.js and npm, then run `npm ci`. Use `npm start` with a native development build; Expo Go cannot run Eatlog's native modules. `npm run android` builds the Android development variant. `npm run ios` needs macOS and Xcode.

Manual logging and its tests need no online credentials. A personal Gemini key can be added in the app to exercise My key. Hosted AI, USDA search, and purchase checks need a separately configured preview Worker, provider keys, and RevenueCat Test Store setup. See [Worker setup](worker/README.md) and [native configuration](release/config/NATIVE_CONFIGURATION.md). Keep credentials in local or service-managed secrets, never in a commit, issue, screenshot, log, or test fixture.

Before opening a pull request, run `env TMPDIR=/tmp npm test`, `npm run typecheck`, `npm run store:metadata:check`, `npm run store:artwork:check`, and `npm run site:check`. If a native or provider scenario could not run, say which one and why. Website screenshots are owner-maintained; leave the checked-in screenshots intact.

For a security issue, email the [published support address](mailto:sggajitos@gmail.com) with a concise description. Do not put keys, personal meal data, or exploit details in a public issue. The [0BSD license](LICENSE) covers this source; Eatlog-hosted AI access and third-party data or services have separate terms.
