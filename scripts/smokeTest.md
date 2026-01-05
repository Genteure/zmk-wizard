# Smoke Test

The smoke test GitHub Action workflow takes internal data `.json` files, turns each into a simulated ZMK user repo, and runs real `west build` jobs to catch regressions.

## Run structure

The normal "build-user-config" workflow from ZMK reads `build.yaml` in the root of the repository and generates Actions jobs based on that. Here we generate many simulated repositories, each with its own `build.yaml`, and execute the builds in Actions.

Terminology for this document:

- **Data file**: A fixture `.json` file containing configuration data in our internal format (`Keyboard` in `typedef.ts`).
- **Simulated repository**: A directory containing a generated ZMK configuration, simulating a real user repository. See `createZMKConfig` from `src/lib/templating/index.ts`.
- **Build**: A single build defined in `build.yaml` (e.g. for a specific board + shield + cmake options combination).

We have multiple data files, each generating a simulated repository. Each simulated repository can declare multiple builds in `build.yaml`.

For each build we collect:

- Build log (`build.log`)
- Presence of firmware output (uf2)
- Counts of warnings and errors found in the log

## Implementation

- Script commands in [scripts/smoke.ts](scripts/smoke.ts):
  - `pnpm smoke list [paths...]` discovers fixture JSON files (default `examples/json`). Writes `json-files` to `GITHUB_OUTPUT` when present.
  - `pnpm smoke build.yaml <fixture.json>` generates the repo in memory, parses `build.yaml`, and writes a matrix JSON string to `GITHUB_OUTPUT` key `build_matrix`.
  - `pnpm smoke generate <fixture.json> <destDir>` materializes the generated repo into `destDir` (used by the workflow before running west).
  - `pnpm smoke verify <fixture.json> <matrix-json> <build-dir>` checks `zephyr/build.log` for warnings/errors, verifies at least one firmware artifact exists (uf2/hex/bin/elf), writes a summary to stdout and `GITHUB_STEP_SUMMARY`, and fails on errors or missing artifacts/log.

- Workflow [.github/workflows/smoke.yml](.github/workflows/smoke.yml):
  - Manual dispatch.
  - Lists fixtures via `pnpm run smoke list` and fans out to `smoke-single.yml` for each JSON path.

- Workflow [.github/workflows/smoke-single.yml](.github/workflows/smoke-single.yml):
  - Step `pnpm run smoke build.yaml <json>` emits the matrix for the build job.
  - Build job runs in `zmkfirmware/zmk-build-arm:stable`, installs pnpm deps, generates the repo into a temp dir with `pnpm run smoke generate ...`, then runs `west build ... | tee build.log` using `-DZMK_CONFIG` and `-DZMK_EXTRA_MODULES` pointing at the generated repo. Finally calls `pnpm run smoke verify ...` to validate logs and artifacts.
  - If `verify` finds errors or missing artifacts/logs it exits non-zero and fails the job. Warnings are reported but do not fail the job.

## Notes for build command construction

- `build.yaml` `include` entries supply `board`, optional `shield`, optional `snippet`, and optional `cmake-args`. Build command in the workflow:
  - `west build -s zmk/app -d <buildDir> -b <board> [-S <snippet>] -- -DZMK_CONFIG=<repo>/config -DZMK_EXTRA_MODULES=<repo> [-DSHIELD=<shield>] <cmake-args>`
- Workspace prep per repo: `west init -l config`, `west update --fetch-opt=--filter=tree:0`, `west zephyr-export`.
- Firmware validation in `verify` looks for `zmk.uf2`, `zmk.hex`, `zmk.bin`, or `zephyr.elf` under `<buildDir>/zephyr`.

## References

- [ZMK build-user-config workflow](https://github.com/zmkfirmware/zmk/blob/v0.3-branch/.github/workflows/build-user-config.yml)
- [Unified ZMK config template workflow](https://github.com/zmkfirmware/unified-zmk-config-template/blob/main/.github/workflows/build.yml)
- [Native toolchain setup](https://zmk.dev/docs/development/local-toolchain/setup/native)
- [Diagnosing build issues](https://zmk.dev/docs/troubleshooting/building-issues#diagnosing-unexpected-build-results)
