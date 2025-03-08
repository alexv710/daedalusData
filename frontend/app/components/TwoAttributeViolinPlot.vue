<script setup lang="ts">
import * as d3 from 'd3'

const props = defineProps({
  data: {
    type: Array,
    required: true,
  },
  colorMode: {
    type: Object,
    default: () => useColorMode(),
  },
  showViolin: {
    type: Boolean,
    default: true,
  },
  showBoxPlot: {
    type: Boolean,
    default: true,
  },
  showDataPoints: {
    type: Boolean,
    default: false,
  },
  pointSize: {
    type: Number,
    default: 3,
  },
  boxPlotWidth: {
    type: Number,
    default: 35,
  },
  violinWidth: {
    type: Number,
    default: 50,
  },
  colors: {
    type: [Function, Array],
    default: null,
  },
  aspectRatio: {
    type: Number,
    default: 16 / 9,
  },
})

const imageStore = useImageStore()

// Local state for toggles
const localShowViolin = ref(props.showViolin)
const localShowBoxPlot = ref(props.showBoxPlot)
const localShowDataPoints = ref(props.showDataPoints)

// DOM references
const chartContainer = ref(null)
const chart = ref(null)
const tooltip = ref(null)

// Attribute selection - using imageStore attributes
const selectedXAttribute = ref('')
const selectedYAttribute = ref('')
const binCount = ref(5)

// Set initial attribute selections
watch(() => imageStore.availableAttributes, (attrs) => {
  if (attrs.length > 0 && !selectedXAttribute.value) {
    selectedXAttribute.value = attrs[0]
  }
}, { immediate: true })

watch(() => imageStore.availableNumericAttributes, (attrs) => {
  if (attrs.length > 0 && !selectedYAttribute.value) {
    selectedYAttribute.value = attrs[0]
  }
}, { immediate: true })

// Check if selected X attribute is numeric (for binning)
const isSelectedXNumeric = computed(() => {
  if (!selectedXAttribute.value || !props.data || props.data.length === 0)
    return false

  return imageStore.availableNumericAttributes.includes(selectedXAttribute.value)
})

// Chart dimensions
const margin = { top: 15, right: 25, bottom: 50, left: 30 }
const width = computed(() => (chartContainer.value?.clientWidth || 0) - margin.left - margin.right)
const height = computed(() => (chartContainer.value?.clientHeight || 0) - margin.top - margin.bottom)

// Theme-aware colors
const isDarkMode = computed(() => props.colorMode.value === 'dark')

// Professional color palettes
const colorPalettes = {
  light: [
    '#3b82f6',
    '#8b5cf6',
    '#14b8a6',
    '#f97316',
    '#06b6d4',
    '#ec4899',
    '#10b981',
    '#6366f1',
    '#f59e0b',
    '#a855f7',
  ],
  dark: [
    '#60a5fa',
    '#a78bfa',
    '#2dd4bf',
    '#fb923c',
    '#22d3ee',
    '#f472b6',
    '#34d399',
    '#818cf8',
    '#fbbf24',
    '#c084fc',
  ],
}

// Get correct color array based on theme
const chartColors = computed(() => {
  return isDarkMode.value ? colorPalettes.dark : colorPalettes.light
})

// Create a color function based on the props or default theme colors
const colorFunct = computed(() => {
  if (typeof props.colors === 'function') {
    return props.colors
  }
  else if (Array.isArray(props.colors)) {
    return d3.scaleOrdinal().range(props.colors)
  }
  else {
    return d3.scaleOrdinal().range(chartColors.value)
  }
})

// Helper functions for kernel density estimation
function kernelDensityEstimator(kernel, X) {
  return function (V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))])
  }
}

function kernelEpanechnikov(k) {
  return function (v) {
    v /= k
    return Math.abs(v) <= 1 ? 0.75 * (1 - v * v) / k : 0
  }
}

