/**
 * Central Immutable Wedding Gallery Asset Registry
 * Isolates and strictly serves Bride, Couple, and Family categories.
 * All photos are authentic originals with precise aspect ratios, focal points,
 * relationship tags, and personal messages.
 */
/**
 * HOW TO ADD A NEW FAMILY PHOTO
 * 1. Put the image in /public/images/family/ (e.g. family-1.6.jpeg)
 * 2. Add ONE entry at the end of the list with category: "family" and the next id
 *    (family-06, family-07, ...). Only these fields are required:
 *      id, category, personName, relationship, message, src
 *    aspectRatio and focalPoint are optional: the site reads the real image size itself.
 * 3. The card is created automatically in the Family Legacy section.
 *
 *    personName   = big title on the card      (e.g. "Chacha Ji")
 *    relationship = small tag above the title  (e.g. "Anu's Father's Younger Brother")
 *    message      = one warm caption sentence
 */
export const WEDDING_GALLERY = [
  // Phase 1: Bride Highlights
  {
    id: "bride-01",
    category: "bride",
    personName: "Anu",
    relationship: "The Bride",
    title: "Anu — The Golden Hour",
    message: "Stepping into this golden dawn with quiet grace, cherished roots, and eyes full of forever.",
    src: "./images/bride/bride-1.1.jpeg",
    aspectRatio: 0.819, // 1078 x 1316 portrait
    focalPoint: { x: 0.5, y: 0.56 },
    description: "A serene moment captured in classic bridal poise and elegance."
  },
  {
    id: "bride-02",
    category: "bride",
    personName: "Anu",
    relationship: "The Bride",
    title: "Elegance & Heritage",
    message: "Carrying ancestral blessings forward, standing poised and radiant on the threshold of our new beginning.",
    src: "./images/bride/bride-1.2.jpeg",
    aspectRatio: 0.954, // 1080 x 1132
    focalPoint: { x: 0.5, y: 0.65 },
    description: "Carrying ancestral blessings, poised on the threshold of new beginnings."
  },
  {
    id: "bride-03",
    category: "bride",
    personName: "Anu",
    relationship: "The Bride",
    title: "Adorned in Crimson & Gold",
    message: "Surrounded by festive joy and woven gold, glowing with gratitude for all the love that brought us here.",
    src: "./images/bride/bride_full_lehenga.jpg",
    aspectRatio: 0.915, // 937 x 1024
    focalPoint: { x: 0.5, y: 0.45 },
    description: "Glowing in intricate embroidered golden silk reflecting festive joy."
  },

  // Phase 2: Couple Story
  {
    id: "couple-01",
    category: "couple",
    personName: "Anu & Prince",
    relationship: "The Couple",
    title: "Sacred Bond of Hastamelap",
    message: "Two hands entwined in sacred faith, uniting two souls and families under eternal Vedic vows.",
    src: "./images/couple/couple_hands_mehendi.jpg",
    aspectRatio: 1.526, // 1024 x 671
    focalPoint: { x: 0.5, y: 0.5 },
    description: "Intricate mehendi and clasped hands sealing eternal Vedic vows."
  },
  {
    id: "couple-02",
    category: "couple",
    personName: "Anu & Prince",
    relationship: "The Couple",
    title: "Walking Into Forever",
    message: "Taking our first auspicious steps side by side, eager to build a life filled with laughter, kindness, and devotion.",
    src: "./images/couple/couple_walking_together.jpg",
    aspectRatio: 1.103, // 1024 x 928
    focalPoint: { x: 0.5, y: 0.45 },
    description: "Taking our first auspicious steps side by side toward 30 November 2026."
  },
  {
    id: "couple-03",
    category: "couple",
    personName: "Anu & Prince",
    relationship: "The Couple",
    title: "Shared Smiles & Tenderness",
    message: "In every quiet glance and shared joke, discovering our favorite companion for all of life's tomorrows.",
    src: "./images/couple/couple-1.3.jpeg",
    aspectRatio: 0.904, // 810 x 896
    focalPoint: { x: 0.5, y: 0.4 },
    description: "Laughter and gentle connection in between timeless traditions."
  },

  // Phase 3: Family Legacy (Verified Family Photos)
  {
    id: "family-01",
    category: "family",
    personName: "Mother",
    relationship: "Anu's Mother",
    title: "The Elders' Blessings",
    message: "Her selfless love and quiet prayers are the foundation upon which my entire world is built.",
    src: "./images/family/family-1.1.jpeg",
    aspectRatio: 1.157, // 1078 x 932
    focalPoint: { x: 0.5, y: 0.5 },
    description: "Generations sharing unconditional love, strength, and heartfelt blessings."
  },
  {
    id: "family-02",
    category: "family",
    personName: "Bade Papa",
    relationship: "Anu's Father's Elder Brother",
    title: "Bade Papa",
    message: "His warm embrace and proud laughter have sheltered me since childhood, and today his blessings mean the world to me.",
    src: "./images/family/family-1.2.jpeg",
    aspectRatio: 1.139, // 1080 x 948
    focalPoint: { x: 0.5, y: 0.5 },
    description: "A tender embrace from a beloved elder, full of pride, affection, and blessings."
  },
  {
    id: "family-03",
    category: "family",
    personName: "Bhaisaab",
    relationship: "Anu's Elder Brother",
    title: "Bhaisaab",
    message: "My protector, my guide, and my first friend, standing tall beside me as I begin a new chapter.",
    src: "./images/family/family-1.3.jpeg",
    aspectRatio: 0.912, // 1080 x 1184
    focalPoint: { x: 0.5, y: 0.5 },
    description: "A big brother in festive finery, dressed for celebration under a canopy of twinkling lights."
  },
  {
    id: "family-04",
    category: "family",
    personName: "Badi Mummy",
    relationship: "Anu's Aunt, Like a Second Mother",
    title: "Badi Mummy",
    message: "Her gentle care, patient love, and countless blessings have shaped who I am, a second mother in every way.",
    src: "./images/family/family-1.4.jpeg",
    aspectRatio: 1.015, // 1080 x 1064
    focalPoint: { x: 0.5, y: 0.5 },
    description: "Two hearts side by side, wrapped in the warmth of a mother-like bond."
  },
  {
    id: "family-05",
    category: "family",
    personName: "Mumma & Papa",
    relationship: "Anu's Parents",
    title: "Mumma & Papa",
    message: "Everything I am began with your sacrifices and your love. Thank you for being my strength, today and always.",
    src: "./images/family/family-1.5.jpeg",
    aspectRatio: 1.166, // 1080 x 926
    focalPoint: { x: 0.5, y: 0.5 },
    description: "Side by side through every season of life, the heart and strength of our family."
  },
  {
    id: "family-06",
    category: "family",
    personName: "Mumma",
    relationship: "Bride's Mother",
    title: "Mumma",
    message: "Holding your hands as you look at me in your pink poshak, your joyful smile and gentle ashirwad give me the courage for every step ahead.",
    src: "./images/family/family-1.6.jpeg",
    description: "Anu and her mother smiling and embracing warmly in traditional festive attire."
  },
  {
    id: "family-12",
    category: "family",
    personName: "Harshuu",
    relationship: "Younger Brother",
    title: "Harshuu",
    message: "My little brother, always right by my side, with a smile and a quiet kind of love that makes every family moment feel complete.",
    src: "./images/family/harshuu.jpeg",
    aspectRatio: 0.75, // 960 x 1280 portrait
    focalPoint: { x: 0.5, y: 0.35 },
    description: "Anu sitting with her younger brother Harshuu at home, both in festive attire and smiling for the camera."
  },
  {
    id: "family-07",
    category: "family",
    personName: "Bhaiyuu",
    relationship: "Bride's Younger Brother",
    title: "Bhaiyuu",
    message: "Standing beside you under the festive lights, seeing you all grown up and looking so sharp brings the sweetest comfort to my big sister heart.",
    src: "./images/family/family-1.7.jpeg",
    description: "Anu smiling proudly beside her younger brother dressed up for the wedding celebration."
  },
  {
    id: "family-08",
    category: "family",
    personName: "Rakshita",
    relationship: "Anu's Bhatiji",
    title: "Rakshita",
    message: "Your little laughs and tiny hugs fill my heart with so much joy, my sweet Rakshita. Having you by my side makes this wedding celebration even more special.",
    src: "./images/family/family-1.8.jpeg",
    aspectRatio: 0.562,
    focalPoint: { x: 0.5, y: 0.45 },
    description: "Anu cheek to cheek with her adorable little bhatiji, both beaming with joy."
  },
  {
    id: "family-09",
    category: "family",
    personName: "Papa",
    relationship: "Anu's Papa",
    title: "Papa",
    message: "Your arm around me has always felt like the safest place in the world. Today, as I begin a new chapter, your blessings and quiet strength walk with me.",
    src: "./images/family/family-1.9.jpeg",
    aspectRatio: 0.75,
    focalPoint: { x: 0.5, y: 0.3 },
    description: "Anu in golden festive attire, held close by her beloved father, full of pride and love."
  },
  {
    id: "family-10",
    category: "family",
    personName: "Radhey",
    relationship: "Anu's Bhatija",
    title: "Radhey",
    message: "Your bright smile and playful hugs are my favourite kind of happiness, my dear Radhey. You make every family moment brighter.",
    src: "./images/family/family-1.10.jpeg",
    aspectRatio: 0.562,
    focalPoint: { x: 0.5, y: 0.5 },
    description: "Anu wrapped in the warm hugs of her little nephews, all smiles and sweet mischief."
  },
  {
    id: "family-11",
    category: "family",
    personName: "Family",
    relationship: "Bade Papa's Family",
    title: "Family",
    message: "Together under one roof, wrapped in love, blessings and laughter, this is the family that made me who I am.",
    src: "./images/family/family-1.11.jpeg",
    aspectRatio: 0.75,
    focalPoint: { x: 0.5, y: 0.45 },
    description: "The whole family gathered together, smiling around the beloved jhula at home."
  },
  {
    id: "family-13",
    category: "family",
    personName: "Bhabhisa",
    relationship: "Anu's Bhabhisa",
    title: "Bhabhisa",
    message: "Your gentle warmth and loving care have made our home brighter, and having your blessings beside me makes this wedding celebration even more special.",
    src: "./images/family/bhabhisa.jpeg",
    focalPoint: { x: 0.5, y: 0.3 },
    description: "Bhabhisa in festive attire on a diya-lit evening, holding a thali of glowing lamps with warmth and blessings."
  },
  {
    id: "family-14",
    category: "family",
    pinFirst: true,
    personName: "Badebhaiya",
    relationship: "Anu's Badebhaiya, In Loving Memory",
    title: "Badebhaiya",
    message: "I never had the chance to meet you, Badebhaiya. I have known your face only through this photograph and the stories told about you with so much love. As I begin this new chapter, I carry your blessings in my heart.",
    src: "./images/family/badebhaiya.jpeg",
    focalPoint: { x: 0.5, y: 0.3 },
    description: "A garlanded, framed childhood portrait of Badebhaiya in a red turban, who passed away before Anu was born. She has known him only through photographs, and he is remembered with deep love and respect."
  }
];

