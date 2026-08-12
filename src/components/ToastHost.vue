<script setup>
import { toast, useToastState } from '../composables/toast'

const state = useToastState()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in state.items"
          :key="item.id"
          class="toast"
          :class="item.type"
          @click="toast.remove(item.id)"
        >
          <span class="icon" aria-hidden="true">
            <template v-if="item.type === 'success'">✓</template>
            <template v-else-if="item.type === 'error'">!</template>
            <template v-else>i</template>
          </span>
          <span class="text">{{ item.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 4000;
  display: grid;
  gap: 10px;
  width: min(360px, calc(100vw - 28px));
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(27, 36, 48, 0.96);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  color: var(--text);
  cursor: pointer;
}

.toast.success {
  border-color: rgba(57, 166, 117, 0.55);
}

.toast.error {
  border-color: rgba(224, 112, 112, 0.55);
}

.toast.info {
  border-color: rgba(142, 197, 255, 0.45);
}

.icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
}

.toast.success .icon {
  background: rgba(47, 143, 102, 0.25);
  color: #5dce9a;
}

.toast.error .icon {
  background: rgba(224, 112, 112, 0.22);
  color: #f0a0a0;
}

.toast.info .icon {
  background: rgba(142, 197, 255, 0.18);
  color: #8ec5ff;
}

.text {
  font-size: 0.92rem;
  line-height: 1.35;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.22s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(18px);
}

.toast-move {
  transition: transform 0.22s ease;
}
</style>
