import * as XLSX from "xlsx";
import dayjs from "dayjs";

const LOCAL_DB_PATH = "local_db.xlsx";
const PROFILES_DB_PATH = "profiles_db.xlsx";

export function loadDatabase(path: string): any[] {
  try {
    const workbook = XLSX.readFile(path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error(`Ошибка загрузки базы данных: ${error}`);
    return [];
  }
}

export function saveDatabase(path: string, data: any[]): void {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  XLSX.writeFile(workbook, path);
  console.log(`Данные сохранены в ${path}`);
}

export function updateProfileDate(profileName: string, profiles: any[]): void {
  const now = dayjs();
  const nextDate = now.add(2, "hour").format("DD.MM.YYYY HH:mm:ss");

  const profile = profiles.find((p) => p.ProfileName === profileName);
  if (profile) {
    profile["Last date"] = now.format("DD.MM.YYYY HH:mm:ss");
    profile["Next date"] = nextDate;
  }
}
