import { chromium, Page, BrowserContext } from "playwright";
import * as xlsx from "xlsx";
import dayjs from "dayjs";
import { SELECTORS } from "./selectors";
import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const PROFILES_DB_PATH = process.env.PROFILES_DB;
const LOCAL_DB_PATH = process.env.EXCEL_FILE;

const normalizeDate = (dateStr: string | undefined): string => {
  if (!dateStr) return "";

  const today = dayjs();
  const daysMap: Record<string, string> = {
    "вчера": today.subtract(1, "day").format("DD.MM.YYYY"),
    "сегодня": today.format("DD.MM.YYYY"),
    "понедельник": today.day(1).format("DD.MM.YYYY"),
    "вторник": today.day(2).format("DD.MM.YYYY"),
    "среда": today.day(3).format("DD.MM.YYYY"),
    "четверг": today.day(4).format("DD.MM.YYYY"),
    "пятница": today.day(5).format("DD.MM.YYYY"),
    "суббота": today.day(6).format("DD.MM.YYYY"),
    "воскресенье": today.day(0).format("DD.MM.YYYY"),
  };

  return daysMap[dateStr.toLowerCase()] || dateStr;
};

const updateProfileDates = (profileName: string): void => {
  if (!PROFILES_DB_PATH || !fs.existsSync(PROFILES_DB_PATH)) {
    console.error(`Файл базы данных профилей не найден: ${PROFILES_DB_PATH}`);
    return;
  }

  try {
    const workbook = xlsx.readFile(PROFILES_DB_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const profiles = xlsx.utils.sheet_to_json<any>(sheet);

    const now = dayjs();
    const nextDate = now.add(2, "hour");

    let profileFound = false;
    profiles.forEach((profile: any) => {
      if (profile["ProfileName"] === profileName) {
        profile["Last date"] = now.format("DD.MM.YYYY HH:mm:ss");
        profile["Next date"] = nextDate.format("DD.MM.YYYY HH:mm:ss");
        profileFound = true;
      }
    });

    if (!profileFound) {
      console.warn(`Профиль "${profileName}" не найден в базе данных.`);
      return;
    }

    const updatedSheet = xlsx.utils.json_to_sheet(profiles);
    workbook.Sheets[workbook.SheetNames[0]] = updatedSheet;
    xlsx.writeFile(workbook, PROFILES_DB_PATH);

    console.log(`Даты обновлены для профиля: ${profileName}`);
  } catch (error) {
    console.error(`Ошибка при обновлении дат для профиля "${profileName}":`, error);
  }
};

const loadProfiles = (): any[] => {
  try {
    const workbook = xlsx.readFile(PROFILES_DB_PATH!);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error("Ошибка при загрузке профилей:", error);
    return [];
  }
};

const findEligibleProfiles = (): string[] => {
  const profiles = loadProfiles();
  const now = dayjs();

  const eligibleProfiles = profiles
    .filter((profile) => {
      const nextDate = dayjs(profile["Next date"], "DD.MM.YYYY HH:mm:ss");
      return nextDate.isBefore(now) || nextDate.isSame(now);
    })
    .map((profile) => profile["ProfileName"]);

  if (eligibleProfiles.length === 0) {
    console.log("Нет доступных профилей для запуска.");
  }

  return eligibleProfiles;
};

async function launchWithProfile(profileName: string): Promise<{ browserContext: BrowserContext; page: Page }> {
  const userDataDir = `${process.env.CHROME_PROFILE_PATH}/${profileName}`;
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browserContext.newPage();
  return { browserContext, page };
}

const loadLocalDatabase = (): any[] => {
  try {
    const workbook = xlsx.readFile(LOCAL_DB_PATH!);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.log("Локальная база данных не найдена. Создаю новую.");
    return [];
  }
};

const updateLocalDatabase = (updatedData: any[]): void => {
  try {
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(updatedData);
    xlsx.utils.book_append_sheet(workbook, sheet, "Chats");
    xlsx.writeFile(workbook, LOCAL_DB_PATH!);
    console.log("Локальная база данных обновлена.");
  } catch (error) {
    console.error("Ошибка при обновлении базы данных:", error);
  }
};

const processChats = async (page: Page): Promise<void> => {
  const chatListContainer = page.locator(SELECTORS.CHAT_LIST_CONTAINER);
  const chatArea = page.locator(SELECTORS.CHAT_AREA);
  const chatRows = page.locator(SELECTORS.CHAT_ROW);
  const totalHeightAttr = await chatListContainer.getAttribute("style");
  const rowCountAttr = await chatListContainer.getAttribute("aria-rowcount");

  if (!totalHeightAttr || !rowCountAttr) {
    console.error("Не удалось получить данные о высоте или количестве строк.");
    return;
  }

  const totalHeight = parseInt(totalHeightAttr.replace(/[^\d]/g, ""));
  const rowCount = parseInt(rowCountAttr);
  const rowHeight = totalHeight / rowCount;

  console.log(`Общая высота: ${totalHeight}px, Количество строк: ${rowCount}, Высота одной строки: ${rowHeight}px`);

  const localDB = loadLocalDatabase();
  let newChatsCount = 0;
  let updatedChatsCount = 0;

  for (let i = 0; i < rowCount; i++) {
    try {
      const currentRowPosition = rowHeight * i;
      const currentItem = chatListContainer.locator(`div[style*='translateY(${currentRowPosition}px)']`);

      if (!(await currentItem.isVisible())) continue;

      const chatText = await currentItem.innerText();
      const [name, date] = chatText.split("\n");
      const normalizedDate = normalizeDate(date);

      const existingEntry = localDB.find(
        (entry) => entry["Name"] === name
      );
      const shouldExtractPhone = !existingEntry || !existingEntry["Phone"];
      const isDateUpdated = existingEntry && existingEntry["Date"] !== normalizedDate;

      const chatType = !existingEntry ? "Новый чат" : "Обновляемый чат";
      console.log(`> Обрабатываем ${chatType}: ${name} | ${normalizedDate}`);

      await currentItem.click();

      // Прокрутка вверх для загрузки всех сообщений в Chat Area
      let lastHeight = 0;
      let sameHeightCount = 0;

      while (sameHeightCount < 3) {
        const currentHeight = await chatArea.evaluate((el) => el.scrollTop);
        const messageCount = await chatRows.count();
        process.stdout.write(`\r  -- Прокрутка вверх для загрузки сообщений... Текущая высота: ${currentHeight}, Сообщений: ${messageCount}`);
        await chatArea.evaluate((el) => el.scrollBy(0, -500));
        await page.waitForTimeout(500); // Задержка для прогрузки новых сообщений

        if (currentHeight === lastHeight) {
          sameHeightCount++;
        } else {
          sameHeightCount = 0;
        }

        lastHeight = currentHeight;
      }
      console.log(); // Переход на новую строку после завершения прокрутки

      // После полной прокрутки проверяем наличие кнопки Load More и запускаем скроллинг снова, если кнопка видна
      while (true) {
        const loadMoreButton = page.locator(SELECTORS.LOAD_MORE_BUTTON);
        if (await loadMoreButton.isVisible()) {
          console.log("  -- Найдена кнопка 'Обновить старые сообщения', выполняю нажатие...");
          await loadMoreButton.click();
          await page.waitForTimeout(3000); // Задержка для подгрузки

          // Снова запускаем скроллинг вверх после нажатия на кнопку
          lastHeight = 0;
          sameHeightCount = 0;
          while (sameHeightCount < 3) {
            const currentHeight = await chatArea.evaluate((el) => el.scrollTop);
            const messageCount = await chatRows.count();
            process.stdout.write(`\r  -- Прокрутка вверх после нажатия на кнопку... Текущая высота: ${currentHeight}, Сообщений: ${messageCount}`);
            await chatArea.evaluate((el) => el.scrollBy(0, -500));
            await page.waitForTimeout(500);

            if (currentHeight === lastHeight) {
              sameHeightCount++;
            } else {
              sameHeightCount = 0;
            }

            lastHeight = currentHeight;
          }
          console.log();
        } else {
          console.log("  -- Кнопка 'Обновить старые сообщения' отсутствует. Продолжаем обработку чата.");
          break;
        }
      }

      // Извлечение содержимого чата
      let chatContent = await page.locator(SELECTORS.CHAT_CONTENT).first().innerText();
      const totalMessages = await chatRows.count();

      // Обрезка текста, если он превышает 32767 символов
      if (chatContent.length > 32767) {
        console.warn(`  -- Текст чата для ${name} превышает допустимую длину и будет обрезан.`);
        chatContent = chatContent.slice(0, 32767);
      }

      console.log(`  -- Извлечено ${totalMessages} сообщений из чата '${name}'.`);

      // Нажатие на кнопку Profile_Button для открытия информации и извлечения номера
      let phoneNumber = existingEntry?.Phone || "";
      if (shouldExtractPhone) {
        const profileButton = page.locator(SELECTORS.PROFILE_BUTTON);
        if (await profileButton.isVisible()) {
          console.log("  -- Открываем информационную панель контакта...");
          await profileButton.click();
          await page.waitForTimeout(2000); // Задержка для прогрузки информации
          phoneNumber = await extractPhoneNumber(page);
        }
      }

      if (!existingEntry) {
        localDB.push({ Name: name, Phone: phoneNumber, Date: normalizedDate, Chat: chatContent });
        console.log(`  -- Новый чат добавлен: ${name}`);
        newChatsCount++;
      } else if (shouldExtractPhone || isDateUpdated) {
        existingEntry.Chat = chatContent;
        if (shouldExtractPhone) existingEntry.Phone = phoneNumber;
        if (isDateUpdated) existingEntry.Date = normalizedDate;
        updatedChatsCount++;
      }
    } catch (error) {
      console.error("  -- Ошибка при обработке чата:", error);
    }
  }

  console.log(`Всего чатов: ${rowCount}, новых: ${newChatsCount}, обновлённых: ${updatedChatsCount}`);
  updateLocalDatabase(localDB);
};

const extractPhoneNumber = async (page: Page): Promise<string> => {
  try {
    const whatsappContactElement = page.locator(SELECTORS.WHATSAPP_CONTACT);
    const isWhatsAppContact = await whatsappContactElement.isVisible();

    if (isWhatsAppContact) {
      console.log("  -- Официальный контакт WhatsApp, пропускаем извлечение номера.");
      return "Официальный аккаунт";
    }

    const phoneElement = page.locator(SELECTORS.PHONE_NUMBER);
    if (await phoneElement.isVisible()) {
      const phoneNumber = await phoneElement.innerText();
      console.log(`  -- Извлечён номер телефона: ${phoneNumber}`);
      return phoneNumber;
    } else {
      console.log("  -- Номер телефона не найден.");
      return "";
    }
  } catch (error) {
    console.error("Ошибка при извлечении номера телефона:", error);
    return "";
  }
};

const main = async () => {
  console.log("Инициализация процесса...");
  const eligibleProfiles = findEligibleProfiles();

  if (eligibleProfiles.length === 0) {
    console.log("Нет профилей для обработки.");
    return;
  }

  for (const profileName of eligibleProfiles) {
    let browserContext: BrowserContext | null = null;

    try {
      console.log(`Запуск профиля: ${profileName}`);
      const context = await launchWithProfile(profileName);
      try {
        browserContext = context.browserContext;
        const { page } = context;

        console.log("Открытие WhatsApp Web...");
        await page.goto("https://web.whatsapp.com");
        await page.waitForSelector(SELECTORS.CHAT_LIST_CONTAINER, { timeout: 30000 });

        await processChats(page);

        console.log(`Скрипт выполнен успешно для профиля: ${profileName}`);
        updateProfileDates(profileName);
      } finally {
        if (browserContext) await browserContext.close();
      }
    } catch (error) {
      console.error(`Ошибка при обработке профиля ${profileName}:`, error);
    }
  }
};

main().catch((error) => console.error("Ошибка в выполнении скрипта:", error));