// Create binned data for numeric X attributes
function createBinnedData(data) {
  if (!isSelectedXNumeric.value)
    return data

  // Extract all numeric values for the X attribute
  const numericValues = data
    .map(d => d[selectedXAttribute.value])
    .filter(v => typeof v === 'number' && !Number.isNaN(v))

  if (numericValues.length === 0)
    return data

  // Create a scale for binning
  const extent = d3.extent(numericValues)
  const binScale = d3.scaleQuantize()
    .domain(extent)
    .range(d3.range(binCount.value))

  // Create bin labels
  const binLabels = d3.range(binCount.value).map((i) => {
    const binStart = binScale.invertExtent(i)[0]
    const binEnd = binScale.invertExtent(i)[1]
    return `${binStart.toFixed(1)} - ${binEnd.toFixed(1)}`
  })

  // Apply binning to data
  return data.map((d) => {
    const value = d[selectedXAttribute.value]
    const result = { ...d }

    if (typeof value === 'number' && !Number.isNaN(value)) {
      const binIndex = binScale(value)
      result[`${selectedXAttribute.value}__binned`] = binLabels[binIndex]
    }
    else {
      result[`${selectedXAttribute.value}__binned`] = 'N/A'
    }

    return result
  })
}

// Main chart drawing function
function drawChart() {
  if (!chartContainer.value || !chart.value || !props.data
    || props.data.length === 0 || !selectedXAttribute.value || !selectedYAttribute.value) {
    showEmptyState()
    return
  }

  // Filter data to only include items with valid values for both attributes
  let filteredData = props.data.filter(item =>
    item[selectedXAttribute.value] !== undefined
    && item[selectedXAttribute.value] !== null
    && item[selectedYAttribute.value] !== undefined
    && item[selectedYAttribute.value] !== null
    && typeof item[selectedYAttribute.value] === 'number'
    && !Number.isNaN(item[selectedYAttribute.value]),
  )

  if (filteredData.length === 0) {
    showEmptyState()
    return
  }

  // Apply binning if X attribute is numeric
  if (isSelectedXNumeric.value) {
    filteredData = createBinnedData(filteredData)
  }

  const svg = d3.select(chart.value)
  svg.selectAll('*').remove()

  svg
    .attr('viewBox', `0 0 ${width.value + margin.left + margin.right} ${height.value + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Group data by x-attribute or its binned version
  const xAttr = isSelectedXNumeric.value ? `${selectedXAttribute.value}__binned` : selectedXAttribute.value
  const groupedData = d3.group(filteredData, d => d[xAttr])

  // Create scales
  const xScale = d3.scaleBand()
    .domain(Array.from(groupedData.keys()))
    .range([0, width.value])
    .padding(0.2)

  const yValues = filteredData.map(d => d[selectedYAttribute.value])
  const yMin = d3.min(yValues)
  const yMax = d3.max(yValues)
  // Add 5% padding to the y domain
  const yPadding = (yMax - yMin) * 0.05

  const yScale = d3.scaleLinear()
    .domain([yMin - yPadding, yMax + yPadding])
    .range([height.value, 0])

  // Draw grid lines for better readability
  addGridLines(g, width.value, yScale)

  // Draw violin plots
  if (localShowViolin.value) {
    drawViolinPlots(g, groupedData, xScale, yScale)
  }

  // Draw box plots
  if (localShowBoxPlot.value) {
    drawBoxPlots(g, groupedData, xScale, yScale)
  }

  // Draw data points
  if (localShowDataPoints.value) {
    drawDataPoints(g, groupedData, xScale, yScale)
  }

  // X axis with wrapped labels
  const xAxis = g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height.value})`)
    .call(d3.axisBottom(xScale))

  // Handle label wrapping for better display
  handleXAxisLabels(xAxis)

  // Add Y axis
  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(yScale))
}

function handleXAxisLabels(xAxis) {
  xAxis.selectAll('.tick text')
    .attr('transform', 'rotate(-35)')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')
    .each(function () {
      const self = d3.select(this)
      const text = self.text()
      const maxLength = 15

      if (text.length > maxLength) {
        self.text(`${text.substring(0, maxLength)}...`)
        self.append('title').text(text) // Add tooltip for full text
      }
    })
}

