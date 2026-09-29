import type { Role } from "@/db/schema";

export const ROLE_LABELS_CLIENT: Record<Role, string> = {
  owner: "Ejer",
  admin: "Administrator",
  accountant: "Bogholder",
  approver: "Godkender",
  member: "Medarbejder",
  auditor: "Revisor (læseadgang)",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Fuld adgang inkl. underskrift af betalinger og brugerstyring",
  admin: "Fuld adgang inkl. underskrift af betalinger og brugerstyring",
  accountant: "Behandler fakturaer, opretter betalinger og styrer integrationer",
  approver: "Godkender eller afviser fakturaer, der er tildelt dem",
  member: "Indsender udlæg og kvitteringer",
  auditor: "Kan se alt, men ikke ændre noget",
};
