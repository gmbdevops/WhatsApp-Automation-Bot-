import dayjs from "dayjs";
import * as fs from "fs";
import * as xlsx from "xlsx";

export const formatDate = (dateStr: string): string => {
  if (dateStr.toLowerCase() === "вчера") {
    return dayjs().subtract(1, "day").format("DD.MM.YYYY");
  }
  return dateStr;
};

export const loadExcelFile = (path: string): xlsx.WorkBook | null => {
  if (fs.existsSync(path)) {
    return xlsx.readFile(path);
  }
  console.log(`Файл ${path} не найден.`);
  return null;
};
