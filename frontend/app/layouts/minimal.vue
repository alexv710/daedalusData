<script setup lang="ts">
import { ref } from 'vue'

const drawerLeft = ref(false)
const drawerRight = ref(false)
</script>

<template>
  <v-app>
    <v-layout>
      <!-- Application Header -->
      <v-app-bar dense flat>
        <v-app-bar-nav-icon variant="text" @click.stop="drawerLeft = !drawerLeft" />
        <v-app-bar-title class="text-sm font-bold">
          DaedalusData
        </v-app-bar-title>
        <v-spacer />
        <v-btn variant="text" class="text-sm" to="/">
          Home
        </v-btn>
        <v-btn variant="text" class="text-sm" to="/analysis">
          Analysis
        </v-btn>
        <v-btn variant="text" class="text-sm" to="/test">
          Test
        </v-btn>
        <DarkToggle class="mr-4" />
        <v-app-bar-nav-icon variant="text" @click.stop="drawerRight = !drawerRight" />
      </v-app-bar>

      <!-- Left Navigation Drawer -->
      <v-navigation-drawer
        v-model="drawerLeft"
        location="left"
        width="300"
        class="scrollable pa-0"
      >
        <v-list dense class="pa-0">
          <!-- Projection Selector -->
          <v-list-item class="pa-0">
            <v-card flat tile class="pa-0">
              <ProjectionSelector />
            </v-card>
          </v-list-item>
          <v-divider class="ma-0" />
          <!-- Label Alphabet Manager -->
          <v-list-item class="pa-0">
            <v-card flat tile class="pa-0">
              <LabelAlphabetManager />
            </v-card>
          </v-list-item>
        </v-list>
      </v-navigation-drawer>

      <!-- Main Content -->
      <v-main>
        <slot />
      </v-main>

      <!-- Right Navigation Drawer (Placeholders) -->
      <v-navigation-drawer
        v-model="drawerRight"
        location="right"
        class="pa-0"
      >
        <template #prepend>
          <v-list dense class="pa-0">
            <v-list-item class="pa-0">
              <v-card flat tile class="pa-0">
                <span>Placeholder 1</span>
              </v-card>
            </v-list-item>
            <v-list-item class="pa-0">
              <v-card flat tile class="pa-0">
                <span>Placeholder 2</span>
              </v-card>
            </v-list-item>
          </v-list>
        </template>
      </v-navigation-drawer>
    </v-layout>
  </v-app>
</template>

<style scoped>
.scrollable {
  overflow-y: auto;
}
</style>
