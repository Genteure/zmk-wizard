import ui from '@nuxt/ui/vue-plugin';
import { createPinia } from 'pinia';
import type { App } from 'vue';

import { fluent } from './components/locales';

export default (app: App) => {
  app.use(ui);

  const pinia = createPinia();
  app.use(pinia);

  app.use(fluent);
};
