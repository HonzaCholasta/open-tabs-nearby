(async() => {
	'use strict';

	const {windows, tabs} = browser;
	let openerTabId = tabs.TAB_ID_NONE;

	tabs.onActivated.addListener(activeInfo => {
		openerTabId = activeInfo.tabId;
	});

	tabs.onCreated.addListener(async tab => {
		if (tab.id === tabs.TAB_ID_NONE || openerTabId === tabs.TAB_ID_NONE)
			return;

		let openerTab = await tabs.get(openerTabId);
		let currentWindow = await windows.getCurrent({
			populate: true
		});

		if (openerTab.windowId !== currentWindow.id)
			return;

		let index = openerTab.index + 1;

		while (currentWindow.tabs[index].pinned)
			index++;
		while (currentWindow.tabs[index].openerTabId === openerTabId)
			index++;

		await tabs.move(tab.id, {
			index: index
		});
	});

	(await tabs.query({
		active: true,
		currentWindow: true
	})).forEach(tab => {
		openerTabId = tab.id;
	});
})();
