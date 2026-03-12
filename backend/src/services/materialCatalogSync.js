import cron from 'node-cron';
import { syncErpMaterialCatalog } from './erpService.js';

const DEFAULT_SCHEDULE = process.env.ERP_MATERIAL_SYNC_CRON || '0 3 * * *';
const DEFAULT_TIMEZONE = process.env.ERP_MATERIAL_SYNC_TIMEZONE || 'America/Sao_Paulo';
const SYNC_ON_BOOT = (process.env.ERP_MATERIAL_SYNC_ON_BOOT || 'true').toLowerCase() !== 'false';

let running = false;

async function runSync(trigger) {
  if (running) {
    console.log(`[materials-sync] skipped (${trigger}) because another sync is running`);
    return;
  }

  running = true;
  const startedAt = Date.now();

  try {
    console.log(`[materials-sync] started via ${trigger}`);
    const result = await syncErpMaterialCatalog(true);
    const elapsedMs = Date.now() - startedAt;
    console.log(`[materials-sync] finished via ${trigger}: ${result.count} materiais sincronizados em ${elapsedMs}ms`);
  } catch (err) {
    console.error(`[materials-sync] failed via ${trigger}:`, err.message);
  } finally {
    running = false;
  }
}

export function initializeMaterialCatalogSync() {
  if (SYNC_ON_BOOT) {
    setTimeout(() => {
      runSync('boot');
    }, 5000);
  }

  cron.schedule(DEFAULT_SCHEDULE, () => {
    runSync('cron');
  }, {
    timezone: DEFAULT_TIMEZONE,
  });

  console.log(`[materials-sync] cron agendado: "${DEFAULT_SCHEDULE}" (${DEFAULT_TIMEZONE})`);
}
