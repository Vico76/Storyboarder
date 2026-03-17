import { GoogleGenAI, Type } from "@google/genai";

const ICON_IDS = ['target', 'sparkles', 'users', 'chart', 'layout', 'message', 'zap', 'refresh', 'shield', 'play'];
const COLORS = [
  "from-blue-600 to-emerald-500",
  "from-emerald-500 to-teal-500",
  "from-teal-500 to-cyan-500",
  "from-cyan-500 to-blue-500",
  "from-blue-500 to-indigo-600",
  "from-indigo-500 to-violet-600",
  "from-violet-500 to-purple-600",
  "from-purple-500 to-fuchsia-600",
  "from-fuchsia-500 to-rose-600",
  "from-rose-600 to-orange-600"
];

export async function generateStoryboard(prompt: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Génère un storyboard (story mapping) pour une vidéo basée sur le prompt suivant : "${prompt}".
    
    Le storyboard doit comporter entre 5 et 10 plans.
    Chaque plan doit avoir :
    - un titre court (référence interne)
    - un message clé (ce qui est dit ou affiché à l'écran)
    - une intention (l'objectif émotionnel ou stratégique du plan)
    - une description visuelle (ce qu'on voit, les animations)
    - une transition (optionnelle, description du mouvement vers le plan suivant)
    - un iconId choisi parmi : ${ICON_IDS.join(', ')}
    - une couleur (gradient Tailwind) choisie parmi : ${COLORS.join(', ')}
    
    Réponds uniquement en JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            message: { type: Type.STRING },
            intention: { type: Type.STRING },
            visual: { type: Type.STRING },
            transition: { type: Type.STRING },
            iconId: { type: Type.STRING },
            color: { type: Type.STRING },
          },
          required: ["title", "message", "intention", "visual", "iconId", "color"]
        }
      }
    }
  });

  const plans = JSON.parse(response.text);
  return plans.map((plan: any, index: number) => ({
    ...plan,
    id: index + 1
  }));
}
