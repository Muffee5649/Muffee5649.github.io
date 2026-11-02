<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useDialog, useToast } from '@wot-ui/ui'
import { t } from '@/locale/index'
import { OrderService } from '@/service/ordering'
import type { SessionOrder, SessionOrderItem, SessionOverview, SessionStatus } from '@/service/ordering'
import { ServiceError } from '@/service/shared'

defineOptions({
  name: 'OrderDetail',
})
definePage({
  style: {
    navigationBarTitleText: '%orders.detail%',
  },
})

const toast = useToast()
const dialog = useDialog()

const sessionId = ref<number | null>(null)
const loading = ref(false)
const overview = ref<SessionOverview | null>(null)

/** 退菜弹层（FR-ORD-05） */
const refundVisible = ref(false)
const refundItem = ref<SessionOrderItem | null>(null)
const refundQty = ref(1)
const refundSubmitting = ref(false)

/** 结账提交中（FR-ORD-07） */
const settling = ref(false)

const session = computed(() => overview.value?.session ?? null)
const orders = computed(() => overview.value?.orders ?? [])
const isActive = computed(() => session.value?.status === 'active')
/** 存在有效订单（未下过单或全部取消时不允许结账，引导取消开台，FR-ORD-07 边界） */
const hasValidOrders = computed(() => (session.value?.orderCount ?? 0) > 0)

/** 金额展示：已结账展示实收结账金额 */
const displayAmount = computed(() => {
  const s = session.value
  if (!s) {
    return 0
  }
  return s.status === 'settled' ? (s.settledAmount ?? s.totalAmountCents) : s.totalAmountCents
})

/** 开台状态 → wd-tag 类型 */
const STATUS_TAG: Record<SessionStatus, 'primary' | 'success' | 'default'> = {
  active: 'primary',
  settled: 'success',
  cancelled: 'default',
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

/** MM-DD HH:mm */
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadOverview() {
  if (sessionId.value == null) {
    return
  }
  loading.value = true
  try {
    overview.value = await OrderService.getSessionOverview(sessionId.value)
  }
  catch (error) {
    console.log('消费总览加载失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  const id = Number(options?.id)
  if (Number.isFinite(id) && id > 0) {
    sessionId.value = id
    loadOverview()
  }
})

/** 条目可退菜：进行中开台 + 已下单订单 + 有效数量 > 0（FR-ORD-05） */
function canRefund(order: SessionOrder, item: SessionOrderItem): boolean {
  return isActive.value && order.status === 'placed' && item.effectiveQuantity > 0
}

/** 打开退菜弹层 */
function openRefund(item: SessionOrderItem) {
  refundItem.value = item
  refundQty.value = 1
  refundVisible.value = true
}

/** 确认退菜 */
async function confirmRefund() {
  const item = refundItem.value
  if (!item || refundQty.value < 1 || refundSubmitting.value) {
    return
  }
  refundSubmitting.value = true
  try {
    await OrderService.refundOrderItem(item.id, refundQty.value)
    refundVisible.value = false
    toast.show(t('orders.refund.success'))
    loadOverview()
  }
  catch (error) {
    console.log('退菜失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.refund.failed'))
  }
  finally {
    refundSubmitting.value = false
  }
}

/** 整单取消（FR-ORD-06） */
async function handleCancelOrder(order: SessionOrder) {
  const result = await dialog.confirm({
    title: t('orders.cancelOrder'),
    msg: t('orders.cancelOrder.confirm', { seq: order.seq }),
  })
  if (result.action !== 'confirm') {
    return
  }
  try {
    await OrderService.cancelOrder(order.id)
    toast.show(t('orders.cancelOrder.success'))
    loadOverview()
  }
  catch (error) {
    console.log('整单取消失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.cancelOrder.failed'))
  }
}

/** 结账（FR-ORD-07）：以当前合计做并发保护比对 */
async function handleSettle() {
  const s = session.value
  if (!s || settling.value) {
    return
  }
  const result = await dialog.confirm({
    title: t('orders.settle'),
    msg: t('orders.settle.confirm', {
      count: s.orderCount,
      total: formatMoney(s.totalAmountCents),
    }),
  })
  if (result.action !== 'confirm') {
    return
  }
  settling.value = true
  try {
    await OrderService.settleSession(s.id, s.totalAmountCents)
    toast.show(t('orders.settle.success'))
    loadOverview()
  }
  catch (error) {
    console.log('结账失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.settle.failed'))
  }
  finally {
    settling.value = false
  }
}

/** 取消开台（FR-ORD-08）：仅无已下单订单时可用 */
async function handleCancelSession() {
  const s = session.value
  if (!s) {
    return
  }
  const result = await dialog.confirm({
    title: t('orders.cancelSession'),
    msg: t('orders.cancelSession.confirm'),
  })
  if (result.action !== 'confirm') {
    return
  }
  try {
    await OrderService.cancelSession(s.id)
    toast.show(t('orders.cancelSession.success'))
    setTimeout(() => {
      if (getCurrentPages().length > 1) {
        uni.navigateBack()
      }
      else {
        uni.switchTab({ url: '/pages/orders/index' })
      }
    }, 600)
  }
  catch (error) {
    console.log('取消开台失败', error)
    toast.error(error instanceof ServiceError ? error.message : t('orders.cancelSession.failed'))
  }
}

