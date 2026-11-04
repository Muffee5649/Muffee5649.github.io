<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { DiningTableService, DishService, ReservationService } from '@/service/ordering'
import type {
  DiningTableType,
  DishItem,
  ReservationItem,
  WorkbenchTable,
} from '@/service/ordering'
import type { AppDishCardData } from '@/components/app-dish-card/app-dish-card.vue'

defineOptions({
  name: 'Home',
})
definePage({
  // 使用 type: "home" 属性设置首页，其他页面不需要设置，默认为page
  type: 'home',
  style: {
    // 'custom' 表示开启自定义导航栏，默认 'default'
    navigationStyle: 'custom',
    navigationBarTitleText: '首页',
    enablePullDownRefresh: true,
  },
})

const toast = useToast()

const loading = ref(false)
const tables = ref<WorkbenchTable[]>([])
const reservations = ref<ReservationItem[]>([])
const hotDishes = ref<DishItem[]>([])
/** 分栏：0 就餐中 / 1 今日预定 / 2 招牌推荐 */
const activeTab = ref(0)

/** 桌台状态计数（空闲 / 已约定 / 占用 / 停用，PRD 7.3） */
const statusCount = computed(() => {
  const count = { idle: 0, reserved: 0, occupied: 0, disabled: 0 }
  tables.value.forEach((table) => {
    count[table.status] += 1
  })
  return count
})

/** 就餐中的桌台（占用态，展示开台摘要） */
const activeSessions = computed(() =>
  tables.value
    .filter(table => table.activeSession)
    .map(table => ({
      tableNo: table.tableNo,
      sessionNo: table.activeSession!.sessionNo,
      openedAt: table.activeSession!.openedAt,
      orderCount: table.activeSession!.orderCount,
      totalAmountCents: table.activeSession!.totalAmountCents,
    })),
)

/** 招牌推荐卡片数据（app-dish-card） */
const hotDishCards = computed<AppDishCardData[]>(() =>
  hotDishes.value.map(dish => ({
    id: dish.id,
    name: dish.name,
    priceCents: dish.priceCents,
    unit: dish.unit,
    image: dish.imageUrls[0] ?? '',
    ratingAvg: dish.ratingAvg,
    ratingCount: dish.ratingCount,
    salesCount: dish.salesCount,
  })),
)

/** 时段问候（响应语言切换） */
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11)
    return t('home.greeting.morning')
  if (hour < 14)
    return t('home.greeting.noon')
  if (hour < 18)
    return t('home.greeting.afternoon')
  return t('home.greeting.evening')
})

/** 今日日期 + 星期（响应语言切换） */
const todayLabel = computed(() => {
  const now = new Date()
  return t('home.dateLabel', {
    m: now.getMonth() + 1,
    d: now.getDate(),
    week: t(`home.week.${now.getDay()}`),
  })
})

