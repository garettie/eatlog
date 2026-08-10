export const CLEAR_HEALTH_CONNECT_DEVICE_STATE_SQL = `
  UPDATE health_connect_state SET enabled = 0, last_sync_at = NULL WHERE id = 1;
  DELETE FROM health_connect_weight_exports;
`;
