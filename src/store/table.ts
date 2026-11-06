import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 点餐桌号绑定（菜单页提前绑定，下单确认页选中并下单）
 *
 * 仅保存桌号标识；桌台状态 / 摘要由各页实时查询，避免展示过期数据
 */
export const useTableStore = defineStore('table', () => {
  /** 已绑定餐桌 id */
  const tableId = ref<number | null>(null)
  /** 已绑定桌号（用于顶部展示） */
  const tableNo = ref('')

  /** 绑定桌号 */
  function bind(id: number, no: string) {
    tableId.value = id
    tableNo.value = no
  }

  /** 解除绑定 */
  function clear() {
    tableId.value = null
    tableNo.value = ''
  }

  return { tableId, tableNo, bind, clear }
})
