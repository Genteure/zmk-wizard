<template>
  <div class="flex flex-wrap items-center justify-center gap-2 m-2">
    <UDropdownMenu :items="layoutTools">
      <UButton icon="i-lucide-menu" :label="$t('tools-label')" color="neutral" variant="outline" />
    </UDropdownMenu>
    <UButton :label="$t('add-key')" icon="i-lucide-plus" color="neutral" variant="outline" @click="keyboard.addKey()" />
    <UFieldGroup>
      <UDropdownMenu :items="assignPartItems">
        <UButton :label="$t('assign-part')" color="neutral" variant="outline" :disabled="!selection.selectedCount" />
      </UDropdownMenu>
      <UButton :label="$t('delete-selected')" color="error" variant="outline" :disabled="!selection.selectedCount"
        @click="keyboard.deleteSelected()" />
    </UFieldGroup>
  </div>
  <!-- TODO: Optimize performance. It's a bit abysmal right now. -->
  <UTable sticky :virtualize="{ estimateSize: 41, overscan: 5 }" :get-row-id="key => key.id" :columns="columns"
    v-model:row-selection="selection.rowSelection" :data="keyboard.layout"
    :ui="{ td: 'px-2 py-1', th: 'p-2 text-center' }" class="flex-1 h-full">
    <template #select-header="{ table }">
      <UCheckbox :model-value="table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected()"
        @update:model-value="value => table.toggleAllPageRowsSelected(!!value)" :aria-label="$t('table-select-all')" />
    </template>

    <template #select-cell="{ row }">
      <UCheckbox :model-value="row.getIsSelected()" :aria-label="$t('table-select-key', { index: row.index })"
        @update:model-value="value => row.toggleSelected(!!value)" />
    </template>

    <template #row-header>{{ $t('table-header-row') }}</template>
    <template #col-header>{{ $t('table-header-col') }}</template>
    <template #x-header>{{ $t('table-header-x') }}</template>
    <template #y-header>{{ $t('table-header-y') }}</template>
    <template #w-header>{{ $t('table-header-w') }}</template>
    <template #h-header>{{ $t('table-header-h') }}</template>
    <template #r-header>{{ $t('table-header-r') }}</template>
    <template #rx-header>{{ $t('table-header-rx') }}</template>
    <template #ry-header>{{ $t('table-header-ry') }}</template>

    <template #row-cell="{ row }">
      <PopoverInputNumber input-type="integer" v-model="row.original.row"
        :title="$t('table-cell-title', { prop: 'row', index: row.index })" />
    </template>
    <template #col-cell="{ row }">
      <PopoverInputNumber input-type="integer" v-model="row.original.col"
        :title="$t('table-cell-title', { prop: 'col', index: row.index })" />
    </template>
    <template #x-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.x"
        :title="$t('table-cell-title', { prop: 'x', index: row.index })" />
    </template>
    <template #y-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.y"
        :title="$t('table-cell-title', { prop: 'y', index: row.index })" />
    </template>
    <template #w-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.w"
        :title="$t('table-cell-title', { prop: 'w', index: row.index })" />
    </template>
    <template #h-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.h"
        :title="$t('table-cell-title', { prop: 'h', index: row.index })" />
    </template>
    <template #r-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.r"
        :title="$t('table-cell-title', { prop: 'r', index: row.index })" />
    </template>
    <template #rx-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.rx"
        :title="$t('table-cell-title', { prop: 'rx', index: row.index })" />
    </template>
    <template #ry-cell="{ row }">
      <PopoverInputNumber input-type="float" v-model="row.original.ry"
        :title="$t('table-cell-title', { prop: 'ry', index: row.index })" />
    </template>
  </UTable>

  <UModal v-model:open="importOpen" :title="$t('tools-import')">
    <template #body>
      <div class="flex flex-col gap-3">
        <UTextarea v-model="importText" :rows="12"
          :placeholder="$t('tools-import-placeholder', { format: importFormat })" class="w-full font-mono text-sm" />
        <p v-if="importError" class="text-sm text-error">{{ importError }}</p>
        <UButton :label="$t('tools-import-confirm')" color="primary" class="w-full justify-center"
          :disabled="!importText.trim()" @click="doImport" />
      </div>
    </template>
  </UModal>
  <UModal v-model:open="exportOpen" :title="$t('tools-export')">
    <template #body>
      <div class="flex flex-col gap-3">
        <UTextarea :model-value="exportText" :rows="12" readonly class="w-full font-mono text-sm" />
        <UButton :label="exportCopied ? $t('tools-export-copied') : $t('tools-export-copy')" color="primary"
          class="w-full justify-center" @click="copyExport" />
      </div>
    </template>
  </UModal>
  <UModal v-model:open="presetOpen" :title="$t('tools-load-preset')">
    <template #body>
      <div class="flex flex-col gap-3">
        <div
          class="w-full h-48 flex items-center justify-center border rounded border-muted bg-muted text-sm text-muted select-none">
          <div>{{ $t('no-preview-yet') }}</div>
        </div>
        <USelectMenu v-model="presetSelected" :items="presetEntries" value-key="value"
          :placeholder="$t('tools-load-preset-placeholder')" class="w-full" />
        <UButton :label="$t('tools-load-preset-confirm')" color="primary" class="w-full justify-center"
          :disabled="!presetSelected" @click="loadPreset" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui';
