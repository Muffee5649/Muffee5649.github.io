import type { Toast, ToastOptions } from '@wot-ui/ui/components/wd-toast/types'

/**
 * 全局 toast 实例。
 * 由 App.ku.vue 在根组件注册，供 http、store、utils 等非组件环境调用。
 */
let toastInstance: Toast | null = null

export function registerToast(instance: Toast) {
  toastInstance = instance
}

export type AppToastIcon = 'none' | 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface AppToastOptions {
  /** 提示文案 */
  title: string
  /** 图标类型，默认 none */
  icon?: AppToastIcon
  /** 展示时长，默认 2000ms */
  duration?: number
}

/**
 * 全局提示，基于 Wot UI 的 wd-toast，自动跟随主题色与明暗模式。
 * 在 App.ku 挂载前调用时回退到原生 uni.showToast。
 */
export function showToast(options: AppToastOptions | string) {
  const { title, icon = 'none', duration = 2000 }
    = typeof options === 'string' ? { title: options } : options

  if (!toastInstance) {
    uni.showToast({
      title,
      icon: icon === 'success' || icon === 'error' || icon === 'loading' ? icon : 'none',
      duration,
    })
    return
  }

  const toastOptions: ToastOptions = { msg: title, duration }
  if (icon !== 'none') {
    toastOptions.iconName = icon
  }
  toastInstance.show(toastOptions)
}
