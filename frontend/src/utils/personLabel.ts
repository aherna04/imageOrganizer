import { Person } from "../api/client";

export function personLabel(person: Person, allPeople: Person[]): string {
  const dupes = allPeople.filter((p) => p.name === person.name).length > 1;
  return dupes ? `${person.name} (${person.photo_count})` : person.name;
}

export function hasDuplicateName(name: string, allPeople: Person[]): boolean {
  return allPeople.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
}
