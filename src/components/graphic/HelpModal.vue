<template>
  <UModal title="Interaction Guide">
    <UButton icon="i-lucide-circle-question-mark" color="neutral" variant="ghost" class="shrink-0" />
    <template #body>
      <div class="space-y-5 text-sm max-h-[70vh] overflow-y-auto pr-2">

        <!-- ── Navigation ───────────────────────────────────── -->
        <section>
          <h3 class="font-semibold mb-2">Navigation</h3>
          <p class="text-muted mb-2">Works in all modes.</p>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in navigationRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted">{{ row[1] }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <USeparator />

        <!-- ── Layout Mode ──────────────────────────────────── -->
        <section>
          <h3 class="font-semibold mb-2">Layout Mode <span class="text-muted font-normal">(Layout tab)</span></h3>
          <p class="text-muted mb-2">Select, move, and rotate keys. Toolbar shows Pan and Select tools.</p>

          <h4 class="font-medium mb-1 mt-3">Click Selection</h4>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in selectionRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium mb-1 mt-3">Box Selection <span class="text-muted font-normal">(drag on canvas)</span></h4>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in boxSelectRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium mb-1 mt-3">Move <span class="text-muted font-normal">(drag the move handle at bounding box center)</span></h4>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in moveRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium mb-1 mt-3">Rotate <span class="text-muted font-normal">(drag the rotate handle above bounding box)</span></h4>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in rotateRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium mb-1 mt-3">Context Menu <span class="text-muted font-normal">(right-click)</span></h4>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in contextMenuRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>
        </section>

        <USeparator />

        <!-- ── Keyboard Mode ────────────────────────────────── -->
        <section>
          <h3 class="font-semibold mb-2">Keyboard Mode <span class="text-muted font-normal">(Keyboard tab)</span></h3>
          <p class="text-muted">Read-only. No selection, no modification. Left-drag pans the canvas. Only universal shortcuts (zoom) apply.</p>
        </section>

        <USeparator />

        <!-- ── Parts Mode ───────────────────────────────────── -->
        <section>
          <h3 class="font-semibold mb-2">Parts Mode <span class="text-muted font-normal">(Parts tab)</span></h3>
          <p class="text-muted mb-2">Wire GPIO pins to keys. Keys in the active part are actionable; others are dimmed. Toolbar shows Pan and Wire tools.</p>
        </section>

        <USeparator />

        <!-- ── Keyboard Shortcuts ───────────────────────────── -->
        <section>
          <h3 class="font-semibold mb-2">Keyboard Shortcuts</h3>
          <p class="text-muted mb-2">Layout mode only, unless noted.</p>
          <table class="w-full text-sm">
            <tbody>
              <tr v-for="row in shortcutRows" :key="row[0]">
                <td class="pr-3 py-1 align-top whitespace-nowrap"><kbd-k :keys="row[0]" /></td>
                <td class="py-1 text-muted" v-html="row[1]" />
              </tr>
            </tbody>
          </table>
        </section>

      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// ─── Navigation ─────────────────────────────────────────────
const navigationRows: [string, string][] = [
  ['Scroll wheel', 'Zoom in/out centered on cursor'],
  ['⌘ + Scroll', 'Zoom with finer step'],
  ['Middle drag', 'Pan viewport'],
  ['⌘ + =', 'Zoom in'],
  ['⌘ + -', 'Zoom out'],
  ['⌘ + 0', 'Fit all content'],
  ['⌘ + 1', 'Zoom to 100%'],
  ['Space held', 'Temporary pan (release to restore tool)'],
];

// ── Layout: Click Selection ──
const selectionRows: [string, string][] = [
  ['Click entity', 'Select exclusively (deselect others)'],
  ['⇧ + Click entity', 'Toggle in/out of selection'],
  ['⌘ + Click entity', 'Toggle in/out of selection'],
  ['Click empty', 'Deselect all'],
  ['⇧ + Click empty', 'No-op (selection preserved)'],
];

// ── Layout: Box Selection ──
const boxSelectRows: [string, string][] = [
  ['Drag → right', 'Select <strong>fully enclosed</strong> keys'],
  ['Drag ← right', 'Select <strong>intersecting</strong> keys'],
  ['⇧ + Drag', '<strong>Add</strong> intersecting keys to selection'],
  ['⌥ + Drag', '<strong>Subtract</strong> intersecting keys (amber)'],
  ['Escape', 'Cancel box selection'],
];

// ── Layout: Move ──
const moveRows: [string, string][] = [
  ['Drag move handle', 'Move all selected (quantized to 0.25U)'],
  ['⇧ + Drag', 'Constrain to horizontal or vertical axis'],
];

// ── Layout: Rotate ──
const rotateRows: [string, string][] = [
  ['Drag rotate handle', 'Rotate around bounding box center'],
  ['⇧ + Drag', 'Snap to 15° increments'],
  ['⌥ + Drag', 'Rotate around each entity\'s own origin'],
];

// ── Layout: Context Menu ──
const contextMenuRows: [string, string][] = [
  ['Right-click entity', 'Copy, Paste, Duplicate, Delete, Mirror'],
  ['Right-click empty', 'Paste, Select All, Zoom to Fit'],
];

// ── Keyboard Shortcuts ──
const shortcutRows: [string, string][] = [
  ['Delete / Backspace', 'Delete selected'],
  ['Escape', 'Deselect all / cancel drag'],
  ['⌘ + A', 'Select all'],
  ['⌘ + C', 'Copy to clipboard'],
  ['⌘ + V', 'Paste from clipboard'],
  ['⌘ + D', 'Duplicate in place'],
  ['⌘ + Z', 'Undo'],
  ['⌘ + ⇧ + Z', 'Redo'],
  ['Arrow keys', 'Nudge 0.25U in direction'],
  ['⇧ + Arrow', 'Nudge 1U in direction'],
  ['R', 'Rotate 30° clockwise'],
  ['⇧ + R', 'Rotate 30° counter-clockwise'],
  ['G', 'Toggle grid snap'],
];
</script>
