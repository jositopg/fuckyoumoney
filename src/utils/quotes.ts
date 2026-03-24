// Frases inspiradas en "Fuck You Money" de Joan Tubau (Kapital)
// Rotan diariamente — la misma frase todo el día, distinta cada día

export interface Quote {
  text: string
  author?: string // si es atribución directa del libro
}

export const QUOTES: Quote[] = [
  {
    text: 'Muéstrame tus ahorros y te diré si quieres ser libre.',
  },
  {
    text: 'La verdadera riqueza es el dinero que no necesitas.',
  },
  {
    text: 'El lujo no es un restaurante pretencioso. El lujo es control de la agenda.',
  },
  {
    text: 'Ahorras para poseer la carta de dejarlo, deseando nunca tener que jugarla.',
  },
  {
    text: 'El desprecio por el dinero es la forma más directa de conseguirlo. Pero ese desprecio tiene que ser honesto.',
  },
  {
    text: 'El secreto de los ricos: el dinero es más útil cuando no te lo gastas.',
  },
  {
    text: 'No son los lujos que añade. Son los problemas que quita.',
  },
  {
    text: 'Soy poderoso no por aquello que deseo, sino por aquello que desprecio.',
  },
  {
    text: 'El precio de las cosas es el tiempo que intercambias por ellas.',
  },
  {
    text: 'La ventaja del ahorro es que permite el error.',
  },
  {
    text: 'El dinero en efectivo son balas en la recámara.',
  },
  {
    text: 'No es una cifra lo que estás buscando. El dinero plantea un problema espiritual, no financiero.',
  },
  {
    text: 'No recibir órdenes es la compra más increíble.',
  },
  {
    text: 'Todo gasto es ridículo si compromete tu libertad de movimientos.',
  },
  {
    text: 'Los retos asustan menos con dinero protegiéndome.',
  },
  {
    text: 'Si el ahorro incrementa tu margen de maniobra, ahorrar un poquito es mejor que no ahorrar nada.',
  },
  {
    text: 'El indicador de satisfacción no es el bienestar material. Es la autonomía personal.',
  },
  {
    text: 'El dinero, si lo mueves con cabeza, compra tu libertad de la masa.',
  },
  {
    text: 'Cuando dominas el tiempo, los recursos son menos escasos.',
  },
  {
    text: 'Mantener una relación sana con el dinero es la señal definitiva de inteligencia.',
  },
  {
    text: 'Muestra debilidad y el sistema te avasalla.',
  },
  {
    text: 'Lo que no pagues hoy con tu dinero lo pagarás mañana con tu tiempo.',
  },
  {
    text: 'Estoy más cerca del comunista que del consumista.',
  },
  {
    text: 'Antes de comprar todo aquello que deseas, elimina primero todo aquello que te molesta.',
  },
  {
    text: 'Mis amigos creen que soy valiente. Lo que pasa es que tengo ahorro cubriéndome.',
  },
  {
    text: 'No me interesa la gente con mucho dinero. Busco personas financieramente satisfechas.',
  },
  {
    text: 'Yo gano dinero para que nadie me diga cómo vivir.',
  },
  {
    text: 'Son grados de libertad. Cada euro ahorrado es un grado más.',
  },
  {
    text: 'La clase media dice que quiere ser libre. Pero no se lo cree.',
  },
  {
    text: '¿Cuándo será suficiente? Cuando tengas la carta de poder decir no.',
  },
]

/**
 * Returns a quote that rotates daily.
 * Same quote all day, different each day.
 */
export function getDailyQuote(): Quote {
  const now = new Date()
  // Day of year as seed: consistent within a day, changes every day
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24))
  return QUOTES[dayOfYear % QUOTES.length]
}
