export interface PokemonChoice {
  pokemon: string
  pokedexId: number
}

export interface PokemonLevelDefinition extends PokemonChoice {
  level: number
  minimumPoints: number
}

// Thresholds grow gradually so early levels come quickly and later ones take sustained study.
export const POKEMON_LEVELS: PokemonLevelDefinition[] = [
  { level: 1, minimumPoints: 0, pokemon: 'Bulbasaur', pokedexId: 1 },
  { level: 2, minimumPoints: 5, pokemon: 'Ivysaur', pokedexId: 2 },
  { level: 3, minimumPoints: 10, pokemon: 'Venusaur', pokedexId: 3 },
  { level: 4, minimumPoints: 20, pokemon: 'Charmander', pokedexId: 4 },
  { level: 5, minimumPoints: 30, pokemon: 'Charmeleon', pokedexId: 5 },
  { level: 6, minimumPoints: 45, pokemon: 'Charizard', pokedexId: 6 },
  { level: 7, minimumPoints: 60, pokemon: 'Squirtle', pokedexId: 7 },
  { level: 8, minimumPoints: 80, pokemon: 'Wartortle', pokedexId: 8 },
  { level: 9, minimumPoints: 100, pokemon: 'Blastoise', pokedexId: 9 },
  { level: 10, minimumPoints: 125, pokemon: 'Pichu', pokedexId: 172 },
  { level: 11, minimumPoints: 150, pokemon: 'Pikachu', pokedexId: 25 },
  { level: 12, minimumPoints: 180, pokemon: 'Raichu', pokedexId: 26 },
  { level: 13, minimumPoints: 210, pokemon: 'Abra', pokedexId: 63 },
  { level: 14, minimumPoints: 250, pokemon: 'Kadabra', pokedexId: 64 },
  { level: 15, minimumPoints: 300, pokemon: 'Alakazam', pokedexId: 65 },
  { level: 16, minimumPoints: 350, pokemon: 'Dratini', pokedexId: 147 },
  { level: 17, minimumPoints: 400, pokemon: 'Dragonair', pokedexId: 148 },
  { level: 18, minimumPoints: 475, pokemon: 'Dragonite', pokedexId: 149 },
  { level: 19, minimumPoints: 550, pokemon: 'Mewtwo', pokedexId: 150 },
  { level: 20, minimumPoints: 650, pokemon: 'Mew', pokedexId: 151 }
]

const alternatives: Record<number, [PokemonChoice, PokemonChoice]> = {
  1: [{ pokemon: 'Charmander', pokedexId: 4 }, { pokemon: 'Squirtle', pokedexId: 7 }],
  2: [{ pokemon: 'Chikorita', pokedexId: 152 }, { pokemon: 'Cyndaquil', pokedexId: 155 }],
  3: [{ pokemon: 'Bayleef', pokedexId: 153 }, { pokemon: 'Quilava', pokedexId: 156 }],
  4: [{ pokemon: 'Totodile', pokedexId: 158 }, { pokemon: 'Treecko', pokedexId: 252 }],
  5: [{ pokemon: 'Croconaw', pokedexId: 159 }, { pokemon: 'Grovyle', pokedexId: 253 }],
  6: [{ pokemon: 'Feraligatr', pokedexId: 160 }, { pokemon: 'Sceptile', pokedexId: 254 }],
  7: [{ pokemon: 'Torchic', pokedexId: 255 }, { pokemon: 'Mudkip', pokedexId: 258 }],
  8: [{ pokemon: 'Combusken', pokedexId: 256 }, { pokemon: 'Marshtomp', pokedexId: 259 }],
  9: [{ pokemon: 'Blaziken', pokedexId: 257 }, { pokemon: 'Swampert', pokedexId: 260 }],
  10: [{ pokemon: 'Eevee', pokedexId: 133 }, { pokemon: 'Jigglypuff', pokedexId: 39 }],
  11: [{ pokemon: 'Vaporeon', pokedexId: 134 }, { pokemon: 'Wigglytuff', pokedexId: 40 }],
  12: [{ pokemon: 'Jolteon', pokedexId: 135 }, { pokemon: 'Flareon', pokedexId: 136 }],
  13: [{ pokemon: 'Ralts', pokedexId: 280 }, { pokemon: 'Gastly', pokedexId: 92 }],
  14: [{ pokemon: 'Kirlia', pokedexId: 281 }, { pokemon: 'Haunter', pokedexId: 93 }],
  15: [{ pokemon: 'Gardevoir', pokedexId: 282 }, { pokemon: 'Gengar', pokedexId: 94 }],
  16: [{ pokemon: 'Larvitar', pokedexId: 246 }, { pokemon: 'Bagon', pokedexId: 371 }],
  17: [{ pokemon: 'Pupitar', pokedexId: 247 }, { pokemon: 'Shelgon', pokedexId: 372 }],
  18: [{ pokemon: 'Tyranitar', pokedexId: 248 }, { pokemon: 'Salamence', pokedexId: 373 }],
  19: [{ pokemon: 'Lugia', pokedexId: 249 }, { pokemon: 'Ho-Oh', pokedexId: 250 }],
  20: [{ pokemon: 'Celebi', pokedexId: 251 }, { pokemon: 'Jirachi', pokedexId: 385 }]
}

export function pokemonChoicesForLevel (level: number): PokemonChoice[] {
  const definition = POKEMON_LEVELS.find(definition => definition.level === level)
  if (!definition) throw new Error('Unknown Pokemon level.')
  return [
    { pokemon: definition.pokemon, pokedexId: definition.pokedexId },
    ...alternatives[level]
  ]
}

export function pokemonLevelForPoints (totalPoints: number): PokemonLevelDefinition {
  return [...POKEMON_LEVELS]
    .reverse()
    .find(level => totalPoints >= level.minimumPoints) ?? POKEMON_LEVELS[0]
}

export function pokemonSpriteUrl (pokedexId: number): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokedexId}.png`
}
