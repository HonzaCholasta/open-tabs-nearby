(async () => {
  'use strict';

  const { windows, tabs } = browser;
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

  [{ id: openerTabId }] = await tabs.query({
    active: true,
    currentWindow: true,
  });
})();