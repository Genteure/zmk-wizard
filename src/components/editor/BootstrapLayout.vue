<template>
  <UModal v-model:open="open" :title="$t('title')">
    <template #body>
      <div class="flex flex-col gap-3">
        <!-- Preview -->
        <div
          class="w-full h-48 flex items-center justify-center border rounded border-muted bg-muted select-none overflow-hidden">
          <LayoutPreview :keys="bootstrapKeys" />
        </div>

        <!-- Tabs -->
        <UTabs v-model="activeTab" :items="tabItems">
          <template #grid>
            <div class="flex gap-4">
              <UFormField :label="$t('grid-cols')" class="flex-1">
                <UInputNumber v-model="cols" :min="1" :max="32" invertWheelChange class="w-full" />
              </UFormField>
              <UFormField :label="$t('grid-rows')" class="flex-1">
                <UInputNumber v-model="rows" :min="1" :max="16" invertWheelChange class="w-full" />
              </UFormField>
            </div>
          </template>
          <template #cols-thumbs>
            <div class="flex flex-col gap-2">
              <UFormField :label="$t('cols-thumbs-notation-label')" :error="notationError || undefined">
                <UInput v-model="notation" :placeholder="$t('cols-thumbs-notation-placeholder')"
                  class="font-mono w-full" />
              </UFormField>
              <i18n path="bootstrap-tip" tag="div" class="text-sm/snug">
                <template #tip_label="{ tipLabel }">
                  <span class="font-semibold">{{ tipLabel }}</span>
                </template>
              </i18n>
              <div>
                <div class="text-sm font-medium">{{ $t('examples-title') }}</div>
                <div class="flex gap-1 flex-wrap">
                  <UButton size="sm" variant="subtle" color="secondary" @click="notation = '333333+3> 3<+333333'">
                    {{ $t('corne-label') }}
                  </UButton>
                  <UButton size="sm" variant="subtle" color="secondary" @click="notation = '133333+3> 3<+333331'">
                    {{ $t('totem-label') }}
                  </UButton>
                  <UButton size="sm" variant="subtle" color="secondary" @click="notation = '444444 444444 555'">
                    {{ $t('ortho-numpad-label') }}
                  </UButton>
                  <UButton size="sm" variant="subtle" color="secondary"
                    @click="notation = '3L+2+55555+3>+1 44 5UUUU55'">
                    {{ $t('syntax-label') }}
                  </UButton>
                  <UButton size="sm" variant="subtle" color="secondary"
                    @click="notation = '2+5432+3 2+2r+2rr+2rrr 4+3^^^3^^3^33v3vv3vvv+4'">
                    {{ $t('showcase-label') }}
                  </UButton>
                </div>
              </div>
              <div>
                <div class="text-sm font-medium">{{ $t('syntax-title') }}</div>

                <div class="flex items-center justify-center">
                  <div>
                    <div class="font-mono">
                      <span class="inline-flex flex-col items-center align-top">
                        <span class="underline underline-offset-2 decoration-2 decoration-warning">
                          <span>3</span>
                          <span class="text-error">L</span>
                          <span>+2+</span>
                        </span>
                        <span
                          class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-warning shrink-0">1</span>
                      </span>
                      <span class="inline-flex flex-col items-center align-top">
                        <span class="underline underline-offset-2 decoration-2 decoration-success">55555</span>
                        <span
                          class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-success shrink-0">2</span>
                      </span>
                      <span class="inline-flex flex-col items-center align-top">
                        <span class="underline underline-offset-2 decoration-2 decoration-warning">
                          <span>+3</span>
                          <span class="text-error">></span>
                          <span>+1</span>
                        </span>
                        <span
                          class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-warning shrink-0">3</span>
                      </span>
                      <span class="bg-info/15">&nbsp;</span>
                      <span>44</span>
                      <span class="bg-info/15">&nbsp;</span>
                      <span>5</span>
                      <span class="text-error">UUUU</span>
                      <span>55</span>
                    </div>
                  </div>
                </div>

                <ul class="text-sm text-toned mt-2 list-disc list-outside pl-4">
                  <i18n path="syntax-separator" tag="li">
                    <template #uscore>
                      <span class="font-mono bg-info/15">_</span>
                    </template>
                    <template #space_char>
                      <span class="font-mono bg-info/15">&nbsp;</span>
                    </template>
                  </i18n>
                  <i18n path="syntax-consecutive" tag="li">
                    <template #badge_num>
                      <span
                        class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-success shrink-0 align-middle">2</span>
                    </template>
                  </i18n>
                  <i18n path="syntax-thumb" tag="li">
                    <template #plus_char>
                      <span class="font-mono bg-info/15">+</span>
                    </template>
                    <template #badge1_num>
                      <span
                        class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-warning shrink-0 align-middle">1</span>
                    </template>
                    <template #badge3_num>
                      <span
                        class="inline-flex size-5 items-center justify-center font-semibold select-none leading-none border-2 rounded-full border-warning shrink-0 align-middle">3</span>
                    </template>
                  </i18n>
                  <i18n path="syntax-modifiers" tag="li">
                    <template #up_chars>
                      <span class="font-mono text-error">^ u U</span>
                    </template>
                    <template #down_chars>
                      <span class="font-mono text-error">v V d D</span>
                    </template>
                    <template #left_chars>
                      <span class="font-mono text-error">&lt; L l</span>
                    </template>
                    <template #right_chars>
                      <span class="font-mono text-error">&gt; R r</span>
                    </template>
                  </i18n>
                </ul>
              </div>
            </div>
          </template>
        </UTabs>

        <UButton :label="$t('generate')" color="primary" class="w-full justify-center" @click="generate" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TabsItem } from '@nuxt/ui';
