<script setup lang="ts">
import * as d3 from 'd3'

interface AggregatedDataPoint {
  value: string
  count: number
}

interface Props {
  data: AggregatedDataPoint[]
  xLabel: string
  yLabel: string
  maxBars?: number
  aspectRatio?: number
  colors?: string[] | ((value: string) => string)
}

const props = withDefaults(defineProps<Props>(), {
  maxBars: 20,
  aspectRatio: 16 / 9,
  colors: () => d3.schemeCategory10,
})

// DOM references
const chartContainer = ref<HTMLDivElement | null>(null)
const chart = ref<SVGSVGElement | null>(null)
const tooltip = ref<HTMLDivElement | null>(null)

// Theme handling for colors only
const colorMode = useColorMode()
const isDarkMode = computed(() => colorMode.value === 'dark')

// Chart dimensions
const margin = { top: 10, right: 10, bottom: 50, left: 30 }
const width = computed(() => (chartContainer.value?.clientWidth ?? 0) - margin.left - margin.right)
const height = computed(() => width.value / props.aspectRatio - margin.top - margin.bottom)

const colorPalettes = {
  light: [
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#14b8a6', // teal-500
    '#f97316', // orange-500
    '#06b6d4', // cyan-500
    '#ec4899', // pink-500
    '#10b981', // emerald-500
    '#6366f1', // indigo-500
    '#f59e0b', // amber-500
    '#a855f7', // purple-500
  ],
  // Slightly desaturated, darker versions for dark mode
  dark: [
    '#60a5fa', // blue-400
    '#a78bfa', // violet-400
    '#2dd4bf', // teal-400
    '#fb923c', // orange-400
    '#22d3ee', // cyan-400
    '#f472b6', // pink-400
    '#34d399', // emerald-400
    '#818cf8', // indigo-400
    '#fbbf24', // amber-400
    '#c084fc', // purple-400
  ],
}

// Create a color function from the given colors option
const colorFunct = computed(() => {
  if (typeof props.colors === 'function') {
    return props.colors
  }
  else if (Array.isArray(props.colors) && props.colors !== d3.schemeCategory10) {
    return d3.scaleOrdinal().range(props.colors)
  }
  else {
    const palette = isDarkMode.value ? colorPalettes.dark : colorPalettes.light
    return d3.scaleOrdinal().range(palette)
  }
})

// Process data: sort and limit the number of bars
const processedData = computed(() => {
  return props.data
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, props.maxBars)
})

// Calculate the total count for percentage calculations
const totalCount = computed(() => d3.sum(processedData.value, d => d.count))

// Scale functions
const x = computed(() => {
  return d3
    .scaleBand()
    .domain(processedData.value.map(d => d.value))
    .range([0, width.value])
    .padding(0.2)
})

const y = computed(() => {
  return d3
    .scaleLinear()
    .domain([0, d3.max(processedData.value, d => d.count * 1.1) ?? 0])
    .nice()
    .range([height.value, 0])
})

// Main chart drawing function
function drawChart() {
  if (!chart.value)
    return

  // Handle empty data case
  if (!processedData.value.length) {
    showEmptyState()
    return
  }

  const svg = d3.select(chart.value)
  svg.selectAll('*').remove()

  svg
    .attr('viewBox', `0 0 ${width.value + margin.left + margin.right} ${height.value + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', `Bar chart showing ${props.xLabel} vs ${props.yLabel}`)

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`)

  // Add background grid
  drawGrid(g)

  // Draw axes and labels
  drawAxes(g)

  // Draw bars with animation
  drawBars(g)
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
    .text('No data available')
}

function drawGrid(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  // Add y-grid lines
  g.append('g')
    .attr('class', 'grid')
    .call(
      d3.axisLeft(y.value)
        .tickSize(-width.value)
        .tickFormat(() => ''),
    )
    .attr('opacity', 0.2)
    .select('.domain')
    .attr('opacity', 0)
}

