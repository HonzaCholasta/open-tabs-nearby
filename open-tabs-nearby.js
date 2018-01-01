(function init() {
  'use strict';

  const {
    runtime,
    sessions,
    tabs,
    windows,
  } = browser;

  let busy = false;
  const queue = [];
  let activeTabId = tabs.TAB_ID_NONE;

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
      } catch (e) {
        console.error(e);
      } finally {
        if (queue.length > 0) {
          queue.shift()();
        } else {
          busy = false;
        }
      }
    };
  }

  function createUid() {
    const array = crypto.getRandomValues(new Uint8Array(16));
    const string = String.fromCharCode(...array);
    return btoa(string).substr(0, 22);
  }

  tabs.onActivated.addListener((activeInfo) => {
    const { tabId } = activeInfo;
    if (tabId === tabs.TAB_ID_NONE) {
      return;
    }

    activeTabId = tabId;
  });

  tabs.onCreated.addListener(synchronized(async (tab) => {
    const { id, windowId } = tab;
    if (id === tabs.TAB_ID_NONE || activeTabId === tabs.TAB_ID_NONE) {
      return;
    }

    const [
      state,
      activeTabState,
    ] = await Promise.all([
      sessions.getTabValue(id, 'state'),
      sessions.getTabValue(activeTabId, 'state'),
    ]);
    if (state) {
      return;
    }

    const uid = createUid();
    const openerTabUid = activeTabState.uid;
    await sessions.setTabValue(id, 'state', { uid, openerTabUid });

    const { tabs: windowTabs } = await windows.get(windowId, { populate: true });
    const windowTabStates = await Promise.all((
      windowTabs.map(windowTab => sessions.getTabValue(windowTab.id, 'state'))
    ));

    let index = windowTabStates.findIndex(tabState => tabState.uid === openerTabUid);
    if (index === -1) {
      return;
    }

    index += 1;
    while (windowTabs[index].pinned) {
      index += 1;
    }
    while (windowTabStates[index].openerTabUid === openerTabUid) {
      index += 1;
    }

    await tabs.move(id, { index });
  }));

  runtime.onInstalled.addListener(synchronized(async (details) => {
    const { reason, previousVersion } = details;
    if (reason !== 'install' && reason !== 'update') {
      return;
    }

    if (reason === 'install' || ['0.1', '0.2', '0.3'].includes(previousVersion)) {
      const allTabs = await tabs.query({});
      const movableTabs = allTabs.filter(tab => tab.id !== tabs.TAB_ID_NONE);
      const movableTabUids = movableTabs.map(createUid);

      const movableTabStates = movableTabs.map((tab, index) => {
        const uid = movableTabUids[index];

        let openerTabUid = movableTabUids[movableTabs.findIndex((
          openerTab => openerTab.id === tab.openerTabId
        ))];
        if (openerTabUid === undefined) {
          openerTabUid = createUid();
        }

        return { uid, openerTabUid };
      });

      await Promise.all(movableTabs.map((
        (tab, index) => sessions.setTabValue(tab.id, 'state', movableTabStates[index])
      )));
    }

    const [activeTab] = await tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      activeTabId = activeTab.id;
    }
  }));
}());
