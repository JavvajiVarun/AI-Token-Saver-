// Opens the welcome page once, right after the extension is first installed.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
});
