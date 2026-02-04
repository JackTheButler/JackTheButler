/**
 * Demo Reservations
 *
 * 20 reservations: 6 past (checked out), 5 current (checked in), 7 future (confirmed), 2 cancelled.
 */

import type { NewReservation } from '../schema.js';
import { generateId, daysFromNow, dateTimeFromNow } from './helpers.js';
import { demoGuests } from './guests.js';

function generateReservations(): NewReservation[] {
  const reservations: NewReservation[] = [];
  const roomTypes = ['Standard King', 'Standard Queen', 'Deluxe King', 'Deluxe Suite', 'Junior Suite', 'Executive Suite'];

  // Past reservations (checked out)
  for (let i = 0; i < 6; i++) {
    const guest = demoGuests[i % demoGuests.length]!;
    const arrivalDays = -30 + i * 4;
    const stayLength = 2 + (i % 4);
    reservations.push({
      id: generateId(),
      guestId: guest.id!,
      confirmationNumber: `DEMO${String(1001 + i).padStart(4, '0')}`,
      roomNumber: `${3 + (i % 4)}${String(10 + i).padStart(2, '0')}`,
      roomType: roomTypes[i % roomTypes.length]!,
      arrivalDate: daysFromNow(arrivalDays),
      departureDate: daysFromNow(arrivalDays + stayLength),
      status: 'checked_out',
      actualArrival: dateTimeFromNow(arrivalDays, 15),
      actualDeparture: dateTimeFromNow(arrivalDays + stayLength, 11),
      totalRate: 150 + i * 50,
      balance: 0,
    });
  }

  // Current reservations (checked in)
  for (let i = 0; i < 5; i++) {
    const guest = demoGuests[(i + 3) % demoGuests.length]!;
    const arrivalDays = -2 + i;
    const stayLength = 3 + (i % 3);
    reservations.push({
      id: generateId(),
      guestId: guest.id!,
      confirmationNumber: `DEMO${String(2001 + i).padStart(4, '0')}`,
      roomNumber: `${4 + (i % 3)}${String(5 + i).padStart(2, '0')}`,
      roomType: roomTypes[(i + 2) % roomTypes.length]!,
      arrivalDate: daysFromNow(arrivalDays),
      departureDate: daysFromNow(arrivalDays + stayLength),
      status: 'checked_in',
      actualArrival: dateTimeFromNow(arrivalDays, 14 + i),
      totalRate: 200 + i * 75,
      balance: 50 + i * 20,
    });
  }

  // Future reservations (confirmed)
  for (let i = 0; i < 7; i++) {
    const guest = demoGuests[(i + 5) % demoGuests.length]!;
    const arrivalDays = 3 + i * 5;
    const stayLength = 2 + (i % 5);
    reservations.push({
      id: generateId(),
      guestId: guest.id!,
      confirmationNumber: `DEMO${String(3001 + i).padStart(4, '0')}`,
      roomType: roomTypes[(i + 1) % roomTypes.length]!,
      arrivalDate: daysFromNow(arrivalDays),
      departureDate: daysFromNow(arrivalDays + stayLength),
      status: 'confirmed',
      estimatedArrival: dateTimeFromNow(arrivalDays, 15),
      totalRate: 180 + i * 60,
      balance: 180 + i * 60,
    });
  }

  // Cancelled reservations
  reservations.push({
    id: generateId(),
    guestId: demoGuests[4]!.id!,
    confirmationNumber: 'DEMO9001',
    roomType: 'Deluxe King',
    arrivalDate: daysFromNow(10),
    departureDate: daysFromNow(13),
    status: 'cancelled',
    totalRate: 450,
    balance: 0,
  });

  reservations.push({
    id: generateId(),
    guestId: demoGuests[7]!.id!,
    confirmationNumber: 'DEMO9002',
    roomType: 'Standard Queen',
    arrivalDate: daysFromNow(15),
    departureDate: daysFromNow(17),
    status: 'cancelled',
    totalRate: 280,
    balance: 0,
  });

  return reservations;
}

export const demoReservations: NewReservation[] = generateReservations();
