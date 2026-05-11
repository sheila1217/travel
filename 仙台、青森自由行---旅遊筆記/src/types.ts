export type TransportMode = 'drive' | 'walk' | 'metro_jr' | 'bus';

export interface TransportSegment {
  id: string;
  mode: TransportMode;
  from?: string;
  to?: string;
  lineName?: string;
  note?: string;
  cost: number;
}

export interface StayInfo {
  bookerName: string;
  reservationCode: string;
  roomType: string;
  checkInDate: string;
  source: string;
}

export type TripItemType = 'attraction' | 'stay' | 'transport' | 'flight';

export interface FlightInfo {
  departureCode: string;
  arrivalCode: string;
  departureTime: string;
  arrivalTime: string;
  flightNumber: string;
}

export interface TripItem {
  id: string;
  type: TripItemType;
  title: string;
  startTime?: string; // Arrival (HH:mm)
  endTime?: string;   // Departure (HH:mm)
  duration?: number;  // Stay/Transit duration in minutes
  location?: string;
  mapCode?: string;
  link?: string;
  note: string;
  cost: number;
  currency: 'JPY' | 'TWD';
  paid: boolean;
  // Transport specific
  segments?: TransportSegment[];
  // Stay specific
  stayInfo?: StayInfo;
  // Flight specific
  flightInfo?: FlightInfo;
}

export interface DayPlan {
  id: string;
  date: string;
  items: TripItem[];
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: 'JPY' | 'TWD';
  paymentMethod: 'cash' | 'card';
  category: string;
  date: string;
  isPaid: boolean;
  linkedItemId?: string; // To avoid double counting from itinerary
}

export interface ShoppingItem {
  id: string;
  name: string;
  imageUrl?: string;
  jpyBudget: number;
  jpyIdeal: number;
  twdBudget: number;
  note: string;
  completed: boolean;
}

export interface CheckItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TravelData {
  days: DayPlan[];
  expenses: Expense[];
  shopping: ShoppingItem[];
  preparation: {
    carRental: string;
    packingList: CheckItem[];
    preTripTasks: CheckItem[];
  };
  exchangeRate: number; // JPY to TWD (e.g., 0.21)
  totalBudgetTWD: number;
}
