export const USER_AGE_OPTIONS = [
  "0-12 ans (Enfant)",
  "13-17 ans (adolescent)",
  "18-24 ans (Jeunes adultes / Étudiants)",
  "25-34 ans (Jeunes actifs)",
  "35-44 ans (Actifs confirmés)",
  "45-54 ans (Actifs expérimentés)",
  "55-64 ans (Actifs très expérimentés)",
  "65 ans et plus (Retraités)",
] as const;

export type UserAgeOption = (typeof USER_AGE_OPTIONS)[number];
