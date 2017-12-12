(function init() {
  'use strict';

  const { runtime, tabs, windows } = browser;
  let openerTabId = tabs.TAB_ID_NONE;

  tabs.onActivated.addListener((activeInfo) => {
    openerTabId = activeInfo.tabId;
  });

  tabs.onCreated.addListener(async (tab) => {
    const { id, discarded } = tab;
    if (id === tabs.TAB_ID_NONE || openerTabId === tabs.TAB_ID_NONE || discarded) {
      return;
    }

    const openerTab = await tabs.get(openerTabId);
    const currentWindow = await windows.getCurrent({
      populate: true,
    });

    if (openerTab.windowId !== currentWindow.id) {
      return;
    }

    let index = openerTab.index + 1;

    while (currentWindow.tabs[index].pinned) {
      index += 1;
    }
    while (currentWindow.tabs[index].openerTabId === openerTabId) {
      index += 1;
    }

    await tabs.move(id, { index });
  });

  runtime.onInstalled.addListener(async (details) => {
    const { reason } = details;
    if (reason !== 'install' && reason !== 'update') {
      return;
    }

    const [activeTab] = await tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      openerTabId = activeTab.id;
    }
  });
}());
