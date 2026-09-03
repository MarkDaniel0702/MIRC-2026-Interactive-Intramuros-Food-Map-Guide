/**
 * Food spots inside Intramuros, Manila.
 *
 * EVERY entry here sits inside the official Intramuros administrative boundary
 * (OpenStreetMap relation 103707). This is not a claim — it is enforced:
 * run `node tools/verify-in-intramuros.mjs` to re-check all of them against the
 * boundary polygon in data/intramuros-boundary.js.
 *
 * Coordinates and names come from an Overpass API query constrained to that
 * boundary (see DATA.md for the exact query). Nothing here was hand-placed.
 *
 * Price tiers are INDICATIVE estimates, not quoted prices. See PRICE_TIERS below
 * and the methodology section of DATA.md.
 *
 * Data (c) OpenStreetMap contributors, ODbL. Retrieved 2026-09-03.
 */

/** The one price scale used everywhere: legend, filters, list cards, popups. */
const PRICE_TIERS = {
  1: { symbol: '₱',       label: 'Budget',      range: 'under ₱200',            short: '<₱200'      },
  2: { symbol: '₱₱', label: 'Moderate',    range: '₱200 – ₱500',  short: '₱200–500'  },
  3: { symbol: '₱₱₱', label: 'Upscale', range: '₱500 – ₱1,000', short: '₱500–1k' },
  4: { symbol: '₱₱₱₱', label: 'Fine dining', range: '₱1,000 and up', short: '₱1k+' }
};

/** Category keys -> display label + marker colour.
 *  Colours sit inside the navy / green / gold system; bright gold is reserved for
 *  selection and highlights, so categories use a brass, not the accent gold. */
const CATEGORIES = {
  heritage: { label: 'Restaurants & Heritage Dining', color: '#D4A82F', icon: 'fork'   },
  cafe:     { label: 'Cafes & Coffee',                color: '#2FA37A', icon: 'cup'    },
  bar:      { label: 'Bars & Nightlife',              color: '#6C8FD4', icon: 'glass'  },
  fastfood: { label: 'Fast Food & Chains',            color: '#C4643C', icon: 'burger' },
  budget:   { label: 'Budget Eats & Carinderias',     color: '#82C144', icon: 'bowl'   },
  dessert:  { label: 'Desserts & Snacks',             color: '#C9D6E6', icon: 'cone'   }
};

/** When the price tiers and the spot list were last reviewed. */
const DATA_REVIEWED = '2026-09-03';

