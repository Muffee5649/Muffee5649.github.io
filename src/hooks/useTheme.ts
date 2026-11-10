import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { ConfigProviderThemeVars } from '@wot-ui/ui'
import {
  getPrimaryThemeVars,
  getRadiusPx,
  getThemeRgbChannels,
  useSettingStore,
} from '@/store/setting'

/**
 * 主题色 / 圆角统一出口
 *
 * - App.ku.vue 用 themeVars、themeStyle 注入 wot-ui 与全局 CSS 变量
 * - 其他页面用 setThemeColor、setRadius 切换，修改后全局即时生效
 */
export function useTheme() {
  const settingStore = useSettingStore()
  const { themeColor, radius } = storeToRefs(settingStore)

  /** wot-ui 组件库主色色阶 */
  const themeVars = computed(
    () => getPrimaryThemeVars(themeColor.value) as ConfigProviderThemeVars,
  )

  /** UnoCSS primary（含透明度修饰）、自定义 tabbar 主题色与全局圆角变量（百分比换算为 px） */
  const themeStyle = computed(
    () => `--wot-color-theme:${themeColor.value};--wot-color-theme-rgb:${getThemeRgbChannels(themeColor.value)};--app-radius:${getRadiusPx(radius.value)}px;`,
  )

  /** 切换主题色 */
  function setThemeColor(value: string) {
    settingStore.setThemeColor(value)
  }

  /** 切换圆角（百分比，100 对应 RADIUS_BASE_PX） */
  function setRadius(percent: number) {
    settingStore.setRadius(percent)
  }

  return {
    themeColor,
    radius,
    themeVars,
    themeStyle,
    setThemeColor,
    setRadius,
  }
}