function todayDateStr(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDuration(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  const hours = Math.floor(minutes / 60)
  return hours > 0
    ? t('home.duration', { h: hours, m: minutes % 60 })
    : t('home.durationMinutes', { m: minutes })
}

function tableTypeLabel(type: DiningTableType | null): string {
  return type ? t(`home.type.${type}`) : t('home.type.uncategorized')
}

async function loadHome() {
  loading.value = true
  try {
    const [tableRes, rsvRes, dishRes] = await Promise.all([
      DiningTableService.getWorkbenchTables(),
      ReservationService.getList({
        status: 'reserved',
        arrivalDate: todayDateStr(),
        size: 10,
      }),
      DishService.getList({ status: 'on_sale', size: 30 }),
    ])
    tables.value = tableRes
    reservations.value = rsvRes.records
    // 招牌优先，其次按销量倒序（FR-REV-03：销量/评分仅作展示参考）
    hotDishes.value = [...dishRes.records]
      .sort((a, b) => {
        const aSign = a.tags.includes('招牌') ? 1 : 0
        const bSign = b.tags.includes('招牌') ? 1 : 0
        return bSign - aSign || b.salesCount - a.salesCount
      })
      .slice(0, 8)
    // 默认停留在有内容的分栏
    if (!tableRes.some(table => table.activeSession)) {
      activeTab.value = rsvRes.records.length ? 1 : 2
    }
  }
  catch (error) {
    console.log('首页数据加载失败', error)
    toast.error(t('home.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadHome()
})

onPullDownRefresh(() => {
  loadHome().finally(() => uni.stopPullDownRefresh())
})

function goOrdering() {
  uni.switchTab({ url: '/pages/orders/index' })
}

function goReservation() {
  uni.navigateTo({ url: '/pages/reservation/index' })
}

function goDashboard() {
  uni.navigateTo({ url: '/pages/dashboard/index' })
}

function goMenus() {
  uni.switchTab({ url: '/pages/menus/index' })
}

/**
 * 自定义导航栏顶部安全距离：
 * 微信小程序的 env(safe-area-inset-top) 在安卓上为 0，需按状态栏高度留白；
 * 同时预留右上角胶囊按钮宽度，避免品牌行右侧内容被遮挡。
 */
let statusBarHeight = 0
let capsuleInset = 0
// #ifdef MP-WEIXIN
{
  const windowInfo = uni.getWindowInfo()
  statusBarHeight = windowInfo.statusBarHeight ?? 0
  const capsule = uni.getMenuButtonBoundingClientRect()
  if (capsule?.left) {
    capsuleInset = windowInfo.windowWidth - capsule.left
  }
}
// #endif
// #ifndef MP-WEIXIN
statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 0
// #endif
</script>

<template>
  <view class="home overflow-hidden bg-gray-100">
    <!-- 顶部品牌区 + 主操作（主题色背景，固定高度不参与滚动） -->
    <view class="bg-primary px-4 pb-7" :style="{ paddingTop: `${statusBarHeight + 12}px` }">
      <view
        class="flex items-center justify-between"
        :style="capsuleInset ? { paddingRight: `${capsuleInset}px` } : undefined"
      >
        <view class="text-lg text-white font-bold">
          {{ $t('home.brand') }}
        </view>
        <view class="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-2xs text-white">
          <view class="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          {{ $t('home.business') }}
        </view>
      </view>
      <view class="mt-0.5 text-2xs text-white opacity-80">
        {{ greeting }} · {{ todayLabel }}
      </view>

      <!-- 两个主要入口（wot-ui 按钮，主题色自动跟随） -->
      <view class="mt-4 flex gap-3">
        <view class="flex-1">
          <wd-button
            type="primary"
            variant="base"
            size="large"
            block
            custom-class="!bg-white"
            custom-style="background: #fff; color: var(--wot-color-theme, #5D87FF);"
            @click="goOrdering"
          >
            <view class="flex items-center gap-1.5">
              <view class="i-carbon-restaurant text-lg" />
              <text class="text-base font-bold">
                {{ $t('home.open') }}
              </text>
            </view>
          </wd-button>
        </view>
        <view class="flex-1">
          <wd-button
            type="primary"
            variant="plain"
            size="large"
            block
            custom-style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.4); color: #fff;"
            @click="goReservation"
          >
            <view class="flex items-center gap-1.5">
              <view class="i-carbon-calendar text-lg" />
              <text class="text-base font-bold">
                {{ $t('home.reserve') }}
              </text>
            </view>
          </wd-button>
        </view>
      </view>

      <!-- 店内情况入口（长条按钮） -->
      <view class="mt-3">
        <wd-button
          type="primary"
          variant="plain"
          size="large"
          block
          custom-style="background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.4); color: #fff;"
          @click="goDashboard"
        >
          <view class="flex items-center gap-1.5">
            <view class="i-ri-store-2-line text-lg" />
            <text class="text-base font-bold">
              {{ $t('dashboard.title') }}
            </text>
          </view>
        </wd-button>
      </view>

      <!-- 桌台状态概览：融入主题色头部 -->
      <view class="mt-3 flex gap-2">
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5" @tap="goOrdering">
          <view class="text-sm text-white font-bold">
            {{ statusCount.idle }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.idle') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5" @tap="goOrdering">
          <view class="text-sm text-white font-bold">
            {{ statusCount.reserved }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.reserved') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5" @tap="goOrdering">
          <view class="text-sm text-white font-bold">
            {{ statusCount.occupied }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.occupied') }}
          </view>
        </view>
        <view class="flex flex-1 flex-col items-center rounded-2 bg-white/15 py-1.5">
          <view class="text-sm text-white/60 font-bold">
            {{ statusCount.disabled }}
          </view>
          <view class="text-3xs text-white/80">
            {{ $t('home.status.disabled') }}
          </view>
        </view>
      </view>
    </view>

    <!-- 内容分栏（wot-ui Tabs，激活色跟随主题色） -->
    <view class="mt-2">
      <wd-tabs v-model="activeTab" line-width="40rpx">
        <wd-tab :title="$t('home.tab.dining')" :badge-props="activeSessions.length ? { value: activeSessions.length, max: 99 } : undefined">
          <!-- 就餐中：横滑卡片，单屏无纵向滚动 -->
          <view v-if="loading && !tables.length" class="flex justify-center py-10">
            <wd-loading color="var(--wot-color-theme, #5D87FF)" />
          </view>
          <scroll-view
            v-else-if="activeSessions.length"
            class="w-full whitespace-nowrap px-3 pb-3"
            scroll-x
            :show-scrollbar="false"
          >
            <view
              v-for="session in activeSessions"
              :key="session.sessionNo"
              class="mr-3 inline-block w-52 overflow-hidden rounded-3 bg-white"
              @tap="goOrdering"
            >
              <view class="flex flex-col gap-1.5 p-4">
                <view class="flex items-baseline justify-between">
                  <text class="text-lg text-gray-800 font-bold">
                    {{ session.tableNo }}
                  </text>
                  <text class="text-2xs text-gray-400">
                    {{ formatDuration(session.openedAt) }}
                  </text>
                </view>
                <view class="text-sm text-primary font-bold">
                  {{ formatMoney(session.totalAmountCents) }}
                </view>
                <view class="text-2xs text-gray-400">
                  {{ t('home.sessionOrders', { count: session.orderCount }) }} · {{ session.sessionNo }}
                </view>
              </view>
            </view>
          </scroll-view>
          <wd-empty v-else :tip="$t('home.empty.sessions')" />
        </wd-tab>

        <wd-tab :title="$t('home.tab.reservations')" :badge-props="reservations.length ? { value: reservations.length, max: 99 } : undefined">
          <view v-if="loading && !tables.length" class="flex justify-center py-10">
            <wd-loading color="var(--wot-color-theme, #5D87FF)" />
          </view>
          <scroll-view
            v-else-if="reservations.length"
            class="w-full whitespace-nowrap px-3 pb-3"
            scroll-x
            :show-scrollbar="false"
          >
            <view
              v-for="rsv in reservations"
              :key="rsv.id"
              class="mr-3 inline-block w-52 overflow-hidden rounded-3 bg-white"
              @tap="goReservation"
            >
              <view class="flex flex-col gap-1.5 p-4">
                <view class="flex items-center justify-between">
                  <text class="text-base text-gray-800 font-bold">
                    {{ formatTime(rsv.arrivalTime) }}
                  </text>
                  <wd-tag type="warning" variant="light" size="small" round>
                    {{ $t('home.tag.reserved') }}
                  </wd-tag>
                </view>
                <view class="text-xs text-gray-800">
                  {{ rsv.guestName }} · {{ t('home.partySize', { count: rsv.partySize }) }}
                </view>
                <view class="truncate text-2xs text-gray-400">
                  {{ tableTypeLabel(rsv.tableType) }} · {{ t('home.tableLabel', { no: rsv.tableNo }) }}<template v-if="rsv.prepMeal">
                    · {{ $t('home.prepMeal') }}
                  </template>
                </view>
              </view>
            </view>
          </scroll-view>
          <wd-empty v-else :tip="$t('home.empty.reservations')" />
        </wd-tab>

        <wd-tab :title="$t('home.tab.dishes')">
          <view v-if="loading && !tables.length" class="flex justify-center py-10">
            <wd-loading color="var(--wot-color-theme, #5D87FF)" />
          </view>
          <scroll-view
            v-else-if="hotDishes.length"
            class="w-full whitespace-nowrap px-3 pb-3"
            scroll-x
            :show-scrollbar="false"
          >
            <view
              v-for="dish in hotDishCards"
              :key="dish.id"
              class="mr-3 inline-block w-36"
              @tap="goMenus"
            >
              <app-dish-card :dish="dish" />
            </view>
          </scroll-view>
          <wd-empty v-else :tip="$t('home.empty.dishes')" />
        </wd-tab>
      </wd-tabs>
    </view>

    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
.home {
  /* 单屏布局：视口高度减去自定义 tabbar 占位（50px + 底部安全区） */
  height: calc(100vh - 50px);
  height: calc(100vh - 50px - env(safe-area-inset-bottom));
}
</style>
