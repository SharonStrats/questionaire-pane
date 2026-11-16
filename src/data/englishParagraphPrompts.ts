export type EnglishParagraphCategory = 'persuasive' | 'analytical' | 'descriptive-creative'

export interface EnglishParagraphPrompt {
  id: string
  category: EnglishParagraphCategory
  title: string
  prompt: string
  suggestedWordRange: string
  suggestedMinutes: string
}

const prompt = (
  category: EnglishParagraphCategory,
  number: number,
  title: string
): EnglishParagraphPrompt => ({
  id: `${category}-${number}`,
  category,
  title,
  prompt: title,
  suggestedWordRange: '100–180 words',
  suggestedMinutes: '10–20 minutes'
})

export const englishParagraphPrompts: EnglishParagraphPrompt[] = [
  prompt('persuasive', 1, 'Explain why students should or should not be allowed to use phones during school breaks.'),
  prompt('persuasive', 2, 'Give three reasons why teenagers should participate in sport or physical activity.'),
  prompt('persuasive', 3, 'Explain why protecting the environment should be everyone’s responsibility.'),
  prompt('persuasive', 4, 'Argue whether homework helps students learn or creates unnecessary pressure.'),
  prompt('persuasive', 5, 'Explain why schools should teach practical life skills such as cooking and budgeting.'),
  prompt('persuasive', 6, 'Persuade your school principal to introduce one change that would improve school life.'),
  prompt('persuasive', 7, 'Explain whether video games have a positive or negative influence on young people.'),
  prompt('persuasive', 8, 'Argue why reading books is still important in a world dominated by technology.'),
  prompt('analytical', 1, 'Explain how a character demonstrates courage in a story you have read.'),
  prompt('analytical', 2, 'Describe how the author creates suspense in a particular scene.'),
  prompt('analytical', 3, 'Explain how a character’s actions reveal their personality.'),
  prompt('analytical', 4, 'Analyse how the author uses descriptive language to create a particular mood.'),
  prompt('analytical', 5, 'Explain how a character’s relationships influence their decisions.'),
  prompt('analytical', 6, 'Describe how the setting contributes to the main conflict.'),
  prompt('analytical', 7, 'Explain how a particular event changes the direction of the story.'),
  prompt('analytical', 8, 'Analyse how the author uses dialogue to reveal conflict between characters.'),
  prompt('descriptive-creative', 1, 'Describe a place that makes you feel completely at peace.'),
  prompt('descriptive-creative', 2, 'Describe a frightening experience using sensory language.'),
  prompt('descriptive-creative', 3, 'Write a paragraph introducing a mysterious character without directly describing their appearance.'),
  prompt('descriptive-creative', 4, 'Describe a busy city street during a storm.'),
  prompt('descriptive-creative', 5, 'Write about a moment when someone realises they have made a terrible mistake.'),
  prompt('descriptive-creative', 6, 'Describe a character’s emotions without using the words happy, sad, angry or scared.'),
  prompt('descriptive-creative', 7, 'Write a paragraph that builds suspense and ends with an unexpected discovery.'),
  prompt('descriptive-creative', 8, 'Describe a childhood memory from the perspective of someone looking back 30 years later.')
]
