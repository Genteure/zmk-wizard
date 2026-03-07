---
title: Editing Layouts
description: Guide and tips for editing the physical and logical layouts in Shield Wizard.
---

Shield Wizard doesn't really have layout editing features yet, you're encouraged to make the layouts externally and import them into Shield Wizard.

If you're designing your PCB using KiCad, you can parse the KiCad PCB file with <https://nickcoutsos.github.io/keymap-layout-tools/>, optionally mirror using the "Transform..." button if it's a reversible design, fix logical layout (Text Rendering) using "Re-order", then import the generated JSON into Shield Wizard.

If you're not using KiCad, Keyboard Layout Editor NG (<https://editor.keyboard-tools.xyz/>) is a good option for creating the physical layout.

If you're importing from VIA/VIAL/QMK, Shield Wizard might parse and use the electrical matrix as the logical layout, which in some cases may create suboptimal keymaps. You should select the keys in Shield Wizard and use the move buttons in the Logical Layout area to rearrange the keys.
