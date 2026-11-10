<script setup lang="ts">
import { ref } from 'vue'
import { useDialog, useToast } from '@wot-ui/ui'
import { useTheme } from '@/hooks/useTheme'
import FgTabbar from '@/tabbar/index.vue'
import { registerDialog } from '@/utils/dialog'
import { registerToast } from '@/utils/toast'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'

// 主题变量统一在全局根节点下发，小程序端无法操作 document，只能通过 style 继承
const { themeStyle, themeClass, isDark, applySystemTheme } = useTheme()

// 全局 toast / dialog 实例，供 http、store、utils 等非组件环境使用（跟随主题）
// 注意：App.ku 是「每个页面」各有一个实例，模块级单例只能指向其中一个，
// 注册时机决定弹窗写到哪个页面，必须在页面显示时重新指向当前页面，否则会串页导致弹不出来
const toast = useToast('global')
const dialog = useDialog('global')

function syncGlobalInstances() {
  registerToast(toast)
  registerDialog(dialog)
}

syncGlobalInstances()

const isCurrentPageTabbar = ref(true)
onShow(() => {
  syncGlobalInstances()
  // 原生导航栏/窗口背景色需要按页面重新设置
  applySystemTheme(isDark.value)

  const { path } = currRoute()
  // “蜡笔小开心”提到本地是 '/pages/index/index'，线上是 '/' 导致线上 tabbar 不见了
  // 所以这里需要判断一下，如果是 '/' 就当做首页，也要显示 tabbar
  if (path === '/') {
    isCurrentPageTabbar.value = true
  }
  else {
    isCurrentPageTabbar.value = isPageTabbar(path)
  }
})

const helloKuRoot = ref('Hello AppKuVue')

const exposeRef = ref('this is form app.Ku.vue')

defineExpose({
  exposeRef,
})
</script>

<template>
  <view class="app-theme-root" :class="themeClass" :style="themeStyle">
    <!-- 这个先隐藏了，知道这样用就行 -->
    <view class="hidden text-center">
      {{ helloKuRoot }}，这里可以配置全局的东西
    </view>

    <KuRootView />

    <FgTabbar v-if="isCurrentPageTabbar" />

    <!-- 兜底：安全区属于 page 节点，小程序无法动态修改 page 背景，用它覆盖底部安全区 -->
    <view class="app-safe-area-fill" />

    <!-- 全局 toast / dialog，跟随主题色与明暗模式 -->
    <wd-toast selector="global" />
    <wd-dialog selector="global" />
  </view>
</template>

<style lang="scss">
/* 全局页面容器：保证明暗模式切换时整页背景/文字颜色跟随 */
.app-theme-root {
  min-height: calc(100vh - var(--window-top, 0px));
  background-color: var(--app-bg);
  color: var(--app-text);
}

/* 底部安全区填充层：tabbar 的 z-index 更高，会正常盖在它上面 */
.app-safe-area-fill {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  height: env(safe-area-inset-bottom);
  pointer-events: none;
  background-color: var(--app-bg);
}
</style>
