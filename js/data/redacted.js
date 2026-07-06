// Trivia for "Redacted" — the clue giver sees the whole question and answer and
// blacks out as many words as they dare; the guesser only sees what's left.
// Each entry: { question, answer, category, alts? } where `alts` lists extra
// spellings/forms the answer checker should also accept (normalized loosely).

export const QUESTIONS = [
  // ---- Geography ----
  { category: "Geography", question: "What prison is located on an island in San Francisco Bay?", answer: "Alcatraz" },
  { category: "Geography", question: "What is the capital city of France?", answer: "Paris" },
  { category: "Geography", question: "Which country is home to the ancient pyramids of Giza?", answer: "Egypt" },
  { category: "Geography", question: "What is the longest river in the world?", answer: "the Nile", alts: ["Nile"] },
  { category: "Geography", question: "Which desert is the largest hot desert on Earth?", answer: "the Sahara", alts: ["Sahara"] },
  { category: "Geography", question: "What is the tallest mountain above sea level on Earth?", answer: "Mount Everest", alts: ["Everest"] },
  { category: "Geography", question: "Which city is famous for its canals instead of roads?", answer: "Venice" },
  { category: "Geography", question: "What is the smallest country in the world by area?", answer: "Vatican City", alts: ["the Vatican", "Vatican"] },
  { category: "Geography", question: "Which US state is nicknamed the Sunshine State?", answer: "Florida" },
  { category: "Geography", question: "What is the largest ocean on Earth?", answer: "the Pacific", alts: ["Pacific", "Pacific Ocean"] },
  { category: "Geography", question: "Which country has the Great Barrier Reef off its coast?", answer: "Australia" },
  { category: "Geography", question: "What is the capital of Japan?", answer: "Tokyo" },

  // ---- Science & Nature ----
  { category: "Science", question: "Which planet is known as the red planet?", answer: "Mars" },
  { category: "Science", question: "Which animal is known for having a very long neck?", answer: "the giraffe", alts: ["giraffe"] },
  { category: "Science", question: "What gas do plants absorb from the air to make food?", answer: "carbon dioxide", alts: ["CO2"] },
  { category: "Science", question: "What is the hardest natural substance on Earth?", answer: "diamond" },
  { category: "Science", question: "How many bones are in the adult human body?", answer: "206" },
  { category: "Science", question: "What is the chemical symbol for gold?", answer: "Au" },
  { category: "Science", question: "Which planet is the largest in our solar system?", answer: "Jupiter" },
  { category: "Science", question: "What is the closest star to the Earth?", answer: "the Sun", alts: ["Sun"] },
  { category: "Science", question: "What part of the human body produces insulin?", answer: "the pancreas", alts: ["pancreas"] },
  { category: "Science", question: "What is the fastest land animal in the world?", answer: "the cheetah", alts: ["cheetah"] },
  { category: "Science", question: "What force pulls objects toward the center of the Earth?", answer: "gravity" },
  { category: "Science", question: "Which blood type is known as the universal donor?", answer: "O negative", alts: ["O-", "type O negative"] },

  // ---- History ----
  { category: "History", question: "Who was the first President of the United States?", answer: "George Washington", alts: ["Washington"] },
  { category: "History", question: "In which country did the Renaissance begin?", answer: "Italy" },
  { category: "History", question: "What ship famously sank on its maiden voyage in 1912?", answer: "the Titanic", alts: ["Titanic"] },
  { category: "History", question: "Which ancient wonder still stands in Egypt today?", answer: "the Great Pyramid", alts: ["Great Pyramid of Giza", "the pyramids", "Great Pyramid"] },
  { category: "History", question: "Who painted the ceiling of the Sistine Chapel?", answer: "Michelangelo" },
  { category: "History", question: "Which wall divided a German city until 1989?", answer: "the Berlin Wall", alts: ["Berlin Wall"] },
  { category: "History", question: "Who was the ancient Egyptian queen famously linked to Julius Caesar?", answer: "Cleopatra" },
  { category: "History", question: "What was the name of the first man to walk on the Moon?", answer: "Neil Armstrong", alts: ["Armstrong"] },

  // ---- Entertainment ----
  { category: "Movies & TV", question: "In which movie does a young lion named Simba grow up to be king?", answer: "The Lion King" },
  { category: "Movies & TV", question: "Which wizard school does Harry Potter attend?", answer: "Hogwarts" },
  { category: "Movies & TV", question: "What is the name of the fictional African nation in Black Panther?", answer: "Wakanda" },
  { category: "Movies & TV", question: "Which animated film features a snowman named Olaf?", answer: "Frozen" },
  { category: "Movies & TV", question: "What is the name of the coffee shop in the show Friends?", answer: "Central Perk" },
  { category: "Movies & TV", question: "Which movie features a computer program world entered by hackers named Neo?", answer: "The Matrix", alts: ["Matrix"] },
  { category: "Movies & TV", question: "What toy cowboy is a main character in the Toy Story films?", answer: "Woody" },

  // ---- Music ----
  { category: "Music", question: "Which British band released the album Abbey Road?", answer: "The Beatles", alts: ["Beatles"] },
  { category: "Music", question: "Which instrument has 88 keys?", answer: "the piano", alts: ["piano"] },
  { category: "Music", question: "Which pop star is known as the Queen of Pop?", answer: "Madonna" },
  { category: "Music", question: "How many strings does a standard guitar have?", answer: "six", alts: ["6"] },

  // ---- Sports ----
  { category: "Sports", question: "How many players are on a soccer team on the field?", answer: "eleven", alts: ["11"] },
  { category: "Sports", question: "In which sport would you perform a slam dunk?", answer: "basketball" },
  { category: "Sports", question: "How many rings are on the Olympic flag?", answer: "five", alts: ["5"] },
  { category: "Sports", question: "Which country hosts the Wimbledon tennis championship?", answer: "England", alts: ["the United Kingdom", "UK", "Britain", "Great Britain"] },
  { category: "Sports", question: "What sport is played at the Masters tournament in Augusta?", answer: "golf" },

  // ---- Food & Everyday ----
  { category: "Food", question: "Which fruit is traditionally used to make wine?", answer: "grapes", alts: ["grape"] },
  { category: "Food", question: "What spice is derived from the crocus flower and is the most expensive by weight?", answer: "saffron" },
  { category: "Food", question: "Which country is credited with inventing pizza?", answer: "Italy" },
  { category: "Food", question: "What is the main ingredient in traditional guacamole?", answer: "avocado", alts: ["avocados"] },
  { category: "Food", question: "What hot drink is made from roasted beans and served as espresso?", answer: "coffee" },

  // ---- Language & Words ----
  { category: "Words", question: "What do you call a word that reads the same forwards and backwards?", answer: "a palindrome", alts: ["palindrome"] },
  { category: "Words", question: "How many letters are there in the English alphabet?", answer: "26", alts: ["twenty-six", "twenty six"] },
  { category: "Words", question: "What is the most spoken first language in the world?", answer: "Mandarin Chinese", alts: ["Mandarin", "Chinese"] },
];
