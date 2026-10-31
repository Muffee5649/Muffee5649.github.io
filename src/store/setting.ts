import { defineStore } from 'pinia'
import { ref } from 'vue'
import i18n from '@/locale/index'
import { setTabbarItem } from '@/tabbar/i18n'

/** 支持的语言编码，需与 src/locale 目录下的语言包保持一致 */
export type LocaleCode = 'zh-Hans' | 'en'

/** 语言选项 */
export interface LanguageOption {
  value: LocaleCode
  name: string
}

/** 可选语言列表 */
export const languageOptions: LanguageOption[] = [
  { value: 'zh-Hans', name: '简体中文' },
  { value: 'en', name: 'English' },
]

/** 主题色选项 */
export interface ThemeColorOption {
  /** 色值 */
  value: string
  /** 展示名称 */
  name: string
}

/** 可选主题色列表 */
export const themeColorOptions: ThemeColorOption[] = [
  { value: '#5D87FF', name: 'Default' }, // 默认配色
  { value: '#00D2BE', name: 'Mercedes' }, // Mercedes 马石油青绿
  { value: '#DC0000', name: 'Ferrari' }, // Ferrari 红
  { value: '#4574CB', name: 'Red Bull' }, // Red Bull 深蓝
  { value: '#FF8000', name: 'McLaren' }, // McLaren 木瓜橙
  { value: '#FF84C6', name: 'Alpine' }, // Alpine 粉
  { value: '#006F62', name: 'Aston Martin' }, // Aston Martin 赛绿
]

/** 默认主题色 */
export const DEFAULT_THEME_COLOR = themeColorOptions[0].value

/** 系统圆角基准：100% 对应的实际圆角 */
export const RADIUS_BASE_PX = 15

/** 默认系统圆角（百分比，100% = RADIUS_BASE_PX） */
export const DEFAULT_RADIUS = 100

/** 圆角百分比转实际 px，保留两位小数 */
export function getRadiusPx(percent: number) {
  return Number((RADIUS_BASE_PX * percent / 100).toFixed(2))
}

type Rgb = [number, number, number]

/** 十六进制颜色转 RGB */
function hexToRgb(hex: string): Rgb | null {
  const value = hex.replace('#', '')
  if (![3, 6].includes(value.length)) {
    return null
  }
  const full = value.length === 3
    ? value.split('').map(char => char + char).join('')
    : value
  const int = Number.parseInt(full, 16)
  if (Number.isNaN(int)) {
    return null
  }
  return [(int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF]
}

/** RGB 转十六进制颜色 */
function rgbToHex(rgb: Rgb) {
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** 按权重混合两个颜色（target 占比为 weight） */
function mixColor(source: Rgb, target: Rgb, weight: number): Rgb {
  return source.map((channel, index) => channel * (1 - weight) + target[index] * weight) as Rgb
}

/**
 * 根据主题色生成 wot-ui 主色色阶（primary1 ~ primary10）
 * 色阶 6 为主题色本身，1-5 逐步变浅，7-10 逐步变深
 */
export function getPrimaryThemeVars(color: string): Record<string, string> {
  const rgb = hexToRgb(color)
  if (!rgb) {
    return {}
  }
  const white: Rgb = [255, 255, 255]
  const black: Rgb = [0, 0, 0]
  const lightWeights = [0.9, 0.7, 0.5, 0.3, 0.15]
  const darkWeights = [0.15, 0.3, 0.45, 0.6]
  const scale = [
    ...lightWeights.map(weight => rgbToHex(mixColor(rgb, white, weight))),
    rgbToHex(rgb),
    ...darkWeights.map(weight => rgbToHex(mixColor(rgb, black, weight))),
  ]
  return scale.reduce<Record<string, string>>((vars, value, index) => {
    vars[`primary${index + 1}`] = value
    return vars
  }, {})
}

export const useSettingStore = defineStore(
  'setting',
  () => {
    /** 当前语言，默认取 uni-app 运行时语言 */
    const locale = ref<LocaleCode>(uni.getLocale() as LocaleCode)

    /** 当前主题色 */
    const themeColor = ref<string>(DEFAULT_THEME_COLOR)

    /** 当前系统圆角（百分比，100 = RADIUS_BASE_PX） */
    const radius = ref<number>(DEFAULT_RADIUS)

    /** 切换主题色并即时生效 */
    const setThemeColor = (value: string) => {
      themeColor.value = value
    }

    /** 切换系统圆角并即时生效 */
    const setRadius = (value: number) => {
      radius.value = value
    }

    /**
     * 应用语言到 uni-app 运行时
     * uni.setLocale 与 i18n.global.locale 缺一不可
     */
    const applyLocale = (value: LocaleCode) => {
      locale.value = value
      uni.setLocale(value)
      i18n.global.locale = value
      // 底部 tabbar 文案需要重新设置
      setTabbarItem()
    }

    /** 切换语言并即时生效 */
    const setLocale = (value: LocaleCode) => {
      applyLocale(value)
    }

    /** 应用已持久化的语言（App 启动时调用，小程序重启后 uni.setLocale 会复位） */
    const syncLocale = () => {
      applyLocale(locale.value)
    }

    return {
      locale,
      setLocale,
      syncLocale,
      languageOptions,
      themeColor,
      setThemeColor,
      themeColorOptions,
      radius,
      setRadius,
    }
  },
  {
    persist: true,
  },
)
