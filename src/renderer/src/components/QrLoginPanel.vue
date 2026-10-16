<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { ScanLine, LoaderCircle, Check, RefreshCw } from "@lucide/vue";
import { useAccountStore } from "../stores/account";

const emit = defineEmits<{ complete: [] }>();
const account = useAccountStore();
const messages = {
  idle: "准备二维码",
  loading: "正在获取二维码…",
  waiting: "打开网易云音乐 App，扫码登录",
  confirming: "已扫码，请在手机上确认登录",
  expired: "二维码已过期",
  success: "登录成功，欢迎回来",
  error: "暂时无法连接",
};
const message = computed(() => messages[account.qrPhase]);
let completeTimer: ReturnType<typeof setTimeout>;
onMounted(() => void account.createQr());
watch(
  () => account.qrPhase,
  (phase) => {
    if (phase === "success")
      completeTimer = setTimeout(() => emit("complete"), 900);
  },
);
onUnmounted(() => {
  clearTimeout(completeTimer);
  account.cancelQr();
});
</script>

<template>
  <span class="modal-symbol"><ScanLine :size="30" /></span>
  <h2>扫码登录</h2>
  <p>连接你的网易云音乐账号，让喜欢的音乐继续。</p>
  <div class="qr-area" :aria-busy="account.qrPhase === 'loading'">
    <img
      v-if="account.qrImage"
      :src="account.qrImage"
      alt="使用网易云音乐 App 扫描此二维码"
      class="qr-image"
      :class="{
        'qr-obscured': ['expired', 'error', 'success', 'confirming'].includes(
          account.qrPhase,
        ),
      }"
    />
    <div v-if="account.qrPhase !== 'waiting'" class="qr-overlay">
      <LoaderCircle
        v-if="account.qrPhase === 'loading'"
        class="spin"
        :size="30"
      />
      <Check
        v-else-if="
          account.qrPhase === 'success' || account.qrPhase === 'confirming'
        "
        :size="34"
      />
      <ScanLine v-else :size="34" />
      <span>{{ message }}</span>
      <button
        v-if="account.qrPhase === 'expired' || account.qrPhase === 'error'"
        class="primary-button"
        @click="account.createQr"
      >
        <RefreshCw :size="15" />重新获取
      </button>
    </div>
  </div>
  <p class="qr-status" role="status" aria-live="polite">{{ message }}</p>
  <p v-if="account.error" class="inline-error" role="alert">
    {{ account.error }}
  </p>
  <small>在手机上确认后即可登录，关闭此窗口会停止扫码。</small>
</template>
