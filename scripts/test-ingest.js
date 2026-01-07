import fs from "fs/promises";
import { parseMarkdownFrontmatter } from "../api/services/ingester.js";

const filePath = process.env.HOME + "/Dropbox/Ocean2.0 Supplemental/ocean-supplemental-markdown/Ocean Library/Baha'i/Administrative/Baha'i International Community/2017-01-01 Bicentenaire de Bahaullah.md";

const text = await fs.readFile(filePath, "utf-8");
const { content, metadata } = parseMarkdownFrontmatter(text);
console.log("Extracted title:", metadata.title);
console.log("Has accents:", metadata.title.includes("á") || metadata.title.includes("'"));
console.log("Title bytes:", JSON.stringify([...Buffer.from(metadata.title)]));
