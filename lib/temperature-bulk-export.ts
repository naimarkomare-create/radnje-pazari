import JSZip from "jszip";
import {
  buildTemperatureChecklistWorkbook,
  type TemperatureChecklistReport
} from "@/lib/excel-templates";

export type TemperatureExportStore = {
  id: string;
  name: string;
};

export type TemperatureExportDevice = {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
};

export type TemperatureExportReport = TemperatureChecklistReport & {
  device_id: string | null;
  store_id: string;
};

export async function buildBulkTemperatureZip({
  devices,
  month,
  reports,
  stores
}: {
  devices: TemperatureExportDevice[];
  month: string;
  reports: TemperatureExportReport[];
  stores: TemperatureExportStore[];
}) {
  const reportsByDevice = new Map<string, TemperatureChecklistReport[]>();

  for (const report of reports) {
    if (!report.device_id) continue;
    const key = `${report.store_id}:${report.device_id}`;
    const current = reportsByDevice.get(key) ?? [];
    current.push(report);
    reportsByDevice.set(key, current);
  }

  const devicesByStore = new Map<string, TemperatureExportDevice[]>();
  for (const device of devices) {
    const current = devicesByStore.get(device.store_id) ?? [];
    current.push(device);
    devicesByStore.set(device.store_id, current);
  }

  const zip = new JSZip();
  const fileNames: string[] = [];
  const usedFileNames = new Set<string>();

  for (const store of stores) {
    const folderName = safeFileSegment(store.name);
    const folder = zip.folder(folderName);
    if (!folder) throw new Error("ZIP folder nije mogao da bude napravljen.");

    for (const device of devicesByStore.get(store.id) ?? []) {
      const { workbook } = await buildTemperatureChecklistWorkbook({
        deviceName: device.name,
        month,
        reports: reportsByDevice.get(`${store.id}:${device.id}`) ?? [],
        storeName: store.name
      });
      const workbookBuffer = await workbook.xlsx.writeBuffer();
      const baseFileName = `${folderName}/${[
        "Temperatura",
        safeFileSegment(store.name),
        safeFileSegment(device.name),
        month
      ].join("-")}.xlsx`;
      let fileName = baseFileName;
      let duplicateNumber = 2;

      while (usedFileNames.has(fileName)) {
        fileName = baseFileName.replace(/\.xlsx$/i, `-${duplicateNumber}.xlsx`);
        duplicateNumber += 1;
      }

      folder.file(fileName.slice(folderName.length + 1), Buffer.from(workbookBuffer));
      usedFileNames.add(fileName);
      fileNames.push(fileName);
    }
  }

  const output = await zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
    type: "nodebuffer"
  });

  return {
    fileCount: fileNames.length,
    fileNames,
    output
  };
}

function safeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[đĐ]/g, (letter) => (letter === "Đ" ? "Dj" : "dj"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Uredjaj";
}
