<template>
  <div ref="chartContainer" class="w-full h-full relative">
    <svg ref="chart" class="w-full h-full"></svg>
    <div ref="tooltip" class="tooltip absolute hidden p-2 bg-gray-800 text-white rounded shadow-lg text-sm">
      <p class="font-bold mb-1">Value: <span class="tooltip-value"></span></p>
      <p>Count: <span class="tooltip-count"></span></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as d3 from 'd3'

// New interface for aggregated data points.
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

const chartContainer = ref<HTMLDivElement | null>(null)
const chart = ref<SVGSVGElement | null>(null)
const tooltip = ref<HTMLDivElement | null>(null)

const margin = { top: 5, right: 5, bottom: 40, left: 30 }
const width = computed(() => (chartContainer.value?.clientWidth ?? 0) - margin.left - margin.right)
const height = computed(() => width.value / props.aspectRatio - margin.top - margin.bottom)

// Create a color function from the given colors option.
const colorFunct = computed(() => {
  if (typeof props.colors === 'function') {
    return props.colors
  } else if (Array.isArray(props.colors)) {
    return d3.scaleOrdinal().range(props.colors)
  } else {
    return d3.scaleOrdinal(d3.schemeCategory10)
  }
})

// Because the data is already aggregated, we simply sort it by count and limit the number of bars.
const processedData = computed(() => {
  return props.data
    .slice() // create a shallow copy to avoid mutating the original array
    .sort((a, b) => b.count - a.count)
    .slice(0, props.maxBars)
})

const x = computed(() => {
  return d3
    .scaleBand()
    .domain(processedData.value.map((d) => d.value))
    .range([0, width.value])
    .padding(0.1)
})

const y = computed(() => {
  return d3
    .scaleLinear()
    .domain([0, d3.max(processedData.value, (d) => d.count) ?? 0])
    .nice()
    .range([height.value, 0])
})

const xAxis = computed(() => d3.axisBottom(x.value))
const yAxis = computed(() => d3.axisLeft(y.value))

function drawChart() {
  if (!chart.value || !processedData.value.length) return

  const svg = d3.select(chart.value)
  svg.selectAll('*').remove()

  svg
    .attr('viewBox', `0 0 ${width.value + margin.left + margin.right} ${height.value + margin.top + margin.bottom}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

  drawAxes(g)
  drawBars(g)
}

function drawAxes(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  // X axis
  const xAxisGroup = g.append('g')
    .attr('transform', `translate(0,${height.value})`)
    .call(xAxis.value)

  function wrap(text: d3.Selection<SVGTextElement, unknown, SVGElement, unknown>, width: number) {
    text.each(function () {
      const textEl = d3.select(this)
      const words = textEl.text().split(/[\s\/]+/).reverse()
      let word: string | undefined
      let line: string[] = []
      let lineNumber = 0
      const lineHeight = 1.0
      const y = textEl.attr('y')
      const dy = parseFloat(textEl.attr('dy') || '0')
      let tspan = textEl.text(null)
        .append('tspan')
        .attr('x', 0)
        .attr('y', y)
        .attr('dy', dy + 'em')

      while ((word = words.pop())) {
        line.push(word)
        tspan.text(line.join(' '))
        if ((tspan.node() as SVGTextContentElement).getComputedTextLength() > width) {
          line.pop()
          tspan.text(line.join(' '))
          line = [word]
          tspan = textEl.append('tspan')
            .attr('x', 0)
            .attr('y', y)
            .attr('dy', ++lineNumber * lineHeight + dy + 'em')
            .text(word)
        }
      }
    })
  }

  xAxisGroup
    .selectAll('.tick text')
    .call(wrap, x.value.bandwidth())
    .attr('transform', 'rotate(-10)')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em')

  // Y axis
  g.append('g').call(yAxis.value)
}

function drawBars(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  g.selectAll('.bar')
    .data(processedData.value)
    .join('rect')
    .attr('class', 'bar')
    .attr('x', (d) => x.value(d.value) ?? 0)
    .attr('y', (d) => y.value(d.count))
    .attr('width', x.value.bandwidth())
    .attr('height', (d) => height.value - y.value(d.count))
    .attr('fill', (d) => colorFunct.value(d.value))
    .on('mouseover', handleMouseOver)
    .on('mouseout', handleMouseOut)
    .on('mousemove', handleMouseMove)
}

function handleMouseOver(event: MouseEvent, d: { value: string; count: number }) {
  if (!tooltip.value) return

  d3.select(event.currentTarget as SVGRectElement)
    .transition()
    .duration(200)
    .attr('fill', '#ff7f0e')

  tooltip.value.classList.remove('hidden')
  tooltip.value.querySelector('.tooltip-value')!.textContent = d.value
  tooltip.value.querySelector('.tooltip-count')!.textContent = d.count.toString()

  positionTooltip(event)
}

function handleMouseOut(event: MouseEvent, d: { value: string; count: number }) {
  if (!tooltip.value) return

  d3.select(event.currentTarget as SVGRectElement)
    .transition()
    .duration(200)
    .attr('fill', colorFunct.value(d.value))

  tooltip.value.classList.add('hidden')
}

function handleMouseMove(event: MouseEvent) {
  positionTooltip(event)
}

function positionTooltip(event: MouseEvent) {
  if (!tooltip.value || !chartContainer.value) return

  const containerRect = chartContainer.value.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()

  let left = event.clientX - containerRect.left + 10
  let top = event.clientY - containerRect.top - tooltipRect.height - 10

  if (left + tooltipRect.width > containerRect.width) {
    left = containerRect.width - tooltipRect.width - 10
  }

  if (top < 0) {
    top = event.clientY - containerRect.top + 20
  }

  tooltip.value.style.left = `${left}px`
  tooltip.value.style.top = `${top}px`
}

onMounted(() => {
  drawChart()
  window.addEventListener('resize', drawChart)
})

watch([() => props.data, () => props.maxBars, width, height], drawChart)

onUnmounted(() => {
  window.removeEventListener('resize', drawChart)
})
</script>

<style scoped>
.tooltip {
  pointer-events: none;
  z-index: 100;
}
</style>