import { useFluent } from 'fluent-vue';
import { computed, nextTick, onMounted, ref } from 'vue';
import type { Key } from '~/types';

import { useKeyboardStore, useSelectionStore } from '../stores';
import { parsePhysicalLayoutDts, parseLayoutJson, parseKleJson, parseCsv, exportKleJson, exportCsv } from './utils/layouthelper';
import { exportPhysicalLayoutDts } from '~/export/shield';
import { config_json } from '~/export/contents';
import { getLayouts } from '~/lib/physicalLayouts';
import PopoverInputNumber from './utils/PopoverInputNumber.vue';

const { $t } = useFluent();

const toast = useToast();

const keyboard = useKeyboardStore();
const selection = useSelectionStore();

const PART_AVATAR_COLORS = [
  'text-part0',
  'text-part1',
  'text-part2',
  'text-part3',
  'text-part4',
];

const PART_COLORS = [
  'part0',
  'part1',
  'part2',
  'part3',
  'part4',
] as ('part0' | 'part1' | 'part2' | 'part3' | 'part4')[];

const assignPartItems = computed<DropdownMenuItem[][]>(() => [
  keyboard.parts.map((p, i) => ({
    label: p.name,
    avatar: {
      text: i.toString(),
      color: PART_COLORS[i % PART_COLORS.length],
    },
    ui: {
      item: PART_AVATAR_COLORS[i % PART_AVATAR_COLORS.length],
    },
    onSelect() {
      const ids = selection.selectedIdSet;
      keyboard.$patch((state) => {
        for (const key of state.layout) {
          if (ids.has(key.id)) key.part = i;
        }
      });
    },
  })),
]);

const columns: TableColumn<Key>[] = [
  { id: 'select' },
  {
    id: 'index',
    header: '#',
    cell: ({ row }) => row.index,
    meta: {
      class: {
        td: 'text-center',
      }
    }
  },
  { id: 'row', },
  { id: 'col', },
  { id: 'x', },
  { id: 'y', },
  { id: 'w', },
  { id: 'h', },
  { id: 'r', },
  { id: 'rx', },
  { id: 'ry', },

];

// ─── Import/Export state ──────────────────────────────────────
const importOpen = ref(false);
const importText = ref('');
const importError = ref('');
const importFormat = ref<'dts' | 'qmk' | 'kle' | 'csv'>('dts');

const exportOpen = ref(false);
const exportText = ref('');
const exportCopied = ref(false);

function openImport(format: 'dts' | 'qmk' | 'kle' | 'csv') {
  importFormat.value = format;
  importText.value = '';
  importError.value = '';
  importOpen.value = true;
}

function doImport() {
  const text = importText.value;
  let parsed: Key[] | null = null;

  if (importFormat.value === 'dts') {
    parsed = parsePhysicalLayoutDts(text);
  } else if (importFormat.value === 'qmk') {
    parsed = parseLayoutJson(text);
  } else if (importFormat.value === 'kle') {
    parsed = parseKleJson(text);
  } else {
    parsed = parseCsv(text);
  }

  if (!parsed) {
    importError.value = $t('tools-import-error');
    return;
  }

  keyboard.$patch({ layout: parsed });
  importOpen.value = false;
}

function openExport(format: 'dts' | 'json' | 'kle' | 'csv') {
  if (format === 'dts') {
    exportText.value = exportPhysicalLayoutDts(keyboard.$state);
  } else if (format === 'json') {
    exportText.value = config_json(keyboard.$state);
  } else if (format === 'kle') {
    exportText.value = exportKleJson(keyboard.layout);
  } else {
    exportText.value = exportCsv(keyboard.layout);
  }
  exportCopied.value = false;
  exportOpen.value = true;
}