import { ulid } from 'ulidx';
import type { Key, KeyId } from '~/types';
import { parseNotation } from '~/lib/colsThumbsParser';
import { useFluent } from 'fluent-vue';
import { useKeyboardStore } from '../stores';
import LayoutPreview from '../graphic/LayoutPreview.vue';

const cols = ref(12);
const rows = ref(4);
const notation = ref('');
const notationError = ref('');

const bootstrapKeys = computed<Key[]>(() => {
  // access all reactive values before branch to ensure they are tracked
  const rowsValue = rows.value;
  const colsValue = cols.value;
  const trimmedNotation = notation.value.trim();

  const activeTabValue = activeTab.value;

  if (activeTabValue === 'grid') {
    const keys: Key[] = [];
    for (let r = 0; r < rowsValue; r++) {
      for (let c = 0; c < colsValue; c++) {
        keys.push({
          id: ulid() as KeyId,
          part: 0,
          row: r,
          col: c,
          x: c,
          y: r,
          w: 1,
          h: 1,
          r: 0,
          rx: 0,
          ry: 0,
        });
      }
    }
    return keys;
  }

  if (activeTabValue === 'cols-thumbs') {

    if (!trimmedNotation) return [];

    try {
      const { keymap, physical } = parseNotation(trimmedNotation);
      notationError.value = '';
      return keymap.map((km, i) => ({
        id: ulid() as KeyId,
        part: 0,
        row: km.y,
        col: km.x,
        x: physical[i].x,
        y: physical[i].y,
        w: 1,
        h: 1,
        r: 0,
        rx: 0,
        ry: 0,
      }));
    } catch (e) {
      notationError.value = e instanceof Error ? e.message : String(e);
      return [];
    }
  }

  return [];
});

const { $t } = useFluent();

const open = defineModel<boolean>('open', { required: true });

const keyboard = useKeyboardStore();

const activeTab = ref<'grid' | 'cols-thumbs'>('cols-thumbs');

const tabItems = computed<TabsItem[]>(() => [
  {
    label: $t('grid-tab'),
    slot: 'grid',
    value: 'grid',
  },
  {
    label: $t('cols-thumbs-tab'),
    slot: 'cols-thumbs',
    value: 'cols-thumbs',
  },
]);

function generate() {
  keyboard.$patch({ layout: structuredClone(bootstrapKeys.value) });
  keyboard.sortLayout();
  open.value = false;
}
</script>

