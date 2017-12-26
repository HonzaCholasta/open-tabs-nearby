(function init() {
  'use strict';

  const { runtime, tabs, windows } = browser;
  let busy = false;
  const queue = [];
  let openerTabId = tabs.TAB_ID_NONE;

  function synchronized(fn) {
    return async (...args) => {
      await new Promise((resolve) => {
        if (!busy) {
          busy = true; resolve();
        } else {
          queue.push(resolve);
        }
      });

      try {
        return await fn(...args);
      } finally {
        if (queue.length > 0) {
          queue.shift()();
        } else {
          busy = false;
        }
      }
    };
  }

  tabs.onActivated.addListener((activeInfo) => {
    openerTabId = activeInfo.tabId;
  });

  tabs.onCreated.addListener(synchronized(async (tab) => {
    const { id, windowId, discarded } = tab;
    if (id === tabs.TAB_ID_NONE || openerTabId === tabs.TAB_ID_NONE || discarded) {
      return;
    }

    const { tabs: windowTabs } = await windows.get(windowId, { populate: true });
    const openerTab = windowTabs.find(windowTab => windowTab.id === openerTabId);
    if (!openerTab) {
      return;
    }

    let index = openerTab.index + 1;
    while (windowTabs[index].pinned) {
      index += 1;
    }
    while (windowTabs[index].openerTabId === openerTabId) {
      index += 1;
    }

    await tabs.move(id, { index });
  }));

  runtime.onInstalled.addListener(synchronized(async (details) => {
    const { reason } = details;
    if (reason !== 'install' && reason !== 'update') {
      return;
    }

    const [activeTab] = await tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      openerTabId = activeTab.id;
    }
  }));
}());
