import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 点餐购物车（菜单页与下单确认页共享）
 *
 * 仅保存 dishId → 数量；菜品展示信息由各页从菜单接口获取，
 * 保证下单时价格 / 在售状态以数据库为准
 */
export const useCartStore = defineStore('cart', () => {
  /** 购物车：dishId → 数量 */
  const cart = ref<Record<number, number>>({})

  /** 菜品数量，未加入返回 0 */
  function countOf(dishId: number): number {
    return cart.value[dishId] ?? 0
  }

  /** 设置数量，≤ 0 时移除 */
  function setQty(dishId: number, qty: number) {
    const next = { ...cart.value }
    if (qty <= 0) {
      delete next[dishId]
    }
    else {
      next[dishId] = qty
    }
    cart.value = next
  }

  /** 清空购物车（下单成功后调用） */
  function clear() {
    cart.value = {}
  }

  return { cart, countOf, setQty, clear }
})
