<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { ReservationService } from '@/service/ordering'
import type { ReservationItem, ReservationPreOrderItem, ReservationStatus } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'Reservation',
})
definePage({
  style: {
    navigationBarTitleText: '%reservation.title%',
    enablePullDownRefresh: true,
  },
})

const PAGE_SIZE = 20

type StatusTab = 'all' | ReservationStatus

/** 状态筛选 Tab（FR-RSV-02 状态筛选） */
const STATUS_TABS: Array<{ value: StatusTab, titleKey: string }> = [
  { value: 'reserved', titleKey: 'reservation.tab.reserved' },
  { value: 'arrived', titleKey: 'reservation.tab.arrived' },
  // { value: 'no_show', titleKey: 'reservation.tab.noShow' },
  { value: 'cancelled', titleKey: 'reservation.tab.cancelled' },
  { value: 'all', titleKey: 'reservation.tab.all' },
]

/** 预定状态 → wd-tag 类型 */
const STATUS_TAG: Record<ReservationStatus, 'warning' | 'success' | 'default'> = {
  reserved: 'warning',
  arrived: 'success',
  cancelled: 'default',
  no_show: 'default',
}

const toast = useToast()
const dialog = useDialog()

const activeTab = ref<StatusTab>('reserved')
const loading = ref(false)
const loadingMore = ref(false)
const reservations = ref<ReservationItem[]>([])
const total = ref(0)
const page = ref(1)

const finished = computed(() => reservations.value.length >= total.value)

/** 展开预点菜单的预定 id（同时仅展开一条） */
const expandedId = ref<number | null>(null)
/** 预点菜单明细缓存（FR-RSV-02 可展开） */
const preOrderMap = ref(new Map<number, ReservationPreOrderItem[]>())

/** 更多操作弹层（编辑 / 标记未到店 / 取消） */
const actionSheetVisible = ref(false)
const actionTarget = ref<ReservationItem | null>(null)

const actionItems = computed(() => [
  { name: t('reservation.action.edit') },
  { name: t('reservation.action.noShow') },
  { name: t('reservation.action.cancel'), color: 'var(--wot-color-danger, #fa4350)' },
])

/** 单一操作提交中（到店开台 / 取消 / 未到店） */
const submitting = ref(false)

/** 到店日期归组键（PRD 6.6：按到店日期归组） */
function dateKey(iso: string): string {
  return iso.slice(0, 10)
}

/** 日期组头：MM月DD日 周X（复用 home.dateLabel / home.week） */
function dateLabel(iso: string): string {
  const date = new Date(iso)
  return t('home.dateLabel', {
    m: date.getMonth() + 1,
    d: date.getDate(),
    week: t(`home.week.${date.getDay()}`),
  })
}

/** MM-DD HH:mm */
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function tableTypeLabel(rsv: ReservationItem): string {
  return t(`home.type.${rsv.tableType}`)
}

async function loadReservations(reset = true) {
  if (loading.value || loadingMore.value) {
    return
  }
  if (reset) {
    loading.value = true
  }
  else {
    loadingMore.value = true
  }
  try {
    const next = reset ? 1 : page.value + 1
    const result = await ReservationService.getList({
      current: next,
      size: PAGE_SIZE,
      status: activeTab.value === 'all' ? undefined : activeTab.value,
    })
    reservations.value = reset
      ? result.records
      : reservations.value.concat(result.records)
    total.value = result.total
    page.value = next
    if (reset) {
      expandedId.value = null
    }
  }
  catch (error) {
    console.log('预定列表加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.loadFailed'))
  }
  finally {
    loading.value = false
    loadingMore.value = false
  }
}

watch(activeTab, () => {
  loadReservations(true)
})

onShow(() => {
  loadReservations(true)
})

onPullDownRefresh(async () => {
  await loadReservations(true)
  uni.stopPullDownRefresh()
})

function loadMore() {
  if (finished.value || loading.value || loadingMore.value) {
    return
  }
  loadReservations(false)
}

