/**
 * Swanford Academy - Master Constants & Profile
 * Master Specification Reference: Sections 2, 5, 6
 */

export const SCHOOL_PROFILE = {
  name: "Swanford Academy",
  subtitle: "Nursery, Primary & Tahfeez School",
  address: "PLOT 212, DR NUHU MUHAMMADU SANUSI WAY, DUTSE, JIGAWA STATE",
  contactPerson: "Muhammad Kanti, Proprietor",
  language: "English",
  curriculum: "Nigerian Curriculum",
  motto: "Illuminating the Path to Success",
  vision:
    "To be a leading institution recognized for excellence in education, character and discipline, producing capable and responsible individuals.",
  mission:
    "To develop educated, disciplined, well-mannered and responsible individuals equipped with knowledge, character and skills to thrive.",
  coreValues: [
    "Excellence",
    "Integrity",
    "Discipline",
    "Respect",
    "Responsibility",
    "Good Character",
    "Wisdom",
    "Leadership",
  ],
} as const;

/**
 * Standard Academic Programmes and Default Class Hierarchy
 * Note: These provide the initial seed baseline; all active classes are
 * managed dynamically via database records.
 */
export const DEFAULT_PROGRAMMES = [
  { code: "CRECHE", name: "Creche" },
  { code: "PRE_SCHOLARS", name: "Pre-Scholars" },
  { code: "PRE_NURSERY", name: "Pre-Nursery" },
  { code: "NURSERY_1", name: "Nursery 1" },
  { code: "NURSERY_2", name: "Nursery 2" },
  { code: "PRIMARY_1", name: "Primary 1" },
  { code: "PRIMARY_2", name: "Primary 2" },
  { code: "PRIMARY_3", name: "Primary 3" },
  { code: "PRIMARY_4", name: "Primary 4" },
  { code: "PRIMARY_5", name: "Primary 5" },
  { code: "PRIMARY_6", name: "Primary 6" },
  { code: "TAHFEEZ", name: "Tahfeez (Standalone Programme)" },
] as const;

export const ACADEMIC_TERMS = [
  { code: "FIRST", name: "First Term" },
  { code: "SECOND", name: "Second Term" },
  { code: "THIRD", name: "Third Term" },
] as const;
