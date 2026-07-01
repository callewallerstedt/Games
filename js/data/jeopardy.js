// "Jeopardy" data: five themes, each with five categories, each category holding
// five clues of rising difficulty tied to the point values 100 → 500.
//
// Each clue is { q, a:[correct, wrong, wrong, wrong] }. The correct answer is
// always written first here; options are shuffled at runtime so its position varies.
//
// Add a new theme by appending another object to THEMES — the board renders 5
// categories × 5 clues automatically, so keep exactly 5 categories with 5 clues each.

export const VALUES = [100, 200, 300, 400, 500];

export const THEMES = [
  {
    id: "sports",
    title: "Sports",
    emoji: "🏅",
    blurb: "Soccer, hoops, tennis, the Olympics and the ring.",
    categories: [
      {
        name: "Soccer",
        clues: [
          { q: "How many players from one team are on the field in soccer?", a: ["11", "9", "10", "12"] },
          { q: "What is the standard duration of a soccer match (regulation)?", a: ["90 minutes", "60 minutes", "100 minutes", "120 minutes"] },
          { q: "Which country has won the most men's FIFA World Cups?", a: ["Brazil", "Germany", "Italy", "Argentina"] },
          { q: "Which superstar is nicknamed \"CR7\"?", a: ["Cristiano Ronaldo", "Lionel Messi", "Neymar", "Ronaldinho"] },
          { q: "Which club has won the most UEFA Champions League titles?", a: ["Real Madrid", "AC Milan", "Bayern Munich", "Liverpool"] },
        ],
      },
      {
        name: "Basketball",
        clues: [
          { q: "How many points is a standard free throw worth?", a: ["1", "2", "3", "0"] },
          { q: "How many players from one team are on the court in basketball?", a: ["5", "6", "7", "4"] },
          { q: "Which player is nicknamed \"King James\"?", a: ["LeBron James", "Michael Jordan", "Kobe Bryant", "Stephen Curry"] },
          { q: "In which country was basketball invented?", a: ["United States", "Canada", "England", "Spain"] },
          { q: "How many NBA championships did Michael Jordan win with the Bulls?", a: ["6", "5", "3", "7"] },
        ],
      },
      {
        name: "Tennis",
        clues: [
          { q: "How many players are on court in a singles tennis match?", a: ["2", "4", "1", "3"] },
          { q: "What term means a score of zero in tennis?", a: ["Love", "Deuce", "Ace", "Fault"] },
          { q: "Which Grand Slam tournament is played on grass courts?", a: ["Wimbledon", "French Open", "US Open", "Australian Open"] },
          { q: "Which man has won the most Grand Slam singles titles (as of 2024)?", a: ["Novak Djokovic", "Rafael Nadal", "Roger Federer", "Pete Sampras"] },
          { q: "On what surface is the French Open (Roland Garros) played?", a: ["Clay", "Grass", "Hard court", "Carpet"] },
        ],
      },
      {
        name: "Olympics",
        clues: [
          { q: "How many rings are on the Olympic flag?", a: ["5", "4", "6", "3"] },
          { q: "How often are the Summer Olympic Games held?", a: ["Every 4 years", "Every 2 years", "Every year", "Every 5 years"] },
          { q: "Which city hosted the delayed 2020 Summer Olympics (held in 2021)?", a: ["Tokyo", "Rio de Janeiro", "London", "Paris"] },
          { q: "In which country did the ancient Olympic Games originate?", a: ["Greece", "Italy", "Egypt", "Turkey"] },
          { q: "Which swimmer holds the record for most Olympic gold medals?", a: ["Michael Phelps", "Mark Spitz", "Ian Thorpe", "Ryan Lochte"] },
        ],
      },
      {
        name: "Fight Night",
        clues: [
          { q: "How many rounds are in a standard championship boxing match?", a: ["12", "10", "15", "8"] },
          { q: "What does \"KO\" stand for in boxing?", a: ["Knockout", "Kick Off", "Key Opponent", "Knock Over"] },
          { q: "Which boxer called himself \"The Greatest\"?", a: ["Muhammad Ali", "Mike Tyson", "Floyd Mayweather", "Joe Frazier"] },
          { q: "What does \"MMA\" stand for?", a: ["Mixed Martial Arts", "Major Match Association", "Men's Martial Arts", "Multi Match Arena"] },
          { q: "Which promotion is the largest MMA organization in the world?", a: ["UFC", "WWE", "Bellator", "ONE"] },
        ],
      },
    ],
  },

  {
    id: "food",
    title: "Food",
    emoji: "🍔",
    blurb: "Produce, world cuisine, sweets, drinks and the kitchen.",
    categories: [
      {
        name: "Fruit & Veg",
        clues: [
          { q: "Which fruit is yellow and curved?", a: ["Banana", "Apple", "Grape", "Plum"] },
          { q: "Which orange vegetable is famously loved by rabbits?", a: ["Carrot", "Potato", "Onion", "Pea"] },
          { q: "Which fruit \"keeps the doctor away,\" per the saying?", a: ["Apple", "Orange", "Pear", "Peach"] },
          { q: "Botanically, a tomato is classified as a…", a: ["Fruit", "Vegetable", "Grain", "Herb"] },
          { q: "Which vitamin are oranges especially rich in?", a: ["Vitamin C", "Vitamin D", "Vitamin K", "Vitamin B12"] },
        ],
      },
      {
        name: "World Cuisine",
        clues: [
          { q: "Which country is famous for pizza and pasta?", a: ["Italy", "Japan", "Mexico", "India"] },
          { q: "Sushi is a traditional dish from which country?", a: ["Japan", "China", "Thailand", "Korea"] },
          { q: "Which spicy dish is a staple of Indian cuisine?", a: ["Curry", "Paella", "Goulash", "Ramen"] },
          { q: "Tacos and guacamole originate from which country?", a: ["Mexico", "Spain", "Brazil", "Peru"] },
          { q: "The rice dish \"paella\" comes from which country?", a: ["Spain", "Portugal", "Italy", "Greece"] },
        ],
      },
      {
        name: "Sweets",
        clues: [
          { q: "What frozen dessert comes in flavors like vanilla and chocolate?", a: ["Ice cream", "Soup", "Bread", "Salad"] },
          { q: "What is the main ingredient in a classic chocolate bar?", a: ["Cocoa", "Rice", "Corn", "Wheat"] },
          { q: "Which flaky French pastry is shaped like a crescent?", a: ["Croissant", "Bagel", "Pretzel", "Muffin"] },
          { q: "The coffee-flavored dessert tiramisu comes from which country?", a: ["Italy", "France", "Austria", "Belgium"] },
          { q: "What ingredient, when whipped, makes a soufflé rise?", a: ["Egg whites", "Baking soda", "Yeast", "Cornstarch"] },
        ],
      },
      {
        name: "Drinks",
        clues: [
          { q: "Which drink is made from roasted beans and often drunk in the morning?", a: ["Coffee", "Milk", "Juice", "Soda"] },
          { q: "Which hot drink comes in green and black varieties?", a: ["Tea", "Cocoa", "Cider", "Lemonade"] },
          { q: "Champagne is a sparkling wine from which country?", a: ["France", "Italy", "Spain", "Germany"] },
          { q: "Which country is the world's largest producer of coffee?", a: ["Brazil", "Colombia", "Vietnam", "Ethiopia"] },
          { q: "Tea is traditionally made from the leaves of which plant?", a: ["Camellia sinensis", "Coffea", "Cacao", "Mentha"] },
        ],
      },
      {
        name: "In the Kitchen",
        clues: [
          { q: "Which appliance keeps food cold?", a: ["Refrigerator", "Oven", "Toaster", "Blender"] },
          { q: "What do you call cooking food in hot oil?", a: ["Frying", "Boiling", "Baking", "Steaming"] },
          { q: "Which utensil is best for flipping pancakes?", a: ["Spatula", "Whisk", "Ladle", "Peeler"] },
          { q: "At what temperature does water boil at sea level?", a: ["100°C", "90°C", "120°C", "80°C"] },
          { q: "Which process uses yeast to make bread rise?", a: ["Fermentation", "Evaporation", "Oxidation", "Condensation"] },
        ],
      },
    ],
  },

  {
    id: "movies",
    title: "Movies",
    emoji: "🎬",
    blurb: "Animation, sci-fi, superheroes, classics and directors.",
    categories: [
      {
        name: "Animated",
        clues: [
          { q: "Which studio created Mickey Mouse?", a: ["Disney", "Pixar", "DreamWorks", "Warner Bros"] },
          { q: "In \"Toy Story,\" what type of toy is Woody?", a: ["Cowboy", "Astronaut", "Robot", "Dinosaur"] },
          { q: "Which animated film features a snowman named Olaf?", a: ["Frozen", "Moana", "Tangled", "Encanto"] },
          { q: "Which studio made \"Shrek\"?", a: ["DreamWorks", "Pixar", "Disney", "Illumination"] },
          { q: "What was the first feature-length Pixar film?", a: ["Toy Story", "A Bug's Life", "Monsters, Inc.", "Finding Nemo"] },
        ],
      },
      {
        name: "Sci-Fi",
        clues: [
          { q: "In \"Star Wars,\" what weapon does a Jedi wield?", a: ["Lightsaber", "Blaster", "Bow", "Hammer"] },
          { q: "Which film features dinosaurs revived in a theme park?", a: ["Jurassic Park", "King Kong", "Godzilla", "Avatar"] },
          { q: "In \"The Matrix,\" which colored pill does Neo take?", a: ["Red", "Blue", "Green", "Yellow"] },
          { q: "Who directed the 2009 film \"Avatar\"?", a: ["James Cameron", "Steven Spielberg", "Ridley Scott", "George Lucas"] },
          { q: "What is the name of the AI computer in \"2001: A Space Odyssey\"?", a: ["HAL 9000", "Skynet", "GLaDOS", "Deep Thought"] },
        ],
      },
      {
        name: "Superheroes",
        clues: [
          { q: "What color is the Hulk?", a: ["Green", "Blue", "Red", "Purple"] },
          { q: "Which superhero is known as the \"Dark Knight\"?", a: ["Batman", "Superman", "Spider-Man", "Iron Man"] },
          { q: "What is Spider-Man's real name?", a: ["Peter Parker", "Bruce Wayne", "Clark Kent", "Tony Stark"] },
          { q: "Which metal makes up Wolverine's claws and skeleton?", a: ["Adamantium", "Vibranium", "Titanium", "Steel"] },
          { q: "In the MCU, what are the six powerful gems collectively called?", a: ["Infinity Stones", "Power Crystals", "Cosmic Cubes", "Soul Shards"] },
        ],
      },
      {
        name: "Classics",
        clues: [
          { q: "\"May the Force be with you\" is from which film series?", a: ["Star Wars", "Star Trek", "Harry Potter", "Lord of the Rings"] },
          { q: "In the 1997 film \"Titanic,\" what does the ship do?", a: ["Sinks", "Wins a race", "Is captured", "Explodes"] },
          { q: "Which film features the line \"Here's looking at you, kid\"?", a: ["Casablanca", "Gone with the Wind", "Citizen Kane", "The Godfather"] },
          { q: "In \"The Wizard of Oz,\" what does Dorothy click together?", a: ["Ruby slippers", "Golden boots", "Silver shoes", "Glass slippers"] },
          { q: "Which 1941 Orson Welles film is often called the greatest ever made?", a: ["Citizen Kane", "Casablanca", "Vertigo", "Gone with the Wind"] },
        ],
      },
      {
        name: "Directors",
        clues: [
          { q: "Which \"Master of Suspense\" directed \"Psycho\"?", a: ["Alfred Hitchcock", "Steven Spielberg", "Martin Scorsese", "Stanley Kubrick"] },
          { q: "Who directed \"Jaws\" and \"E.T.\"?", a: ["Steven Spielberg", "George Lucas", "James Cameron", "Ridley Scott"] },
          { q: "Who directed \"Pulp Fiction\"?", a: ["Quentin Tarantino", "Martin Scorsese", "Christopher Nolan", "Spike Lee"] },
          { q: "Who directed \"Inception\" and \"The Dark Knight\"?", a: ["Christopher Nolan", "James Cameron", "Ridley Scott", "Denis Villeneuve"] },
          { q: "Who directed \"Parasite,\" the first non-English Best Picture winner?", a: ["Bong Joon-ho", "Ang Lee", "Akira Kurosawa", "Hayao Miyazaki"] },
        ],
      },
    ],
  },

  {
    id: "games",
    title: "Video Games",
    emoji: "🎮",
    blurb: "Nintendo, PlayStation, arcades, shooters and RPGs.",
    categories: [
      {
        name: "Nintendo",
        clues: [
          { q: "What is the name of Nintendo's mustachioed plumber mascot?", a: ["Mario", "Luigi", "Wario", "Sonic"] },
          { q: "In \"Super Mario,\" what does Mario collect for points?", a: ["Coins", "Rings", "Gems", "Stars"] },
          { q: "Which princess does Mario often rescue?", a: ["Peach", "Zelda", "Daisy", "Rosalina"] },
          { q: "In \"The Legend of Zelda,\" what is the hero's name?", a: ["Link", "Zelda", "Ganon", "Epona"] },
          { q: "In what year was the Nintendo Switch released?", a: ["2017", "2015", "2019", "2013"] },
        ],
      },
      {
        name: "PlayStation",
        clues: [
          { q: "Which company makes the PlayStation?", a: ["Sony", "Microsoft", "Nintendo", "Sega"] },
          { q: "Which of these is a PlayStation controller face-button symbol?", a: ["Triangle", "Star", "Heart", "Diamond"] },
          { q: "Which exclusive game series stars Kratos, a warrior of myth?", a: ["God of War", "Halo", "Gears of War", "Doom"] },
          { q: "Which PlayStation series stars treasure hunter Nathan Drake?", a: ["Uncharted", "Tomb Raider", "Assassin's Creed", "Far Cry"] },
          { q: "In what year was the original PlayStation first released in Japan?", a: ["1994", "1998", "2000", "1991"] },
        ],
      },
      {
        name: "Arcade",
        clues: [
          { q: "In \"Pac-Man,\" what does Pac-Man munch through the maze?", a: ["Dots", "Coins", "Bricks", "Keys"] },
          { q: "Which game has you arranging falling blocks into complete lines?", a: ["Tetris", "Pong", "Snake", "Frogger"] },
          { q: "In \"Pac-Man,\" what chases Pac-Man around the maze?", a: ["Ghosts", "Zombies", "Dogs", "Robots"] },
          { q: "In which country was \"Tetris\" created?", a: ["Soviet Union", "Japan", "United States", "Germany"] },
          { q: "Which 1972 title was the first commercially successful arcade game?", a: ["Pong", "Space Invaders", "Asteroids", "Pac-Man"] },
        ],
      },
      {
        name: "Shooters",
        clues: [
          { q: "In gaming, what does \"FPS\" stand for?", a: ["First-Person Shooter", "Fast Play Speed", "Final Player Score", "Free Play Session"] },
          { q: "Which series features a super-soldier called Master Chief?", a: ["Halo", "Call of Duty", "Doom", "Battlefield"] },
          { q: "Which battle-royale game rewards you with a \"Victory Royale\"?", a: ["Fortnite", "PUBG", "Apex Legends", "Warzone"] },
          { q: "Which 1993 game helped popularize the FPS genre with demon-blasting?", a: ["Doom", "Halo", "Counter-Strike", "Half-Life"] },
          { q: "\"Counter-Strike\" began as a mod for which game?", a: ["Half-Life", "Doom", "Quake", "Unreal"] },
        ],
      },
      {
        name: "RPGs",
        clues: [
          { q: "In gaming, what does \"RPG\" stand for?", a: ["Role-Playing Game", "Rapid Play Gaming", "Random Player Group", "Real Player Game"] },
          { q: "Which franchise is about catching creatures like Pikachu?", a: ["Pokémon", "Digimon", "Yu-Gi-Oh", "Monster Hunter"] },
          { q: "Which RPG features dragons and the shout \"Fus Ro Dah\"?", a: ["Skyrim", "Fallout", "Mass Effect", "Dragon Age"] },
          { q: "In \"The Witcher,\" what is the profession of hero Geralt?", a: ["Monster hunter", "Wizard", "Knight", "Blacksmith"] },
          { q: "Which notoriously tough RPG series is made by FromSoftware?", a: ["Dark Souls", "Final Fantasy", "Dragon Age", "Mass Effect"] },
        ],
      },
    ],
  },

  {
    id: "countries",
    title: "Countries",
    emoji: "🌍",
    blurb: "Capitals, flags, landmarks, geography and culture.",
    categories: [
      {
        name: "Capitals",
        clues: [
          { q: "What is the capital of France?", a: ["Paris", "Lyon", "Marseille", "Nice"] },
          { q: "What is the capital of Japan?", a: ["Tokyo", "Kyoto", "Osaka", "Seoul"] },
          { q: "What is the capital of Australia?", a: ["Canberra", "Sydney", "Melbourne", "Perth"] },
          { q: "What is the capital of Canada?", a: ["Ottawa", "Toronto", "Vancouver", "Montreal"] },
          { q: "What is the capital of Brazil?", a: ["Brasília", "Rio de Janeiro", "São Paulo", "Salvador"] },
        ],
      },
      {
        name: "Flags",
        clues: [
          { q: "How many stars are on the flag of the United States?", a: ["50", "13", "48", "52"] },
          { q: "Which country's flag features a red maple leaf?", a: ["Canada", "United States", "Denmark", "Switzerland"] },
          { q: "Which country's flag is a single red circle on a white field?", a: ["Japan", "China", "South Korea", "Turkey"] },
          { q: "The \"Union Jack\" is the flag of which country?", a: ["United Kingdom", "United States", "Australia", "Ireland"] },
          { q: "Which country has the only non-rectangular national flag?", a: ["Nepal", "Switzerland", "Vatican City", "Bhutan"] },
        ],
      },
      {
        name: "Landmarks",
        clues: [
          { q: "In which city is the Eiffel Tower?", a: ["Paris", "London", "Rome", "Berlin"] },
          { q: "The Great Wall is located in which country?", a: ["China", "Japan", "India", "Mongolia"] },
          { q: "In which city can you find the Colosseum?", a: ["Rome", "Athens", "Cairo", "Istanbul"] },
          { q: "The Taj Mahal is located in which country?", a: ["India", "Pakistan", "Iran", "Turkey"] },
          { q: "The ancient city of Machu Picchu is in which country?", a: ["Peru", "Mexico", "Chile", "Bolivia"] },
        ],
      },
      {
        name: "Geography",
        clues: [
          { q: "Which is the largest continent by area?", a: ["Asia", "Africa", "Europe", "Antarctica"] },
          { q: "Which is generally considered the longest river in the world?", a: ["Nile", "Amazon", "Yangtze", "Mississippi"] },
          { q: "Which is the largest country in the world by land area?", a: ["Russia", "Canada", "China", "United States"] },
          { q: "Which is the largest hot desert in the world?", a: ["Sahara", "Gobi", "Kalahari", "Arabian"] },
          { q: "Which is the smallest country in the world by area?", a: ["Vatican City", "Monaco", "San Marino", "Nauru"] },
        ],
      },
      {
        name: "Culture",
        clues: [
          { q: "What language is mainly spoken in Spain?", a: ["Spanish", "Portuguese", "Italian", "French"] },
          { q: "What is the main language of Brazil?", a: ["Portuguese", "Spanish", "English", "French"] },
          { q: "Which language has the most native speakers in the world?", a: ["Mandarin Chinese", "English", "Spanish", "Hindi"] },
          { q: "In which country is \"Oktoberfest\" traditionally celebrated?", a: ["Germany", "Austria", "Netherlands", "Belgium"] },
          { q: "The festival of lights, \"Diwali,\" is mainly celebrated in which country?", a: ["India", "China", "Thailand", "Japan"] },
        ],
      },
    ],
  },
];
