<!--
  Modified from https://github.com/nuxt/ui/blob/v4@{2026-Jun-1}/src/runtime/components/locale/LocaleSelect.vue
-->
<script setup lang="ts">
import type { Locale, SelectMenuProps } from '@nuxt/ui';
import { reactiveOmit } from '@vueuse/core';
import { useForwardProps } from 'reka-ui';

export interface LocaleSelectProps extends Omit<SelectMenuProps<Locale<any>[], 'code', false>, 'items' | 'modelValue'> {
  locales?: Locale<any>[]
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<LocaleSelectProps>(), {
  searchInput: false,
  valueKey: 'code',
  labelKey: 'name'
})

const selectMenuProps = useForwardProps(reactiveOmit(props, 'locales', 'clear'))

const modelValue = defineModel<string>({ required: true })

</script>

<template>
  <USelectMenu v-model="modelValue" v-bind="{ ...selectMenuProps, ...$attrs }"
    :clear="props.clear === false ? undefined : props.clear" :items="locales" />
</template>
