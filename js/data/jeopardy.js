// "Jeopardy" data: a set of themes, each with five categories, each category
// holding five clues of rising difficulty tied to the point values 100 → 500.
//
// Answers are typed in by the player and a human judges them, so each clue is just
// { q, a } — the question and the canonical correct answer to reveal. The judge can
// accept close/alternate answers at their discretion; `a` is what the board shows.
//
// Difficulty is deliberately graded down each column:
//   100 — general knowledge, most players get it
//   200 — easy/medium
//   300 — medium, takes a beat
//   400 — hard, for the well-read
//   500 — expert / obscure, genuinely tough
//
// Add a theme by appending another object to THEMES — the board renders 5
// categories × 5 clues automatically, so keep exactly 5 categories with 5 clues each.

export const VALUES = [100, 200, 300, 400, 500];

export const THEMES = [
  {
    id: "science",
    title: "Science & Nature",
    emoji: "🔬",
    blurb: "The body, chemistry, physics, animals and planet Earth.",
    categories: [
      {
        name: "Human Body",
        clues: [
          { q: "Which organ pumps blood around the body?", a: "The heart" },
          { q: "What is the largest organ of the human body?", a: "The skin" },
          { q: "How many bones are in the adult human body?", a: "206" },
          { q: "What is the name of the longest bone in the human body?", a: "The femur (thigh bone)" },
          { q: "Which part of the brain controls balance and coordination?", a: "The cerebellum" },
        ],
      },
      {
        name: "Chemistry",
        clues: [
          { q: "What is the chemical formula for water?", a: "H₂O" },
          { q: "What is the chemical symbol for gold?", a: "Au" },
          { q: "What is the most abundant gas in Earth's atmosphere?", a: "Nitrogen" },
          { q: "Which is the only metal that is liquid at room temperature?", a: "Mercury" },
          { q: "Which element, atomic number 74, has the highest melting point of any metal?", a: "Tungsten" },
        ],
      },
      {
        name: "Physics",
        clues: [
          { q: "What force pulls objects toward the Earth?", a: "Gravity" },
          { q: "What kind of energy does a moving object possess?", a: "Kinetic energy" },
          { q: "What is the SI unit of force?", a: "The newton" },
          { q: "What is the SI unit of electrical resistance?", a: "The ohm" },
          { q: "Heisenberg's uncertainty principle says you can't know a particle's exact position and its exact what?", a: "Momentum" },
        ],
      },
      {
        name: "Animal Kingdom",
        clues: [
          { q: "What is the largest land animal?", a: "The African elephant" },
          { q: "What is the fastest land animal?", a: "The cheetah" },
          { q: "What is the largest animal ever known to have lived?", a: "The blue whale" },
          { q: "How many hearts does an octopus have?", a: "Three" },
          { q: "What is the only mammal capable of true, sustained flight?", a: "The bat" },
        ],
      },
      {
        name: "Planet Earth",
        clues: [
          { q: "What is the largest ocean on Earth?", a: "The Pacific Ocean" },
          { q: "What is the tallest mountain above sea level?", a: "Mount Everest" },
          { q: "What is the deepest point in the ocean?", a: "The Mariana Trench (Challenger Deep)" },
          { q: "What is the deepest lake in the world?", a: "Lake Baikal" },
          { q: "What is the name of the supercontinent that existed 300 million years ago?", a: "Pangaea" },
        ],
      },
    ],
  },

  {
    id: "history",
    title: "World History",
    emoji: "🏛️",
    blurb: "Ancient empires, wars, leaders and the age of exploration.",
    categories: [
      {
        name: "Ancient World",
        clues: [
          { q: "The pyramids of Giza are located in which country?", a: "Egypt" },
          { q: "Which ancient civilization built the Colosseum?", a: "The Romans (Ancient Rome)" },
          { q: "Which Mesopotamian people are credited with the earliest known writing, cuneiform?", a: "The Sumerians" },
          { q: "Who was the first Roman emperor?", a: "Augustus (Octavian)" },
          { q: "The Code of Hammurabi, one of the oldest legal codes, came from which empire?", a: "Babylon (the Babylonian Empire)" },
        ],
      },
      {
        name: "Wars",
        clues: [
          { q: "In which year did World War II end?", a: "1945" },
          { q: "In which year did World War I begin?", a: "1914" },
          { q: "Which 1815 battle marked the final defeat of Napoleon?", a: "The Battle of Waterloo" },
          { q: "The 1962 US–USSR standoff over missiles in Cuba is known as what?", a: "The Cuban Missile Crisis" },
          { q: "The Hundred Years' War was fought mainly between which two countries?", a: "England and France" },
        ],
      },
      {
        name: "Leaders",
        clues: [
          { q: "Who was the first President of the United States?", a: "George Washington" },
          { q: "Which British PM led the country through most of World War II?", a: "Winston Churchill" },
          { q: "Who led India's nonviolent independence movement?", a: "Mahatma Gandhi" },
          { q: "Which Russian ruler nicknamed 'the Great' founded St. Petersburg?", a: "Peter the Great" },
          { q: "Who was the last active pharaoh of ancient Egypt?", a: "Cleopatra VII" },
        ],
      },
      {
        name: "20th Century",
        clues: [
          { q: "In which year did humans first land on the Moon?", a: "1969" },
          { q: "In which year did the Berlin Wall fall?", a: "1989" },
          { q: "Which ship sank on its maiden voyage in 1912?", a: "The RMS Titanic" },
          { q: "Who was the US president during the Cuban Missile Crisis?", a: "John F. Kennedy" },
          { q: "In what year did the Soviet Union officially dissolve?", a: "1991" },
        ],
      },
      {
        name: "Explorers",
        clues: [
          { q: "Which explorer reached the Americas in 1492 sailing for Spain?", a: "Christopher Columbus" },
          { q: "Who was the first person to reach the South Pole?", a: "Roald Amundsen" },
          { q: "Who led the first expedition to circumnavigate the globe?", a: "Ferdinand Magellan" },
          { q: "Who, with Tenzing Norgay, first reached the summit of Mount Everest?", a: "Edmund Hillary" },
          { q: "Which Portuguese explorer was first to reach India by sea?", a: "Vasco da Gama" },
        ],
      },
    ],
  },

  {
    id: "geography",
    title: "Geography",
    emoji: "🌍",
    blurb: "Capitals, rivers, mountains, flags and the extremes of the map.",
    categories: [
      {
        name: "Capitals",
        clues: [
          { q: "What is the capital of Japan?", a: "Tokyo" },
          { q: "What is the capital of Canada?", a: "Ottawa" },
          { q: "What is the capital of Australia?", a: "Canberra" },
          { q: "What is the capital of Turkey?", a: "Ankara" },
          { q: "What is the capital of Kazakhstan?", a: "Astana" },
        ],
      },
      {
        name: "Rivers & Lakes",
        clues: [
          { q: "Which river flows through Egypt and is often called the world's longest?", a: "The Nile" },
          { q: "Which river runs through London?", a: "The Thames" },
          { q: "On which continent is most of the Amazon River?", a: "South America" },
          { q: "Which is the largest lake in the world by surface area?", a: "The Caspian Sea" },
          { q: "The Danube River empties into which sea?", a: "The Black Sea" },
        ],
      },
      {
        name: "Mountains",
        clues: [
          { q: "On which continent is Mount Everest?", a: "Asia" },
          { q: "The Alps run mainly through which continent?", a: "Europe" },
          { q: "Mount Kilimanjaro is the highest peak on which continent?", a: "Africa" },
          { q: "The Andes run along the western edge of which continent?", a: "South America" },
          { q: "What is the highest mountain in North America?", a: "Denali (Mount McKinley)" },
        ],
      },
      {
        name: "Extreme Places",
        clues: [
          { q: "What is the largest hot desert in the world?", a: "The Sahara" },
          { q: "Which is the largest country in the world by area?", a: "Russia" },
          { q: "Which is the smallest country in the world by area?", a: "Vatican City" },
          { q: "Which country spans the most time zones?", a: "France (12, including overseas territories)" },
          { q: "Which Pacific nation is the only country located in all four hemispheres?", a: "Kiribati" },
        ],
      },
      {
        name: "Flags",
        clues: [
          { q: "Which country's flag features a single red maple leaf?", a: "Canada" },
          { q: "How many stars are on the flag of the United States?", a: "50" },
          { q: "Which is the only country with a non-rectangular national flag?", a: "Nepal" },
          { q: "Which country's flag features a green cedar tree?", a: "Lebanon" },
          { q: "Which country's flag depicts a dragon?", a: "Bhutan" },
        ],
      },
    ],
  },

  {
    id: "movies",
    title: "Movies & TV",
    emoji: "🎬",
    blurb: "Blockbusters, animation, directors, Oscars and the small screen.",
    categories: [
      {
        name: "Blockbusters",
        clues: [
          { q: "In 'Titanic,' what does the ship strike?", a: "An iceberg" },
          { q: "Which 2009 James Cameron film became the highest-grossing of all time?", a: "Avatar" },
          { q: "In 'The Matrix,' which colored pill does Neo take?", a: "The red pill" },
          { q: "Which 1975 Spielberg film is often called the first summer blockbuster?", a: "Jaws" },
          { q: "What was the first film in the Marvel Cinematic Universe, from 2008?", a: "Iron Man" },
        ],
      },
      {
        name: "Animation",
        clues: [
          { q: "What was the first feature-length Pixar film?", a: "Toy Story" },
          { q: "In 'Frozen,' what is the name of the snowman?", a: "Olaf" },
          { q: "Which Japanese studio produced 'Spirited Away'?", a: "Studio Ghibli" },
          { q: "Who directed 'Spirited Away'?", a: "Hayao Miyazaki" },
          { q: "What was the first full-length animated feature, released by Disney in 1937?", a: "Snow White and the Seven Dwarfs" },
        ],
      },
      {
        name: "Directors",
        clues: [
          { q: "Who directed 'Jaws' and 'E.T.'?", a: "Steven Spielberg" },
          { q: "Who directed 'Pulp Fiction'?", a: "Quentin Tarantino" },
          { q: "Who directed 'Inception' and 'Interstellar'?", a: "Christopher Nolan" },
          { q: "Which director is known as the 'Master of Suspense'?", a: "Alfred Hitchcock" },
          { q: "Who directed 'Parasite,' the first non-English Best Picture winner?", a: "Bong Joon-ho" },
        ],
      },
      {
        name: "Oscars",
        clues: [
          { q: "What is the nickname for the Academy Award statuette?", a: "Oscar" },
          { q: "Which 1997 film won 11 Oscars, tying the record?", a: "Titanic" },
          { q: "Which actress has won the most acting Oscars, with four?", a: "Katharine Hepburn" },
          { q: "Which film won the very first Best Picture Oscar in 1929?", a: "Wings" },
          { q: "Who was the first Black actor to win the Best Actor Oscar?", a: "Sidney Poitier" },
        ],
      },
      {
        name: "TV Shows",
        clues: [
          { q: "'The Simpsons' is set in which fictional town?", a: "Springfield" },
          { q: "Which HBO fantasy series is based on George R.R. Martin's novels?", a: "Game of Thrones" },
          { q: "In 'Breaking Bad,' what is Walter White's alias?", a: "Heisenberg" },
          { q: "What fictional town is the setting for 'Stranger Things'?", a: "Hawkins, Indiana" },
          { q: "In 'Friends,' what is the name of Ross's pet monkey?", a: "Marcel" },
        ],
      },
    ],
  },

  {
    id: "music",
    title: "Music",
    emoji: "🎵",
    blurb: "Pop icons, rock legends, classical, instruments and bands.",
    categories: [
      {
        name: "Pop",
        clues: [
          { q: "Which artist is known as the 'King of Pop'?", a: "Michael Jackson" },
          { q: "Which singer released the 2011 album '21'?", a: "Adele" },
          { q: "Which pop star was born Stefani Germanotta?", a: "Lady Gaga" },
          { q: "In which year was Michael Jackson's 'Thriller' released?", a: "1982" },
          { q: "Which artist has won the most Grammy Awards of all time?", a: "Beyoncé" },
        ],
      },
      {
        name: "Rock",
        clues: [
          { q: "Which band recorded 'Hey Jude'?", a: "The Beatles" },
          { q: "Who was the lead singer of Queen?", a: "Freddie Mercury" },
          { q: "Which band released 'Stairway to Heaven'?", a: "Led Zeppelin" },
          { q: "Which guitarist recorded 'Purple Haze' and starred at Woodstock?", a: "Jimi Hendrix" },
          { q: "Which 1973 Pink Floyd album spent over 900 weeks on the Billboard charts?", a: "The Dark Side of the Moon" },
        ],
      },
      {
        name: "Classical",
        clues: [
          { q: "Who composed the 'Ode to Joy'?", a: "Ludwig van Beethoven" },
          { q: "Which composer wrote 'The Four Seasons'?", a: "Antonio Vivaldi" },
          { q: "Which child prodigy composed 'The Magic Flute'?", a: "Wolfgang Amadeus Mozart" },
          { q: "Beethoven wrote his famous Ninth Symphony while suffering from what condition?", a: "Deafness" },
          { q: "Which Russian composer wrote 'The Nutcracker' and 'Swan Lake'?", a: "Pyotr Ilyich Tchaikovsky" },
        ],
      },
      {
        name: "Instruments",
        clues: [
          { q: "How many strings does a standard guitar have?", a: "Six" },
          { q: "Which keyboard instrument has 88 keys?", a: "The piano" },
          { q: "Which brass instrument is the largest and lowest-pitched?", a: "The tuba" },
          { q: "Violin, viola and cello belong to which instrument family?", a: "The string family" },
          { q: "What is the highest-pitched member of the standard woodwind family?", a: "The piccolo" },
        ],
      },
      {
        name: "Bands",
        clues: [
          { q: "Which band sang 'Bohemian Rhapsody'?", a: "Queen" },
          { q: "How many members were in The Beatles?", a: "Four" },
          { q: "Which Swedish group won Eurovision in 1974 with 'Waterloo'?", a: "ABBA" },
          { q: "Which band's frontmen are Bono and The Edge?", a: "U2" },
          { q: "Which American band released 'Hotel California' in 1976?", a: "The Eagles" },
        ],
      },
    ],
  },

  {
    id: "sports",
    title: "Sports",
    emoji: "🏅",
    blurb: "Soccer, hoops, the Olympics, tennis and motorsport.",
    categories: [
      {
        name: "Soccer",
        clues: [
          { q: "How many players per team are on the field in soccer?", a: "11" },
          { q: "Which country has won the most men's FIFA World Cups?", a: "Brazil (five)" },
          { q: "Which player has won the most Ballon d'Or awards?", a: "Lionel Messi" },
          { q: "Which club has won the most UEFA Champions League titles?", a: "Real Madrid" },
          { q: "Which country hosted and won the first FIFA World Cup in 1930?", a: "Uruguay" },
        ],
      },
      {
        name: "Basketball",
        clues: [
          { q: "How many players from one team are on the court?", a: "Five" },
          { q: "How many points is a shot beyond the arc worth?", a: "Three" },
          { q: "Which player holds the NBA record for most career points?", a: "LeBron James" },
          { q: "Which team did Michael Jordan win six championships with?", a: "The Chicago Bulls" },
          { q: "Who scored 100 points in a single NBA game in 1962?", a: "Wilt Chamberlain" },
        ],
      },
      {
        name: "Olympics",
        clues: [
          { q: "How many rings are on the Olympic flag?", a: "Five" },
          { q: "How often are the Summer Olympics held?", a: "Every four years" },
          { q: "Which swimmer has won the most Olympic gold medals, with 23?", a: "Michael Phelps" },
          { q: "In which country did the ancient Olympics originate?", a: "Greece" },
          { q: "Which city hosted the first modern Olympic Games in 1896?", a: "Athens" },
        ],
      },
      {
        name: "Tennis",
        clues: [
          { q: "What is the term for a score of zero in tennis?", a: "Love" },
          { q: "Which Grand Slam tournament is played on grass?", a: "Wimbledon" },
          { q: "On which surface is the French Open played?", a: "Clay" },
          { q: "Which man has won the most Grand Slam singles titles?", a: "Novak Djokovic" },
          { q: "Who completed the 'Golden Slam' in 1988, winning all four majors plus Olympic gold?", a: "Steffi Graf" },
        ],
      },
      {
        name: "Motorsport",
        clues: [
          { q: "In Formula 1, what flag signals the end of a race?", a: "The chequered flag" },
          { q: "Which tiny country hosts a famous street-circuit Grand Prix?", a: "Monaco" },
          { q: "Which German driver won a record-tying seven Formula 1 World Championships?", a: "Michael Schumacher" },
          { q: "What is the most famous 24-hour endurance race, held annually in France?", a: "The 24 Hours of Le Mans" },
          { q: "Which three-time Brazilian F1 champion died at Imola in 1994?", a: "Ayrton Senna" },
        ],
      },
    ],
  },

  {
    id: "literature",
    title: "Literature & Words",
    emoji: "📚",
    blurb: "Classic novels, authors, Shakespeare, wordplay and poetry.",
    categories: [
      {
        name: "Classic Novels",
        clues: [
          { q: "In which novel does a white whale named Moby Dick appear?", a: "Moby-Dick" },
          { q: "Who wrote 'Romeo and Juliet'?", a: "William Shakespeare" },
          { q: "Which Dickens novel opens 'It was the best of times, it was the worst of times'?", a: "A Tale of Two Cities" },
          { q: "In Orwell's '1984,' what is the name of the ever-watching leader?", a: "Big Brother" },
          { q: "Which Tolstoy novel follows Russian aristocrats during the Napoleonic invasion?", a: "War and Peace" },
        ],
      },
      {
        name: "Authors",
        clues: [
          { q: "Which author created Harry Potter?", a: "J.K. Rowling" },
          { q: "Who wrote 'The Old Man and the Sea'?", a: "Ernest Hemingway" },
          { q: "Who wrote 'Pride and Prejudice'?", a: "Jane Austen" },
          { q: "Which American writer penned the poem 'The Raven'?", a: "Edgar Allan Poe" },
          { q: "Which Colombian author wrote 'One Hundred Years of Solitude'?", a: "Gabriel García Márquez" },
        ],
      },
      {
        name: "Shakespeare",
        clues: [
          { q: "'To be or not to be' is a line from which play?", a: "Hamlet" },
          { q: "Which play features the 'star-crossed lovers'?", a: "Romeo and Juliet" },
          { q: "In which play does Lady Macbeth appear?", a: "Macbeth" },
          { q: "Which play features the dying line 'Et tu, Brute?'", a: "Julius Caesar" },
          { q: "Roughly how many plays is Shakespeare generally credited with writing?", a: "About 37" },
        ],
      },
      {
        name: "Words & Origins",
        clues: [
          { q: "What do you call a word that means the same as another?", a: "A synonym" },
          { q: "What is a word spelled the same forwards and backwards called?", a: "A palindrome" },
          { q: "What is the study of the origin of words called?", a: "Etymology" },
          { q: "Which language has the most native speakers worldwide?", a: "Mandarin Chinese" },
          { q: "What term describes a word that imitates a sound, like 'buzz' or 'hiss'?", a: "Onomatopoeia" },
        ],
      },
      {
        name: "Poetry",
        clues: [
          { q: "A poem of 14 lines is called a what?", a: "A sonnet" },
          { q: "Which Japanese poetry form has three lines of 5-7-5 syllables?", a: "Haiku" },
          { q: "Which poet wrote 'The Road Not Taken'?", a: "Robert Frost" },
          { q: "'Do not go gentle into that good night' was written by which Welsh poet?", a: "Dylan Thomas" },
          { q: "Which epic poem attributed to Homer follows Odysseus's journey home?", a: "The Odyssey" },
        ],
      },
    ],
  },

  {
    id: "food",
    title: "Food & Drink",
    emoji: "🍽️",
    blurb: "World cuisine, ingredients, drinks, desserts and cooking.",
    categories: [
      {
        name: "World Cuisine",
        clues: [
          { q: "Sushi originates from which country?", a: "Japan" },
          { q: "The rice dish paella comes from which country?", a: "Spain" },
          { q: "Tikka masala and naan bread belong to which cuisine?", a: "Indian" },
          { q: "The cheese feta traditionally comes from which country?", a: "Greece" },
          { q: "The noodle soup 'pho' is a national dish of which country?", a: "Vietnam" },
        ],
      },
      {
        name: "Ingredients",
        clues: [
          { q: "Which spice gives curry powder its yellow color?", a: "Turmeric" },
          { q: "Which nut is used to make marzipan?", a: "Almond" },
          { q: "Which fruit is the main ingredient of guacamole?", a: "Avocado" },
          { q: "Saffron is harvested from the stigmas of which flower?", a: "The crocus" },
          { q: "Traditional wasabi is made from the root of a plant related to which vegetable?", a: "Horseradish" },
        ],
      },
      {
        name: "Drinks",
        clues: [
          { q: "Which popular drink is made from roasted beans?", a: "Coffee" },
          { q: "Champagne comes from which country?", a: "France" },
          { q: "Which country produces the most coffee in the world?", a: "Brazil" },
          { q: "Tequila is distilled from which plant?", a: "The (blue) agave" },
          { q: "Which Japanese rice wine can be served warm or cold?", a: "Sake" },
        ],
      },
      {
        name: "Desserts",
        clues: [
          { q: "Which flaky French pastry is shaped like a crescent?", a: "The croissant" },
          { q: "Which Italian dessert's name means 'pick me up'?", a: "Tiramisu" },
          { q: "Which meringue dessert topped with fruit is named after a ballerina?", a: "Pavlova" },
          { q: "Crème brûlée is finished with a caramelized layer of what?", a: "Sugar" },
          { q: "The layered pastry 'baklava' is most associated with which region's cuisine?", a: "The Middle East / Turkey" },
        ],
      },
      {
        name: "In the Kitchen",
        clues: [
          { q: "At what temperature does water boil at sea level, in Celsius?", a: "100°C" },
          { q: "What cooking method submerges food in hot oil?", a: "(Deep) frying" },
          { q: "Which process uses yeast to make bread rise?", a: "Fermentation" },
          { q: "What French phrase means having all ingredients prepped and in place?", a: "Mise en place" },
          { q: "What is the French term for meat slowly cooked and preserved in its own fat?", a: "Confit" },
        ],
      },
    ],
  },

  {
    id: "games",
    title: "Video Games",
    emoji: "🎮",
    blurb: "Nintendo, PlayStation, arcade classics, shooters and RPGs.",
    categories: [
      {
        name: "Nintendo",
        clues: [
          { q: "What is the name of Nintendo's mustachioed plumber mascot?", a: "Mario" },
          { q: "In 'The Legend of Zelda,' what is the hero's name?", a: "Link" },
          { q: "Which Nintendo franchise is about catching creatures like Pikachu?", a: "Pokémon" },
          { q: "In what year was the original 'Super Mario Bros.' released?", a: "1985" },
          { q: "What was Nintendo's first handheld console, released in 1989?", a: "The Game Boy" },
        ],
      },
      {
        name: "PlayStation",
        clues: [
          { q: "Which company makes the PlayStation?", a: "Sony" },
          { q: "Which PlayStation series stars Kratos, a warrior of myth?", a: "God of War" },
          { q: "Which stealth series was created by Hideo Kojima?", a: "Metal Gear (Solid)" },
          { q: "In what year was the original PlayStation first released in Japan?", a: "1994" },
          { q: "Which 2017 PlayStation game features a robot-dinosaur world and heroine Aloy?", a: "Horizon Zero Dawn" },
        ],
      },
      {
        name: "Arcade",
        clues: [
          { q: "In 'Pac-Man,' what chases Pac-Man around the maze?", a: "Ghosts" },
          { q: "Which puzzle game has you arranging falling tetromino blocks?", a: "Tetris" },
          { q: "In which country was 'Tetris' created?", a: "The Soviet Union" },
          { q: "Which 1972 title was the first commercially successful arcade video game?", a: "Pong" },
          { q: "In 'Donkey Kong,' what was the original name of the character who became Mario?", a: "Jumpman" },
        ],
      },
      {
        name: "Shooters",
        clues: [
          { q: "In gaming, what does 'FPS' stand for?", a: "First-Person Shooter" },
          { q: "Which series features the super-soldier Master Chief?", a: "Halo" },
          { q: "Which battle-royale game rewards you with a 'Victory Royale'?", a: "Fortnite" },
          { q: "'Counter-Strike' began as a mod for which game?", a: "Half-Life" },
          { q: "Which 1993 id Software game helped define the first-person shooter?", a: "Doom" },
        ],
      },
      {
        name: "RPGs",
        clues: [
          { q: "In gaming, what does 'RPG' stand for?", a: "Role-Playing Game" },
          { q: "Which open-world RPG features the shout 'Fus Ro Dah'?", a: "Skyrim" },
          { q: "In 'The Witcher,' what is Geralt's profession?", a: "A witcher (monster hunter)" },
          { q: "Which studio created the notoriously tough 'Dark Souls' series?", a: "FromSoftware" },
          { q: "Which 2011 sandbox game is the best-selling video game of all time?", a: "Minecraft" },
        ],
      },
    ],
  },

  {
    id: "space",
    title: "Space & the Universe",
    emoji: "🚀",
    blurb: "The solar system, stars, missions, astronauts and the cosmos.",
    categories: [
      {
        name: "Solar System",
        clues: [
          { q: "Which planet is known as the Red Planet?", a: "Mars" },
          { q: "Which is the largest planet in the solar system?", a: "Jupiter" },
          { q: "Which planet is closest to the Sun?", a: "Mercury" },
          { q: "Which planet is famous for its extensive ring system?", a: "Saturn" },
          { q: "Which former planet was reclassified as a dwarf planet in 2006?", a: "Pluto" },
        ],
      },
      {
        name: "Stars & Galaxies",
        clues: [
          { q: "What galaxy is Earth located in?", a: "The Milky Way" },
          { q: "What is the closest star to Earth?", a: "The Sun" },
          { q: "What is the name of the nearest star system to our own?", a: "Alpha Centauri" },
          { q: "What is a collapsed object from which not even light can escape?", a: "A black hole" },
          { q: "Which spiral galaxy nearest the Milky Way is on a collision course with it?", a: "Andromeda" },
        ],
      },
      {
        name: "Missions",
        clues: [
          { q: "Which was the first artificial satellite, launched in 1957?", a: "Sputnik 1" },
          { q: "Which NASA program first landed humans on the Moon?", a: "Apollo (Apollo 11)" },
          { q: "Which telescope, launched in 1990, gave us iconic deep-space images?", a: "The Hubble Space Telescope" },
          { q: "Which space telescope launched in 2021 as Hubble's successor?", a: "The James Webb Space Telescope" },
          { q: "Which two probes launched in 1977 have now left the solar system?", a: "Voyager 1 and 2" },
        ],
      },
      {
        name: "Astronauts",
        clues: [
          { q: "Who was the first person to walk on the Moon?", a: "Neil Armstrong" },
          { q: "Who was the first human in space?", a: "Yuri Gagarin" },
          { q: "Who was the second person to walk on the Moon?", a: "Buzz Aldrin" },
          { q: "Who was the first American woman in space?", a: "Sally Ride" },
          { q: "Who was the first woman in space, in 1963?", a: "Valentina Tereshkova" },
        ],
      },
      {
        name: "Cosmic Facts",
        clues: [
          { q: "What force keeps the planets in orbit around the Sun?", a: "Gravity" },
          { q: "Approximately how old is the universe?", a: "About 13.8 billion years" },
          { q: "What theory describes the universe expanding from a single point?", a: "The Big Bang" },
          { q: "What is the invisible mass thought to make up most of the universe called?", a: "Dark matter" },
          { q: "What is the boundary around a black hole beyond which nothing escapes?", a: "The event horizon" },
        ],
      },
    ],
  },

  {
    id: "art",
    title: "Art & Mythology",
    emoji: "🎨",
    blurb: "Paintings, artists, Greek and Norse myth, and great architecture.",
    categories: [
      {
        name: "Famous Paintings",
        clues: [
          { q: "Who painted the 'Mona Lisa'?", a: "Leonardo da Vinci" },
          { q: "Which artist painted 'The Starry Night'?", a: "Vincent van Gogh" },
          { q: "Which Spanish artist painted the anti-war mural 'Guernica'?", a: "Pablo Picasso" },
          { q: "'The Persistence of Memory,' with its melting clocks, was painted by whom?", a: "Salvador Dalí" },
          { q: "Which Dutch master painted 'Girl with a Pearl Earring'?", a: "Johannes Vermeer" },
        ],
      },
      {
        name: "Artists",
        clues: [
          { q: "Which Renaissance artist painted the Sistine Chapel ceiling?", a: "Michelangelo" },
          { q: "Which art movement is Claude Monet most associated with?", a: "Impressionism" },
          { q: "Which Mexican artist is famous for her self-portraits?", a: "Frida Kahlo" },
          { q: "Which pop artist created the 'Campbell's Soup Cans'?", a: "Andy Warhol" },
          { q: "Which post-Impressionist painter cut off part of his own ear?", a: "Vincent van Gogh" },
        ],
      },
      {
        name: "Greek Myth",
        clues: [
          { q: "Who is the Greek king of the gods?", a: "Zeus" },
          { q: "Who is the Greek god of the sea?", a: "Poseidon" },
          { q: "Which hero completed twelve legendary labours?", a: "Heracles (Hercules)" },
          { q: "Which monster had snakes for hair and turned onlookers to stone?", a: "Medusa" },
          { q: "Who flew too close to the sun on wings of wax and feathers?", a: "Icarus" },
        ],
      },
      {
        name: "World Myth",
        clues: [
          { q: "Who is the Norse god of thunder?", a: "Thor" },
          { q: "Who is the trickster god in Norse mythology?", a: "Loki" },
          { q: "What is the Norse name for the prophesied 'end of the world'?", a: "Ragnarök" },
          { q: "In Egyptian myth, which jackal-headed god presides over the afterlife?", a: "Anubis" },
          { q: "In Norse myth, what is the rainbow bridge linking Earth to Asgard?", a: "The Bifröst" },
        ],
      },
      {
        name: "Architecture",
        clues: [
          { q: "In which city is the Eiffel Tower?", a: "Paris" },
          { q: "The Colosseum stands in which city?", a: "Rome" },
          { q: "Who designed the still-unfinished Sagrada Família in Barcelona?", a: "Antoni Gaudí" },
          { q: "The Taj Mahal was built as a tomb by which Mughal emperor?", a: "Shah Jahan" },
          { q: "Which ancient wonder was a great lighthouse in the harbour of Alexandria?", a: "The Lighthouse (Pharos) of Alexandria" },
        ],
      },
    ],
  },

  {
    id: "tech",
    title: "Tech & Internet",
    emoji: "💻",
    blurb: "Computing, big tech, the web, gadgets and programming.",
    categories: [
      {
        name: "Computing",
        clues: [
          { q: "What does 'PC' stand for?", a: "Personal Computer" },
          { q: "What does 'CPU' stand for?", a: "Central Processing Unit" },
          { q: "What does 'RAM' stand for?", a: "Random Access Memory" },
          { q: "How many bits are in a byte?", a: "Eight" },
          { q: "Which British mathematician devised the theoretical 'Turing machine'?", a: "Alan Turing" },
        ],
      },
      {
        name: "Big Tech",
        clues: [
          { q: "Which company makes the iPhone?", a: "Apple" },
          { q: "Who co-founded Microsoft with Paul Allen?", a: "Bill Gates" },
          { q: "Which company owns Instagram and WhatsApp?", a: "Meta (Facebook)" },
          { q: "In what year was Apple founded?", a: "1976" },
          { q: "What was the original name of the search engine that became Google?", a: "BackRub" },
        ],
      },
      {
        name: "The Web",
        clues: [
          { q: "What does 'www' stand for?", a: "World Wide Web" },
          { q: "Who is credited with inventing the World Wide Web?", a: "Tim Berners-Lee" },
          { q: "What does 'URL' stand for?", a: "Uniform Resource Locator" },
          { q: "What does 'HTTP' stand for?", a: "HyperText Transfer Protocol" },
          { q: "What does 'HTML,' the language of web pages, stand for?", a: "HyperText Markup Language" },
        ],
      },
      {
        name: "Gadgets",
        clues: [
          { q: "Which company created the iPod?", a: "Apple" },
          { q: "What does 'GPS' stand for?", a: "Global Positioning System" },
          { q: "What does 'USB' stand for?", a: "Universal Serial Bus" },
          { q: "What short-range wireless tech is named after a 10th-century Danish king?", a: "Bluetooth" },
          { q: "What does 'LED' stand for?", a: "Light-Emitting Diode" },
        ],
      },
      {
        name: "Programming",
        clues: [
          { q: "What does 'AI' stand for?", a: "Artificial Intelligence" },
          { q: "Which programming language shares its name with a type of coffee?", a: "Java" },
          { q: "In many languages, what symbol commonly begins a comment or a hashtag?", a: "The hash / pound sign (#)" },
          { q: "What does 'SQL' stand for?", a: "Structured Query Language" },
          { q: "Who is often called the first computer programmer, back in the 1800s?", a: "Ada Lovelace" },
        ],
      },
    ],
  },
];
