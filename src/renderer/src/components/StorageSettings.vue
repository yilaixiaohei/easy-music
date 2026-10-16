<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { FolderOpen, RefreshCw, LoaderCircle } from '@lucide/vue';
import { errorMessage, unwrap } from '../api';
import { desktop } from '../api';
import type { StorageInfo } from '../../../shared/contracts';
const info = ref<StorageInfo>();
const busy = ref(false);
const error = ref('');
const message = ref('');
const available = Boolean(window.desktop?.storage);
function size(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
async function refresh() {
  if (!available || busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try { info.value = unwrap(await desktop().storage.info()); }
  catch (reason) { error.value = errorMessage(reason); }
  finally { busy.value = false; }
}
async function clear(kind: 'cache' | 'diagnostics') {
  if (!available || busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    const result = unwrap(await desktop().storage.clear(kind));
    info.value = result.info;
    message.value = result.skippedFiles ? '已清理可删除的文件；占用中或不可访问的文件已保留。' : kind === 'cache' ? '网络缓存已清理，后续播放和封面浏览会重新生成。' : '诊断日志已清理。';
  } catch (reason) { error.value = errorMessage(reason); }
  finally { busy.value = false; }
}
async function openDirectory() {
  try { unwrap(await desktop().storage.openDirectory()); }
  catch (reason) { error.value = errorMessage(reason); }
}
async function setCacheLimit(event: Event) {
  const select = event.target as HTMLSelectElement;
  const value = select.value === 'unlimited' ? null : Number(select.value);
  if (value !== null && value !== 256 && value !== 512 && value !== 1024) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    info.value = unwrap(await desktop().storage.setCacheLimit(value));
    message.value = info.value.cacheLimitMB !== info.value.activeCacheLimitMB ? '已保存，完全退出并重新启动软件后生效。' : '缓存上限已保存。';
  } catch (reason) { error.value = errorMessage(reason); }
  finally { select.value = String(info.value?.cacheLimitMB ?? 'unlimited'); busy.value = false; }
}
onMounted(refresh);
</script>
<template>
  <section class="storage-settings" aria-label="缓存与数据管理" :aria-busy="busy">
    <div class="storage-heading"><h3>缓存与数据管理</h3><button aria-label="刷新存储占用" title="刷新占用" :disabled="busy || !available" @click="refresh"><LoaderCircle v-if="busy" class="spin" :size="16"/><RefreshCw v-else :size="16"/></button></div>
    <template v-if="info">
      <div class="storage-item"><label for="cache-limit">网络缓存上限</label><select id="cache-limit" class="lyrics-style-select" :value="info.cacheLimitMB ?? 'unlimited'" :disabled="busy" @change="setCacheLimit"><option :value="256">256 MB</option><option :value="512">512 MB（默认）</option><option :value="1024">1 GB</option><option value="unlimited">无限制</option></select></div>
      <p class="storage-help">修改后需完全退出再启动，最小化到托盘不会生效。仅限制网络缓存；无限制表示应用不指定容量上限。</p>
      <p v-if="info.cacheLimitMB !== info.activeCacheLimitMB" class="storage-message" role="status">待重启生效；当前上限：{{ info.activeCacheLimitMB === null ? '无限制' : size(info.activeCacheLimitMB * 1024 * 1024) }}。</p>
      <div class="storage-item"><span>数据目录占用<small>{{ info.approximate ? '约 ' : '' }}{{ size(info.totalBytes) }}</small></span><button class="secondary-button" :disabled="busy" @click="openDirectory"><FolderOpen :size="14"/>打开目录</button></div>
      <p class="storage-directory" :title="info.directory">{{ info.directory }}</p>
      <div class="storage-item"><span>网络缓存<small>{{ size(info.cacheBytes) }}</small></span><button class="secondary-button" :disabled="busy" @click="clear('cache')">清理缓存</button></div>
      <div class="storage-item"><span>诊断日志与崩溃报告<small>{{ size(info.diagnosticBytes) }}</small></span><button class="secondary-button" :disabled="busy" @click="clear('diagnostics')">清理日志</button></div>
      <div v-if="info.temporaryBytes !== null" class="storage-item"><span>服务临时文件<small>{{ size(info.temporaryBytes) }}</small></span><span class="storage-preserved">自动管理，保留使用</span></div>
    </template>
    <p v-else-if="busy" role="status">正在统计占用…</p>
    <p v-else-if="!available">请在桌面客户端中管理缓存。</p>
    <p class="storage-help">清理保留登录状态、设置、播放记录和播放队列。服务临时文件可能包含接口凭证，不作为垃圾删除。占用会随使用重新增加。</p>
    <p v-if="message" class="storage-message" role="status">{{ message }}</p>
    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
  </section>
</template>