function addGridLines(g, width, yScale) {
  g.append('g')
    .attr('class', 'grid-lines')
    .call(
      d3.axisLeft(yScale)
        .tickSize(-width)
        .tickFormat(''),
    )
    .attr('opacity', 0.2)
    .selectAll('line')
    .attr('stroke-dasharray', '2,2')
}

function drawViolinPlots(g, groupedData, xScale, yScale) {
  groupedData.forEach((groupData, key) => {
    const values = groupData.map(d => d[selectedYAttribute.value])
    const violinWidth = xScale.bandwidth() * (props.violinWidth / 100)

    // Compute kernel density estimation
    const kde = kernelDensityEstimator(kernelEpanechnikov(7), yScale.ticks(50))
    const density = kde(values)

    // Scale the density to fit the violin width
    const densityMax = d3.max(density, d => d[1]) || 0.01
    const densityScale = d3.scaleLinear()
      .domain([0, densityMax])
      .range([0, violinWidth / 2])

    // Create the violin shape
    const area = d3.area()
      .x0(d => xScale(key) + xScale.bandwidth() / 2 - densityScale(d[1]))
      .x1(d => xScale(key) + xScale.bandwidth() / 2 + densityScale(d[1]))
      .y(d => yScale(d[0]))
      .curve(d3.curveCatmullRom)

    g.append('path')
      .datum(density)
      .attr('class', 'violin')
      .attr('d', area)
      .style('fill', colorFunct.value(key))
      .style('opacity', 0.7)
      .style('stroke', 'none')
      .on('mouseover', event => handleMouseOver(event, key, groupData))
      .on('mouseout', handleMouseOut)
      .on('mousemove', handleMouseMove)
  })
}

function drawBoxPlots(g, groupedData, xScale, yScale) {
  groupedData.forEach((groupData, key) => {
    const values = groupData.map(d => d[selectedYAttribute.value]).sort(d3.ascending)

    if (values.length === 0)
      return

    const q1 = d3.quantile(values, 0.25)
    const median = d3.median(values)
    const q3 = d3.quantile(values, 0.75)
    const interQuantileRange = q3 - q1
    const min = Math.max(q1 - 1.5 * interQuantileRange, d3.min(values))
    const max = Math.min(q3 + 1.5 * interQuantileRange, d3.max(values))
    const y1 = yScale(q1)
    const y3 = yScale(q3)
    const boxY = Math.min(y1, y3)
    const boxHeight = Math.abs(y1 - y3)

    const boxWidth = xScale.bandwidth() * (props.boxPlotWidth / 100)

    // Box
    g.append('rect')
      .attr('x', xScale(key) + (xScale.bandwidth() - boxWidth) / 2)
      .attr('y', boxY)
      .attr('height', boxHeight || 1)
      .attr('width', boxWidth)
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')

    // Median line
    g.append('line')
      .attr('x1', xScale(key) + (xScale.bandwidth() - boxWidth) / 2)
      .attr('x2', xScale(key) + (xScale.bandwidth() + boxWidth) / 2)
      .attr('y1', yScale(median))
      .attr('y2', yScale(median))
      .attr('stroke', '#f97316') // Orange color for median
      .attr('stroke-width', 2)

    // Whiskers
    g.append('line')
      .attr('x1', xScale(key) + xScale.bandwidth() / 2)
      .attr('x2', xScale(key) + xScale.bandwidth() / 2)
      .attr('y1', yScale(min))
      .attr('y2', yScale(q1))
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 1)

    g.append('line')
      .attr('x1', xScale(key) + xScale.bandwidth() / 2)
      .attr('x2', xScale(key) + xScale.bandwidth() / 2)
      .attr('y1', yScale(max))
      .attr('y2', yScale(q3))
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 1)

    // Min/max horizontal lines
    g.append('line')
      .attr('x1', xScale(key) + (xScale.bandwidth() - boxWidth) / 2)
      .attr('x2', xScale(key) + (xScale.bandwidth() + boxWidth) / 2)
      .attr('y1', yScale(min))
      .attr('y2', yScale(min))
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 1)

    g.append('line')
      .attr('x1', xScale(key) + (xScale.bandwidth() - boxWidth) / 2)
      .attr('x2', xScale(key) + (xScale.bandwidth() + boxWidth) / 2)
      .attr('y1', yScale(max))
      .attr('y2', yScale(max))
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 1)
  })
}

