import { computed, readonly, ref } from 'vue'

/** 可选主题色 */
export interface ThemeOption {
  /** 主题名称 */
  name: string
  /** 主题色，HEX 格式 */
  value: string
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark'

/** 可选主题色列表 */
export const themeList: ThemeOption[] = [
  { value: '#5D87FF', name: 'Default' }, // 默认配色
  { value: '#00D2BE', name: 'Mercedes' }, // Mercedes 马石油青绿
  { value: '#DC0000', name: 'Ferrari' }, // Ferrari 红
  { value: '#4574CB', name: 'Red Bull' }, // Red Bull 深蓝
  { value: '#FF8000', name: 'McLaren' }, // McLaren 木瓜橙
  { value: '#FF84C6', name: 'Alpine' }, // Alpine 粉
  { value: '#006F62', name: 'Aston Martin' }, // Aston Martin 赛绿
]

/** 默认主题色 */
export const DEFAULT_THEME_COLOR = themeList[0].value

/** 主题色本地缓存 key */
const COLOR_STORAGE_KEY = 'shake-lab-theme-color'
/** 主题模式本地缓存 key */
const MODE_STORAGE_KEY = 'shake-lab-theme-mode'

/** 与白色混合的权重，依次对应浅色模式下 wot-ui 主色 1~5 色阶 */
const LIGHT_WEIGHTS = [0.96, 0.88, 0.68, 0.42, 0.18]
/** 与黑色混合的权重，依次对应浅色模式下 wot-ui 主色 7~10 色阶 */
const DARK_WEIGHTS = [0.18, 0.32, 0.47, 0.64]
/** 深色模式下 1~5 色阶向黑色混合的权重（由深到浅） */
const DARK_MODE_BLACK_WEIGHTS = [0.64, 0.47, 0.32, 0.18, 0]
/** 深色模式下 7~10 色阶向白色混合的权重（由浅到更浅） */
const DARK_MODE_WHITE_WEIGHTS = [0.42, 0.68, 0.88, 0.96]

/** 页面级语义色，供业务页面在明暗模式下直接使用 */
const APP_THEME_VARS: Record<ThemeMode, Record<string, string>> = {
  light: {
    '--app-bg': '#F7F8FA',
    '--app-bg-bounce': '#FFFFFF',
    '--app-surface': '#FFFFFF',
    '--app-text': '#1D1F29',
    '--app-text-secondary': '#868A9C',
    '--app-border': '#F2F3F5',
  },
  dark: {
    '--app-bg': '#111318',
    '--app-bg-bounce': '#1A1D26',
    '--app-surface': '#1D1F29',
    '--app-text': '#F7F8FA',
    '--app-text-secondary': '#A9ACB8',
    '--app-border': '#272B3B',
  },
}

type RGB = [number, number, number]

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]

/** 统一成 #RRGGBB，非法值回退默认主题色 */
function normalizeHex(color: string): string {
  const value = String(color || '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(value)) {
    return `#${value.split('').map(char => char + char).join('')}`.toUpperCase()
  }
  if (/^[0-9a-f]{6}$/i.test(value)) {
    return `#${value}`.toUpperCase()
  }
  return DEFAULT_THEME_COLOR
}

