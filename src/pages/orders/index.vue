<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { OrderService } from '@/service/ordering'
import type { SessionListItem, SessionStatus } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'Orders',
})
definePage({
  style: {
    navigationBarTitleText: '%orders.title%',
    enablePullDownRefresh: true,
  },
})

const PAGE_SIZE = 20

type StatusTab = 'all' | SessionStatus

/** 状态筛选 Tab（FR-ORD-04 基础筛选） */
const STATUS_TABS: Array<{ value: StatusTab, titleKey: string }> = [
  { value: 'active', titleKey: 'orders.tab.active' },
  { value: 'settled', titleKey: 'orders.tab.settled' },
  { value: 'cancelled', titleKey: 'orders.tab.cancelled' },
  { value: 'all', titleKey: 'orders.tab.all' },
]

/** 开台状态 → wd-tag 类型 */
const STATUS_TAG: Record<SessionStatus, 'primary' | 'success' | 'default'> = {
  active: 'primary',
  settled: 'success',
  cancelled: 'default',
}

const toast = useToast()
const activeTab = ref<StatusTab>('active')
const loading = ref(false)
const loadingMore = ref(false)
const sessions = ref<SessionListItem[]>([])
const total = ref(0)
const page = ref(1)

const finished = computed(() => sessions.value.length >= total.value)

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** 开台时间 MM-DD HH:mm */
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 列表金额：已结账展示实收结账金额，其余展示合计 */
function sessionAmount(session: SessionListItem): number {
  return session.status === 'settled'
    ? (session.settledAmount ?? session.totalAmountCents)
    : session.totalAmountCents
}

async function loadSessions(reset = true) {
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
    const result = await OrderService.getList({
      current: next,
      size: PAGE_SIZE,
      status: activeTab.value === 'all' ? undefined : activeTab.value,
    })
    sessions.value = reset ? result.records : sessions.value.concat(result.records)
    total.value = result.total
    page.value = next
  }
  catch (error) {
    console.log('订单列表加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.loadFailed'))
  }
  finally {
    loading.value = false
    loadingMore.value = false
  }
}

watch(activeTab, () => {
  loadSessions(true)
})

onShow(() => {
  loadSessions(true)
})

onPullDownRefresh(async () => {
  await loadSessions(true)
  uni.stopPullDownRefresh()
})

function loadMore() {
  if (finished.value || loading.value || loadingMore.value) {
    return
  }
  loadSessions(false)
}

function goDetail(session: SessionListItem) {
  uni.navigateTo({ url: `/pages/orders/detail?id=${session.id}` })
}
</script>

<template>
  <view class="orders flex flex-col bg-gray-100">
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
    <view v-if="loading && !sessions.length" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <!-- 开台列表 -->
    <scroll-view
      v-else-if="sessions.length"
      class="min-h-0 flex-1"
      scroll-y
      :show-scrollbar="false"
      @scrolltolower="loadMore"
    >
      <view class="flex flex-col gap-2 px-3 py-3">
        <view
          v-for="session in sessions"
          :key="session.id"
          class="rounded-3 bg-white p-3.5 active:opacity-70"
          @tap="goDetail(session)"
        >
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-2.5">
              <view class="h-10 w-10 flex items-center justify-center rounded-2 bg-primary/10 text-primary">
                <view class="i-ri-restaurant-line text-lg" />
              </view>
              <view class="min-w-0">
                <view class="text-base text-gray-800 font-bold">
                  {{ session.tableNo }}
                </view>
                <view class="mt-0.5 truncate text-2xs text-gray-400">
                  {{ session.sessionNo }}
                </view>
              </view>
            </view>
            <wd-tag :type="STATUS_TAG[session.status]" variant="light" size="small" round>
              {{ $t(`orders.status.${session.status}`) }}
            </wd-tag>
          </view>
          <view class="mt-3 flex items-end justify-between border-t border-gray-100 pt-2.5">
            <view class="text-2xs text-gray-400">
              {{ formatDateTime(session.openedAt) }}
              <template v-if="session.dinerCount">
                · {{ $t('home.partySize', { count: session.dinerCount }) }}
              </template>
              · {{ $t('home.sessionOrders', { count: session.orderCount }) }}
            </view>
            <view class="text-lg text-primary font-bold">
              {{ formatMoney(sessionAmount(session)) }}
            </view>
          </view>
        </view>

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
      <wd-empty :tip="$t('orders.empty')" />
    </view>

    <wd-toast />
  </view>
</template>

<style lang="scss" scoped>
.orders {
  /* tab 页：视口高度减去 H5 导航栏（--window-top）与自定义 tabbar（50px + 安全区） */
  height: calc(100vh - var(--window-top, 0px) - 50px);
  height: calc(100vh - var(--window-top, 0px) - 50px - env(safe-area-inset-bottom));
}
</style>
