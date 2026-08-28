export function formatBuildingAddress(building: {
  street_number: string;
  street: string;
  city: string;
  postal_code: string;
}): string {
  return `${building.street_number} ${building.street}, ${building.city}, ${building.postal_code}`;
}
