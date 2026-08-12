<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchMe } from '../api/auth'
import { FEATURE_DEFS } from '../api/feature-defs'
import { fetchFeatures } from '../api/features'
import LadderDay from '../views/LadderDay.vue'
import SevereAbnormal from '../views/SevereAbnormal.vue'
import StockSearch from '../views/StockSearch.vue'
import Telegraph from '../views/Telegraph.vue'
import UpgradeNotice from './UpgradeNotice.vue'

const props = defineProps({
  feature: { type: String, required: true },
})

const route = useRoute()
const loading = ref(true)
const enabled = ref(true)
const isAdmin = ref(false)

const viewMap = {
  ladder: LadderDay,
  telegraph: Telegraph,
  search: StockSearch,
  severeAbnormal: SevereAbnormal,
}

const view = computed(() => viewMap[props.feature] || null)
const label = computed(
  () => FEATURE_DEFS.find((x) => x.key === props.feature)?.label || props.feature,
)

async function refresh() {
  loading.value = true
  try {
    const [user, data] = await Promise.all([
      fetchMe(),
      fetchFeatures({ force: true }),
    ])
    isAdmin.value = Boolean(user?.isAdmin)
    const on = data?.features?.[props.feature]
    enabled.value = isAdmin.value || on !== false
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(() => route.fullPath, refresh)
</script>

<template>
  <div v-if="loading" class="page">
    <p class="status">加载中…</p>
  </div>
  <component :is="view" v-else-if="enabled && view" />
  <UpgradeNotice v-else :label="label" title="功能升级中" />
</template>
