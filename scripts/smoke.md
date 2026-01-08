# Smoke Test

This smoke test exercises every example keyboard fixture by generating a ZMK user repository and running real `west build` jobs in GitHub Actions. It is meant to catch regressions in templating and build setup, not to fully validate runtime behavior.

## Fixtures

- Fixtures live under `examples/json`. Each fixture is a `Keyboard` JSON in the internal format defined in `typedef.ts`.
- Matrix fan-out uses the relative POSIX paths (e.g. `unibody/rpi_pico_basic.json`).

## Helper script: [scripts/smoke.ts](scripts/smoke.ts)

- `pnpm run smoke list` finds all fixture JSON files under `examples/json`, prints a sorted JSON array, and writes it to the `json-files` output when running in Actions.
- `pnpm run smoke generate <fixture.json> <destDir>`
  - Validates the fixture (`KeyboardSchema` + `validateKeyboard`).
    This catches issues like missing required fields or invalid pin assignments before attempting to generate files. It provides distintion between schema validation errors (possible when schema was updated) and templating errors.
  - Generates the ZMK configuration via `createZMKConfig` and writes files into `<destDir>`.
  - Builds the Actions matrix JSON from the generated `build.yaml` and writes it to the `build_matrix` output. While building the matrix it:
    - Uncomments any lines after the `---` document separator so the optional sample builds in `build.yaml` are enabled for the smoke test.
    - Drops any entries whose `shield` contains `settings_reset`. Settings reset firmware are exactly the same across all builds, if they fail it's a problem with ZMK itself.

The generated matrix is the exact object consumed by the `build` job in `smoke-single.yml` (typically an `include` array with `board`, optional `shield`, optional `snippet`, optional `cmake-args`, and optional `artifact-name`).

## GitHub Actions flow

### [.github/workflows/smoke.yml](.github/workflows/smoke.yml)

- Triggers on `push`, `pull_request`, and `workflow_dispatch`.
- Job `smoke`: checks out the repo, sets up pnpm/node, installs dependencies, and runs `pnpm run smoke list`. The resulting JSON array is exposed as the `json-files` output.
- Job `for-each-repo`: matrix fan-out over `json-files`, calling `smoke-single.yml` once per fixture. `fail-fast` is disabled so all fixtures attempt to build.

### [.github/workflows/smoke-single.yml](.github/workflows/smoke-single.yml)

Inputs

- `json-path` (required): fixture path relative to `examples/json`.
- `config_path` (should not be set, defaults to `config`): hardcoded path just to make GitHub Actions linter happy.

Job `matrix` – generate config and matrix

- Checks out the repo, installs pnpm deps, and creates a temp `config_workspace` directory.
- Runs `pnpm run smoke generate <json-path> <config_workspace>` to materialize the repo and emit the matrix JSON.
- Sanitizes `artifact_name` from `json-path` (prefixed with `zmk-config-`) and uploads the generated config as a short-lived artifact (1 day).
- Build matrix is eqiuivalent to reading from `build.yaml` in the standard `build-user-config.yml` workflow.
- Outputs: `artifact_name`, `build_matrix`, and `config_workspace`.

Job `build` – run west builds (container: `zmkfirmware/zmk-build-arm:stable`)

This largely matches the upstream ZMK reusable workflow [build-user-config.yml](https://github.com/zmkfirmware/zmk/blob/v0.3/.github/workflows/build-user-config.yml) with a few smoke-test tweaks.

- Instead of checking out the current repository, we download the generated config artifact into the same location (`${GITHUB_WORKSPACE}`).
- Run the same build steps as upstream.
  - With the output of `west build` being `tee`d into a log file.
- Instead of uploading firmware artifacts, we create a filtered log summary (lines matching `error|warn|fatal`) to make potential issues easier to find.
