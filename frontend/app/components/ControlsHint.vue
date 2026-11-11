<script setup lang="ts">
const visible = defineModel<boolean>({ default: true })
const selectModifier = useSelectModifier()
</script>

<template>
  <v-card
    v-if="visible"
    class="controls-hint"
    elevation="4"
    density="compact"
    data-testid="controls-hint"
  >
    <v-card-title class="d-flex align-center text-sm font-bold">
      Controls
      <v-spacer />
      <v-btn
        icon="mdi-close"
        size="x-small"
        variant="text"
        aria-label="Hide controls"
        @click="visible = false"
      />
    </v-card-title>
    <v-card-text class="text-xs">
      <p class="group-title">
        Move around
      </p>
      <dl>
        <dt>Left drag</dt><dd>Pan</dd>
        <dt>Scroll</dt><dd>Zoom</dd>
        <dt>Click image</dt><dd>Lock it and open its detail window</dd>
        <dt>Esc</dt><dd>Unlock</dd>
      </dl>

      <p class="group-title">
        Select images
      </p>
      <dl>
        <dt>Right drag</dt><dd>Lasso, replaces the selection</dd>
        <dt>{{ selectModifier }} + right drag</dt><dd>Lasso, adds to the selection</dd>
        <dt>{{ selectModifier }} + click</dt><dd>Add or remove one image</dd>
      </dl>

      <p class="group-title">
        Label images
      </p>
      <ol>
        <li>Select images in the view.</li>
        <li>Click a label in the left panel.</li>
        <li>Press <strong>Assign</strong> below the labels.</li>
      </ol>

      <p class="mt-2 text-gray-500">
        Reopen this card with the help button in the top bar.
      </p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.controls-hint {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  width: 300px;
  max-width: calc(100% - 24px);
  opacity: 0.95;
}

.group-title {
  margin-top: 8px;
  margin-bottom: 2px;
  font-weight: 600;
}

.group-title:first-child {
  margin-top: 0;
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 12px;
  row-gap: 2px;
}

dt {
  font-weight: 500;
  white-space: nowrap;
}

dd {
  margin: 0;
}

ol {
  padding-left: 18px;
  list-style: decimal;
}
</style>