function hexToRgb(hex: string): RGB {
  const value = hex.slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

/** 按权重把颜色向目标色混合 */
function mixColor(color: string, target: RGB, weight: number): string {
  const source = hexToRgb(color)
  const channels = source.map((channel, index) => {
    const value = Math.round(channel + (target[index] - channel) * weight)
    return Math.min(255, Math.max(0, value))
  })
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/**
 * 生成主题相关的 CSS 变量：
 * - `--wot-color-theme` / `--wot-color-theme-rgb` 供 UnoCSS(text-primary) 和项目自定义样式使用
 * - `--wot-primary-1~10` 供 wot-ui v2 组件使用，深色模式下色阶方向与 wot-ui 保持一致
 * - `--app-*` 供业务页面自身的背景、文字、边框使用
 */
function buildThemeVars(color: string, dark: boolean): Record<string, string> {
  /** 深色模式下主色适当提亮，保证在暗背景上的可读性 */
  const mainColor = dark ? mixColor(color, WHITE, 0.18) : color
  const [r, g, b] = hexToRgb(mainColor)
  const vars: Record<string, string> = {
    '--wot-color-theme': mainColor,
    '--wot-color-theme-rgb': `${r}, ${g}, ${b}`,
    ...APP_THEME_VARS[dark ? 'dark' : 'light'],
  }

  if (dark) {
    DARK_MODE_BLACK_WEIGHTS.forEach((weight, index) => {
      vars[`--wot-primary-${index + 1}`] = mixColor(color, BLACK, weight)
    })
    vars['--wot-primary-6'] = mainColor
    DARK_MODE_WHITE_WEIGHTS.forEach((weight, index) => {
      vars[`--wot-primary-${index + 7}`] = mixColor(color, WHITE, weight)
    })
  }
  else {
    LIGHT_WEIGHTS.forEach((weight, index) => {
      vars[`--wot-primary-${index + 1}`] = mixColor(color, WHITE, weight)
    })
    vars['--wot-primary-6'] = color
    DARK_WEIGHTS.forEach((weight, index) => {
      vars[`--wot-primary-${index + 7}`] = mixColor(color, BLACK, weight)
    })
  }

  return vars
}

/**
 * H5 端同步到根节点，覆盖被 teleport 到 body 的弹层。
 * 小程序端没有 document，变量由 App.ku.vue 的根节点 style 下发。
 */
function applyToDocument(vars: Record<string, string>) {
  // #ifdef H5
  if (typeof document === 'undefined')
    return
  const style = document.documentElement.style
  Object.entries(vars).forEach(([key, value]) => style.setProperty(key, value))
  // #endif
}

/**
 * 同步原生导航栏、窗口背景色。
 * 页面级配置在 pages.config.ts 中是静态的，深色模式需要运行时纠正。
 */
function applySystemTheme(dark: boolean) {
  const backgroundColor = dark ? '#111318' : '#F8F8F8'
  // 回弹区比页面底色亮一档，和页面内容做区分
  const bounceColor = dark ? '#1A1D26' : '#FFFFFF'
  const frontColor = dark ? '#ffffff' : '#000000'

  try {
    uni.setNavigationBarColor({
      frontColor,
      backgroundColor,
      fail: () => {
        // H5 自定义导航栏或部分平台不支持时忽略
      },
    })
  }
  catch {
    // 不支持该 API 的平台忽略
  }

  if (typeof uni.setBackgroundColor === 'function') {
    try {
      uni.setBackgroundColor({
        backgroundColor: bounceColor,
        backgroundColorTop: bounceColor,
        backgroundColorBottom: bounceColor,
        fail: () => {
          // 部分平台不支持时忽略
        },
      })
    }
    catch {
      // 不支持该 API 的平台忽略
    }
  }
}

function readStoredColor(): string {
  try {
    return normalizeHex(uni.getStorageSync(COLOR_STORAGE_KEY))
  }
  catch {
    return DEFAULT_THEME_COLOR
  }
}

function readStoredMode(): ThemeMode {
  try {
    return uni.getStorageSync(MODE_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  }
  catch {
    return 'light'
  }
}

function persist(key: string, value: string) {
  try {
    uni.setStorageSync(key, value)
  }
  catch (error) {
    console.warn('[useTheme] 主题配置持久化失败', error)
  }
}

/** 模块级单例，保证所有页面读取到同一份主题配置 */
const themeColor = ref(readStoredColor())
const themeMode = ref<ThemeMode>(readStoredMode())

/** 是否为深色模式 */
const isDark = computed(() => themeMode.value === 'dark')

/** 当前主题对应的 CSS 变量 */
const themeVars = computed(() => buildThemeVars(themeColor.value, isDark.value))

/** 可直接绑定到根节点 style 的字符串，小程序端同样支持 */
const themeStyle = computed(() =>
  Object.entries(themeVars.value)
    .map(([key, value]) => `${key}:${value}`)
    .join(';'),
)

/** 根节点主题类名，驱动 wot-ui 的暗色变量 */
const themeClass = computed(() => (isDark.value ? 'wot-theme-dark' : 'wot-theme-light'))

applyToDocument(themeVars.value)

/** 切换主题色并持久化 */
function setThemeColor(color: string) {
  const nextColor = normalizeHex(color)
  themeColor.value = nextColor
  persist(COLOR_STORAGE_KEY, nextColor)
  applyToDocument(buildThemeVars(nextColor, isDark.value))
}

/** 切换明暗模式并持久化 */
function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode
  persist(MODE_STORAGE_KEY, mode)
  applyToDocument(buildThemeVars(themeColor.value, mode === 'dark'))
  applySystemTheme(mode === 'dark')
}

/** 设置是否深色模式 */
function setDark(value: boolean) {
  setThemeMode(value ? 'dark' : 'light')
}

/** 在明暗模式之间切换 */
function toggleDark() {
  setThemeMode(isDark.value ? 'light' : 'dark')
}

/** 恢复默认主题色 */
function resetTheme() {
  setThemeColor(DEFAULT_THEME_COLOR)
}

export function useTheme() {
  return {
    /** 可选主题色列表 */
    themeList,
    /** 当前主题色 */
    themeColor: readonly(themeColor),
    /** 当前主题模式 */
    themeMode: readonly(themeMode),
    /** 是否为深色模式 */
    isDark,
    /** 当前主题 CSS 变量 */
    themeVars,
    /** 供根节点 style 绑定的样式字符串 */
    themeStyle,
    /** 供根节点 class 绑定的主题类名 */
    themeClass,
    /** 切换主题色 */
    setThemeColor,
    /** 切换明暗模式 */
    setThemeMode,
    /** 设置是否深色模式 */
    setDark,
    /** 在明暗模式之间切换 */
    toggleDark,
    /** 恢复默认主题色 */
    resetTheme,
    /** 同步原生导航栏/窗口背景色 */
    applySystemTheme,
  }
}
