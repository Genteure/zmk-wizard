# Compile Test

This compile test exercises every example keyboard fixture by generating a ZMK user repository and running real `west build` commands in GitHub Actions. It is meant to catch regressions in templating and build setup, not to fully validate runtime behavior.

## Fixtures

- Fixtures live under `examples/json`. Each fixture is a `Keyboard` JSON in the internal format defined in `src/types/keyboard.ts`.
- Fixtures use the relative POSIX paths (e.g. `unibody/rpi_pico_basic.json`).

## Helper script: [scripts/smoke.ts](scripts/smoke.ts)

- `pnpm run smoke list` finds all fixture JSON files under `examples/json` and prints a sorted JSON array.
- `pnpm run smoke generate <fixture.json> <destDir>`
  - Validates the fixture (`KeyboardSchema` + `validateKeyboard`).
    This catches issues like missing required fields or invalid pin assignments before attempting to generate files. It provides distinction between schema validation errors (possible when schema was updated) and templating errors.
  - Generates the ZMK configuration via `createZMKConfig` and writes files into `<destDir>`.
  - Builds the Actions matrix JSON from the generated `build.yaml` and writes it to the `build_matrix` output. While building the matrix it:
    - Uncomments any lines after the `---` document separator so the optional sample builds in `build.yaml` are enabled for the compile test.
    - Drops any entries whose `shield` contains `settings_reset`. Settings reset firmware are exactly the same across all builds, if they fail it's a problem with ZMK itself.
- `pnpm run smoke generate-all <destDir>`
  - Runs `generate` for every fixture, writing each generated repository into `<destDir>/<fixture-name>/` together with its `build-matrix.json`.
  - Merges the generated `config/west.yml` files (the ZMK import and any extra west modules) into a single workspace manifest at `<destDir>/config/west.yml`, so all fixtures share one `west update`.
  - Also writes `fixtures.txt` (one fixture directory per line) and `test-plan.json` so the compile job can iterate everything in a single job.

The generated matrix is the same shape consumed by the `build` job in upstream ZMK's [build-user-config.yml](https://github.com/zmkfirmware/zmk/blob/v0.3/.github/workflows/build-user-config.yml) (typically an `include` array with `board`, optional `shield`, optional `snippet`, optional `cmake-args`, and optional `artifact-name`).

## GitHub Actions flow

### [.github/workflows/compile-test.yml](.github/workflows/compile-test.yml)

- Triggers on `push`, `pull_request`, and `workflow_dispatch`, ignoring `renovate/**` branches.
- Job `generate`: checks out the repo, sets up pnpm/node, installs dependencies, runs `pnpm run smoke generate-all`, and uploads all generated repositories as one short-lived artifact (1 day).
- Job `compile` (container: `zmkfirmware/zmk-build-arm:stable`):
  - Downloads the generated repositories.
  - Caches the west modules using the same cache layout as upstream ZMK.
  - Runs `west init`, `west update`, and `west zephyr-export` once using the merged workspace manifest.
  - Runs every matrix entry for every fixture with `west build` inside this single job, continuing past failures so all fixtures are attempted.
  - Writes a filtered log summary (lines matching `error|warn|fatal`) to make potential issues easier to find.

The build commands largely match the upstream ZMK reusable workflow [build-user-config.yml](https://github.com/zmkfirmware/zmk/blob/v0.3/.github/workflows/build-user-config.yml), with the compile-test tweak that all generated fixtures are compiled sequentially in one job instead of one matrix job per board/shield.