<ftl locale="en">
title = Bootstrap Layout
grid-tab = Grid
cols-thumbs-tab = Cols + Thumbs Notation
grid-cols = Columns
grid-rows = Rows
generate = Bootstrap and Replace
cols-thumbs-notation-label = Notation string
cols-thumbs-notation-placeholder = e.g. 33333+3 2+333331
bootstrap-tip = {$tip_label}: You can always add/remove/adjust keys later in the editor, so don't worry about getting it perfect here.
  .tip-label = Tip
examples-title = Examples
corne-label = Corne
totem-label = TOTEM
ortho-numpad-label = Ortho + numpad
syntax-label = Syntax
showcase-label = Showcase
syntax-title = Syntax
syntax-separator = Use {$uscore} (underline) or {$space_char} (space) to separate sections.
syntax-consecutive = Consecutive numbers {$badge_num} represent the number of keys in each column, with each number representing a column.
syntax-thumb = The {$plus_char} symbol indicates thumb keys. Thumb keys before {$badge1_num} the column keys are left-aligned, while those after {$badge3_num} are right-aligned.
syntax-modifiers = Modifiers can be added to columns and thumbs. For columns, use {$up_chars} for up and {$down_chars} for down. For thumbs, use {$left_chars} for left and {$right_chars} for right.
</ftl>

<ftl locale="zh-CN">
title = 初始化布局
grid-tab = 网格
cols-thumbs-tab = 列 + 拇指键表达式
grid-cols = 列数
grid-rows = 行数
generate = 初始化并替换
cols-thumbs-notation-label = 表达式字符串
cols-thumbs-notation-placeholder = 例如 33333+3 2+333331
bootstrap-tip = {$tip_label}：之后随时可以在编辑器里添加/删除/调整按键，不用在这里一次性设置完美。
  .tip-label = 提示
examples-title = 示例
corne-label = Corne
totem-label = TOTEM
ortho-numpad-label = Ortho + numpad
syntax-label = 语法
showcase-label = 综合示例
syntax-title = 语法说明
syntax-separator = 使用 {$uscore}（下划线）或 {$space_char}（空格）分隔区域。
syntax-consecutive = 连续数字 {$badge_num} 表示每列的按键数量，每个数字代表一列。
syntax-thumb = {$plus_char} 符号表示拇指键。位于列键之前的 {$badge1_num} 拇指键左对齐，之后的 {$badge3_num} 右对齐。
syntax-modifiers = 可以为列和拇指键添加修饰符。列使用 {$up_chars} 表示向上，{$down_chars} 表示向下。拇指键使用 {$left_chars} 表示向左，{$right_chars} 表示向右。
</ftl>

<ftl locale="ja">
title = 初期レイアウト作成
grid-tab = グリッド
cols-thumbs-tab = 列 + サムキー表記
grid-cols = 列数
grid-rows = 行数
generate = 生成して置換
cols-thumbs-notation-label = 表記文字列
cols-thumbs-notation-placeholder = 例: 33333+3 2+333331
bootstrap-tip = {$tip_label}: 後からいつでもエディターでキーの追加・削除・調整ができるので、ここで完璧にしようと気負わなくて大丈夫です。
  .tip-label = ヒント
examples-title = 例
corne-label = Corne
totem-label = TOTEM
ortho-numpad-label = Ortho + numpad
syntax-label = 構文
showcase-label = 応用例
syntax-title = 構文説明
syntax-separator = セクションの区切りには {$uscore}（アンダースコア）または {$space_char}（スペース）を使用します。
syntax-consecutive = 連続した数字 {$badge_num} は各列のキー数を表し、各数字が1つの列を示します。
syntax-thumb = {$plus_char} 記号はサムキーを示します。列キーの前の {$badge1_num} サムキーは左寄せ、後の {$badge3_num} は右寄せになります。
syntax-modifiers = 列とサムキーに修飾子を追加できます。列では {$up_chars} が上方向、{$down_chars} が下方向です。サムキーでは {$left_chars} が左方向、{$right_chars} が右方向です。
</ftl>
