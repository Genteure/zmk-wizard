# Shield Wizard for ZMK

A web-based tool to create ZMK configurations for custom keyboards.

## Usage

`https://placeholder.example.com`

## Development

```bash
pnpm i
pnpm dev
pnpm test
```

If you're having trouble installing tree-sitter with the error `.../include/node/v8config.h:13:2: error: #error "C++20 or later required."`, `export CXXFLAGS="-std=c++20"` then run `pnpm rb` to rebuild.

## License

This project is licensed under the MIT License.

## Acknowledgements

This project used/referenced code from these projects:

- <https://github.com/zmkfirmware/zmk/>
- <https://github.com/nickcoutsos/keymap-layout-tools>
- <https://github.com/marsidev/react-turnstile>