function drawDataPoints(g, groupedData, xScale, yScale) {
  groupedData.forEach((groupData, key) => {
    if (groupData.length === 0)
      return

    const jitterWidth = xScale.bandwidth() * 0.4

    g.selectAll(null)
      .data(groupData)
      .enter()
      .append('circle')
      .attr('cx', () => xScale(key) + xScale.bandwidth() / 2 + (Math.random() - 0.5) * jitterWidth)
      .attr('cy', d => yScale(d[selectedYAttribute.value]))
      .attr('r', props.pointSize)
      .attr('fill', colorFunct.value(key))
      .attr('opacity', 0.6)
      .attr('stroke', isDarkMode.value ? '#e2e8f0' : '#1a202c')
      .attr('stroke-width', 0.5)
      .on('mouseover', (event, d) => {
        tooltip.value.classList.remove('hidden')
        tooltip.value.innerHTML = `
            <div class="font-bold">${d[selectedXAttribute.value]}</div>
            <div>${selectedYAttribute.value}: ${d[selectedYAttribute.value].toFixed(2)}</div>
          `
        positionTooltip(event)
      })
      .on('mouseout', () => {
        tooltip.value.classList.add('hidden')
      })
      .on('mousemove', handleMouseMove)
  })
}

function showEmptyState() {
  if (!chart.value)
    return

  const svg = d3.select(chart.value)
  svg.selectAll('*').remove()

  svg
    .attr('viewBox', `0 0 ${width.value + margin.left + margin.right} ${height.value + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  svg.append('text')
    .attr('x', (width.value + margin.left + margin.right) / 2)
    .attr('y', (height.value + margin.top + margin.bottom) / 2)
    .attr('text-anchor', 'middle')
    .attr('fill', isDarkMode.value ? '#e2e8f0' : '#1a202c')
    .text('No valid numeric data available')
}

// Tooltip event handlers
function handleMouseOver(event, key, groupData) {
  if (!tooltip.value)
    return

  const values = groupData.map(d => d[selectedYAttribute.value]).sort(d3.ascending)
  const min = d3.min(values)
  const q1 = d3.quantile(values, 0.25)
  const median = d3.median(values)
  const q3 = d3.quantile(values, 0.75)
  const max = d3.max(values)

  tooltip.value.classList.remove('hidden')
  tooltip.value.innerHTML = `
      <div class="font-bold mb-1">${selectedXAttribute.value}: ${key}</div>
      <div>Sample Size: ${values.length}</div>
      <div>Minimum: ${min.toFixed(2)}</div>
      <div>Q1: ${q1.toFixed(2)}</div>
      <div>Median: ${median.toFixed(2)}</div>
      <div>Q3: ${q3.toFixed(2)}</div>
      <div>Maximum: ${max.toFixed(2)}</div>
    `

  d3.select(event.currentTarget).style('opacity', 1)

  positionTooltip(event)
}

function handleMouseOut(event) {
  if (!tooltip.value)
    return

  tooltip.value.classList.add('hidden')
  d3.select(event.currentTarget).style('opacity', 0.7)
}

function handleMouseMove(event) {
  positionTooltip(event)
}

function positionTooltip(event) {
  if (!tooltip.value || !chartContainer.value)
    return

  const containerRect = chartContainer.value.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()

  // Calculate position while keeping tooltip inside the container
  const maxLeft = containerRect.width - tooltipRect.width - 5
  const maxTop = containerRect.height - tooltipRect.height - 5

  let left = event.clientX - containerRect.left + 10
  let top = event.clientY - containerRect.top - tooltipRect.height - 10

  // Keep tooltip within container bounds
  left = Math.max(5, Math.min(left, maxLeft))
  top = Math.max(5, Math.min(top, maxTop))

  // Position tooltip
  tooltip.value.style.left = `${left}px`
  tooltip.value.style.top = `${top}px`
}

// Lifecycle hooks
onMounted(() => {
  drawChart()
  window.addEventListener('resize', drawChart)
})

watch(
  [
    () => props.data,
    selectedXAttribute,
    selectedYAttribute,
    binCount,
    localShowViolin,
    localShowBoxPlot,
    localShowDataPoints,
    width,
    height,
    isDarkMode,
  ],
  drawChart,
)

onUnmounted(() => {
  window.removeEventListener('resize', drawChart)
})
</script>

<template>
  <div class="mb-4">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div class="min-w-[140px]">
        <label class="mb-1 block text-sm font-medium">X Attribute:</label>
        <select v-model="selectedXAttribute" class="w-full border rounded p-1 text-sm">
          <option v-for="attr in imageStore.availableAttributes" :key="attr" :value="attr">
            {{ attr }}
          </option>
        </select>
      </div>

      <!-- Binning options for numeric X attributes -->
      <div v-if="isSelectedXNumeric" class="min-w-[140px]">
        <label class="mb-1 block text-sm font-medium">Bin Count:</label>
        <div class="flex items-center gap-2">
          <input
            v-model.number="binCount"
            type="range"
            min="2"
            max="20"
            class="w-24"
          >
          <span class="text-sm">{{ binCount }}</span>
        </div>
      </div>

      <div class="min-w-[140px]">
        <label class="mb-1 block text-sm font-medium">Y Attribute:</label>
        <select v-model="selectedYAttribute" class="w-full border rounded p-1 text-sm">
          <option v-for="attr in imageStore.availableNumericAttributes" :key="attr" :value="attr">
            {{ attr }}
          </option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium">Display:</label>
        <div class="flex gap-2">
          <label class="flex items-center text-sm">
            <input v-model="localShowViolin" type="checkbox" class="mr-1">
            Violin
          </label>
          <label class="flex items-center text-sm">
            <input v-model="localShowBoxPlot" type="checkbox" class="mr-1">
            BoxPlot
          </label>
          <label class="flex items-center text-sm">
            <input v-model="localShowDataPoints" type="checkbox" class="mr-1">
            Points
          </label>
        </div>
      </div>
    </div>

    <div ref="chartContainer" class="relative h-64 w-full">
      <svg ref="chart" class="h-full w-full" />
      <div ref="tooltip" class="tooltip absolute hidden rounded p-2 text-sm shadow-lg">
        <p class="mb-1 font-bold">
          {{ selectedXAttribute }}: <span class="tooltip-group" />
        </p>
        <p>Sample Size: <span class="tooltip-sample-size" /></p>
        <p>Minimum: <span class="tooltip-min" /></p>
        <p>Q1: <span class="tooltip-q1" /></p>
        <p>Median: <span class="tooltip-median" /></p>
        <p>Q3: <span class="tooltip-q3" /></p>
        <p>Maximum: <span class="tooltip-max" /></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tooltip {
  pointer-events: none;
  z-index: 100;
  max-width: 250px;
  background-color: v-bind('isDarkMode ? "#1f2937" : "#ffffff"');
  color: v-bind('isDarkMode ? "#f3f4f6" : "#1f2937"');
  border: 1px solid v-bind('isDarkMode ? "#374151" : "#e5e7eb"');
}

select,
input[type='range'] {
  background-color: v-bind('isDarkMode ? "#374151" : "#ffffff"');
  color: currentColor;
  border-color: v-bind('isDarkMode ? "#4b5563" : "#d1d5db"');
}

:deep(.x-axis),
:deep(.y-axis),
:deep(.x-label),
:deep(.y-label) {
  color: currentColor;
}
</style>
