<template>
  <v-app>
    <Playground />
  </v-app>
</template>

<script>
  import Playground from './Playground.group'
  export default {
    name: 'App',
    components: {
      Playground,
    },
  }
</script>
