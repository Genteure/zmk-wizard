---
title: About Layouts
description: The purpose and differences between Physical and Keymap layouts in Shield Wizard.
---

There are two layouts in Shield Wizard: Physical and Keymap.

## Physical Layout

Physical layout is for visual.

Physical layout is the visual representation of the physical design of the keyboard. It shows the actual position and shape of the keys on the keyboard.

It's used by both ZMK Studio and Keymap Editor to render the keymap.

- <https://zmk.dev/docs/features/studio>
- <https://zmk.studio/>
- <https://nickcoutsos.github.io/keymap-editor/>

## Keymap Layout

Keymap layout is for keymap (and NOT electrical wiring).

Keymap layout is the way you would represent the keys in a grid. It's the way you think about the logical relationship between the keys.

Keymap layout determines the order of the keys in the keymap file, and it's used by Shield Wizard to construct the matrix transform.

Keymap layout rows and columns are sometimes the same as the electrical wiring but not always. You should not try to force the keymap layout to match the electrical wiring.

## Making Layouts

If you're designing your PCB using KiCad, you can parse the KiCad PCB file with <https://nickcoutsos.github.io/keymap-layout-tools/>, optionally mirror using the "Transform..." button if it's a reversible design, fix keymap layout (Text Rendering) using "Re-order", then import the generated JSON into Shield Wizard.

If you're not using KiCad, Keyboard Layout Editor NG (<https://editor.keyboard-tools.xyz/>) is a good option for creating the physical layout.

If you're importing from VIA/VIAL/QMK, Shield Wizard can parse and use the electrical matrix as the keymap layout, which in some cases may create suboptimal keymaps. You should select the keys in Shield Wizard and use the move buttons in the Keymap Layout area to rearrange the keys.
