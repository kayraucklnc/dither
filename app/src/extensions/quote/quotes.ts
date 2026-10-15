// The quotes the widget ships: each one checked against the work it names.
// Translations are the common English ones. Keep to characters the fonts have
// below 64 px (docs: tools/fonts/build.py) — Latin-1, curly quotes, dashes.

export interface Quote {
  text: string;
  who: string;
  /** The book, play or poem it comes from. */
  from?: string;
}

export const PHILOSOPHY: readonly Quote[] = [
  { text: "The unexamined life is not worth living.", who: "Socrates", from: "Plato’s Apology" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", who: "Seneca", from: "On the Shortness of Life" },
  { text: "While we are postponing, life speeds by.", who: "Seneca", from: "Letters to Lucilius" },
  { text: "We suffer more often in imagination than in reality.", who: "Seneca", from: "Letters to Lucilius" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", who: "Marcus Aurelius", from: "Meditations" },
  { text: "Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", who: "Marcus Aurelius", from: "Meditations" },
  { text: "Men are disturbed not by things, but by the views which they take of them.", who: "Epictetus", from: "Enchiridion" },
  { text: "First say to yourself what you would be; and then do what you have to do.", who: "Epictetus", from: "Discourses" },
  { text: "Of all the things which wisdom provides to make us entirely happy, much the greatest is the possession of friendship.", who: "Epicurus", from: "Principal Doctrines" },
  { text: "Wonder is the feeling of a philosopher, and philosophy begins in wonder.", who: "Plato", from: "Theaetetus" },
  { text: "The beginning is the most important part of the work.", who: "Plato", from: "The Republic" },
  { text: "A journey of a thousand miles begins with a single step.", who: "Lao Tzu", from: "Tao Te Ching" },
  { text: "To know what you know and what you do not know, that is true knowledge.", who: "Confucius", from: "Analects" },
  { text: "The greatest thing in the world is to know how to belong to oneself.", who: "Montaigne", from: "Essays" },
  { text: "I think, therefore I am.", who: "Descartes", from: "Discourse on the Method" },
  { text: "The heart has its reasons which reason knows nothing of.", who: "Pascal", from: "Pensées" },
  { text: "All of humanity’s problems stem from man’s inability to sit quietly in a room alone.", who: "Pascal", from: "Pensées" },
  { text: "All things excellent are as difficult as they are rare.", who: "Spinoza", from: "Ethics" },
  { text: "Reason is, and ought only to be the slave of the passions.", who: "Hume", from: "A Treatise of Human Nature" },
  { text: "Man is born free, and everywhere he is in chains.", who: "Rousseau", from: "The Social Contract" },
  { text: "Out of the crooked timber of humanity, no straight thing was ever made.", who: "Kant" },
  { text: "Two things fill the mind with ever new and increasing admiration and awe: the starry heavens above me and the moral law within me.", who: "Kant", from: "Critique of Practical Reason" },
  { text: "Life can only be understood backwards; but it must be lived forwards.", who: "Kierkegaard", from: "Journals" },
  { text: "He who has a why to live can bear almost any how.", who: "Nietzsche", from: "Twilight of the Idols" },
  { text: "Without music, life would be a mistake.", who: "Nietzsche", from: "Twilight of the Idols" },
  { text: "Whoever fights monsters should see to it that in the process he does not become a monster.", who: "Nietzsche", from: "Beyond Good and Evil" },
  { text: "The limits of my language mean the limits of my world.", who: "Wittgenstein", from: "Tractatus" },
  { text: "Whereof one cannot speak, thereof one must be silent.", who: "Wittgenstein", from: "Tractatus" },
  { text: "One is not born, but rather becomes, a woman.", who: "Simone de Beauvoir", from: "The Second Sex" },
  { text: "Man is condemned to be free.", who: "Sartre", from: "Existentialism Is a Humanism" },
  { text: "One must imagine Sisyphus happy.", who: "Camus", from: "The Myth of Sisyphus" },
  { text: "In the depth of winter, I finally learned that within me there lay an invincible summer.", who: "Camus", from: "Return to Tipasa" },
];

export const LITERATURE: readonly Quote[] = [
  { text: "To be, or not to be: that is the question.", who: "Shakespeare", from: "Hamlet" },
  { text: "There is nothing either good or bad, but thinking makes it so.", who: "Shakespeare", from: "Hamlet" },
  { text: "The fault, dear Brutus, is not in our stars, but in ourselves.", who: "Shakespeare", from: "Julius Caesar" },
  { text: "We are such stuff as dreams are made on, and our little life is rounded with a sleep.", who: "Shakespeare", from: "The Tempest" },
  { text: "Midway upon the journey of our life I found myself within a forest dark.", who: "Dante", from: "Inferno" },
  { text: "We must cultivate our garden.", who: "Voltaire", from: "Candide" },
  { text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.", who: "Jane Austen", from: "Pride and Prejudice" },
  { text: "Beware; for I am fearless, and therefore powerful.", who: "Mary Shelley", from: "Frankenstein" },
  { text: "I am no bird; and no net ensnares me.", who: "Charlotte Brontë", from: "Jane Eyre" },
  { text: "Whatever our souls are made of, his and mine are the same.", who: "Emily Brontë", from: "Wuthering Heights" },
  { text: "It was the best of times, it was the worst of times.", who: "Charles Dickens", from: "A Tale of Two Cities" },
  { text: "All happy families are alike; each unhappy family is unhappy in its own way.", who: "Tolstoy", from: "Anna Karenina" },
  { text: "Hope is the thing with feathers that perches in the soul.", who: "Emily Dickinson" },
  { text: "Isn’t it nice to think that tomorrow is a new day with no mistakes in it yet?", who: "L. M. Montgomery", from: "Anne of Green Gables" },
  { text: "So we beat on, boats against the current, borne back ceaselessly into the past.", who: "F. Scott Fitzgerald", from: "The Great Gatsby" },
  { text: "The world breaks every one and afterward many are strong at the broken places.", who: "Ernest Hemingway", from: "A Farewell to Arms" },
  { text: "The past is never dead. It’s not even past.", who: "William Faulkner", from: "Requiem for a Nun" },
  { text: "All animals are equal, but some animals are more equal than others.", who: "George Orwell", from: "Animal Farm" },
  { text: "Who controls the past controls the future: who controls the present controls the past.", who: "George Orwell", from: "Nineteen Eighty-Four" },
  { text: "Hell is other people.", who: "Sartre", from: "No Exit" },
  { text: "It is only with the heart that one can see rightly; what is essential is invisible to the eye.", who: "Antoine de Saint-Exupéry", from: "The Little Prince" },
  { text: "Not all those who wander are lost.", who: "J. R. R. Tolkien", from: "The Fellowship of the Ring" },
  { text: "All we have to decide is what to do with the time that is given us.", who: "J. R. R. Tolkien", from: "The Fellowship of the Ring" },
  { text: "And now that you don’t have to be perfect, you can be good.", who: "John Steinbeck", from: "East of Eden" },
  { text: "I took a deep breath and listened to the old brag of my heart. I am, I am, I am.", who: "Sylvia Plath", from: "The Bell Jar" },
  { text: "Stuff your eyes with wonder.", who: "Ray Bradbury", from: "Fahrenheit 451" },
  { text: "Don’t Panic.", who: "Douglas Adams", from: "The Hitchhiker’s Guide to the Galaxy" },
  { text: "Hope is a good thing, maybe the best of things, and no good thing ever dies.", who: "Stephen King", from: "Rita Hayworth and Shawshank Redemption" },
];
