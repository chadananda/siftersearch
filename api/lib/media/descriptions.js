// Editorial policy shared by new recordings and the metadata-only backfill.
export const DESCRIPTION_STYLE = `Write a useful editorial description, not a report about a recording.
Lead immediately with the particular idea, question, tension, historical example, or comparison developed here. The opening sentence must distinguish this installment from its neighbours in the same series.
Use 2-3 natural sentences, usually 45-85 words. Include 2-3 concrete details when the transcript supports them; explain how the ideas connect instead of listing topics.
Do not open with the speaker's name, "the speaker", "this talk", "this session", "in this lecture", or a restatement of the title or book being studied. Do not announce that someone discusses, explores, examines, or delves into a subject. Begin with the subject itself.
Vary the structure according to the content. Avoid a repeated template, sales language, generic praise, and promises about what listeners will learn. Preserve qualifications; do not present a question or quoted view as the speaker's settled conclusion. Use only the supplied evidence. Do not invent names, examples, comparisons, or conclusions. Do not rename the talk.`;

export function validDescription(summary, speaker='') {
 const s=String(summary||'').trim();
 if(s.length<80 || s.length>1200)return false;
 if(/^(?:the speaker\b|this (?:talk|session|lecture|recording)\b|in this\b|here[,]?\s+(?:the speaker|we)\b)/i.test(s))return false;
 if(speaker && s.toLocaleLowerCase().startsWith(speaker.toLocaleLowerCase()))return false;
 return true;
}

export function descriptionEvidence(paragraphs, maxChars=45000) {
 const rows=paragraphs.map((p,i)=>({n:Number.isFinite(Number(p.n))?Number(p.n):i,text:(p.words||[]).map(w=>Array.isArray(w)?w[0]:w.w||w.word||'').join(' ').trim()})).filter(p=>p.text);
 if(!rows.length)return [];
 if(rows.reduce((n,p)=>n+p.text.length,0)<=maxChars)return rows;
 // Spread excerpts over the entire recording, rather than summarizing its preamble.
 if(rows.length===1)return [{...rows[0],text:rows[0].text.slice(0,maxChars)}];
 const count=Math.min(60,rows.length), picked=new Set(Array.from({length:count},(_,i)=>Math.round(i*(rows.length-1)/(count-1))));
 const per=Math.floor(maxChars/count);
 return rows.filter((_,i)=>picked.has(i)).map(p=>({...p,text:p.text.slice(0,per)}));
}
