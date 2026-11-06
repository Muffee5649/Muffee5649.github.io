<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DiningTableService, DishService, OrderService } from '@/service/ordering'
import type {
  DiningTableStatus,
  OrderingMenuCategory,
  WorkbenchTable,
} from '@/service/ordering'
import { ServiceError } from '@/service/shared'
import { useCartStore } from '@/store/cart'
import { useTableStore } from '@/store/table'

defineOptions({
  name: 'Ordering',
})
definePage({
  style: {
    navigationBarTitleText: '%orders.ordering%',
  },
})

const toast = useToast()
const cartStore = useCartStore()
/** 菜单页提前绑定的桌号 */
const tableStore = useTableStore()

const loading = ref(false)
const submitting = ref(false)
/** 菜单（购物车菜品展示信息以数据库为准） */
const categories = ref<OrderingMenuCategory[]>([])
/** 全部餐桌 + 开台 / 预定摘要 */
const tables = ref<WorkbenchTable[]>([])
/** 已选餐桌 id：默认沿用菜单页提前绑定的桌号 */
const selectedTableId = ref<number | null>(tableStore.tableId)

/** 下单条目 */
interface OrderingEntry {
  dishId: number
  name: string
  priceCents: number
  unit: string
  imageUrl: string | null
  qty: number
}

/** 购物车条目（保持分类内排序；同一菜品可能归属多个分类，按菜品 id 去重） */
const cartEntries = computed<OrderingEntry[]>(() => {
  const entries: OrderingEntry[] = []
  const seen = new Set<number>()
  categories.value.forEach((category) => {
    category.dishes.forEach((dish) => {
      if (seen.has(dish.id)) {
        return
      }
      seen.add(dish.id)
      const qty = cartStore.countOf(dish.id)
      if (qty > 0) {
        entries.push({
          dishId: dish.id,
          name: dish.name,
          priceCents: dish.priceCents,
          unit: dish.unit,
          imageUrl: dish.imageUrl,
          qty,
        })
      }
    })
  })
  return entries
})

const totalCount = computed(() =>
  cartEntries.value.reduce((sum, entry) => sum + entry.qty, 0),
)

const totalCents = computed(() =>
  cartEntries.value.reduce((sum, entry) => sum + entry.qty * entry.priceCents, 0),
)

const selectedTable = computed(() =>
  tables.value.find(table => table.id === selectedTableId.value) ?? null,
)

/** 占用桌 → 追加到进行中开台（加单），其余开新台 */
const isAddOrder = computed(() => selectedTable.value?.status === 'occupied')

/** 桌台可否选择：空闲 / 已约定可开台，占用中且有进行中开台可加单 */
function isTableSelectable(table: WorkbenchTable): boolean {
  return table.status === 'idle'
    || table.status === 'reserved'
    || (table.status === 'occupied' && !!table.activeSession)
}

/** 桌台状态圆点颜色（类名字符串供 UnoCSS 静态提取） */
const STATUS_DOT: Record<DiningTableStatus, string> = {
  idle: 'bg-emerald-500',
  reserved: 'bg-amber-500',
  occupied: 'bg-primary',
  disabled: 'bg-gray-300',
}

/** 桌台状态文案颜色 */
const STATUS_TEXT: Record<DiningTableStatus, string> = {
  idle: 'text-emerald-600',
  reserved: 'text-amber-600',
  occupied: 'text-primary',
  disabled: 'text-gray-400',
}

function toggleTable(table: WorkbenchTable) {
  if (!isTableSelectable(table)) {
    return
  }
  if (selectedTableId.value === table.id) {
    selectedTableId.value = null
    tableStore.clear()
    return
  }
  selectedTableId.value = table.id
  // 与菜单页顶部桌号保持一致
  tableStore.bind(table.id, table.tableNo)
}

/** 桌台卡片样式（选中高亮，不可选置灰） */
function cellClass(table: WorkbenchTable): string[] {
  const classes = table.id === selectedTableId.value
    ? ['border-primary', 'bg-primary/5']
    : ['border-transparent', 'bg-white']
  if (!isTableSelectable(table)) {
    classes.push('opacity-50')
  }
  return classes
}

