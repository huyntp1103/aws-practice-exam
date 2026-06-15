import type { ExamMeta } from "./types";

// Mirrors the registry in scrape_exam.py.
export const EXAMS: ExamMeta[] = [
  { code: "clf-c02", name: "AWS Certified Cloud Practitioner (CLF-C02)" },
  { code: "saa-c03", name: "AWS Certified Solutions Architect – Associate (SAA-C03)" },
  { code: "saa-c03-bonso", name: "AWS Certified Solutions Architect – Associate · Tutorials Dojo (SAA-C03)" },
  { code: "dva-c02", name: "AWS Certified Developer – Associate (DVA-C02)" },
  { code: "soa-c02", name: "AWS Certified SysOps Administrator – Associate (SOA-C02)" },
  { code: "sap-c02", name: "AWS Certified Solutions Architect – Professional (SAP-C02)" },
  { code: "dop-c02", name: "AWS Certified DevOps Engineer – Professional (DOP-C02)" },
];

export function examByCode(code: string): ExamMeta | undefined {
  return EXAMS.find((e) => e.code === code);
}