function drawAxes(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  // X axis with adjusted labels
  const xAxisGroup = g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${height.value})`)
    .call(d3.axisBottom(x.value))

  // Handle label overlap with dynamic wrapping and positioning
  handleXAxisLabels(xAxisGroup)

  // Y axis
  g.append('g')
    .attr('class', 'y-axis')
    .call(d3.axisLeft(y.value).ticks(5))

  // Add thousand separators to y-axis labels
  g.selectAll('.y-axis .tick text')
    .text(d => d3.format(',')(d))
}

function handleXAxisLabels(xAxisGroup: d3.Selection<SVGGElement, unknown, null, undefined>) {
  // Dynamic font size based on bar count and width
  const fontSize = Math.min(
    12,
    Math.max(
      8,
      Math.floor(x.value.bandwidth() / 5),
    ),
  )

  // Text wrapping for labels
  xAxisGroup.selectAll('.tick text')
    .style('font-size', `${fontSize}px`)
    .attr('text-anchor', 'end')
    .attr('dx', '-0.5em')
    .attr('dy', '0.15em')
    .attr('transform', 'rotate(-35)')
    .each(function (this: SVGTextElement) {
      const self = d3.select(this)
      const text = self.text()
      const maxLength = 15

      if (text.length > maxLength) {
        self.text(`${text.substring(0, maxLength)}...`)

        // Add title for full text on hover
        self.append('title').text(text)
      }
    })
}

function drawBars(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  g.selectAll('.bar')
    .data(processedData.value)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', d => x.value(d.value) ?? 0)
    .attr('width', x.value.bandwidth())
    .attr('y', height.value)
    .attr('height', 0)
    .attr('fill', d => colorFunct.value(d.value))
    .attr('rx', 2)
    .attr('opacity', 0.9)
    .attr('data-value', d => d.value)
    .attr('data-count', d => d.count)
    .attr('aria-label', d => `${d.value}: ${d.count} (${Math.round(d.count / totalCount.value * 100)}%)`)
    .on('mouseover', handleMouseOver)
    .on('mouseout', handleMouseOut)
    .on('mousemove', handleMouseMove)
    .transition()
    .duration(750)
    .delay((_, i) => i * 30)
    .attr('y', d => y.value(d.count))
    .attr('height', d => Math.max(0, height.value - y.value(d.count)))
}

// Tooltip handlers
function handleMouseOver(event: MouseEvent, d: AggregatedDataPoint) {
  if (!tooltip.value)
    return

  const bar = d3.select(event.currentTarget as SVGRectElement)

  // Highlight the bar
  bar.transition()
    .duration(200)
    .attr('opacity', 1)
    .attr('stroke', '#000')
    .attr('stroke-width', 1)

  // Show and populate tooltip
  tooltip.value.classList.remove('hidden')

  const percentage = (d.count / totalCount.value * 100).toFixed(1)
  tooltip.value.innerHTML = `
    <div class="font-bold">${d.value}</div>
    <div class="mt-1">${props.yLabel}: ${d3.format(',')(d.count)}</div>
    <div>Percentage: ${percentage}%</div>
  `

  positionTooltip(event)
}

function handleMouseOut(event: MouseEvent, d: AggregatedDataPoint) {
  if (!tooltip.value)
    return

  // Restore bar appearance
  d3.select(event.currentTarget as SVGRectElement)
    .transition()
    .duration(200)
    .attr('opacity', 0.9)
    .attr('stroke', 'none')

  // Hide tooltip
  tooltip.value.classList.add('hidden')
}

function handleMouseMove(event: MouseEvent) {
  positionTooltip(event)
}

function positionTooltip(event: MouseEvent) {
  if (!tooltip.value || !chartContainer.value)
    return

  const containerRect = chartContainer.value.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()

  let left = event.clientX - containerRect.left + 10
  let top = event.clientY - containerRect.top - tooltipRect.height - 10

  // Ensure tooltip stays within container bounds
  if (left + tooltipRect.width > containerRect.width) {
    left = containerRect.width - tooltipRect.width - 10
  }

  if (top < 0) {
    top = event.clientY - containerRect.top + 20
  }

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
    () => props.maxBars,
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
  <div ref="chartContainer" class="relative h-full w-full">
    <svg ref="chart" class="h-full w-full" />
    <div
      ref="tooltip"
      class="tooltip absolute hidden rounded-md p-3 text-sm shadow-lg transition-opacity duration-200"
      :class="colorMode === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800 border border-gray-200'"
    />
  </div>
</template>

<style scoped>
.tooltip {
  pointer-events: none;
  z-index: 100;
  min-width: 120px;
}

:deep(.bar:hover) {
  cursor: pointer;
}
</style>
