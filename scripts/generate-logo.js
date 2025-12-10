import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
dotenv.config({ path: path.join(__dirname, '../.env-secrets') });

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('No OpenAI API key found');
  process.exit(1);
}

const openai = new OpenAI({ apiKey });

async function generateLogo() {
  console.log('Generating SifterSearch logo...');

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: `Create a minimalist, modern app icon/favicon for "SifterSearch" - an AI-powered interfaith library search tool.

Design requirements:
- Clean, simple geometric design suitable as favicon and app icon
- Features an abstract "S" shape that subtly incorporates a search/magnifying glass element
- Color palette: deep ocean blue to teal gradient (#0284c7 to #14b8a6)
- Should work well at small sizes (32x32 pixels)
- Modern, professional tech aesthetic
- NO text, NO letters, just an abstract symbol
- Flat design with subtle depth
- Single cohesive icon, not multiple elements
- White or light elements on the gradient background

Style: Similar to modern tech company logos like Notion, Linear, or Vercel - clean, geometric, instantly recognizable.`,
    n: 1,
    size: "1024x1024",
    quality: "hd",
    style: "vivid"
  });

  const imageUrl = response.data[0].url;
  const revisedPrompt = response.data[0].revised_prompt;

  console.log('Image URL:', imageUrl);
  console.log('\nRevised prompt:', revisedPrompt);

  // Download the image
  const imageResponse = await fetch(imageUrl);
  const buffer = await imageResponse.arrayBuffer();

  const outputPath = path.join(__dirname, '../public/logo-generated.png');
  fs.writeFileSync(outputPath, Buffer.from(buffer));

  console.log('\nLogo saved to:', outputPath);
}

generateLogo().catch(console.error);
