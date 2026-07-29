# Shield Wizard for ZMK

<https://shield-wizard.genteure.com>

A web-based graphical tool for creating custom ZMK keyboard (shield) configurations. Get ZMK firmware for your custom keyboard without writing any code!

Browser based workflow, no local tooling required. Shield Wizard for ZMK hosts temporary git repositories for you to import into your own GitHub account.

Supported ZMK features:

- Unibody and split keyboards with up to 5 split parts
- The most common controller boards, including nRF52840-based and RP2040-based boards
- Matrix, direct, and Charlieplex wiring, as well as a mix of all three
- 595 shift registers
- Rotary encoders
- A variety of SPI/I2C peripherals, including:
  - SSD1306 and nice!view displays
  - WS2812 RGB LEDs
- Selected external modules, for pointing devices (PMW3610, Cirque trackpads)

All generated configurations are intended to work out of the box. Please report all non-working configurations, regardless compilation or runtime issues, by opening an issue on this repository.

## Development

`pnpm` is the package manager used for this project.

Install node (see `.node-version`), pnpm, and then run:

```bash
pnpm install
pnpm dev
```

See `package.json` for the list of commands (dev, build, check, etc.).

## Contributing

Contributions are welcome!

I'm taking a relaxed approach to contributions for this project, which means
I'll likely accept any changes that improve the project in some way, but for larger
changes, please open an issue or discuss them with me on the [ZMK Community Discord](https://zmk.dev/community/discord/invite) first.

## License

This project is licensed under the MIT License.

## Acknowledgements

This project used/referenced code from these projects:

- <https://github.com/zmkfirmware/zmk/>
- <https://github.com/nickcoutsos/keymap-layout-tools>
