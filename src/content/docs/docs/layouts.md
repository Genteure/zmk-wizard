---
title: About Layouts
description: The purpose and differences between Physical and Logical layouts in Shield Wizard.
---

There are two layouts in Shield Wizard: Physical and Logical.

## Physical Layout

TLDR: Physical layout is for visual.

Physical layout is the visual representation of the physical design of the keyboard. It shows the actual position and shape of the keys on the keyboard.

It's used by both ZMK Studio and Keymap Editor to render the keymap.

- <https://zmk.dev/docs/features/studio>
- <https://zmk.studio/>
- <https://nickcoutsos.github.io/keymap-editor/>

## Logical Layout

TLDR: Logical layout is for keymap, NOT electrical wiring.

Logical layout is the way you would represent the keys in a grid. It's the way you think about the logical relationship between the keys.

Logical layout determines the order of the keys in the keymap file, and it's used by Shield Wizard to construct the matrix transform.

Logical layout rows and columns are sometimes the same as the electrical wiring but not always. You should not try to force the logical layout to match the electrical wiring.
