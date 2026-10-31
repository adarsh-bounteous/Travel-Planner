import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export const AlertIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" />
  </Icon>
)

export const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
)

export const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Icon>
)

export const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

export const EditIcon = () => (
  <Icon>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </Icon>
)

export const BellIcon = () => (
  <Icon>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icon>
)

export const HomeIcon = () => (
  <Icon>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </Icon>
)

export const CalendarIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </Icon>
)

export const XIcon = () => (
  <Icon>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
)

export const ArrowLeftIcon = () => (
  <Icon>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Icon>
)

export const ArrowRightIcon = () => (
  <Icon>
    <path d="m12 5 7 7-7 7" />
    <path d="M5 12h14" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
)

export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
)

export const ImageIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
)

export const HeartIcon = ({ filled = false, className }: { filled?: boolean; className?: string }) => (
  <svg
    className={className ? `icon ${className}` : 'icon'}
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={filled ? { fill: 'currentColor' } : undefined}
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
)

export const StarIcon = () => (
  <Icon>
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
  </Icon>
)

export const BagIcon = () => (
  <Icon>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </Icon>
)

export const ChevronDownIcon = () => (
  <Icon>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const SuitcaseIcon = () => (
  <Icon>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V4h6v3M9 11v5M15 11v5" />
  </Icon>
)

export const MapPinIcon = () => (
  <Icon>
    <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Icon>
)

export const ClockIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const CloseIcon = XIcon

export const UsersIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M16 4.5a4 4 0 0 1 0 7" />
    <path d="M22 21a7 7 0 0 0-4.5-6.5" />
  </Icon>
)

export const BedIcon = () => (
  <Icon>
    <path d="M2 18V6" />
    <path d="M2 14h20v4" />
    <path d="M22 14v-2a3 3 0 0 0-3-3h-9v5" />
    <circle cx="6" cy="11" r="1.5" />
  </Icon>
)

export const PlaneIcon = () => (
  <Icon>
    <path d="M17.8 19.2 16 11l3.5-3.5A2.1 2.1 0 0 0 16.5 4.5L13 8 4.8 6.2 3.5 7.5l6.5 3.5-3 3-3-.5L3 15l4 2 2 4 1-1-.5-3 3-3 3.5 6.5Z" />
  </Icon>
)

export const WalletIcon = () => (
  <Icon>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </Icon>
)

export const SimIcon = () => (
  <Icon>
    <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
    <rect x="8" y="12" width="8" height="6" rx="1" />
  </Icon>
)

export const UtensilsIcon = () => (
  <Icon>
    <path d="M3 2v7a3 3 0 0 0 6 0V2" />
    <path d="M6 2v20" />
    <path d="M18 22V2c-2.5 1.5-4 4-4 8 0 2 1 3 4 3" />
  </Icon>
)

export const ShieldIcon = () => (
  <Icon>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </Icon>
)

export const CompassIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3Z" />
  </Icon>
)

export const ListIcon = () => (
  <Icon>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </Icon>
)

export const RefreshIcon = () => (
  <Icon>
    <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 15 6.7L21 16" />
    <path d="M16 16h5v5" />
  </Icon>
)

/** The single icon set, keyed by the names the design uses. */
export const ICONS = {
  home: HomeIcon,
  search: SearchIcon,
  trips: SuitcaseIcon,
  profile: UserIcon,
  calendar: CalendarIcon,
  'map-pin': MapPinIcon,
  clock: ClockIcon,
  plus: PlusIcon,
  'arrow-right': ArrowRightIcon,
  close: CloseIcon,
  suitcase: SuitcaseIcon,
  compass: CompassIcon,
  heart: HeartIcon,
  users: UsersIcon,
  bed: BedIcon,
  plane: PlaneIcon,
  wallet: WalletIcon,
  sim: SimIcon,
  utensils: UtensilsIcon,
  shield: ShieldIcon,
  list: ListIcon,
  refresh: RefreshIcon,
} as const

/** A name from the icon set, so a call site cannot reference an icon outside it. */
export type IconName = keyof typeof ICONS