/** 桌台类型文案 */
function tableTypeLabel(table: WorkbenchTable): string {
  return table.tableType ? t(`home.type.${table.tableType}`) : t('home.type.uncategorized')
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

async function loadOrdering() {
  loading.value = true
  try {
    const [menuResult, tableResult] = await Promise.all([
      DishService.getOrderingMenu(),
      DiningTableService.getWorkbenchTables(),
    ])
    categories.value = menuResult
    tables.value = tableResult

    // 提前绑定的桌号可能已被占用 / 停用，失效时取消选中
    if (tableStore.tableId) {
      const bound = tableResult.find(table => table.id === tableStore.tableId)
      if (!bound || !isTableSelectable(bound)) {
        selectedTableId.value = null
        tableStore.clear()
      }
    }
  }
  catch (error) {
    console.log('下单页数据加载失败', error)
    toast.error(t('ordering.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadOrdering()
})

/** 返回菜单页（无上级页面时兜底 switchTab） */
function backToMenus() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
  }
  else {
    uni.switchTab({ url: '/pages/menus/index' })
  }
}

/** 确认下单：空闲 / 已约定桌先开台再下单，占用桌追加到进行中开台 */
async function confirmOrder() {
  if (!totalCount.value || submitting.value) {
    return
  }
  const table = selectedTable.value
  if (!table) {
    toast.show(t('ordering.table.required'))
    return
  }
  submitting.value = true
  try {
    const sessionId = table.activeSession && table.status === 'occupied'
      ? table.activeSession.sessionId
      : await OrderService.openTable(table.id)
    await OrderService.placeOrder({
      sessionId,
      items: cartEntries.value.map(entry => ({
        dishId: entry.dishId,
        quantity: entry.qty,
      })),
    })
    cartStore.clear()
    uni.showToast({ title: t('ordering.success'), icon: 'success' })
    setTimeout(backToMenus, 600)
  }
  catch (error) {
    console.log('下单失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('ordering.failed'))
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="ordering flex flex-col bg-gray-100">
    <!-- 加载中 -->
    <view v-if="loading && !tables.length" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <!-- 主体：选桌号 + 菜品明细 -->
    <scroll-view v-else-if="cartEntries.length" class="min-h-0 flex-1" scroll-y :show-scrollbar="false">
      <!-- 选桌号 -->
      <view class="px-3 pt-3">
        <view class="flex items-center gap-1.5 pb-2 text-sm text-gray-800 font-bold">
          <view class="i-ri-restaurant-line text-base text-primary" />
          {{ $t('ordering.table.title') }}
        </view>
        <wd-empty v-if="!tables.length" :tip="$t('ordering.table.empty')" />
        <view v-else class="grid grid-cols-3 gap-2">
          <view
            v-for="table in tables"
            :key="table.id"
            class="relative border rounded-3 border-solid p-3 active:opacity-70"
            :class="cellClass(table)"
            @tap="toggleTable(table)"
          >
            <view class="truncate text-base text-gray-800 font-bold">
              {{ table.tableNo }}
            </view>
            <view class="mt-1 flex items-center gap-1 text-3xs text-gray-400">
              <view class="i-ri-group-line" />
              <text class="truncate">
                {{ table.capacity ? t('ordering.table.capacity', { count: table.capacity }) : tableTypeLabel(table) }}
              </text>
            </view>
            <view class="mt-1.5 flex items-center gap-1 text-3xs" :class="STATUS_TEXT[table.status]">
              <view class="h-1.5 w-1.5 shrink-0 rounded-full" :class="STATUS_DOT[table.status]" />
              {{ $t(`home.status.${table.status}`) }}
            </view>
            <!-- 选中标记 / 可加单角标 -->
            <view class="absolute right-2 top-2">
              <view v-if="table.id === selectedTableId" class="i-ri-check-line text-base text-primary" />
              <wd-tag
                v-else-if="table.status === 'occupied' && table.activeSession"
                type="primary"
                variant="light"
                size="small"
                round
              >
                {{ $t('ordering.addOrder') }}
              </wd-tag>
            </view>
          </view>
        </view>
      </view>

      <!-- 菜品明细 -->
      <view class="px-3 pb-4 pt-4">
        <view class="flex items-center justify-between pb-2">
          <view class="flex items-center gap-1.5 text-sm text-gray-800 font-bold">
            <view class="i-ri-file-list-3-line text-base text-primary" />
            {{ $t('ordering.dishes.title') }}
          </view>
          <view class="text-2xs text-gray-400">
            {{ t('ordering.dishes.count', { count: totalCount }) }}
          </view>
        </view>
        <view class="flex flex-col gap-2">
          <view
            v-for="entry in cartEntries"
            :key="entry.dishId"
            class="flex items-center gap-3 rounded-3 bg-white p-2.5"
          >
            <image
              v-if="entry.imageUrl"
              :src="entry.imageUrl"
              mode="aspectFill"
              class="h-12 w-12 shrink-0 rounded-2"
            />
            <view
              v-else
              class="h-12 w-12 flex shrink-0 items-center justify-center rounded-2 bg-primary/10 text-primary/40"
            >
              <view class="i-ri-restaurant-2-line text-lg" />
            </view>
            <view class="min-w-0 flex-1">
              <view class="truncate text-sm text-gray-800 font-bold">
                {{ entry.name }}
              </view>
              <view class="mt-0.5 text-2xs text-primary font-bold">
                {{ formatMoney(entry.priceCents) }}/{{ entry.unit }}
              </view>
            </view>
            <view class="shrink-0 text-right">
              <view class="text-xs text-gray-400">
                ×{{ entry.qty }}
              </view>
              <view class="mt-0.5 text-sm text-gray-800 font-bold">
                {{ formatMoney(entry.qty * entry.priceCents) }}
              </view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 购物车为空 -->
    <view v-else class="flex flex-1 flex-col items-center justify-center gap-3">
      <wd-empty :tip="$t('menus.cart.empty')" />
      <wd-button type="primary" variant="plain" size="small" @click="backToMenus">
        {{ $t('ordering.back') }}
      </wd-button>
    </view>

    <!-- 底部确认栏 -->
    <view
      v-if="cartEntries.length"
      class="flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
    >
      <view class="min-w-0 flex-1">
        <view class="text-2xs text-gray-400">
          {{ $t('ordering.total') }} · {{ t('ordering.dishes.count', { count: totalCount }) }}
        </view>
        <view class="text-xl text-primary font-bold">
          {{ formatMoney(totalCents) }}
        </view>
      </view>
      <wd-button
        type="primary"
        size="large"
        custom-class="!px-8"
        :disabled="!totalCount"
        :loading="submitting"
        @click="confirmOrder"
      >
        {{ isAddOrder ? $t('ordering.confirmAdd') : $t('ordering.confirm') }}
      </wd-button>
    </view>

    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
.ordering {
  /* 单屏布局：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0）
     本页非 tabbar 页，无需减去 tabbar 占位 */
  height: calc(100vh - var(--window-top, 0px));
}
</style>
