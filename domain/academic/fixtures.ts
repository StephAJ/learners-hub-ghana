import type { SubjectOffering } from "./types";

export type AcademicClass = {
  classTeacher: string;
  id: string;
  learnerCount: number;
  level: string;
  name: string;
  offerings: SubjectOffering[];
  room: string;
};

export type LearnerOption = {
  id: string;
  name: string;
  studentId: string;
};

const tenantId = "tenant-greenfield";

function createOffering(
  classGroupId: string,
  subjectCode: string,
  subjectName: string,
  requirement: SubjectOffering["requirement"],
): SubjectOffering {
  return {
    id: `${classGroupId}-${subjectCode.toLowerCase()}`,
    tenantId,
    classGroupId,
    subjectCode,
    subjectName,
    requirement,
    active: true,
  };
}

function createJhsOfferings(classGroupId: string): SubjectOffering[] {
  return [
    createOffering(classGroupId, "MA", "Mathematics", "compulsory"),
    createOffering(classGroupId, "EN", "English Language", "compulsory"),
    createOffering(classGroupId, "IS", "Integrated Science", "compulsory"),
    createOffering(classGroupId, "SS", "Social Studies", "compulsory"),
    createOffering(classGroupId, "CT", "Computing", "compulsory"),
    createOffering(
      classGroupId,
      "RM",
      "Religious & Moral Education",
      "compulsory",
    ),
    createOffering(classGroupId, "FR", "French", "optional"),
    createOffering(classGroupId, "CA", "Creative Arts", "optional"),
  ];
}

export const academicClasses: AcademicClass[] = [
  {
    id: "class-jhs1-blue",
    name: "JHS 1 Blue",
    level: "Junior High",
    learnerCount: 41,
    classTeacher: "Mrs. E. Aidoo",
    room: "Block A · Room 2",
    offerings: createJhsOfferings("class-jhs1-blue"),
  },
  {
    id: "class-jhs2-gold",
    name: "JHS 2 Gold",
    level: "Junior High",
    learnerCount: 38,
    classTeacher: "Mr. K. Mensah",
    room: "Block A · Room 4",
    offerings: createJhsOfferings("class-jhs2-gold"),
  },
  {
    id: "class-jhs3-green",
    name: "JHS 3 Green",
    level: "Junior High",
    learnerCount: 36,
    classTeacher: "Ms. A. Asante",
    room: "Block B · Room 1",
    offerings: createJhsOfferings("class-jhs3-green"),
  },
  {
    id: "class-shs1-arts",
    name: "SHS 1 General Arts",
    level: "Senior High",
    learnerCount: 44,
    classTeacher: "Mrs. R. Tetteh",
    room: "Arts Block · Room 3",
    offerings: [
      createOffering("class-shs1-arts", "EM", "Core Mathematics", "compulsory"),
      createOffering("class-shs1-arts", "EN", "English Language", "compulsory"),
      createOffering("class-shs1-arts", "SC", "Integrated Science", "compulsory"),
      createOffering("class-shs1-arts", "SS", "Social Studies", "compulsory"),
      createOffering("class-shs1-arts", "EC", "Economics", "optional"),
      createOffering("class-shs1-arts", "GH", "Government", "optional"),
      createOffering("class-shs1-arts", "GE", "Geography", "optional"),
      createOffering("class-shs1-arts", "RL", "Religious Studies", "optional"),
    ],
  },
];

export const availableLearners: LearnerOption[] = [
  { id: "learner-yaa", name: "Yaa Nkrumah", studentId: "LH-260418" },
  { id: "learner-daniel", name: "Daniel Asare", studentId: "LH-260419" },
  { id: "learner-adwoa", name: "Adwoa Boateng", studentId: "LH-260420" },
];

export const academicTenantId = tenantId;
