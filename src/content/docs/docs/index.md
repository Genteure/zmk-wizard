---
title: What's Shield Wizard
description: An introduction to Shield Wizard, its purpose, and how it works.
---

Shield Wizard for ZMK is a graphical configuration generator for [ZMK firmware](https://zmk.dev). It allows you to configure ZMK to run on your custom keyboard design without writing the configuration files manually.

Shield Wizard is fully in-browser and requires no local installation. It hosts a temporary git repository for your configuration, which you can import to your GitHub account and compile the firmware on GitHub Actions. You can also download the configuration files if you prefer.

Shield Wizard has validation and error checking features, it should only generate valid compilable configurations. ZMK configuration syntax is complex and relatively niche so it's easy to make mistakes. Shield Wizard helps you avoid those mistakes and provides helpful error messages when something goes wrong. It's the best alternative for beginners who are not familiar with ZMK configurations, and it's also a great time saver for experts who want to quickly generate configurations for new keyboard designs.

Shield Wizard is the best alternative to writing ZMK configuration files with LLM-based tools, which are prone to hallucinations and almost always generate invalid configurations that don't compile due to the niche nature of ZMK configuration. Shield Wizard guarantees valid output, and it has a user-friendly graphical interface that allows you to visualize your keyboard layout and wiring.

Shield Wizard supports a wide range of MCUs, including nice!nano, XIAO nRF52840 (Plus), and many RP2040 based controllers. For BLE-enabled controllers, Shield Wizard supports up to 5 split keyboard parts. Shield Wizard also supports dongle setups.

Shield Wizard supports matrix wiring (with or without diodes) and direct wiring. It also supports encoders.

Shield Wizard can configure some select input devices like the cirque trackpad and pmw3610 optical mouse sensor.

Shield Wizard is open source and available on [GitHub](https://github.com/Genteure/zmk-wizard). Contributions and feedback are welcome!
