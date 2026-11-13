/**
 * Wedding Invitation Configuration
 * Inspired by Lusion's modern interactive 3D aesthetics.
 * All wedding details, names, times, and venue can be easily edited here.
 */
import { WEDDING_GALLERY } from '../data/galleryData.js';

export const weddingConfig = {
  // Couple Information
  bride: {
    firstName: "Anu",
    fullName: "Anu",
    role: "The Bride",
    bio: "Grace, radiance, and an eternal smile. Stepping into a beautiful new chapter of life with love, tradition, and boundless joy."
  },
  groom: {
    firstName: "Prince",
    fullName: "Prince",
    role: "The Groom",
    bio: "Strength, kindness, and devotion. Ready to walk hand in hand into a lifetime of shared dreams and everlasting laughter."
  },

  // Main Wedding Announcement
  invitationNote: "Together with their loving families, invite you to celebrate the joyous union and wedding of",
  weddingDateDisplay: "30 November 2026",
  targetDateISO: "2026-11-30T10:30:00", // For countdown timer & calendar sync

  // Preserved Original Photos (Crucial: Exact files, original pixels and ratios preserved)
  photos: WEDDING_GALLERY,

  // Itinerary & Ceremonies
  events: [
    {
      name: "Pile Chawal",
      date: "Friday, 20 November 2026",
      time: "9:15 AM",
      venue: "In-house"
    },
    {
      name: "Ganesh Sthapana (Baan)",
      date: "Saturday, 28 November 2026",
      time: "9:15 AM",
      venue: "In-house"
    },
    {
      name: "Chaak",
      date: "Sunday, 29 November 2026",
      time: "10:15 AM",
      venue: "In-house"
    },
    {
      name: "Bhaat",
      date: "Sunday, 29 November 2026",
      time: "5:30 PM",
      venue: "Chhagan Bhani Wadi"
    },
    {
      name: "Haldi & Sangeet",
      date: "Sunday, 29 November 2026",
      time: "Haldi 12:15 PM, Sangeet 1:15 PM",
      venue: "Chhagan Bhani Wadi"
    },
    {
      name: "Priti Bhojan",
      date: "Monday, 30 November 2026",
      time: "7:15 AM",
      venue: "Vastral Party Plot"
    }
  ],

  // Venue & Location
  venue: {
    name: "Vastral Open Party Plot",
    subtext: "Palace Gardens & Crystal Pavilion",
    address: "Vastral Open Party Plot, Opp. Girivar Palms, Vastral, Ahmedabad",
    cityState: "Ahmedabad, Gujarat",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=Vastral%20Open%20Party%20Plot%2C%20Opp.%20Girivar%20Palms%2C%20Vastral%2C%20Ahmedabad",
    note: "Valet parking and warm hospitality await all our honored guests."
  },

  // Credits & Signature
  credits: {
    developedBy: "Harsh Rajput",
    tagline: "Crafted with love, continuous 3D cinematography & modern interactive WebGL."
  }
};
