<script>
  import { onMount } from 'svelte';
  export let type = 'line'; // line, bar, pie
  export let data = [];
  export let labels = [];
  export let title = '';
  
  let canvas;
  let chart;

  onMount(async () => {
    const Chart = (await import('chart.js/auto')).default;
    
    const ctx = canvas.getContext('2d');
    chart = new Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{
          label: title,
          data,
          borderColor: 'var(--chart-blue)',
          backgroundColor: type === 'line' 
            ? 'transparent'
            : 'var(--chart-blue)',
          tension: 0.4,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: 'var(--text-primary)',
              font: {
                size: 12
              }
            }
          }
        },
        scales: type !== 'pie' ? {
          x: {
            grid: {
              color: 'var(--border-subtle)',
              drawBorder: false
            },
            ticks: {
              color: 'var(--text-secondary)',
              font: {
                size: 11
              }
            }
          },
          y: {
            grid: {
              color: 'var(--border-subtle)',
              drawBorder: false
            },
            ticks: {
              color: 'var(--text-secondary)',
              font: {
                size: 11
              }
            }
          }
        } : undefined
      }
    });

    return () => {
      chart.destroy();
    };
  });
</script>

<div class="bg-surface-2 rounded-lg p-6 border border-border-subtle">
  {#if title}
    <h3 class="text-lg font-medium text-text-primary mb-4">{title}</h3>
  {/if}
  <div class="h-64">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  canvas {
    width: 100% !important;
    height: 100% !important;
  }
</style>
