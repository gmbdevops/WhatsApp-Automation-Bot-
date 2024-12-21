export const SELECTORS = {
  CHAT_LIST_CONTAINER: "//div[@role='grid']",
  CHAT_ITEM: "//div[@role='listitem']",
  CHAT_LAST_ITEM: "//div[@role='listitem']//span[@dir='ltr']/parent::span",
  CHAT_AREA: "//div[@role='application']/parent::*",
  CHAT_CONTENT: "//div[@class='xnpuxes copyable-area']",
  CHAT_ROW: "//div[@role='row']",
  LOAD_MORE_BUTTON: "//div[contains(text(), 'Нажмите здесь, чтобы получить свои старые сообщения')]",
  PROFILE_BUTTON: "//div[@id='main']/header",
  PROFILE_PAGE: "//div[contains(@class, ' xnpuxes copyable-area')]",
  PHONE_NUMBER: "//div[contains(@class, ' xnpuxes copyable-area')]/following::span[starts-with(text(), '+')][1]",
  WHATSAPP_CONTACT: "//div[@id='main']//span[contains(@data-icon, 'wa-chat-psa')]"
};
