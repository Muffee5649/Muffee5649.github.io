<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConfigProviderThemeVars } from '@wot-ui/ui'
import { storeToRefs } from 'pinia'
import FgTabbar from '@/tabbar/index.vue'
import { getPrimaryThemeVars, getRadiusPx, useSettingStore } from '@/store/setting'
import { isPageTabbar } from './tabbar/store'
import { currRoute } from './utils'

const settingStore = useSettingStore()
const { themeColor, radius } = storeToRefs(settingStore)

/** wot-ui 组件库主色色阶 */
const themeVars = computed(
  () => getPrimaryThemeVars(themeColor.value) as ConfigProviderThemeVars,
)

/** UnoCSS primary、自定义 tabbar 主题色与全局圆角变量（百分比换算为 px） */
const themeStyle = computed(
  () => `--wot-color-theme:${themeColor.value};--app-radius:${getRadiusPx(radius.value)}px;`,
)

const isCurrentPageTabbar = ref(true)
onShow(() => {
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
  <wd-config-provider :theme-vars="themeVars" :custom-style="themeStyle">
    <view>
      <!-- 这个先隐藏了，知道这样用就行 -->
      <view class="hidden text-center">
        {{ helloKuRoot }}，这里可以配置全局的东西
      </view>

      <KuRootView />

      <FgTabbar v-if="isCurrentPageTabbar" />
    </view>
  </wd-config-provider>
</template>
