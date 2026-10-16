<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Minus, Square, Copy, X } from "@lucide/vue";
import type { WindowAction } from "../../../shared/contracts";
const maximized = ref(false);
const focused = ref(true);
const error = ref("");
const isDesktop = Boolean(window.desktop);
let dispose: (() => void) | undefined;
onMounted(async () => {
  if (!window.desktop) return;
  dispose = window.desktop.window.onState((state) => {
    maximized.value = state.maximized;
    focused.value = state.focused;
  });
  try {
    const result = await window.desktop.window.state();
    if (result.ok) {
      maximized.value = result.data.maximized;
      focused.value = result.data.focused;
    }
  } catch {
    error.value = "窗口控制暂不可用";
  }
});
onUnmounted(() => dispose?.());
async function control(action: WindowAction) {
  try {
    const result = await window.desktop?.window.control(action);
    if (result && !result.ok) error.value = result.error;
  } catch {
    error.value = "窗口操作失败，请重试";
  }
}
</script>
<template>
  <div
    class="window-controls"
    :class="{ 'window-inactive': !focused }"
    role="group"
    aria-label="窗口控制"
  >
    <span v-if="error" class="window-error" role="status">{{ error }}</span>
    <button
      class="caption-button"
      :disabled="!isDesktop"
      aria-label="最小化窗口"
      title="最小化"
      @click="control('minimize')"
    >
      <Minus :size="18" :stroke-width="1.6" />
    </button>
    <button
      class="caption-button"
      :disabled="!isDesktop"
      :aria-label="maximized ? '还原窗口' : '最大化窗口'"
      :title="maximized ? '还原' : '最大化'"
      @click="control('toggle-maximize')"
    >
      <Copy v-if="maximized" :size="15" :stroke-width="1.6" /><Square
        v-else
        :size="16"
        :stroke-width="1.6"
      />
    </button>
    <button
      class="caption-button caption-close"
      :disabled="!isDesktop"
      aria-label="关闭窗口"
      title="关闭"
      @click="control('close')"
    >
      <X :size="19" :stroke-width="1.6" />
    </button>
  </div>
</template>
