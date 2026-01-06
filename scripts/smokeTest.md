# Smoke Test

This smoke test exercises every example keyboard fixture by generating a ZMK user repository and running real `west build` jobs in GitHub Actions. It is meant to catch regressions in templating and build setup, not to validate runtime behavior.

TODO: this document is LLM generated, it's mostly correct but needs a bit of human polishing.

## Fixtures

- Fixtures live under `examples/json`. Each fixture is a `Keyboard` JSON in the internal format defined in `typedef.ts`.
- Matrix fan-out uses the relative POSIX paths (e.g. `unibody/rpi_pico_basic.json`).

## Helper script: [scripts/smoke.ts](scripts/smoke.ts)

- `pnpm run smoke list` finds all fixture JSON files under `examples/json`, prints a sorted JSON array, and writes it to the `json-files` output when running in Actions.
- `pnpm run smoke generate <fixture.json> <destDir>`
  - Validates the fixture (`KeyboardSchema` + `validateKeyboard`).
  - Generates the virtual repo via `createZMKConfig` and writes files into `<destDir>`.
  - Builds the Actions matrix JSON from the generated `build.yaml` and writes it to the `build_matrix` output. While building the matrix it:
    - Uncomments any lines after the `---` document separator so the optional sample builds in `build.yaml` are enabled for the smoke test.
    - Drops any entries whose `shield` contains `settings_reset` (those are not built in CI).

The generated matrix is the exact object consumed by the `build` job in `smoke-single.yml` (typically an `include` array with `board`, optional `shield`, optional `snippet`, optional `cmake-args`, and optional `artifact-name`).

## GitHub Actions flow

### [.github/workflows/smoke.yml](.github/workflows/smoke.yml)

- Triggers on `push`, `pull_request`, and `workflow_dispatch`.
- Job `smoke`: checks out the repo, sets up pnpm/node, installs dependencies, and runs `pnpm run smoke list`. The resulting JSON array is exposed as the `json-files` output.
- Job `for-each-repo`: matrix fan-out over `json-files`, calling `smoke-single.yml` once per fixture. `fail-fast` is disabled so all fixtures attempt to build.

### [.github/workflows/smoke-single.yml](.github/workflows/smoke-single.yml)

Inputs

- `json-path` (required): fixture path relative to `examples/json`.
- `config_path` (optional): path inside the generated artifact used as the west project root (defaults to `config`).

Job `matrix` – generate config and matrix

- Checks out the repo, installs pnpm deps, and creates a temp `config_workspace` directory.
- Runs `pnpm run smoke generate <json-path> <config_workspace>` to materialize the repo and emit the matrix JSON.
- Sanitizes `artifact_name` from `json-path` (prefixed with `zmk-config-`) and uploads the generated config as a short-lived artifact (1 day).
- Outputs: `artifact_name`, `build_matrix`, and `config_workspace`.

Job `build` – run west builds (container: `zmkfirmware/zmk-build-arm:stable`)

- Matrix is `fromJson(build_matrix)` so every `include` entry becomes a build.
- Downloads the generated config artifact, creates a temp build directory, and prepares env vars:
  - If `zephyr/module.yml` exists, treat the repo as a Zephyr module: set `-DZMK_EXTRA_MODULES` to the artifact path and move the working base to a fresh temp dir.
  - Optional `snippet` adds `-S <snippet>` to `west build`. `shield` and extra module path become `-DSHIELD=...` and part of `extra_cmake_args`.
- Copies the generated config into `base_dir` when needed, caches west modules (keyed by `west.yml`/`build.yaml`), then runs: `west init -l <config_path>`, `west update --fetch-opt=--filter=tree:0`, `west zephyr-export`, and `west build -s zmk/app ...` with the computed args.
- After each build it prints the sanitized `.config`, the Devicetree file, and appends a log summary that highlights lines containing `error|warn|fatal` (with a small ignore list). Build failures surface directly from the west command.

## Developing or debugging locally

- List fixtures: `pnpm run smoke list`.
- Generate a repo for inspection: `tmpdir=$(mktemp -d); pnpm run smoke generate examples/json/unibody/rpi_pico_basic.json "$tmpdir"; ls "$tmpdir"`.
- To mirror CI, run the build inside the `zmkfirmware/zmk-build-arm:stable` container with the same west commands shown above, using `config` as the project root.