async function copyExport() {
  await navigator.clipboard.writeText(exportText.value);
  exportCopied.value = true;
  setTimeout(() => { exportCopied.value = false; }, 1200);
}
// ─── Preset loading ──────────────────────────────────────────
const presetOpen = ref(false);
const presetSelected = ref('');

const presetEntries = computed(() => {
  const layouts = getLayouts();
  const entries: { label: string; value: string; keys: Key[] }[] = [];
  for (const [category, items] of Object.entries(layouts)) {
    for (const item of items) {
      entries.push({
        label: `${category} — ${item.name}`,
        value: `${category}—${item.name}`,
        keys: item.keys,
      });
    }
  }
  return entries;
});

function loadPreset() {
  const entry = presetEntries.value.find(e => e.value === presetSelected.value);
  if (!entry) return;

  keyboard.$patch({ layout: structuredClone(entry.keys) });
  keyboard.sortLayout();

  presetOpen.value = false;
  presetSelected.value = '';
}

const layoutTools = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: $t('tools-bootstrap'),
      onSelect() {
        // TODO implement bootstrap layout generation
        toast.add({
          title: "Not Implemented Yet",
          description: "Bootstrap layout is not implemented yet. Please use presets or import layouts for now.",
          color: 'warning',
        })
      },
    },
    {
      label: $t('tools-load-preset'),
      onSelect() { presetOpen.value = true; },
    },
    {
      label: $t('tools-convert'),
      children: [
        {
          label: $t('tools-convert-p2k'),
        },
        {
          label: $t('tools-convert-k2p'),
        },
      ],
    },
  ],
  [
    {
      label: $t('tools-import-zmk'),
      onSelect() { openImport('dts'); },
    },
    {
      label: $t('tools-import-qmk'),
      onSelect() { openImport('qmk'); },
    },
    {
      label: $t('tools-import-kle'),
      onSelect() { openImport('kle'); },
    },
    {
      label: $t('tools-import-csv'),
      onSelect() { openImport('csv'); },
    },
  ],
  [
    {
      label: $t('tools-export-zmk'),
      onSelect() { openExport('dts'); },
    },
    {
      label: $t('tools-export-json'),
      onSelect() { openExport('json'); },
    },
    {
      label: $t('tools-export-kle'),
      onSelect() { openExport('kle'); },
    },
    {
      label: $t('tools-export-csv'),
      onSelect() { openExport('csv'); },
    }
  ],
  [
    {
      label: $t('tools-external-kicad'),
      to: 'https://nickcoutsos.github.io/keymap-layout-tools/',
      target: '_blank',
    },
    {
      label: $t('tools-external-kle-ng'),
      to: 'https://editor.keyboard-tools.xyz/',
      target: '_blank',
    }
  ],
]);
</script>

<ftl locale="en">
table-select-all = Select All
table-select-key = Select Key { $index }

table-cell-title = Edit { $prop ->
  [row] row
  [col] column
  [x] x position
  [y] y position
  [w] width
  [h] height
  [r] rotation
  [rx] rotation origin x
  [ry] rotation origin y
  *[other] { $prop }
} for Key { $index }

table-header-row = Row
table-header-col = Col
table-header-x = X
table-header-y = Y
table-header-w = W
table-header-h = H
table-header-r = R
table-header-rx = RX
table-header-ry = RY

add-key = Add Key
assign-part = Assign To Part
delete-selected = Delete Selected

tools-label = Tools
tools-bootstrap = Bootstrap Layout
tools-load-preset = Load Preset
tools-load-preset-placeholder = Select a preset layout…
tools-load-preset-confirm = Replace Layout
tools-convert = Convert
tools-convert-p2k = Physical Layout -> Keymap Layout
tools-convert-k2p = Keymap Layout -> Physical Layout
tools-import = Import
tools-import-zmk = Import ZMK Physical Layout DTS
tools-import-qmk = Import QMK-like Layout JSON
tools-import-kle = Import KLE / VIA / VIAL JSON
tools-import-csv = Import CSV
tools-export = Export
tools-export-zmk = Export ZMK Physical Layout DTS
tools-export-json = Export Layout JSON
tools-export-kle = Export KLE JSON
tools-export-csv = Export CSV
tools-import-error = Unable to parse layout data.
tools-import-placeholder = Paste { $format ->
  [dts] ZMK Physical Layout DTS
  [qmk] QMK-like Layout JSON
  [kle] KLE / VIA / VIAL JSON
  [csv] CSV layout data
  *[other] layout data
} here…
tools-import-confirm = Import
tools-export-copy = Copy
tools-export-copied = Copied!
tools-external-kicad = KiCAD PCB -> Layout JSON
tools-external-kle-ng = Keyboard Layout Editor NG

