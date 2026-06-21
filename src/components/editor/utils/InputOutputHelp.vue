<template>
  <UModal :title="$t('title')">
    <UButton :label="$t('help-button-label')" icon="i-lucide-help-circle" variant="outline" color="neutral" size="sm" />

    <template #body>
      <div class="p-4">
        <div class="light bg-elevated rounded-lg">
          <div class="relative inline-block">
            <img :src="schematic.src" :alt="$t('alt-schematic')" draggable="false" />
            <span
              class="absolute left-[52%] top-[88%] -translate-y-1/2 bg-accented text-highlighted font-semibold rounded border-2 border-kscanin p-1">
              {{ $t('input') }}
            </span>
            <span
              class="absolute left-[52%] top-[35%] -translate-y-1/2 bg-accented text-highlighted font-semibold rounded border-2 border-kscanout p-1">
              {{ $t('output') }}
            </span>
          </div>
        </div>

        <div class="mt-4 text-sm text-toned space-y-3">
          <div>
            <i18n path="input-s1" tag="p" :args="{ input: $t('input') }">
              <template #input="{ input }">
                <span class="text-default font-semibold">{{ input }}</span>
              </template>
            </i18n>
            <p>{{ $t('input-s2') }}</p>
          </div>
          <div>
            <i18n path="output-s1" tag="p" :args="{ output: $t('output') }">
              <template #output="{ output }">
                <span class="text-default font-semibold">{{ output }}</span>
              </template>
            </i18n>
            <p>{{ $t('output-s2') }}</p>
          </div>
          <div>
            <p>{{ $t('key-s1') }}</p>
            <p>{{ $t('key-s2') }}</p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import schematic from '~/assets/schematic.svg';

const { $t } = useFluent();
</script>

<ftl locale="en">
input = Input
output = Output

title = Kscan {input} vs {output}
help-button-label = What's Input/Output?
alt-schematic = Input/output schematic

# s1 for "sentence 1"
input-s1 = {$input} (sensing) pins are reading signals on the lines.
    .input = {input}
input-s2 = They connect to the anode (positive terminal) of a diode.

output-s1 = {$output} (driving) pins are sending signals on the lines.
    .output = {output}
output-s2 = They connect to the cathode (negative terminal) of a diode.

key-s1 = Key switches can be before or after diodes.
key-s2 = The col2row/row2col direction will be calculated automatically based on wiring and layout.
</ftl>

<ftl locale="zh-CN">
input = 输入
output = 输出

title = Kscan {input}与{output}
help-button-label = 什么是输入/输出？
alt-schematic = 输入/输出接线示意图

input-s1 = {$input}（感应）引脚读取接线上的信号。
    .input = {input}
input-s2 = 它们连接到二极管的阳极。

output-s1 = {$output}（驱动）引脚在接线上发送信号。
    .output = {output}
output-s2 = 它们连接到二极管的阴极。

key-s1 = 键轴可以在二极管的前面或后面。
key-s2 = col2row/row2col的方向将根据接线和键盘布局自动计算。
</ftl>

<ftl locale="ja">
input = 入力
output = 出力

title = Kscan {input}と{output}
help-button-label = 入出力とは？
alt-schematic = 入出力の配線図

input-s1 = {$input}（検出）ピンは配線上の信号を読み取ります。
    .input = {input}
input-s2 = ダイオードのアノード（正極）に接続します。

output-s1 = {$output}（駆動）ピンは配線に信号を送出します。
    .output = {output}
output-s2 = ダイオードのカソード（負極）に接続します。

key-s1 = キースイッチはダイオードの前後に配置できます。
key-s2 = col2row/row2colの方向は配線とレイアウトに基づいて自動的に計算されます。
</ftl>
