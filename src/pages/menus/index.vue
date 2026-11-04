<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { useCartStore } from '@/store/cart'
import { DishService } from '@/service/ordering'
import type { OrderingMenuCategory, OrderingMenuDish } from '@/service/ordering'
import type { AppDishCardData } from '@/components/app-dish-card/app-dish-card.vue'

defineOptions({
  name: 'Menus',
})
definePage({
  style: {
    navigationBarTitleText: '%menus.title%',
    enablePullDownRefresh: true,
  },
})

const toast = useToast()

const loading = ref(false)
const categories = ref<OrderingMenuCategory[]>([])
/** 当前选中分类（wd-sidebar v-model） */
const activeCategory = ref<number | string>('')
/** 右侧列表滚动锚点（分类 id → cat-{id}） */
const anchor = ref('')
/** 购物车：dishId → 数量（store 管理，与下单确认页共享） */
const cartStore = useCartStore()
const { cart } = storeToRefs(cartStore)
/** 购物车明细弹层 */
const showCart = ref(false)
/** 右侧列表当前滚动距离 */
const scrollTop = ref(0)
/** 各分类区块相对滚动内容顶部的偏移（滚动联动侧栏用） */
const sectionTops = ref<Array<{ id: number | string, top: number }>>([])
/** 点击侧栏触发的程序化滚动期间，暂时忽略滚动事件，避免高亮来回跳动 */
let scrollLinkLocked = false
let scrollLinkTimer: ReturnType<typeof setTimeout> | undefined

/** 测量各分类区块偏移（分类渲染完成后调用） */
async function measureSectionTops() {
  await nextTick()
  uni.createSelectorQuery()
    .select('.menu-list')
    .boundingClientRect()
    .selectAll('.menu-section')
    .boundingClientRect()
    .exec((res) => {
      const container = res[0] as { top: number } | null
      const sections = res[1] as Array<{ top: number }> | null
      if (!container || !sections?.length) {
        return
      }
      sectionTops.value = categories.value.map((category, index) => ({
        id: category.id,
        top: sections[index].top - container.top + scrollTop.value,
      }))
    })
}

/** 列表滚动时同步侧栏选中项：取最后一个顶部已滚过视口顶部的分类 */
function onListScroll(event: { detail: { scrollTop: number } }) {
  const top = event.detail.scrollTop
  scrollTop.value = top
  if (scrollLinkLocked) {
    return
  }
  let current = sectionTops.value[0]?.id
  sectionTops.value.forEach((section) => {
    if (top + 1 >= section.top) {
      current = section.id
    }
  })
  if (current !== undefined && current !== activeCategory.value) {
    activeCategory.value = current
  }
}

/** 滚到底部时兜底：最后分类可能无法顶到视口顶部，直接高亮最后一项 */
function onListReachBottom() {
  if (scrollLinkLocked) {
    return
  }
  const last = sectionTops.value[sectionTops.value.length - 1]
  if (last && last.id !== activeCategory.value) {
    activeCategory.value = last.id
  }
}

/** 购物车条目（保持分类内排序；同一菜品可能归属多个分类，按菜品 id 去重） */
const cartEntries = computed(() => {
  const entries: Array<{ dish: OrderingMenuDish, qty: number }> = []
  const seen = new Set<number>()
  categories.value.forEach((category) => {
    category.dishes.forEach((dish) => {
      if (seen.has(dish.id)) {
        return
      }
      seen.add(dish.id)
      const qty = cart.value[dish.id] ?? 0
      if (qty > 0) {
        entries.push({ dish, qty })
      }
    })
  })
  return entries
})

const totalCount = computed(() =>
  cartEntries.value.reduce((sum, entry) => sum + entry.qty, 0),
)

const totalCents = computed(() =>
  cartEntries.value.reduce((sum, entry) => sum + entry.qty * entry.dish.priceCents, 0),
)

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** OrderingMenuDish → 菜品卡片数据 */
function toCardData(dish: OrderingMenuDish): AppDishCardData {
  return {
    id: dish.id,
    name: dish.name,
    priceCents: dish.priceCents,
    unit: dish.unit,
    image: dish.imageUrl ?? '',
    description: dish.description ?? undefined,
  }
}