/** 去点餐（FR-ORD-03 边界：开台下尚无订单时突出加单入口） */
function goOrdering() {
  uni.switchTab({ url: '/pages/menus/index' })
}
</script>

<template>
  <view class="detail flex flex-col bg-gray-100">
    <!-- 加载中 -->
    <view v-if="loading && !overview" class="flex flex-1 items-center justify-center">
      <wd-loading color="var(--wot-color-theme, #5D87FF)" />
    </view>

    <scroll-view v-else-if="session" class="min-h-0 flex-1" scroll-y :show-scrollbar="false">
      <!-- 头部：桌台会话信息（外层用 padding 留白，避免首子元素 margin 逃逸产生多余滚动） -->
      <view class="px-3 pt-3">
        <view class="rounded-3 bg-white p-3.5">
          <view class="flex items-center justify-between">
            <view class="min-w-0 flex items-center gap-2.5">
              <view class="h-11 w-11 flex shrink-0 items-center justify-center rounded-2 bg-primary/10 text-primary">
                <view class="i-ri-restaurant-line text-xl" />
              </view>
              <view class="min-w-0">
                <view class="flex items-baseline gap-2">
                  <text class="text-lg text-gray-800 font-bold">
                    {{ session.tableNo }}
                  </text>
                  <wd-tag :type="STATUS_TAG[session.status]" variant="light" size="small" round>
                    {{ $t(`orders.status.${session.status}`) }}
                  </wd-tag>
                </view>
                <view class="mt-0.5 truncate text-2xs text-gray-400">
                  {{ session.sessionNo }}
                </view>
              </view>
            </view>
            <view class="shrink-0 text-right">
              <view class="text-xl text-primary font-bold">
                {{ formatMoney(displayAmount) }}
              </view>
              <view class="mt-0.5 text-2xs text-gray-400">
                {{ session.status === 'settled' ? $t('orders.settledAmount') : $t('ordering.total') }}
              </view>
            </view>
          </view>

          <!-- 会话统计 -->
          <view class="grid grid-cols-3 mt-3 gap-2 border-t border-gray-100 pt-3 text-center">
            <view>
              <view class="text-2xs text-gray-400">
                {{ $t('orders.stat.orders') }}
              </view>
              <view class="mt-0.5 text-sm text-gray-800 font-bold">
                {{ session.orderCount }}
              </view>
            </view>
            <view>
              <view class="text-2xs text-gray-400">
                {{ $t('orders.stat.openedAt') }}
              </view>
              <view class="mt-0.5 text-sm text-gray-800 font-bold">
                {{ formatDateTime(session.openedAt) }}
              </view>
            </view>
            <view>
              <view class="text-2xs text-gray-400">
                {{ $t('orders.stat.diners') }}
              </view>
              <view class="mt-0.5 text-sm text-gray-800 font-bold">
                {{ session.dinerCount ?? '—' }}
              </view>
            </view>
          </view>

          <!-- 结账信息（已结账） -->
          <view
            v-if="session.status === 'settled' && session.settledAt"
            class="mt-2.5 flex items-center justify-center gap-1 text-2xs text-gray-400"
          >
            <view class="i-ri-check-line" />
            {{ $t('orders.settledAt') }} {{ formatDateTime(session.settledAt) }}
          </view>
        </view>
      </view>

      <!-- 订单列表（按下单时间升序） -->
      <view v-if="orders.length" class="flex flex-col gap-2.5 px-3 py-3">
        <view
          v-for="order in orders"
          :key="order.id"
          class="overflow-hidden rounded-3 bg-white"
          :class="{ 'opacity-60': order.status === 'cancelled' }"
        >
          <!-- 订单头部 -->
          <view class="flex items-center justify-between px-3.5 pt-3">
            <view class="min-w-0 flex items-center gap-2">
              <view class="shrink-0 rounded-1 bg-primary/10 px-1.5 py-0.5 text-2xs text-primary font-bold">
                #{{ order.seq }}
              </view>
              <text class="truncate text-2xs text-gray-400">
                {{ order.orderNo }}
              </text>
            </view>
            <wd-tag
              :type="order.status === 'placed' ? 'primary' : 'default'"
              variant="light"
              size="small"
              round
            >
              {{ $t(`orders.orderStatus.${order.status}`) }}
            </wd-tag>
          </view>
          <view class="flex items-center gap-1 px-3.5 pt-1.5 text-2xs text-gray-400">
            <view class="i-ri-time-line" />
            {{ formatDateTime(order.placedAt) }} · {{ order.placedBy }}
          </view>
          <view v-if="order.note" class="px-3.5 pt-1 text-2xs text-amber-600">
            {{ $t('orders.note') }}：{{ order.note }}
          </view>

          <!-- 条目明细 -->
          <view class="mt-1.5 px-3.5 divide-y divide-gray-100">
            <view v-for="item in order.items" :key="item.id" class="flex items-center gap-2 py-2.5">
              <view class="min-w-0 flex-1">
                <view class="flex items-center gap-1.5">
                  <text class="truncate text-sm text-gray-800">
                    {{ item.dishName }}
                  </text>
                  <text v-if="item.refundedQuantity" class="shrink-0 text-2xs text-gray-400">
                    {{ $t('orders.refunded', { count: item.refundedQuantity }) }}
                  </text>
                </view>
                <view class="mt-0.5 truncate text-2xs text-gray-400">
                  {{ item.quantity }} × {{ formatMoney(item.unitPriceCents) }}
                  <template v-if="item.note">
                    · {{ item.note }}
                  </template>
                </view>
              </view>
              <view class="shrink-0 text-sm text-gray-800 font-bold">
                {{ formatMoney(item.subtotalCents) }}
              </view>
              <wd-button
                v-if="canRefund(order, item)"
                size="small"
                type="danger"
                variant="plain"
                custom-class="!px-2"
                @click="openRefund(item)"
              >
                {{ $t('orders.refund') }}
              </wd-button>
            </view>
          </view>

          <!-- 订单底部 -->
          <view class="flex items-center justify-between px-3.5 pb-3 pt-1">
            <wd-button
              v-if="isActive && order.status === 'placed'"
              size="small"
              type="danger"
              variant="plain"
              @click="handleCancelOrder(order)"
            >
              {{ $t('orders.cancelOrder') }}
            </wd-button>
            <view v-else />
            <view class="text-sm text-gray-800 font-bold">
              {{ $t('orders.orderAmount') }} {{ formatMoney(order.amountCents) }}
            </view>
          </view>
        </view>
      </view>

      <!-- 尚未下单（FR-ORD-03 边界） -->
      <view v-else class="flex flex-col items-center gap-3 px-3 py-8">
        <wd-empty :tip="$t('orders.emptyOrders')" />
        <wd-button v-if="isActive" type="primary" variant="plain" size="small" @click="goOrdering">
          {{ $t('orders.goOrdering') }}
        </wd-button>
      </view>
    </scroll-view>

    <!-- 开台不存在 -->
    <view v-else class="flex flex-1 items-center justify-center">
      <wd-empty :tip="$t('orders.detail.notFound')" />
    </view>

    <!-- 底部操作栏：进行中开台可结账 / 取消开台 -->
    <view
      v-if="session && isActive"
      class="flex items-center gap-3 border-t border-gray-200 bg-white px-4 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
    >
      <view class="min-w-0 flex-1">
        <view class="text-2xs text-gray-400">
          {{ $t('home.sessionOrders', { count: session.orderCount }) }} · {{ $t('ordering.total') }}
        </view>
        <view class="text-xl text-primary font-bold">
          {{ formatMoney(session.totalAmountCents) }}
        </view>
      </view>
      <wd-button
        v-if="hasValidOrders"
        type="primary"
        size="large"
        custom-class="!px-8"
        :loading="settling"
        @click="handleSettle"
      >
        {{ $t('orders.settle') }}
      </wd-button>
      <wd-button
        v-else
        type="danger"
        size="large"
        custom-class="!px-8"
        @click="handleCancelSession"
      >
        {{ $t('orders.cancelSession') }}
      </wd-button>
    </view>

    <!-- 退菜弹层 -->
    <wd-popup v-model="refundVisible" position="bottom">
      <view v-if="refundItem" class="px-4 pb-6 pt-5">
        <view class="text-base text-gray-800 font-bold">
          {{ $t('orders.refund.title') }}
        </view>
        <view class="mt-1 text-sm text-gray-600">
          {{ refundItem.dishName }}
        </view>
        <view class="mt-4 flex items-center justify-between">
          <view class="text-sm text-gray-600">
            {{ $t('orders.refund.qty') }}
          </view>
          <wd-input-number v-model="refundQty" :min="1" :max="refundItem.effectiveQuantity" />
        </view>
        <view class="mt-2 text-right text-2xs text-gray-400">
          {{ $t('orders.refund.remaining', { count: refundItem.effectiveQuantity }) }}
        </view>
        <wd-button
          type="danger"
          size="large"
          block
          class="mt-4"
          :loading="refundSubmitting"
          @click="confirmRefund"
        >
          {{ $t('orders.refund.confirm') }}
        </wd-button>
      </view>
    </wd-popup>

    <wd-toast />
    <wd-dialog />
  </view>
</template>

<style lang="scss" scoped>
.detail {
  /* 非 tab 页：视口高度减去 H5 导航栏（--window-top，小程序端无此变量取 0） */
  height: calc(100vh - var(--window-top, 0px));
}
</style>
