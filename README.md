# Shield Wizard for ZMK

A web-based graphical tool for creating custom ZMK shield configurations. Configure ZMK for your custom keyboard without writing code.

## Usage

`https://placeholder.example.com`

## Development

```bash
pnpm i
pnpm dev
pnpm test
```

If you're having trouble installing tree-sitter with the error `.../include/node/v8config.h:13:2: error: #error "C++20 or later required."`, `export CXXFLAGS="-std=c++20"` then run `pnpm rb` to rebuild.

### Environment Variables

- `PUBLIC_SITE_URL` - The base URL of the site (defaults to `https://placeholder.example.com`). Used for generating canonical URLs and Open Graph metadata.
- `PUBLIC_TURNSTILE_SITEKEY` - Cloudflare Turnstile site key for CAPTCHA verification (defaults to test key).
- `TURNSTILE_SECRET` - Cloudflare Turnstile secret key for server-side verification (optional).

## Contributing

Contributions are welcome!

I'm taking a lax approach to contributions for this project, which means I will likely accept any changes that improve the project in some way, but for larger changes please open an issue or discuss with me on the [ZMK Community Discord](https://zmk.dev/community/discord/invite) first.

## License

This project is licensed under the MIT License.

## Acknowledgements

This project used/referenced code from these projects:

- <https://github.com/zmkfirmware/zmk/>
- <https://github.com/nickcoutsos/keymap-layout-tools>
- <https://github.com/marsidev/react-turnstile>
