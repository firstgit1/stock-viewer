<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { fetchAnnouncement } from '../api/announcement'

const props = defineProps({
  active: { type: Boolean, default: true },
})

const enabled = ref(false)
const text = ref('')
const durationSec = ref(18)

const visible = computed(() => props.active && enabled.value && Boolean(text.value.trim()))

async function load() {
  if (!props.active) {
    enabled.value = false
    text.value = ''
    return
  }
  try {
    const data = await fetchAnnouncement({ force: true })
    enabled.value = Boolean(data.enabled)
    text.value = String(data.text || '').trim()
  } catch {
    enabled.value = false
    text.value = ''
  }
}

function tuneSpeed() {
  const len = text.value.length
  const mobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const base = mobile ? 10 : 14
  durationSec.value = Math.min(48, Math.max(12, base + len * 0.12))
}

watch(text, tuneSpeed)
watch(
  () => props.active,
  (on) => {
    if (on) load()
    else {
      enabled.value = false
      text.value = ''
    }
  },
)

onMounted(load)

defineExpose({ reload: load })
</script>

<template>
  <div v-if="visible" class="announce" role="status" aria-live="polite">
    <span class="horn" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path
          d="M3 10v4a1 1 0 0 0 1 1h2.2l3.4 2.7a1 1 0 0 0 1.6-.8V7.1a1 1 0 0 0-1.6-.8L6.2 9H4a1 1 0 0 0-1 1Zm14.1-2.3a1 1 0 0 0-1.4 1.4 4 4 0 0 1 0 5.8 1 1 0 1 0 1.4 1.4 6 6 0 0 0 0-8.6Zm2.5-2.6a1 1 0 1 0-1.5 1.3 8 8 0 0 1 0 11.2 1 1 0 1 0 1.5 1.3 10 10 0 0 0 0-13.8Z"
        />
      </svg>
    </span>
    <div class="viewport">
      <div class="track" :style="{ animationDuration: `${durationSec}s` }">
        <span class="msg">{{ text }}</span>
        <span class="msg" aria-hidden="true">{{ text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.announce {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 6px 14px;
  border-bottom: 1px solid rgba(212, 162, 76, 0.28);
  background: linear-gradient(90deg, rgba(212, 162, 76, 0.16), rgba(47, 143, 102, 0.1));
  color: #f0d59a;
}

.horn {
  flex: 0 0 auto;
  display: inline-flex;
  color: var(--warn);
  opacity: 0.95;
}

.viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}

.track {
  display: inline-flex;
  width: max-content;
  white-space: nowrap;
  animation-name: marquee;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}

.msg {
  flex: 0 0 auto;
  padding-right: 3rem;
  font-size: 0.9rem;
  letter-spacing: 0.02em;
  color: #f3e0b0;
}

@keyframes marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

@media (max-width: 768px) {
  .announce {
    gap: 8px;
    min-height: 34px;
    padding: 5px 10px;
  }

  .msg {
    padding-right: 2.2rem;
    font-size: 0.84rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .track {
    animation: none;
    transform: none;
  }

  .viewport {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    mask-image: none;
    -webkit-mask-image: none;
  }

  .msg + .msg {
    display: none;
  }
}
</style>