/** 展开 / 收起预点菜单明细（懒加载缓存） */
async function togglePreOrders(rsv: ReservationItem) {
  if (expandedId.value === rsv.id) {
    expandedId.value = null
    return
  }
  if (!preOrderMap.value.has(rsv.id)) {
    try {
      preOrderMap.value.set(rsv.id, await ReservationService.getPreOrders(rsv.id))
    }
    catch (error) {
      console.log('预点菜单加载失败', error)
      toast.error(error instanceof ServiceError ? error.message : t('reservation.loadFailed'))
      return
    }
  }
  expandedId.value = rsv.id
}

function goCreate() {
  uni.navigateTo({ url: '/pages/reservation/form' })
}

/** 到店开台核销（FR-RSV-03）：预点菜单自动转首笔订单 */
async function handleCheckIn(rsv: ReservationItem) {
  if (submitting.value) {
    return
  }
  const result = await dialog.confirm({
    title: t('reservation.checkIn'),
    msg: t('reservation.checkIn.confirm', {
      no: rsv.tableNo,
      name: rsv.guestName,
      count: rsv.preOrderCount,
    }),
  })
  if (result.action !== 'confirm') {
    return
  }
  submitting.value = true
  try {
    const checkResult = await ReservationService.checkIn(rsv.id)
    toast.show(
      checkResult.skippedDishes.length
        ? t('reservation.checkIn.skipped', { dishes: checkResult.skippedDishes.join('、') })
        : t('reservation.checkIn.success'),
    )
    loadReservations(true)
    // 进入该开台的消费总览（FR-RSV-03：随后进入正常点餐/加单流程）
    setTimeout(() => {
      uni.navigateTo({ url: `/pages/orders/detail?id=${checkResult.sessionId}` })
    }, 600)
  }
  catch (error) {
    console.log('到店开台失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.checkIn.failed'))
  }
  finally {
    submitting.value = false
  }
}

/** 打开更多操作弹层（编辑 / 标记未到店 / 取消） */
function openActions(rsv: ReservationItem) {
  actionTarget.value = rsv
  actionSheetVisible.value = true
}

/** wd-action-sheet v2 select 事件回传 { item, index } */
function onActionSelect({ index }: { item: { name: string }, index: number }) {
  const rsv = actionTarget.value
  actionSheetVisible.value = false
  if (!rsv) {
    return
  }
  if (index === 0) {
    uni.navigateTo({ url: `/pages/reservation/form?id=${rsv.id}` })
  }
  else if (index === 1) {
    handleNoShow(rsv)
  }
  else if (index === 2) {
    handleCancel(rsv)
  }
}

/** 取消预定（FR-RSV-04）：二次确认，桌状态自动释放 */
async function handleCancel(rsv: ReservationItem) {
  if (submitting.value) {
    return
  }
  const result = await dialog.confirm({
    title: t('reservation.action.cancel'),
    msg: t('reservation.cancel.confirm', { no: rsv.reservationNo }),
  })
  if (result.action !== 'confirm') {
    return
  }
  submitting.value = true
  try {
    await ReservationService.cancel(rsv.id)
    toast.show(t('reservation.cancel.success'))
    loadReservations(true)
  }
  catch (error) {
    console.log('取消预定失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.cancel.failed'))
  }
  finally {
    submitting.value = false
  }
}

