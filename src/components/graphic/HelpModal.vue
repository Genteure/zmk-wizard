<template>
  <UModal :title="$t('help-title')">
    <UButton icon="i-lucide-circle-question-mark" color="neutral" variant="ghost" class="shrink-0" :aria-label="$t('help-open')" />
    <template #body>
      <div class="space-y-5 text-sm max-h-[70vh] overflow-y-auto pr-2">

        <USeparator :label="$t('help-general')" />
        <!-- ── General ──────────────────────────────────────── -->
        <section>
          <h4 class="font-medium m-1">{{ $t('help-panning') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-middle-drag') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-pan-canvas') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-pan-any-tool') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="space" /> held
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-temporary-pan') }}</td>
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium m-1 mt-3">{{ $t('help-zooming') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-scroll') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-zoom-centered') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" /> + scroll
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-fine-zoom') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="+" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-zoom-in') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="-" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-zoom-out') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="0" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-fit-all') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="1" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-reset-100') }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ── Wiring ───────────────────────────────────────── -->
        <USeparator :label="$t('help-wiring')" />
        <section>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-click-key') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-assign-pin') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-drag-across') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-assign-same-pin') }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ── Layout ───────────────────────────────────────── -->
        <USeparator :label="$t('help-layout')" />
        <section>
          <h4 class="font-medium m-1">{{ $t('help-selection') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-click-key') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-select') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-click-empty') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-deselect-all') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" /> /
                  <UKbd value="meta" /> + click
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-toggle-selection') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-drag-right') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-box-select-enclosed') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-drag-left') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-box-select-touching') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-add-to-selection') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="alt" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-subtract-from-selection') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="a" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-select-all') }}</td>
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium m-1 mt-3">{{ $t('help-move') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-drag-move') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-move-keys') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-constrain-axis') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="arrow" /> keys
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-nudge-quarter') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" /> +
                  <UKbd value="arrow" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-nudge-one') }}</td>
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium m-1 mt-3">{{ $t('help-rotate') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">{{ $t('help-drag-rotate') }}</td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-rotate-center') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-snap-15') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="alt" /> + drag
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-rotate-origin') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="r" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-rotate-cw') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="shift" />
                  <UKbd value="r" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-rotate-ccw') }}</td>
              </tr>
            </tbody>
          </table>

          <h4 class="font-medium m-1 mt-3">{{ $t('help-editing') }}</h4>
          <table class="m-1 w-full text-sm rounded-lg overflow-hidden ring-1 ring-default">
            <tbody class="divide-y divide-default">
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="delete" /> /
                  <UKbd value="backspace" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-delete-selection') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="c" /> /
                  <UKbd value="v" /> /
                  <UKbd value="d" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-copy-paste') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="z" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-undo') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="meta" />
                  <span> + </span>
                  <UKbd value="shift" />
                  <span> + </span>
                  <UKbd value="z" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-redo') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="escape" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-deselect-cancel') }}</td>
              </tr>
              <tr class="hover:bg-muted/30">
                <td class="pr-3 py-1.5 pl-2 align-top whitespace-nowrap">
                  <UKbd value="g" />
                </td>
                <td class="py-1.5 pr-2 text-muted">{{ $t('help-toggle-grid') }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </UModal>
</template>

<ftl locale="en">
help-title = Interactions
help-open = Open interaction help

help-general = General
help-wiring = Wiring
help-layout = Layout

help-panning = Panning
help-zooming = Zooming
help-selection = Selection
help-move = Move
help-rotate = Rotate
help-editing = Editing

help-middle-drag = Middle drag
help-pan-canvas = Pan canvas
help-pan-any-tool = Pan (any tool)
help-temporary-pan = Temporary pan — release to restore tool

help-scroll = Scroll
help-zoom-centered = Zoom centered on cursor
help-fine-zoom = Fine zoom
help-zoom-in = Zoom in
help-zoom-out = Zoom out
help-fit-all = Fit all content
help-reset-100 = Reset to 100%

help-click-key = Click key
help-assign-pin = Assign pin to key
help-drag-across = Drag across keys
help-assign-same-pin = Assign same pin to all touched keys

help-click-empty = Click empty
help-deselect-all = Deselect all
help-select = Select
help-toggle-selection = Toggle key in/out of selection
help-drag-right = Drag towards → right
help-box-select-enclosed = Box-select enclosed keys
help-drag-left = Drag towards ← left
help-box-select-touching = Box-select touching keys
help-add-to-selection = Add to selection
help-subtract-from-selection = Subtract from selection
help-select-all = Select all

help-drag-move = Drag move handle
help-move-keys = Move selected keys
help-constrain-axis = Constrain axis
help-nudge-quarter = Nudge 0.25 U
help-nudge-one = Nudge 1 U

help-drag-rotate = Drag rotate handle
help-rotate-center = Rotate around group center
help-snap-15 = Snap to 15°
help-rotate-origin = Rotate around each key's origin
help-rotate-cw = Rotate 30° CW
help-rotate-ccw = Rotate 30° CCW

help-delete-selection = Delete selection
help-copy-paste = Copy / Paste / Duplicate
help-undo = Undo
help-redo = Redo
help-deselect-cancel = Deselect / cancel drag
help-toggle-grid = Toggle grid overlay
</ftl>

<ftl locale="zh-CN">
help-title = 交互操作
help-open = 打开帮助

help-general = 通用
help-wiring = 接线
help-layout = 布局

help-panning = 平移
help-zooming = 缩放
help-selection = 选择
help-move = 移动
help-rotate = 旋转
help-editing = 编辑

help-middle-drag = 中键拖动
help-pan-canvas = 平移画布
help-pan-any-tool = 平移（任意工具）
help-temporary-pan = 临时平移模式 — 释放后恢复原工具

help-scroll = 滚动
help-zoom-centered = 以光标为中心缩放
help-fine-zoom = 精细缩放
help-zoom-in = 放大
help-zoom-out = 缩小
help-fit-all = 显示全部内容
help-reset-100 = 重置为 100%

help-click-key = 点击按键
help-assign-pin = 为按键分配引脚
help-drag-across = 拖过多按键
help-assign-same-pin = 为所有经过的按键分配相同引脚

help-click-empty = 点击空白处
help-deselect-all = 取消全选
help-select = 选择
help-toggle-selection = 切换按键选中状态
help-drag-right = 向右拖动
help-box-select-enclosed = 框选区域内的按键
help-drag-left = 向左拖动
help-box-select-touching = 框选触及的按键
help-add-to-selection = 添加到选区
help-subtract-from-selection = 从选区移除
help-select-all = 全选

help-drag-move = 拖动移动手柄
help-move-keys = 移动选中的按键
help-constrain-axis = 锁定轴向
help-nudge-quarter = 微调 0.25 U
help-nudge-one = 微调 1 U

help-drag-rotate = 拖动旋转手柄
help-rotate-center = 围绕组中心旋转
help-snap-15 = 吸附到 15°
help-rotate-origin = 围绕各按键原点旋转
help-rotate-cw = 顺时针旋转 30°
help-rotate-ccw = 逆时针旋转 30°

help-delete-selection = 删除选中项
help-copy-paste = 复制 / 粘贴 / 复制副本
help-undo = 撤销
help-redo = 重做
help-deselect-cancel = 取消选择 / 取消拖动
help-toggle-grid = 切换网格显示
</ftl>

<ftl locale="ja">
help-title = 操作ガイド
help-open = 操作ガイドを開く

help-general = 一般
help-wiring = 配線
help-layout = レイアウト

help-panning = パン
help-zooming = ズーム
help-selection = 選択
help-move = 移動
help-rotate = 回転
help-editing = 編集

help-middle-drag = 中ボタンドラッグ
help-pan-canvas = キャンバスをパン
help-pan-any-tool = パン（全ツール共通）
help-temporary-pan = 一時的にパンモード — 解除で元のツールに戻る

help-scroll = スクロール
help-zoom-centered = カーソル位置を中心にズーム
help-fine-zoom = 微調整ズーム
help-zoom-in = 拡大
help-zoom-out = 縮小
help-fit-all = 全体表示
help-reset-100 = 100% にリセット

help-click-key = キーをクリック
help-assign-pin = キーにピンを割り当て
help-drag-across = キーをまたいでドラッグ
help-assign-same-pin = ドラッグした全キーに同じピンを割り当て

help-click-empty = 空欄をクリック
help-deselect-all = すべて選択解除
help-select = 選択
help-toggle-selection = 選択の切り替え
help-drag-right = 右へドラッグ
help-box-select-enclosed = 矩形選択（内包）
help-drag-left = 左へドラッグ
help-box-select-touching = 矩形選択（接触）
help-add-to-selection = 選択に追加
help-subtract-from-selection = 選択から除外
help-select-all = すべて選択

help-drag-move = 移動ハンドルをドラッグ
help-move-keys = 選択キーを移動
help-constrain-axis = 軸方向に制約
help-nudge-quarter = 0.25 U ずつ移動
help-nudge-one = 1 U ずつ移動

help-drag-rotate = 回転ハンドルをドラッグ
help-rotate-center = グループ中心を軸に回転
help-snap-15 = 15° にスナップ
help-rotate-origin = 各キーの原点を軸に回転
help-rotate-cw = 時計回りに 30° 回転
help-rotate-ccw = 反時計回りに 30° 回転

help-delete-selection = 選択を削除
help-copy-paste = コピー / ペースト / 複製
help-undo = 元に戻す
help-redo = やり直し
help-deselect-cancel = 選択解除 / ドラッグキャンセル
help-toggle-grid = グリッド表示の切り替え
</ftl>

<script setup lang="ts">
</script>
