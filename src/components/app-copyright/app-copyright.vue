<script lang="ts" setup>
import { computed } from 'vue'
import { t } from '@/locale/index'

defineOptions({
  name: 'AppCopyright',
})

const props = withDefaults(
  defineProps<{
    /** 是否固定在屏幕底部展示；默认随正常文档流直接渲染 */
    fixed?: boolean
    /** 页面是否带底部 tabbar；仅 fixed 时生效，用于避让 tabbar 高度 */
    isTabbar?: boolean
  }>(),
  {
    fixed: false,
    isTabbar: false,
  },
)

const positionClass = computed(() => {
  if (!props.fixed) {
    return ''
  }
  // 有 tabbar 时上移到 tabbar 之上，安全区由 tabbar 自身处理
  return props.isTabbar
    ? 'copyright--tabbar'
    : 'fixed bottom-2 left-0 right-0 pb-safe'
})

const text = t('common.copyright', {
  year: new Date().getFullYear(),
  name: import.meta.env.VITE_COPYRIGHT_NAME,
})
</script>

<template>
  <view
    class="py-2 text-center text-2xs text-gray-400"
    :class="positionClass"
  >
    {{ text }}
  </view>
</template>

<style lang="scss" scoped>
/* fixed + tabbar：底部上移到 tabbar 内容高度之上，并让出底部安全区 */
.copyright--tabbar {
  position: fixed;
  right: 0;
  /* 50px 与 src/tabbar/index.vue 中 tabbar 的 h-50px 保持一致 */
  bottom: calc(50px + env(safe-area-inset-bottom));
  left: 0;
}
</style>
