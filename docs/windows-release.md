# Desktop release and updater

This app uses Tauri's updater with GitHub Releases as the update endpoint:

```text
https://github.com/YuNa-Zju/rbujo/releases/latest/download/latest.json
```

## One-time setup

The updater public key is committed in `src-tauri/tauri.conf.json`. Keep the matching private key secret.

The generated private key for this setup is currently at:

```text
/private/tmp/rbujo-updater.key
```

Add the private key content to the GitHub repository secret:

```text
TAURI_SIGNING_PRIVATE_KEY
```

Because this key was generated without a password, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can be left empty or omitted.

If GitHub CLI is logged in, set the secret with:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo YuNa-Zju/rbujo --body-file /private/tmp/rbujo-updater.key
```

In GitHub repository settings, make sure Actions can write releases:

```text
Settings -> Actions -> General -> Workflow permissions -> Read and write permissions
```

## Release

Use the normal Git Flow shape: finish and merge feature branches into `develop`, create a `release/<version>` branch for final checks, merge the release branch into `master`, then tag the merge commit.

For the first release:

1. Make sure the release branch contains everything you want to ship.
2. Bump `version` in `src-tauri/tauri.conf.json`.
3. Merge the release branch into `master`.
4. Tag the `master` merge commit with a tag matching `v*`.
5. Push `master` and the tag.
6. Merge the release branch back into `develop` so the version bump and release fixes are not lost.

Example:

```bash
git checkout master
git merge --no-ff release/0.1.0
git tag v0.1.0
git push origin master
git push origin v0.1.0
git checkout develop
git merge --no-ff release/0.1.0
git push origin develop
```

You can also run the `Release Desktop` workflow manually from GitHub Actions.

The workflow builds a macOS DMG plus Windows NSIS and MSI installers. It uploads release assets. Windows update artifacts are signed, uploaded with the setup exe, and included in `latest.json`.

## App behavior

Installed production builds check for updates on startup. If a newer signed release is available, the app shows a prompt. Choosing `立即更新` downloads and installs the update. On Windows, the app may close during installer execution.
