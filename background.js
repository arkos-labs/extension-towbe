// background.js — Service Worker Twobeevent Capture v2

// Écoute les messages venant de la popup ou du content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "ping") {
    sendResponse({ status: "ok" });
  }
  return true;
});

// Quand l'onglet change ou se recharge, on notifie la popup si elle est ouverte
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.get("activeTabId", (result) => {
      if (result.activeTabId === tabId) {
        chrome.storage.local.remove("activeTabId");
      }
    });
  }
});