no-preview-yet = Preview not implemented yet
</ftl>

<ftl locale="zh-CN">
table-select-all = 全选
table-select-key = 选择按键 { $index }

table-cell-title = 编辑按键{ $index }的{ $prop ->
  [row] 行
  [col] 列
  [x] X坐标
  [y] Y坐标
  [w] 宽度
  [h] 高度
  [r] 旋转
  [rx] 旋转原点X
  [ry] 旋转原点Y
  *[other] { $prop }
}

table-header-row = 行
table-header-col = 列
table-header-x = X
table-header-y = Y
table-header-w = 宽
table-header-h = 高
table-header-r = R
table-header-rx = RX
table-header-ry = RY

add-key = 添加按键
assign-part = 更改归属
delete-selected = 删除选中

tools-label = 工具
tools-bootstrap = 初始化布局
tools-load-preset = 加载预设
tools-load-preset-placeholder = 选择预设布局…
tools-load-preset-confirm = 替换布局
tools-convert = 转换
tools-convert-p2k = 物理布局 -> 键映射布局
tools-convert-k2p = 键映射布局 -> 物理布局
tools-import = 导入
tools-import-zmk = 导入 ZMK 物理布局 DTS
tools-import-qmk = 导入类 QMK 风格的布局 JSON
tools-import-kle = 导入 KLE / VIA / VIAL JSON
tools-import-csv = 导入 CSV
tools-export = 导出
tools-export-zmk = 导出 ZMK 物理布局 DTS
tools-export-json = 导出布局 JSON
tools-export-kle = 导出 KLE JSON
tools-export-csv = 导出 CSV
tools-import-error = 无法解析布局数据。
tools-import-placeholder = 在此粘贴{ $format ->
  [dts] ZMK 物理布局 DTS
  [qmk] 类 QMK 布局 JSON
  [kle] KLE / VIA / VIAL JSON
  [csv] CSV 布局数据
  *[other] 布局数据
}…
tools-import-confirm = 导入
tools-export-copy = 复制
tools-export-copied = 已复制！
tools-external-kicad = KiCAD PCB -> 布局 JSON
tools-external-kle-ng = Keyboard Layout Editor NG

no-preview-yet = 预览尚未实现
</ftl>

<ftl locale="ja">
table-select-all = すべて選択
table-select-key = キー { $index } を選択

table-cell-title = キー{ $index }の{ $prop ->
  [row] 行
  [col] 列
  [x] X座標
  [y] Y座標
  [w] 幅
  [h] 高さ
  [r] 回転
  [rx] 回転原点X
  [ry] 回転原点Y
  *[other] { $prop }
}を編集

table-header-row = 行
table-header-col = 列
table-header-x = X
table-header-y = Y
table-header-w = 幅
table-header-h = 高さ
table-header-r = R
table-header-rx = RX
table-header-ry = RY

add-key = キーを追加
assign-part = 所属変更
delete-selected = 選択を削除

tools-label = ツール
tools-bootstrap = レイアウト初期化
tools-load-preset = プリセット読み込み
tools-load-preset-placeholder = プリセットレイアウトを選択…
tools-load-preset-confirm = レイアウトを置換
tools-convert = 変換
tools-convert-p2k = 物理レイアウト -> キーマップレイアウト
tools-convert-k2p = キーマップレイアウト -> 物理レイアウト
tools-import = インポート
tools-import-zmk = ZMK 物理レイアウト DTS インポート
tools-import-qmk = QMK 風レイアウト JSON インポート
tools-import-kle = KLE / VIA / VIAL JSON インポート
tools-import-csv = CSV インポート
tools-export = エクスポート
tools-export-zmk = ZMK 物理レイアウト DTS エクスポート
tools-export-json = レイアウト JSON エクスポート
tools-export-kle = KLE JSON エクスポート
tools-export-csv = CSV エクスポート
tools-import-error = レイアウトデータを解析できません。
tools-import-placeholder = { $format ->
  [dts] ZMK 物理レイアウト DTS
  [qmk] QMK 風レイアウト JSON
  [kle] KLE / VIA / VIAL JSON
  [csv] CSV レイアウトデータ
  *[other] レイアウトデータ
}をここに貼り付け…
tools-import-confirm = インポート
tools-export-copy = コピー
tools-export-copied = コピーしました！
tools-external-kicad = KiCAD PCB -> レイアウト JSON
tools-external-kle-ng = Keyboard Layout Editor NG

no-preview-yet = プレビューはまだ実装されていません
</ftl>
