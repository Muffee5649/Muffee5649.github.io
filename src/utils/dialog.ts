import type { Dialog, DialogOptions } from '@wot-ui/ui/components/wd-dialog/types'

/**
 * 全局 dialog 实例。
 * 由 App.ku.vue 在根组件注册，供 http、store、utils 等非组件环境调用。
 */
let dialogInstance: Dialog | null = null

export function registerDialog(instance: Dialog) {
  dialogInstance = instance
}

function normalize(options: DialogOptions | string) {
  return typeof options === 'string' ? { title: options, msg: '' } : options
}

/**
 * 确认框，基于 wd-dialog，自动跟随主题色与明暗模式。
 * 确认返回 true，取消/关闭返回 false。
 */
export async function showConfirm(options: DialogOptions | string): Promise<boolean> {
  if (!dialogInstance) {
    const { title, msg } = normalize(options)
    return new Promise((resolve) => {
      uni.showModal({
        title: title ?? '',
        content: msg ?? '',
        success: (res) => {
          resolve(res.confirm)
        },
        fail: () => {
          resolve(false)
        },
      })
    })
  }

  try {
    await dialogInstance.confirm(options)
    return true
  }
  catch {
    return false
  }
}

/**
 * 提示框（只有确认按钮），基于 wd-dialog，自动跟随主题色与明暗模式。
 */
export async function showAlert(options: DialogOptions | string): Promise<void> {
  if (!dialogInstance) {
    const { title, msg } = normalize(options)
    uni.showModal({
      title: title ?? '',
      content: msg ?? '',
      showCancel: false,
    })
    return
  }

  try {
    await dialogInstance.alert(options)
  }
  catch {
    // 用户关闭弹窗时忽略
  }
}