/** 分类下购物车数量（侧栏徽标） */
function categoryCount(categoryId: number): number {
  const category = categories.value.find(item => item.id === categoryId)
  if (!category) {
    return 0
  }
  return category.dishes.reduce((sum, dish) => sum + (cart.value[dish.id] ?? 0), 0)
}

function countOf(dishId: number): number {
  return cart.value[dishId] ?? 0
}

function plusDish(dish: AppDishCardData) {
  cart.value = { ...cart.value, [dish.id]: countOf(dish.id) + 1 }
}

function minusDish(dish: AppDishCardData) {
  setQty(dish.id, countOf(dish.id) - 1)
}

/** 设置数量（弹层计数器用），≤ 0 时移除 */
function setQty(dishId: number, qty: number) {
  cartStore.setQty(dishId, qty)
  if (!Object.keys(cart.value).length) {
    showCart.value = false
  }
}

/** 弹层计数器变化：value 可能是数字或空字符串 */
function onCartChange(dishId: number, payload: { value: number | string }) {
  setQty(dishId, Number(payload.value))
}

function clearCart() {
  cartStore.clear()
  showCart.value = false
}

/** 点击侧栏分类 → 右侧列表滚动到对应锚点 */
async function onCategoryChange({ value }: { value: number | string }) {
  // 程序化滚动期间屏蔽滚动联动，滚动结束后恢复
  scrollLinkLocked = true
  if (scrollLinkTimer) {
    clearTimeout(scrollLinkTimer)
  }
  scrollLinkTimer = setTimeout(() => {
    scrollLinkLocked = false
  }, 300)
  anchor.value = ''
  await nextTick()
  anchor.value = `cat-${value}`
}

/** 下单：携带购物车跳转到下单确认页（选桌号、确认下单） */
function checkout() {
  if (!totalCount.value) {
    return
  }
  showCart.value = false
  uni.navigateTo({ url: '/pages/orders/ordering' })
}