const FOOD_SPOTS = [
  {
    id: 'adams-canteen', name: 'Adams Canteen', category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Rice Meals'], street: 'Escuela Street', area: null,
    lat: 14.588943, lng: 120.977993, osm: 'node/1038225312',
    blurb: 'Neighbourhood canteen serving Filipino rice meals on the streets behind the southern wall.'
  },
  {
    id: 'aujens-coffee', name: "Aujen's Coffee", category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Pastries'], street: 'Cabildo Street', area: null,
    lat: 14.591738, lng: 120.974225, osm: 'way/46913648',
    blurb: 'Small independent coffee bar a short walk from Manila Cathedral.'
  },
  {
    id: 'bacolod-chk-n-bbq', name: 'Bacolod Chk-N-Bbq', category: 'fastfood', priceTier: 2,
    cuisine: ['Filipino', 'Chicken Inasal', 'Barbecue'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.593288, lng: 120.973522, osm: 'node/1054550021',
    blurb: 'Chain grill for Bacolod-style chicken inasal and barbecue skewers over rice.'
  },
  {
    id: 'balai-maria', name: 'Balai Maria', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino'], street: 'Beaterio Street', area: null,
    lat: 14.590828, lng: 120.973268, osm: 'node/10173344617',
    blurb: 'Filipino kitchen on the quieter western side of the walled city.'
  },
  {
    id: 'bamboo-intramuros', name: 'Bamboo Intramuros', category: 'bar', priceTier: 2,
    cuisine: ['Bar', 'Filipino', 'Grill'], street: 'Magallanes Drive', area: null,
    lat: 14.594598, lng: 120.977585, osm: 'node/6134921366',
    blurb: 'Open-air bar and grill tucked along the northern edge of Intramuros.'
  },
  {
    id: 'barbaras-casa-manila', name: "Barbara's Casa Manila", category: 'heritage', priceTier: 4,
    cuisine: ['Filipino', 'Buffet'], street: 'General Luna Street', area: 'Plaza San Luis Complex',
    lat: 14.589439, lng: 120.975215, osm: 'node/5938571786',
    blurb: 'Heritage buffet inside a Spanish-era mansion, with a Filipino cultural show at dinner.'
  },
  {
    id: 'bataka-bar', name: 'Bataka Bar', category: 'bar', priceTier: 2,
    cuisine: ['Bar', 'Filipino'], street: 'General Luna Street', area: 'Plaza San Luis area',
    lat: 14.589301, lng: 120.975319, osm: 'node/7138594047',
    blurb: 'Casual drinking spot a few steps from Casa Manila.'
  },
  {
    id: 'batala-ice-cream', name: 'Batala (Ice Cream)', category: 'dessert', priceTier: 1,
    cuisine: ['Ice Cream', 'Desserts'], street: 'San Jose Street', area: null,
    lat: 14.587318, lng: 120.977635, osm: 'node/12928095701',
    blurb: 'Ice cream counter in the southern quarter — a separate venue from Batala Bar.'
  },
  {
    id: 'batala-bar', name: 'Batala Bar', category: 'bar', priceTier: 2,
    cuisine: ['Craft Beer', 'Bar'], street: 'General Luna Street', area: 'Plaza San Luis Complex',
    lat: 14.589570, lng: 120.975060, osm: 'node/11710850483',
    blurb: 'Craft beer bar in the Plaza San Luis complex, popular after dark.'
  },
  {
    id: 'beanleaf', name: 'Beanleaf', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Tea', 'Pastries'], street: 'General Luna Street', area: null,
    lat: 14.592758, lng: 120.972201, osm: 'way/607837308',
    blurb: 'Coffee and tea house on the western side, busy with students and office workers.'
  },
  {
    id: 'belfry-cafe', name: 'Belfry Café', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Filipino'], street: 'Cabildo Street', area: null,
    lat: 14.591910, lng: 120.973632, osm: 'node/9785549707',
    blurb: 'Café on Cabildo Street named for the bell towers it sits beneath.'
  },
  {
    id: 'cafe-intramuros', name: 'Cafe Intramuros', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Filipino'], street: 'Real Street', area: 'Plaza San Luis Complex',
    lat: 14.589617, lng: 120.975010, osm: 'node/11710850481',
    blurb: 'Courtyard café in the Plaza San Luis complex, opposite San Agustin Church.'
  },
  {
    id: 'cafe-janealo', name: 'Cafe Janealo', category: 'cafe', priceTier: 1,
    cuisine: ['Filipino', 'Pasta', 'Rice Meals'], street: 'Beaterio Street', area: null,
    lat: 14.591670, lng: 120.974402, osm: 'node/11729816004',
    blurb: 'Diner-style café serving rice meals and pasta, with live music some evenings.'
  },
  {
    id: 'cafe-sofia', name: 'Cafe Sofia', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino', 'Café'], street: 'General Luna Street', area: null,
    lat: 14.587756, lng: 120.976836, osm: 'node/11521200457',
    blurb: 'Sit-down café-restaurant on General Luna Street near San Agustin Church.'
  },
  {
    id: 'casa-marinero', name: 'Casa Marinero', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino'], street: 'Santa Potenciana Street', area: null,
    lat: 14.589010, lng: 120.975918, osm: 'node/10168006689',
    blurb: 'Filipino dining room on Santa Potenciana Street.'
  },
  {
    id: 'casa-marinero-ii', name: 'Casa Marinero II', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino'], street: 'Cabildo Street', area: null,
    lat: 14.589069, lng: 120.975864, osm: 'node/1038225358',
    blurb: 'Second branch of Casa Marinero, a few doors from the original.'
  },
  {
    id: 'chamber-cafe', name: 'Chamber Café', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee'], street: null, area: 'Western Intramuros, near Muralla Street',
    lat: 14.592713, lng: 120.971177, osm: 'node/13197462031',
    blurb: 'Compact coffee spot on the western side of the walled city.'
  },
  {
    id: 'chowking', name: 'Chowking', category: 'fastfood', priceTier: 1,
    cuisine: ['Chinese', 'Filipino', 'Noodles'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.592926, lng: 120.973056, osm: 'node/735198878',
    blurb: 'Chinese-Filipino fast food chain — rice toppings, noodles and siomai.'
  },
  {
    id: 'cioccolata', name: 'Cioccolata', category: 'dessert', priceTier: 2,
    cuisine: ['Churros', 'Hot Chocolate', 'Desserts'], street: 'Muralla Street', area: 'The Bayleaf Hotel',
    lat: 14.589866, lng: 120.978827, osm: 'node/6630882658',
    blurb: 'Churros and thick hot chocolate at the foot of The Bayleaf hotel.'
  },
  {
    id: 'club-intramuros', name: 'Club Intramuros', category: 'heritage', priceTier: 3,
    cuisine: ['Filipino', 'International'], street: 'Bonifacio Drive', area: 'Club Intramuros Golf Club',
    lat: 14.593005, lng: 120.970375, osm: 'node/997416584',
    blurb: 'Clubhouse restaurant at the golf course laid out in the old moat, still within the Intramuros district.'
  },
  {
    id: 'cold-treats', name: 'Cold Treats', category: 'dessert', priceTier: 1,
    cuisine: ['Ice Cream', 'Snacks'], street: 'Real Street', area: 'Plaza San Luis Complex',
    lat: 14.589672, lng: 120.975072, osm: 'node/11710850482',
    blurb: 'Ice cream and cold snacks stall in the Plaza San Luis complex.'
  },
  {
    id: 'dexter-pizza-sisays', name: "Dexter Pizza - Sisay's", category: 'budget', priceTier: 1,
    cuisine: ['Pizza', 'Filipino'], street: 'Cabildo Street', area: null,
    lat: 14.591489, lng: 120.974403, osm: 'way/1262428190',
    blurb: 'Neighbourhood pizza and short-order counter near Beaterio Street.'
  },
  {
    id: 'figaro', name: 'Figaro', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Pastries'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.593133, lng: 120.973349, osm: 'node/7142353791',
    blurb: 'Branch of the Filipino coffee chain on Andres Soriano Avenue.'
  },
  {
    id: 'flower-stories-cafe', name: 'Flower Stories Cafe', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Desserts'], street: 'Magallanes Street', area: null,
    lat: 14.591516, lng: 120.975038, osm: 'node/1054550144',
    blurb: 'Small flower-shop café near Magallanes Street.'
  },
  {
    id: 'greenwich', name: 'Greenwich', category: 'fastfood', priceTier: 1,
    cuisine: ['Pizza', 'Pasta'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.592955, lng: 120.973115, osm: 'node/735198892',
    blurb: 'Pizza and pasta fast food chain on Andres Soriano Avenue.'
  },
  {
    id: 'grotto-hookah-lounge', name: 'Grotto Hookah Lounge', category: 'bar', priceTier: 2,
    cuisine: ['Shisha', 'Bar'], street: 'Cabildo Street', area: null,
    lat: 14.591699, lng: 120.974185, osm: 'node/12803663501',
    blurb: 'Shisha lounge on Cabildo Street, open late.'
  },
  {
    id: 'ilustrado', name: 'Ilustrado', category: 'heritage', priceTier: 3,
    cuisine: ['Filipino', 'Spanish'], street: 'Cabildo Street', area: null,
    lat: 14.587787, lng: 120.977404, osm: 'node/735198925',
    blurb: 'Long-established Spanish-Filipino restaurant in the walled city, known for paella and heritage set menus.'
  },
  {
    id: 'js-cuisine', name: "J's Cuisine", category: 'heritage', priceTier: 2,
    cuisine: ['Filipino'], street: 'Anda Street', area: null,
    lat: 14.593072, lng: 120.977183, osm: 'node/13300824401',
    blurb: 'Casual Filipino restaurant in the northeastern quarter, near Anda Street.'
  },
  {
    id: 'jollibee', name: 'Jollibee', category: 'fastfood', priceTier: 1,
    cuisine: ['Filipino', 'Burgers', 'Fried Chicken'], street: 'Muelle del Rio', area: 'Near the Pasig River',
    lat: 14.593882, lng: 120.974017, osm: 'way/603667781',
    blurb: "The country's biggest fast food chain — Chickenjoy, burger steak and sweet spaghetti."
  },
  {
    id: 'kfc', name: 'KFC', category: 'fastfood', priceTier: 1,
    cuisine: ['Fried Chicken'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.592777, lng: 120.972890, osm: 'node/4918585322',
    blurb: 'Fried chicken chain branch off Andres Soriano Avenue.'
  },
  {
    id: 'kabayan-food-house', name: 'Kabayan Food House', category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Turo-Turo'], street: 'Santa Potenciana Street', area: null,
    lat: 14.589558, lng: 120.976646, osm: 'node/6303089088',
    blurb: 'Turo-turo food house ladling out Filipino home cooking by the plate.'
  },
  {
    id: 'la-cathedral-cafe', name: 'La Cathedral Cafe', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Filipino', 'Pasta'], street: 'Beaterio Street', area: 'Overlooking Manila Cathedral',
    lat: 14.591231, lng: 120.974121, osm: 'node/6794128986',
    blurb: 'Multi-storey café with a roof deck looking straight across at the dome of Manila Cathedral.'
  },
  {
    id: 'la-events-cafe', name: 'La Events Cafe', category: 'cafe', priceTier: 2,
    cuisine: ['Breakfast', 'Filipino', 'Sandwiches', 'International'], street: 'Santa Clara Street', area: null,
    lat: 14.592474, lng: 120.971340, osm: 'node/13850123701',
    blurb: 'All-day breakfast and sandwiches on the western side of the walled city.'
  },
  {
    id: 'liezels-place', name: "Liezel's Place", category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Rice Meals'], street: 'Cabildo Street', area: null,
    lat: 14.588142, lng: 120.977422, osm: 'node/1038225289',
    blurb: 'Carinderia serving Filipino rice meals near the southern wall.'
  },
  {
    id: 'los-frailes-cafe', name: 'Los Frailes Cafe', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Filipino'], street: 'Real Street', area: 'Near San Agustin Church',
    lat: 14.589359, lng: 120.974758, osm: 'node/12802006503',
    blurb: 'Café named for the friars, steps from San Agustin Church.'
  },
  {
    id: 'mk-cookies-pastries', name: 'MK Cookies & Pastries', category: 'dessert', priceTier: 1,
    cuisine: ['Bakery', 'Cookies', 'Pastries'], street: 'Beaterio Street', area: null,
    lat: 14.591424, lng: 120.974137, osm: 'node/11729816001',
    blurb: 'Cookie and pastry counter on Beaterio Street.'
  },
  {
    id: 'maxs-restaurant', name: "Max's Restaurant", category: 'fastfood', priceTier: 2,
    cuisine: ['Filipino', 'Fried Chicken'], street: 'Andres Soriano Avenue', area: null,
    lat: 14.593568, lng: 120.973847, osm: 'node/1034880097',
    blurb: 'The classic Filipino chain built on fried chicken, with full rice meals and sharing platters.'
  },
  {
    id: 'mcdonalds', name: "McDonald's", category: 'fastfood', priceTier: 1,
    cuisine: ['Burgers', 'Fried Chicken'], street: 'Muralla Street', area: null,
    lat: 14.592822, lng: 120.977764, osm: 'node/4698359089',
    blurb: 'Burger chain branch on Muralla Street by the university campuses.'
  },
  {
    id: 'moonleaf', name: 'Moonleaf', category: 'cafe', priceTier: 1,
    cuisine: ['Milk Tea', 'Bubble Tea'], street: 'Victoria Street', area: null,
    lat: 14.589284, lng: 120.978147, osm: 'node/6630882656',
    blurb: 'Milk tea shop on Victoria Street.'
  },
  {
    id: 'papa-kape', name: 'Papa Kape', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Filipino'], street: 'Soledad Promenade', area: 'Inside Fort Santiago',
    lat: 14.594656, lng: 120.969735, osm: 'node/12583335679',
    blurb: 'Coffee bar within the grounds of Fort Santiago, pouring Philippine-grown beans.'
  },
  {
    id: 'paper-cup', name: 'Paper + Cup', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Brunch'], street: 'Muralla Street', area: null,
    lat: 14.588266, lng: 120.978494, osm: 'node/5712864416',
    blurb: 'Quiet specialty coffee spot near the eastern wall.'
  },
  {
    id: 'parers-kimchi', name: 'Parers Kimchi', category: 'heritage', priceTier: 2,
    cuisine: ['Korean'], street: 'Beaterio Street', area: null,
    lat: 14.591962, lng: 120.974531, osm: 'node/11729816003',
    blurb: 'Korean kitchen serving kimchi stews and grilled plates near Beaterio Street.'
  },
  {
    id: 'patio-de-conchita', name: 'Patio de Conchita', category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Rice Meals'], street: 'Beaterio Street', area: null,
    lat: 14.591848, lng: 120.974346, osm: 'node/1054550149',
    blurb: 'Rustic carinderia set in an old Spanish house, known for complete Filipino rice meals at around ₱140.'
  },
  {
    id: 'pepito-foodhouse', name: 'Pepito Foodhouse', category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Barbecue', 'Grill'], street: 'Solana Street', area: null,
    lat: 14.590476, lng: 120.977135, osm: 'node/1038283676',
    blurb: 'Grill house on Solana Street doing barbecue, chicken and rice plates.'
  },
  {
    id: 'ristorante-delle-mitre', name: 'Ristorante delle Mitre', category: 'heritage', priceTier: 2,
    cuisine: ['Italian', 'Spanish', 'Filipino'], street: 'General Luna Street', area: 'Opposite San Agustin Church',
    lat: 14.589488, lng: 120.974704, osm: 'node/5421592625',
    blurb: 'Catholic-themed dining room opposite San Agustin Church, known for very large sharing portions.'
  },
  {
    id: 'savor-kribs', name: 'Savor & Kribs', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino', 'Grill'], street: 'Victoria Street', area: null,
    lat: 14.589707, lng: 120.978639, osm: 'node/4524696228',
    blurb: 'Casual grill and Filipino plates on Victoria Street.'
  },
  {
    id: 'sky-deck-view-bar', name: 'Sky Deck View Bar', category: 'bar', priceTier: 3,
    cuisine: ['Bar', 'Cocktails', 'Tapas'], street: 'Muralla Street', area: 'The Bayleaf Hotel roof deck',
    lat: 14.589941, lng: 120.978735, osm: 'node/13208384185',
    blurb: 'Rooftop bar on The Bayleaf with a 360-degree view over the walls and the Manila Bay sunset.'
  },
  {
    id: 'starbucks-general-luna-south', name: 'Starbucks — General Luna (South)', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Pastries'], street: 'General Luna Street', area: null,
    lat: 14.588501, lng: 120.975849, osm: 'node/5757535421',
    blurb: 'Coffee chain branch on the southern stretch of General Luna Street.'
  },
  {
    id: 'starbucks-muralla', name: 'Starbucks — Muralla', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Pastries'], street: 'Muralla Street', area: null,
    lat: 14.592976, lng: 120.977702, osm: 'node/6212730482',
    blurb: 'Coffee chain branch on Muralla Street beside the university campuses.'
  },
  {
    id: 'starbucks-general-luna-north', name: 'Starbucks — General Luna (North)', category: 'cafe', priceTier: 2,
    cuisine: ['Coffee', 'Pastries'], street: 'General Luna Street', area: null,
    lat: 14.592643, lng: 120.972005, osm: 'node/13674455575',
    blurb: 'Coffee chain branch on the northern stretch of General Luna Street.'
  },
  {
    id: 'sunlai-foodhouse', name: 'Sunlai Foodhouse', category: 'budget', priceTier: 1,
    cuisine: ['Filipino', 'Rice Meals'], street: 'Cabildo Street', area: null,
    lat: 14.588158, lng: 120.977402, osm: 'node/1038225325',
    blurb: 'Food house near the southern wall serving Filipino plates over rice.'
  },
  {
    id: 'tesoros', name: 'Tesoros', category: 'heritage', priceTier: 2,
    cuisine: ['Filipino', 'Café'], street: 'General Luna Street', area: 'Plaza San Luis Complex',
    lat: 14.589585, lng: 120.975042, osm: 'node/11710850484',
    blurb: "Café and dining room attached to the Tesoro's handicrafts store in Plaza San Luis."
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FOOD_SPOTS, PRICE_TIERS, CATEGORIES, DATA_REVIEWED };
}
