export type EnglishEssayCategory = 'persuasive-argumentative' | 'analytical' | 'creative-imaginative'

export interface EnglishEssayPrompt {
  id: string
  category: EnglishEssayCategory
  prompt: string
  suggestedWordRange: string
  suggestedMinutes: string
}

const prompt = (category: EnglishEssayCategory, number: number, text: string): EnglishEssayPrompt => ({
  id: `${category}-${number}`,
  category,
  prompt: text,
  suggestedWordRange: '400–700 words',
  suggestedMinutes: '30–45 minutes'
})

export const englishEssayPrompts: EnglishEssayPrompt[] = [
  ...([
    'Should mobile phones be banned in all Australian schools?',
    'Is social media doing more harm than good to teenagers?',
    'Should school uniforms be compulsory?',
    'Should students be given less homework?',
    'Is artificial intelligence making students better learners or making them less independent?',
    'Should animals be kept in zoos?',
    'Should Australia do more to protect endangered animals?',
    'Is it more important to be successful or to be happy?',
    'Should teenagers have a greater say in decisions that affect their lives?',
    'Does technology bring people closer together or make them more isolated?'
  ].map((text, index) => prompt('persuasive-argumentative', index + 1, text))),
  ...([
    'How does the main character change throughout the story?',
    'How does the author explore the theme of friendship?',
    'How does the text demonstrate the difference between appearance and reality?',
    'How does the author use conflict to develop the storyline?',
    'How does the setting influence the characters and their decisions?',
    'Is the main character responsible for their own downfall?',
    'How does the author explore the theme of courage?',
    'How are power and control represented in the text?',
    'How does the author encourage readers to sympathise with a particular character?',
    'What message does the author want readers to take away from the story?'
  ].map((text, index) => prompt('analytical', index + 1, text))),
  ...([
    'Write a story that begins with: “I knew something was wrong when everyone stopped talking.”',
    'Write about a character who discovers a secret that changes everything they believed about their family.',
    'Imagine waking up one morning and discovering that nobody can remember who you are.',
    'Write a story set 100 years in the future where technology controls almost every part of human life.',
    'Write from the perspective of a character who has been unfairly blamed for something they did not do.',
    'Describe a place that seems beautiful during the day but becomes frightening at night.',
    'Write a story in which a seemingly ordinary object holds an extraordinary secret.',
    'Write about two people who are forced to work together despite strongly disliking each other.',
    'Create a story about a decision that cannot be undone.',
    'Write an alternative ending to a familiar fairy tale, changing the reader’s understanding of the original story.'
  ].map((text, index) => prompt('creative-imaginative', index + 1, text)))
]
