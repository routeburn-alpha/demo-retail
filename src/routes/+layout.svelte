<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="bg-amber-500 text-amber-950 text-center text-sm py-2 font-semibold">
  PREVIEW DEPLOY TEST — if you can read this, the Vercel preview pipeline works.
</div>

{@render children()}