/** 标记未到店（FR-RSV-05）：仅已约定状态可标记，桌状态自动释放 */
async function handleNoShow(rsv: ReservationItem) {
  if (submitting.value) {
    return
  }
  const result = await dialog.confirm({
    title: t('reservation.action.noShow'),
    msg: t('reservation.noShow.confirm', { no: rsv.reservationNo }),
  })
  if (result.action !== 'confirm') {
    return
  }
  submitting.value = true
  try {
    await ReservationService.markNoShow(rsv.id)
    toast.show(t('reservation.noShow.success'))
    loadReservations(true)
  }
  catch (error) {
    console.log('标记未到店失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('reservation.noShow.failed'))
  }
  finally {
    submitting.value = false
  }
}

/** 已到店预定跳转关联开台的消费总览 */
function goSession(rsv: ReservationItem) {
  if (rsv.sessionId) {
    uni.navigateTo({ url: `/pages/orders/detail?id=${rsv.sessionId}` })
  }
}
</script>

<template>
  <view class="reservation flex flex-col bg-gray-100">
    <!-- 状态筛选 -->
    <view class="bg-white">
      <wd-tabs v-model="activeTab" line-width="40rpx">
        <wd-tab
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          :name="tab.value"
          :title="$t(tab.titleKey)"
        />
      </wd-tabs>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && !reservations.length" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <!-- 预定列表（按到店日期归组） -->
    <scroll-view
      v-else-if="reservations.length"
      class="min-h-0 flex-1"
      scroll-y
      :show-scrollbar="false"
      @scrolltolower="loadMore"
    >
      <view class="flex flex-col gap-2 px-3 py-3">
        <template v-for="(rsv, index) in reservations" :key="rsv.id">
          <!-- 日期组头（PRD 6.6：按到店日期归组） -->
          <view
            v-if="index === 0 || dateKey(rsv.arrivalTime) !== dateKey(reservations[index - 1].arrivalTime)"
            class="flex items-center gap-1.5 px-1 pt-1 text-2xs text-gray-400"
          >
            <view class="i-ri-calendar-line" />
            {{ dateLabel(rsv.arrivalTime) }}
          </view>

          <!-- 预定卡片 -->
          <view class="rounded-3 bg-white p-3.5">
            <!-- 头部：预定人 + 状态 -->
            <view class="flex items-center justify-between">
              <view class="min-w-0">
                <view class="flex items-baseline gap-2">
                  <text class="truncate text-base text-gray-800 font-bold">
                    {{ rsv.guestName }}
                  </text>
                  <text class="shrink-0 text-2xs text-gray-400">
                    {{ $t('home.partySize', { count: rsv.partySize }) }}
                  </text>
                </view>
                <view class="mt-0.5 truncate text-2xs text-gray-400">
                  {{ rsv.reservationNo }}
                </view>
              </view>
              <wd-tag :type="STATUS_TAG[rsv.status]" variant="light" size="small" round>
                {{ $t(`reservation.status.${rsv.status}`) }}
              </wd-tag>
            </view>

            <!-- 信息行 -->
            <view class="mt-2.5 flex flex-col gap-1 text-xs text-gray-600">
              <view class="flex items-center gap-1.5">
                <view class="i-ri-restaurant-line shrink-0 text-gray-300" />
                {{ tableTypeLabel(rsv) }} · {{ $t('home.tableLabel', { no: rsv.tableNo }) }}
                <wd-tag v-if="rsv.prepMeal" type="warning" variant="light" size="small" round>
                  {{ $t('home.prepMeal') }}
                </wd-tag>
              </view>
              <view class="flex items-center gap-1.5">
                <view class="i-ri-time-line shrink-0 text-gray-300" />
                {{ formatDateTime(rsv.arrivalTime) }}
              </view>
              <view class="flex items-center gap-1.5">
                <view class="i-ri-phone-line shrink-0 text-gray-300" />
                {{ rsv.phone }}
              </view>
              <view v-if="rsv.note" class="flex items-center gap-1.5">
                <view class="i-ri-chat-3-line shrink-0 text-gray-300" />
                {{ rsv.note }}
              </view>
            </view>

            <!-- 预点菜单（可展开明细，FR-RSV-02） -->
            <view v-if="rsv.preOrderCount" class="mt-2.5 border-t border-gray-100 pt-2.5">
              <view
                class="flex items-center gap-1 text-2xs text-primary active:opacity-70"
                @tap="togglePreOrders(rsv)"
              >
                <view class="i-ri-file-list-3-line" />
                {{ $t('reservation.preOrders', { count: rsv.preOrderCount }) }}
                <view :class="expandedId === rsv.id ? 'i-ri-arrow-up-s-line' : 'i-ri-arrow-down-s-line'" />
              </view>
              <view v-if="expandedId === rsv.id" class="mt-2 divide-y divide-gray-100">
                <view
                  v-for="item in preOrderMap.get(rsv.id) ?? []"
                  :key="item.id"
                  class="flex items-center justify-between gap-2 py-1.5"
                >
                  <view class="min-w-0">
                    <view
                      class="truncate text-xs"
                      :class="item.dishStatus === 'off_sale' ? 'text-gray-400 line-through' : 'text-gray-800'"
                    >
                      {{ item.dishName }}
                    </view>
                    <view v-if="item.dishStatus === 'off_sale'" class="text-2xs text-amber-600">
                      {{ $t('reservation.preOrder.offSale') }}
                    </view>
                    <view v-if="item.note" class="truncate text-2xs text-gray-400">
                      {{ item.note }}
                    </view>
                  </view>
                  <view class="shrink-0 text-2xs text-gray-400">
                    ×{{ item.quantity }}
                  </view>
                </view>
              </view>
            </view>

            <!-- 操作行：已约定 → 到店开台 + 更多；已到店 → 查看总览 -->
            <view
              v-if="rsv.status === 'reserved'"
              class="mt-2.5 flex items-center justify-end gap-2 border-t border-gray-100 pt-2.5"
            >
              <wd-button
                size="small"
                variant="plain"
                custom-class="!px-3"
                @click="openActions(rsv)"
              >
                {{ $t('reservation.action.more') }}
              </wd-button>
              <wd-button
                size="small"
                type="primary"
                custom-class="!px-3"
                :loading="submitting"
                @click="handleCheckIn(rsv)"
              >
                {{ $t('reservation.checkIn') }}
              </wd-button>
            </view>
            <view
              v-else-if="rsv.sessionId"
              class="mt-2.5 flex items-center justify-end border-t border-gray-100 pt-2.5"
            >
              <wd-button
                size="small"
                type="primary"
                variant="plain"
                custom-class="!px-3"
                @click="goSession(rsv)"
              >
                {{ $t('reservation.viewSession') }}
              </wd-button>
            </view>
          </view>
        </template>

        <!-- 加载更多 / 没有更多 -->
        <view class="flex items-center justify-center gap-1.5 py-2 text-2xs text-gray-300">
          <template v-if="loadingMore">
            <wd-loading size="24rpx" color="var(--wot-color-theme, #5D87FF)" />
            {{ $t('orders.loadingMore') }}
          </template>
          <template v-else-if="finished">
            {{ $t('orders.noMore') }}
          </template>
        </view>
      </view>
    </scroll-view>

    <!-- 空态 -->
    <view v-else class="flex flex-1 flex-col items-center justify-center">
      <wd-empty :tip="$t('reservation.empty')" />
    </view>

    <!-- 底部：新建预定入口（FR-RSV-01） -->
    <view class="border-t border-gray-200 bg-white px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
      <wd-button type="primary" size="large" block @click="goCreate">
        <view class="flex items-center justify-center gap-1.5">
          <view class="i-carbon-calendar text-base" />
          <text class="font-bold">
            {{ $t('reservation.create') }}
          </text>
        </view>
      </wd-button>
    </view>

    <!-- 更多操作（已约定：编辑 / 标记未到店 / 取消） -->
    <wd-action-sheet
      v-model="actionSheetVisible"
      :actions="actionItems"
      :cancel-text="$t('reservation.action.cancelText')"
      @select="onActionSelect"
    />

    <wd-toast />
    <wd-dialog />
  </view>
</template>

<style lang="scss" scoped>
.reservation {
  /* 非 tab 页：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0） */
  height: calc(100vh - var(--window-top, 0px));
}
</style>
