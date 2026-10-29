'use strict';

/**
 * LocalPass - Renderer bridge
 *
 * The only surface the page can reach. Every channel is fixed and every path
 * is derived in the main process, so a compromised renderer cannot ask for an
 * arbitrary file. Results use an explicit `ok` envelope so failures arrive
 * with a code instead of an Electron stack trace.
 */

const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);

  if (!result || typeof result !== 'object') {
    throw new Error('invalid_response');
  }

  if (result.ok !== true) {
    const error = new Error(result.code || 'unknown_error');
    error.code = result.code || 'unknown_error';
    throw error;
  }

  return result.value;
}

contextBridge.exposeInMainWorld('localpass', {
  app: {
    info: () => invoke('app:info'),
  },
  vault: {
    read: () => invoke('vault:read'),
    write: (payload) => invoke('vault:write', payload),
    remove: () => invoke('vault:remove'),
  },
  sync: {
    status: () => invoke('sync:status'),
    chooseFolder: (title) => invoke('sync:choose-folder', title),
    list: () => invoke('sync:list'),
    read: (deviceId) => invoke('sync:read', deviceId),
    write: (deviceId, payload) => invoke('sync:write', deviceId, payload),
    remove: (deviceId) => invoke('sync:remove', deviceId),
  },
  clipboard: {
    copyTemp: (text, ttlMs) => invoke('clipboard:copy-temp', text, ttlMs),
  },
});
