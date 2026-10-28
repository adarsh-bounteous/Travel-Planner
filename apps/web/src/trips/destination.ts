export type DestinationRef = { country: string; place: string | null; label: string }
export type DestinationStatus = 'ready' | 'no_destination' | 'no_country_data' | 'no_place_data'

/** The one label for a chosen destination: "Lisbon, Portugal", or just the country when no place is chosen. */
export const destinationLabel = (country: string, place: string | null) =>
  place ? `${place}, ${country}` : country