async function loadMenu() {
  loading.value = true
  try {
    const result = await DishService.getOrderingMenu()
    categories.value = result
    if (result.length && !result.some(item => item.id === activeCategory.value)) {
      activeCategory.value = result[0].id
    }
    measureSectionTops()
  }
  catch (error) {
    console.log('菜单数据加载失败', error)
    toast.error(t('menus.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadMenu()
})

onPullDownRefresh(() => {
  loadMenu().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="menus flex flex-col bg-gray-100">
    <view v-if="loading && !categories.length" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>
    <wd-empty v-else-if="!categories.length" :tip="$t('menus.empty.categories')" />

    <!-- 主体：左侧分类栏 + 右侧菜品列表（美团式） -->
    <view v-else class="min-h-0 flex flex-1">
      <scroll-view class="h-full w-20 shrink-0 bg-white" scroll-y :show-scrollbar="false">
        <wd-sidebar v-model="activeCategory" custom-class="!w-full" @change="onCategoryChange">
          <wd-sidebar-item
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
            :label="category.name"
            :badge-props="categoryCount(category.id) ? { value: categoryCount(category.id), max: 99 } : undefined"
          />
        </wd-sidebar>
      </scroll-view>
      <scroll-view
        class="menu-list h-full min-w-0 flex-1"
        scroll-y
        :show-scrollbar="false"
        :scroll-into-view="anchor"
        scroll-with-animation
        @scroll="onListScroll"
        @scrolltolower="onListReachBottom"
      >
        <view v-for="category in categories" :id="`cat-${category.id}`" :key="category.id" class="menu-section pb-2">
          <view class="px-3 pb-1 pt-3 text-2xs text-gray-400">
            {{ category.name }}
          </view>
          <view class="flex flex-col gap-2 px-2">
            <app-dish-card
              v-for="dish in category.dishes"
              :key="dish.id"
              :dish="toCardData(dish)"
              layout="horizontal"
              show-stepper
              :count="countOf(dish.id)"
              @plus="plusDish"
              @minus="minusDish"
            />
          </view>
          <wd-empty
            v-if="!category.dishes.length"
            :tip="$t('menus.empty.dishes')"
            custom-class="!py-4"
          />
        </view>
      </scroll-view>
    </view>

    <!-- 底部购物车栏（位于自定义 tabbar 之上） -->
    <view class="flex items-center gap-3 border-t border-gray-200 bg-white px-3 py-2">
      <view class="relative shrink-0" @tap="showCart = totalCount > 0">
        <wd-badge :value="totalCount" :max="99">
          <view class="h-10 w-10 flex items-center justify-center rounded-full bg-primary text-white">
            <view class="i-carbon-shopping-cart text-xl" />
          </view>
        </wd-badge>
      </view>
      <view class="min-w-0 flex-1" @tap="showCart = totalCount > 0">
        <view class="truncate text-base text-gray-800 font-bold">
          {{ formatMoney(totalCents) }}
        </view>
        <view class="text-3xs text-gray-400">
          {{ t('menus.cart.title', { count: totalCount }) }}
        </view>
      </view>
      <wd-button
        type="primary"
        size="large"
        custom-class="!px-6"
        :disabled="!totalCount"
        @click="checkout"
      >
        {{ $t('menus.cart.checkout') }}
      </wd-button>
    </view>

    <!-- 购物车明细弹层（z-index 高于自定义 tabbar 的 1000） -->
    <wd-popup
      v-model="showCart"
      position="bottom"
      round
      :z-index="1001"
      custom-class="!bg-gray-50"
    >
      <view class="flex items-center justify-between px-4 pb-1 pt-4">
        <text class="text-sm text-gray-800 font-bold">
          {{ t('menus.cart.title', { count: totalCount }) }}
        </text>
        <view class="flex items-center gap-1 text-3xs text-gray-400 active:opacity-70" @tap="clearCart">
          <view class="i-ri-delete-bin-line text-14px" />
          {{ $t('menus.cart.clear') }}
        </view>
      </view>
      <scroll-view class="h-[40vh] bg-white" scroll-y :show-scrollbar="false">
        <view
          v-for="entry in cartEntries"
          :key="entry.dish.id"
          class="flex items-center gap-3 px-4 py-2.5"
        >
          <image
            v-if="entry.dish.imageUrl"
            :src="entry.dish.imageUrl"
            mode="aspectFill"
            class="h-12 w-12 shrink-0 rounded-2"
          />
          <view
            v-else
            class="h-12 w-12 flex shrink-0 items-center justify-center rounded-2 bg-primary/10 text-primary/40"
          >
            <view class="i-carbon-restaurant text-lg" />
          </view>
          <view class="min-w-0 flex-1">
            <view class="truncate text-xs text-gray-800 font-bold">
              {{ entry.dish.name }}
            </view>
            <view class="mt-0.5 text-2xs text-primary font-bold">
              {{ formatMoney(entry.dish.priceCents) }}/{{ entry.dish.unit }}
            </view>
          </view>
          <wd-input-number
            :model-value="entry.qty"
            :min="0"
            :max="99"
            input-width="24px"
            @change="onCartChange(entry.dish.id, $event)"
          />
        </view>
        <wd-empty v-if="!cartEntries.length" :tip="$t('menus.cart.empty')" />
      </scroll-view>
      <view class="flex items-center justify-between gap-3 px-4 pt-3 pb-safe">
        <view class="text-base text-primary font-bold">
          {{ formatMoney(totalCents) }}
        </view>
        <wd-button type="primary" custom-class="!px-6" :disabled="!totalCount" @click="checkout">
          {{ $t('menus.cart.checkout') }}
        </wd-button>
      </view>
    </wd-popup>

    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
.menus {
  /* 单屏布局：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0）
     与自定义 tabbar 占位（50px + 底部安全区），否则购物车栏会被 tabbar 遮挡 */
  height: calc(100vh - var(--window-top, 0px) - 50px);
  height: calc(100vh - var(--window-top, 0px) - 50px - env(safe-area-inset-bottom));
}
</style>
