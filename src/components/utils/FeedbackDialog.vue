<template>
  <UModal v-model:open="open" :title="$t('feedback-title')">
    <template #body>
      <form class="flex flex-col gap-4" @submit.prevent="submitFeedback">
        <USelect v-model="feedbackType" :items="feedbackTypeItems" :placeholder="$t('feedback-type-placeholder')" />

        <UTextarea v-model="feedbackText" :rows="5" :placeholder="$t('feedback-text-placeholder')" :maxlength="5000" />

        <p class="text-xs text-toned">
          {{ $t('feedback-snapshot-note') }}
        </p>

        <VueTurnstile v-model="captchaToken" :site-key="siteKey" class="cf-turnstile" />

        <p v-if="errorMsg" class="text-sm text-error">{{ errorMsg }}</p>

        <UButton type="submit" :label="$t('feedback-submit')" color="primary" class="w-full justify-center"
          :disabled="!canSubmit" :loading="isSubmitting" />
      </form>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useFluent } from 'fluent-vue';
import { computed, ref } from 'vue';
import VueTurnstile from 'vue-turnstile';
import { PUBLIC_TURNSTILE_SITEKEY } from 'astro:env/client';
import { actions } from 'astro:actions';
import { useKeyboardStore, useNavigationStore } from '../stores';

const { $t } = useFluent();
const toast = useToast();
const keyboard = useKeyboardStore();
const nav = useNavigationStore();

const open = defineModel<boolean>('open', { default: false });
const feedbackType = ref<string>('bug');
const feedbackText = ref('');
const captchaToken = ref('');
const isSubmitting = ref(false);
const errorMsg = ref('');

const siteKey = PUBLIC_TURNSTILE_SITEKEY;

interface FeedbackItem { label: string; value: string; }

const feedbackTypeItems = computed<FeedbackItem[]>(() => [
  { label: $t('feedback-type-bug'), value: 'bug' },
  { label: $t('feedback-type-feature'), value: 'feature' },
  { label: $t('feedback-type-other'), value: 'other' },
]);

const canSubmit = computed(() =>
  !!feedbackType.value && feedbackText.value.trim().length > 0 && !!captchaToken.value
);

async function submitFeedback() {
  if (!canSubmit.value) return;

  isSubmitting.value = true;
  errorMsg.value = '';

  try {
    const { error } = await actions.sendFeedback({
      type: feedbackType.value as 'bug' | 'feature' | 'other',
      text: feedbackText.value,
      captcha: captchaToken.value,
      keyboardState: keyboard.$state,
      uiState: {
        activeTab: nav.activeTab,
        activePart: nav.activePart,
      },
    });
    if (error) {
      errorMsg.value = error.message;
      return;
    }

    toast.add({
      title: $t('feedback-success-title'),
      description: $t('feedback-success-desc'),
      color: 'success',
      icon: 'i-lucide-check-circle',
    });

    // Reset and close
    feedbackType.value = 'bug';
    feedbackText.value = '';
    captchaToken.value = '';
    open.value = false;
  } catch (e) {
    errorMsg.value = (e as Error).message;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<ftl locale="en">
feedback-title = Send Feedback
feedback-type-placeholder = Type of feedback…
feedback-type-bug = Bug Report
feedback-type-feature = Feature Request
feedback-type-other = Other / I'm Not Sure
feedback-text-placeholder = Describe your feedback…
feedback-snapshot-note = A snapshot of the current configuration will be sent along with the feedback for troubleshooting.
feedback-submit = Submit Feedback
feedback-success-title = Feedback Sent
feedback-success-desc = Thank you for your feedback!
</ftl>

<ftl locale="zh-CN">
feedback-title = 发送反馈
feedback-type-placeholder = 反馈类型…
feedback-type-bug = 错误报告
feedback-type-feature = 功能请求
feedback-type-other = 其他 / 我不确定
feedback-text-placeholder = 描述您的反馈…
feedback-snapshot-note = 当前配置的快照将与反馈一起发送，以便进行故障排除。
feedback-submit = 提交反馈
feedback-success-title = 反馈已发送
feedback-success-desc = 感谢您的反馈！
</ftl>

<ftl locale="ja">
feedback-title = フィードバックを送信
feedback-type-placeholder = フィードバックの種類…
feedback-type-bug = バグ報告
feedback-type-feature = 機能リクエスト
feedback-type-other = その他 / 不明
feedback-text-placeholder = フィードバックを入力…
feedback-snapshot-note = トラブルシューティングのため、現在の設定のスナップショットがフィードバックと一緒に送信されます。
feedback-submit = 送信
feedback-success-title = 送信完了
feedback-success-desc = フィードバックをお寄せいただきありがとうございます！
</ftl>
