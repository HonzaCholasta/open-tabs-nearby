/*
 * Open Tabs Nearby
 * Copyright (C) 2017-2018  Jan Cholasta
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function init() {
  'use strict';

  const { getTabValue, setTabValue } = browser.sessions;
  const { TAB_ID_NONE, move: moveTabs, query: queryTabs } = browser.tabs;

  let busy = false;
  const queue = [];
  let activeTabId = TAB_ID_NONE;

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
        throw e;
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

  browser.tabs.onActivated.addListener((activeInfo) => {
    const { tabId } = activeInfo;
    if (tabId === TAB_ID_NONE) {
      return;
    }

    activeTabId = tabId;
  });

  browser.tabs.onCreated.addListener(synchronized(async (theTab) => {
    if (theTab.id === TAB_ID_NONE || activeTabId === TAB_ID_NONE) {
      return;
    }

    const [
      theState,
      activeTabState,
    ] = await Promise.all([
      getTabValue(theTab.id, 'state'),
      getTabValue(activeTabId, 'state'),
    ]);
    if (theState) {
      return;
    }
    if (!activeTabState) {
      console.error(`getTabValue(${activeTabId}) returned undefined`);
      return;
    }

    const openerTabUid = activeTabState.uid;

    await setTabValue(theTab.id, 'state', {
      uid: createUid(),
      openerTabUid,
    });

    const tabs =
      (await queryTabs({ windowId: theTab.windowId }))
        .filter(tab => tab.id !== TAB_ID_NONE && tab.id !== theTab.id)
        .sort((a, b) => a.index - b.index);
    const states = await Promise.all(tabs.map(tab => getTabValue(tab.id, 'state')));
    tabs.forEach((tab, index) => {
      if (!states[index]) {
        console.error(`getTabValue(${tab.id}) returned undefined`);
      }
    });

    let index = states.findIndex(state => state && state.uid === openerTabUid);
    if (index === -1) {
      return;
    }

    index += 1;
    while (index < tabs.length && tabs[index].pinned) {
      index += 1;
    }
    while (index < tabs.length && states[index] && states[index].openerTabUid === openerTabUid) {
      index += 1;
    }

    await moveTabs(theTab.id, { index: tabs[index - 1].index + 1 });
  }));

  browser.runtime.onInstalled.addListener(synchronized(async (details) => {
    const { reason, previousVersion } = details;
    if (reason !== 'install' && reason !== 'update') {
      return;
    }

    if (reason === 'install' || ['0.1', '0.2', '0.3'].includes(previousVersion)) {
      const tabs = Object.assign([], ...(await queryTabs({}))
        .filter(tab => tab.id !== TAB_ID_NONE)
        .map(tab => ({ [tab.id]: tab })));
      const uids = tabs.map(createUid);
      const states = tabs.map(tab => ({
        uid: uids[tab.id],
        openerTabUid: ('openerTabId' in tab && uids[tab.openerTabId]) || createUid(),
      }));

      await Promise.all(tabs.map(tab => setTabValue(tab.id, 'state', states[tab.id])));
    }

    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab) {
      activeTabId = activeTab.id;
    }
  }));
}());
