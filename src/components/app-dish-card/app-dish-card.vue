<script lang="ts" setup>
import { computed } from 'vue'
import { t } from '@/locale/index'

/**
 * 菜品卡片数据（首页招牌推荐与点餐页共用）
 * - 首页由 DishItem 映射（纵向卡片，携带评分 / 销量）
 * - 点餐页由 OrderingMenuDish 映射（横向行卡片，无评分 / 销量，对应行自动隐藏）
 */
export interface AppDishCardData {
  id: number
  name: string
  /** 价格（分） */
  priceCents: number
  unit: string
  /** 主图 URL，空串时展示占位图标 */
  image: string
  /** 简介，仅横向布局展示 */
  description?: string
  /** 平均评分 0~5 */
  ratingAvg?: number
  /** 评价数量，0 表示无评价；不传则隐藏评分行 */
  ratingCount?: number
  /** 累计销量；不传则不展示销量 */
  salesCount?: number
}

defineOptions({
  name: 'AppDishCard',
})

const props = withDefaults(
  defineProps<{
    dish: AppDishCardData
    /** 卡片布局：vertical 纵向卡片（首页）/ horizontal 横向行卡片（点餐页，每行一道菜） */
    layout?: 'vertical' | 'horizontal'
    /** 是否显示加减操作（点餐页加入购物车） */
    showStepper?: boolean
    /** 当前数量（购物车中的份数） */
    count?: number
  }>(),
  {
    layout: 'vertical',
    showStepper: false,
    count: 0,
  },
)

const emit = defineEmits<{
  (e: 'plus', dish: AppDishCardData): void
  (e: 'minus', dish: AppDishCardData): void
  (e: 'select', dish: AppDishCardData): void
}>()

const isHorizontal = computed(() => props.layout === 'horizontal')

/** 是否展示评分 / 销量行 */
const hasFeedback = computed(
  () => props.dish.ratingCount !== undefined || props.dish.salesCount !== undefined,
)

const money = computed(() => `¥${(props.dish.priceCents / 100).toFixed(2)}`)
</script>

<template>
  <view
    class="box-border w-full overflow-hidden rounded-3 bg-white"
    :class="isHorizontal ? 'flex items-stretch gap-2.5 p-2.5' : ''"
    @tap="emit('select', dish)"
  >
    <view
      class="overflow-hidden"
      :class="isHorizontal ? 'h-21 w-21 shrink-0 rounded-2' : 'h-24 w-full'"
    >
      <image
        v-if="dish.image"
        :src="dish.image"
        mode="aspectFill"
        class="block h-full w-full"
        :class="isHorizontal ? 'rounded-2' : ''"
      />
      <view
        v-else
        class="h-full w-full flex items-center justify-center bg-primary/10 text-primary/40"
      >
        <view class="i-carbon-restaurant" :class="isHorizontal ? 'text-xl' : 'text-2xl'" />
      </view>
    </view>
    <!-- 信息列：横向时名称/简介在上、价格沉底；纵向时名称/价格/评分依次排列 -->
    <view
      class="min-w-0 flex flex-col gap-0.5"
      :class="isHorizontal ? 'flex-1 justify-between py-0.5' : 'p-2.5'"
    >
      <view class="order-1 flex flex-col gap-0.5">
        <view
          class="truncate text-gray-800 font-bold"
          :class="isHorizontal ? 'text-sm' : 'text-xs'"
        >
          {{ dish.name }}
        </view>
        <view v-if="isHorizontal && dish.description" class="truncate text-2xs text-gray-400">
          {{ dish.description }}
        </view>
      </view>
      <view
        class="flex items-center justify-between"
        :class="isHorizontal ? 'order-3' : 'order-2'"
      >
        <view class="truncate text-sm text-primary font-bold">
          {{ money }}<text class="text-2xs text-gray-400 font-normal">/{{ dish.unit }}</text>
        </view>
        <!-- 加减操作：数量为 0 时只显示加号（美团式） -->
        <view v-if="showStepper" class="flex shrink-0 items-center gap-1" @tap.stop>
          <view
            v-if="count > 0"
            class="h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-white active:opacity-70"
            @tap.stop="emit('minus', dish)"
          >
            <view class="i-ri-subtract-line text-12px" />
          </view>
          <text v-if="count > 0" class="min-w-4 text-center text-xs text-gray-700 font-bold">
            {{ count }}
          </text>
          <view
            class="h-5 w-5 flex items-center justify-center rounded-full bg-primary text-white active:opacity-70"
            @tap.stop="emit('plus', dish)"
          >
            <view class="i-ri-add-line text-12px" />
          </view>
        </view>
      </view>
      <view
        v-if="hasFeedback"
        class="flex items-center justify-between text-3xs"
        :class="isHorizontal ? 'order-2' : 'order-3'"
      >
        <view v-if="dish.ratingCount" class="flex items-center gap-0.5 text-amber-500">
          <view class="i-carbon-star-filled" />
          {{ (dish.ratingAvg ?? 0).toFixed(1) }}
        </view>
        <text v-else class="text-gray-300">
          {{ t('dish.noRating') }}
        </text>
        <text v-if="dish.salesCount !== undefined" class="text-gray-400">
          {{ t('dish.sold', { count: dish.salesCount }) }}
        </text>
      </view>
    </view>
  </view>
</template>
